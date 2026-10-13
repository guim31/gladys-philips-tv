// -----------------------------------------------------------------------------
// The hub, end to end against the SDK's fake Gladys and fake TVs: devices and
// states, standby and sleeping network, persistence, the "content changed"
// scene event, every command of the features, Wake-on-LAN, the connection
// status and the configuration actions (test, search, pairing).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME_APP, OTHER_SOURCE } from '../src/devices.js';
import { ORIGINS, TRIGGERS, macOf, normalizeMac, ssdpCandidates } from '../src/hub.js';
import {
  CREDENTIALS,
  FakePhilips,
  HOST_1,
  HOST_2,
  MAC,
  PIN,
  PLATFORM_ID,
  createAll,
  createWorld,
  deviceOf,
  featureOf,
  pairedTv,
} from './helpers/world.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const NETFLIX = 'com.netflix.ninja.MainActivity-com.netflix.ninja';
const YOUTUBE =
  'com.google.android.apps.youtube.tv.activity.ShellActivity-com.google.android.youtube.tv';
const PLAY_TV = 'org.droidtv.playtv.PlayTvActivity-org.droidtv.playtv';

const emptyDataDir = () => mkdtempSync(join(tmpdir(), 'gladys-philips-'));
const state = (world, key, index = 0) =>
  world.fake.lastState(`${deviceOf(world, index).external_id}:${key}`);
const statesOf = (world, key) =>
  world.fake.states.filter(
    (item) => item.device_feature_external_id === `${deviceOf(world).external_id}:${key}`,
  );
const events = (world) =>
  world.fake.sceneEvents.filter((event) => event.key === TRIGGERS.CONTENT_CHANGED);
const setValue = (world, key, value) => {
  const device = deviceOf(world);
  return world.fake.setValue(device, featureOf(device, key), value);
};
const message = (ack, language = 'en') => ack.data?.message?.[language] ?? ack.data?.message;

test('a paired Android TV is published with its states, local, connected', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(device.name, 'Philips 65OLED855/12');
  assert.equal(device.external_id, world.gladys.externalIds('tv', PLATFORM_ID).device);
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [
    { name: 'PHILIPS_HOST', value: HOST_1 },
    { name: 'PHILIPS_MODEL', value: '65OLED855/12' },
  ]);
  assert.equal(featureOf(device, 'volume').max, 60, 'the bounds of the TV');
  assert.deepEqual(
    featureOf(device, 'source').supported_options.map((option) => option.value),
    ['tv', 'hdmi_1', 'hdmi_2', 'hdmi_3', 'hdmi_4', OTHER_SOURCE],
  );
  const apps = featureOf(device, 'app').supported_options;
  assert.equal(apps[0].value, HOME_APP);
  assert.ok(apps.some((option) => option.value === NETFLIX && option.label === 'Netflix'));
  assert.equal(state(world, 'power'), 1);
  assert.equal(state(world, 'volume'), 18);
  assert.equal(state(world, 'source'), 'tv');
  assert.equal(state(world, 'app'), PLAY_TV);
  assert.equal(state(world, 'channel'), 1);
  assert.equal(state(world, 'playing'), '1 · Irdeto scrambled');
  assert.equal(state(world, 'ambilight'), 1);
  assert.equal(state(world, 'ambilight_style'), 'video_standard');
  assert.equal(state(world, 'ambilight_hue'), 0);
  assert.equal(state(world, 'ambilight_color'), undefined, 'no fixed colour');
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'local',
  });
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.hub.records.get(1).identity.mac, MAC, 'from /network/devices');
  // Android: everything over HTTPS on 1926, authenticated.
  assert.ok(world.tv.requests.length > 5);
});

test('a Saphi TV: HTTP on 1925, no pairing, no apps nor sources, Ambilight', async (t) => {
  const tv = new FakePhilips({ kind: 'saphi' });
  const world = await createWorld({ tvs: { [HOST_1]: tv }, dataDir: emptyDataDir() });
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(device.name, 'Philips 50PUS6804/12', 'the model without its "1_" prefix');
  const keys = device.features.map((feature) => feature.external_id.split(':').at(-1));
  assert.ok(!keys.includes('source') && !keys.includes('app'), 'no intents on Saphi');
  assert.ok(keys.includes('ambilight') && keys.includes('ambilight_hue'));
  assert.equal(state(world, 'power'), 1);
  assert.equal(state(world, 'channel'), 1);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  const styles = featureOf(device, 'ambilight_style').supported_options.map((o) => o.value);
  assert.ok(styles.includes('lounge_pta_lounge'), 'the Saphi lounge presets');
  assert.ok(styles.includes('video_sports'));
  await assert.rejects(world.hub.openApp(world.hub.records.get(1), 'Netflix'), /not an Android TV/);
});

test('an Android TV not paired yet: published, "not paired" in the status', async (t) => {
  const tv = new FakePhilips();
  const world = await createWorld({ tvs: { [HOST_1]: tv }, dataDir: emptyDataDir() });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1, '/system needs no pairing');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /not paired yet/);
  assert.match(world.fake.connectionStatus.message.fr, /pas encore appairé/);
});

test('pairing: a code on the TV, the PIN, the credentials kept under /data', async (t) => {
  const tv = new FakePhilips();
  const dataDir = emptyDataDir();
  const world = await createWorld({ tvs: { [HOST_1]: tv }, dataDir });
  t.after(() => world.app.stop());

  const confirmFirst = await world.fake.action('pair_confirm', { tv: '1', pin: PIN });
  assert.equal(confirmFirst.success, false);
  assert.match(confirmFirst.error, /Show a pairing code/);

  const shown = await world.fake.action('pair_request', { tv: '1' });
  assert.equal(shown.success, true);
  assert.match(message(shown), /A code is shown on the TV.*TV 1, within 30 s/);
  assert.match(message(shown, 'fr'), /Un code s'affiche/);
  assert.ok(tv.pending, 'the TV shows a code');

  const wrong = await world.fake.action('pair_confirm', { tv: '1', pin: '1234' });
  assert.equal(wrong.success, false);
  assert.match(wrong.error, /Wrong code/);
  const garbage = await world.fake.action('pair_confirm', { tv: '1', pin: '12' });
  assert.match(garbage.error, /4 digits/);

  const paired = await world.fake.action('pair_confirm', { tv: '1', pin: ` ${PIN} ` });
  assert.equal(paired.success, true, paired.error);
  assert.match(message(paired), /is paired/);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(state(world, 'power'), 1);

  await world.app.stop();
  const saved = JSON.parse(await readFile(join(dataDir, 'philips-state.json'), 'utf8'));
  const credentials = saved.credentials[PLATFORM_ID];
  assert.equal(typeof credentials.user, 'string');
  assert.equal(tv.clients.get(credentials.user), credentials.password);

  // A new start reads the credentials back.
  const again = await createWorld({ tvs: { [HOST_1]: tv }, dataDir });
  t.after(() => again.app.stop());
  assert.deepEqual(again.fake.connectionStatus, { connected: true });
});

test('pairing a Saphi TV is not needed', async (t) => {
  const world = await createWorld({
    tvs: { [HOST_1]: new FakePhilips({ kind: 'saphi' }) },
    dataDir: emptyDataDir(),
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('pair_request', {});
  assert.equal(ack.success, true);
  assert.match(message(ack), /needs no pairing/);
  const none = await world.fake.action('pair_request', { tv: '2' });
  assert.match(none.error, /address of TV 2/);
});

test('credentials refused (pairing removed on the TV): said in the status', async (t) => {
  const tv = new FakePhilips(); // knows no client
  const world = await createWorld({ tvs: { [HOST_1]: tv } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /pairing refused by the TV/);
});

test('a stale nonce is answered once, without a failure', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.rotateNonce();
  world.tv.volume.current = 22;
  await world.hub.pollAll();
  assert.equal(state(world, 'volume'), 22);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('standby: power 0, Ambilight still read, the rest unpublished', async (t) => {
  const world = await createWorld({ tvs: { [HOST_1]: pairedTv({ power: 'StandbyKeep' }) } });
  t.after(() => world.app.stop());
  assert.equal(state(world, 'power'), 0);
  assert.equal(state(world, 'playing'), 'Off');
  assert.equal(state(world, 'volume'), undefined);
  assert.equal(state(world, 'ambilight'), 1, 'a lounge light may shine in standby');
});

test('a TV whose network sleeps: off, unreachable, no error once known', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.online = false;
  await world.hub.pollAll();
  assert.equal(state(world, 'power'), 0);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  const report = await world.fake.action('test_connection');
  assert.match(message(report), /asleep \(no answer\)/);
});

test('a TV never reached: not published, said in the status', async (t) => {
  const world = await createWorld({ tvs: {}, dataDir: emptyDataDir() });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 0);
  assert.match(world.fake.connectionStatus.message.en, /not reached yet/);
});

test('something else at the address, and a JointSpace 1 TV', async (t) => {
  const other = {
    online: true,
    port: 1925,
    android: false,
    handle: ({ url }) =>
      new URL(url).pathname === '/1/system'
        ? { status: 200, headers: {}, body: JSON.stringify({ name: '32PFL5605H', country: 'FR' }) }
        : { status: 404, headers: {}, body: 'Not found' },
  };
  const world = await createWorld({ tvs: { [HOST_1]: other }, dataDir: emptyDataDir() });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /before 2016/);
  other.handle = () => ({ status: 200, headers: {}, body: '<html>router</html>' });
  await world.fake.action('test_connection');
  assert.match(world.fake.connectionStatus.message.en, /no Philips TV API/);
});

test('identity and lists are kept: the device exists at start with the TV asleep', async (t) => {
  const first = await createWorld();
  await first.app.stop();
  const tv = first.tv;
  tv.online = false;
  const world = await createWorld({ tvs: { [HOST_1]: tv }, dataDir: first.dataDir });
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(device.external_id, deviceOf(first).external_id);
  assert.ok(featureOf(device, 'app').supported_options.length > 10, 'the apps of last time');
  assert.equal(state(world, 'power'), 0);
  assert.equal(world.hub.records.get(1).identity.mac, MAC);
});

test('content changed: app to app, channel, HDMI, with who did it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(events(world).length, 0, 'nothing at the first read');

  world.tv.showNetflix();
  await world.hub.pollAll();
  assert.equal(state(world, 'app'), NETFLIX);
  assert.equal(state(world, 'source'), OTHER_SOURCE);
  assert.equal(state(world, 'playing'), 'Netflix');
  assert.deepEqual(events(world).at(-1).data, {
    device: deviceOf(world).external_id,
    tv: 'Philips 65OLED855/12',
    kind: 'app',
    name: 'Netflix',
    channel_number: null,
    origin: ORIGINS.TV,
  });

  world.tv.openApp(YOUTUBE);
  await world.hub.pollAll();
  assert.equal(events(world).at(-1).data.name, 'YouTube', 'the TV says which app is in front');

  world.tv.watchHdmi();
  await world.hub.pollAll();
  assert.equal(events(world).at(-1).data.kind, 'source');
  assert.equal(state(world, 'source'), OTHER_SOURCE, 'the TV does not say which HDMI');
  assert.equal(state(world, 'playing'), 'HDMI source');

  const before = events(world).length;
  await world.hub.pollAll();
  assert.equal(events(world).length, before, 'no change, no event');

  await setValue(world, 'channel', 2);
  await world.hub.pollAll();
  const last = events(world).at(-1).data;
  assert.equal(last.kind, 'channel');
  assert.equal(last.channel_number, 2);
  assert.equal(last.origin, ORIGINS.GLADYS);
  assert.equal(state(world, 'channel'), 2);
});

test('sources: HDMI by intent, remembered until the screen changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'source', 'hdmi_2');
  const intent = world.tv.launches.at(-1);
  assert.equal(intent.action, 'org.droidtv.playtv.SELECTURI');
  assert.equal(
    intent.extras.uri,
    'content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW6',
  );
  await world.hub.pollAll();
  assert.equal(state(world, 'source'), 'hdmi_2');
  assert.equal(state(world, 'playing'), 'HDMI 2');

  await setValue(world, 'source', 'tv');
  assert.equal(world.tv.launches.at(-1).extras.uri, 'content://android.media.tv/channel/1648');
  await world.hub.pollAll();
  assert.equal(state(world, 'source'), 'tv');

  await setValue(world, 'source', OTHER_SOURCE);
  assert.equal(world.tv.keys.at(-1), 'Home');
});

test('apps: open by the select, by name in a scene, home', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'app', NETFLIX);
  assert.equal(world.tv.launches.at(-1).component.packageName, 'com.netflix.ninja');
  const ack = await world.fake.sceneAction('open_app', { app: 'youtube' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { app: 'YouTube' });
  const unknown = await world.fake.sceneAction('open_app', { app: 'Molotov' });
  assert.match(unknown.error, /No app "Molotov"/);
  await setValue(world, 'app', HOME_APP);
  assert.equal(world.tv.keys.at(-1), 'Home');
});

test('volume, mute and the buttons', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'volume', 30);
  assert.equal(world.tv.volume.current, 30);
  assert.equal(state(world, 'volume'), 30);
  await setValue(world, 'volume', 500);
  assert.equal(world.tv.volume.current, 60, 'within the bounds of the TV');
  await setValue(world, 'volume_down', 1);
  assert.equal(world.tv.keys.at(-1), 'VolumeDown');
  await setValue(world, 'volume_up', 1);
  assert.equal(world.tv.keys.at(-1), 'VolumeUp');
  await setValue(world, 'mute', 1);
  assert.equal(world.tv.keys.at(-1), 'Mute');
  assert.equal(world.tv.volume.muted, true);
  await setValue(world, 'channel_up', 1);
  assert.equal(world.tv.keys.at(-1), 'ChannelStepUp');
});

test('channels: by preset number, unknown number refused', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'channel', 2);
  assert.deepEqual(world.tv.posts.at(-1), {
    path: 'activities/tv',
    payload: { channelList: { id: 'all' }, channel: { ccid: 1649 } },
  });
  await assert.rejects(world.hub.setChannel(world.hub.records.get(1), 42), /No channel 42/);
});

test('power: standby, on through the API, on through Wake-on-LAN', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'power', 0);
  assert.equal(world.tv.power, 'Standby');
  assert.equal(state(world, 'power'), 0);

  await setValue(world, 'power', 1);
  assert.equal(world.tv.power, 'On');
  assert.equal(state(world, 'power'), 1);

  // Its network asleep: a magic packet, then "On" once it answers in standby.
  world.tv.power = 'Standby';
  world.tv.online = false;
  await world.hub.pollAll();
  const tv = world.tv;
  const wakes = [];
  world.gladys.wakeOnLan = async (mac) => {
    wakes.push(mac);
    tv.online = true; // the packet wakes its network, the screen stays off
  };
  const record = world.hub.records.get(1);
  await world.hub.openApp(record, 'Netflix');
  assert.deepEqual(wakes, [MAC]);
  assert.equal(tv.power, 'On', 'asked to turn on once it answered');
  assert.equal(tv.launches.at(-1).component.packageName, 'com.netflix.ninja');
});

test('Wake-on-LAN off, MAC unknown: the TV that sleeps cannot be turned on', async (t) => {
  const world = await createWorld({
    config: { tv_1_host: HOST_1, wake_on_lan: false, language: 'en' },
  });
  t.after(() => world.app.stop());
  world.tv.online = false;
  await world.hub.pollAll();
  await assert.rejects(world.hub.ensureOn(world.hub.records.get(1)), /MAC address is unknown/);
});

test('a feature command still running after 4 s is acknowledged', async (t) => {
  const world = await createWorld({ timings: { featureAckMs: 10 } });
  t.after(() => world.app.stop());
  const tv = world.tv;
  const slow = tv.handle.bind(tv);
  tv.handle = (request) =>
    request.url.endsWith('/activities/launch')
      ? new Promise((resolve) => setTimeout(() => resolve(slow(request)), 50))
      : slow(request);
  const ack = await setValue(world, 'app', NETFLIX);
  assert.equal(ack.success, true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(tv.launches.length, 1, 'the command went on');
});

test('Ambilight: on / off, a style, a fixed colour, Ambilight + Hue', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'ambilight', 0);
  assert.equal(world.tv.ambilightPower, 'Off');
  assert.equal(state(world, 'ambilight'), 0);

  await setValue(world, 'ambilight_style', 'lounge_hot_lava');
  assert.deepEqual(world.tv.ambilightConfiguration, {
    styleName: 'FOLLOW_COLOR',
    isExpert: false,
    menuSetting: 'HOT_LAVA',
  });
  assert.equal(state(world, 'ambilight'), 1);
  await world.hub.pollAll();
  assert.equal(state(world, 'ambilight_style'), 'lounge_hot_lava');

  await setValue(world, 'ambilight_color', 0xff8800);
  const configuration = world.tv.ambilightConfiguration;
  assert.equal(configuration.isExpert, true);
  assert.equal(configuration.styleName, 'FOLLOW_COLOR', 'the style that lists MANUAL_HUE');
  assert.equal(configuration.colorSettings.algorithm, 'MANUAL_HUE');
  assert.deepEqual(configuration.colorSettings.color, {
    hue: 23,
    saturation: 255,
    brightness: 255,
  });
  await world.hub.pollAll();
  assert.equal(state(world, 'ambilight_style'), 'color');
  const color = state(world, 'ambilight_color');
  assert.ok(Math.abs(((color >> 8) & 0xff) - 0x88) <= 2, `${color.toString(16)} ≈ ff8800`);

  await setValue(world, 'ambilight_hue', 1);
  assert.equal(world.tv.huePower, 'On');
  assert.equal(state(world, 'ambilight_hue'), 1);

  await assert.rejects(
    world.hub.setAmbilightStyle(world.hub.records.get(1), 'video_disco'),
    /no Ambilight style "video_disco"/,
  );
});

test('a read that overlaps a command is dropped', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const tv = world.tv;
  const record = world.hub.records.get(1);
  const handle = tv.handle.bind(tv);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  tv.handle = async (request) => {
    if (request.url.endsWith('/audio/volume') && request.method === 'GET') {
      await gate;
    }
    return handle(request);
  };
  const reading = world.hub.poll(record);
  await new Promise((resolve) => setImmediate(resolve));
  tv.volume.current = 5; // read by the poll, before the command
  tv.handle = handle;
  await world.hub.setVolume(record, 40);
  release();
  assert.equal(await reading, false);
  assert.equal(state(world, 'volume'), 40, 'the stale read did not publish');
});

test('onDeviceCreated sends every state again, and refreshes the widgets', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = statesOf(world, 'power').length;
  await createAll(world);
  assert.equal(statesOf(world, 'power').length, before + 1);
  assert.ok(world.fake.widgetRefreshes.includes('remote'));
  assert.ok(world.fake.widgetRefreshes.includes('ambilight'));
});

test('a reconnection publishes everything again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = statesOf(world, 'volume').length;
  await world.hub.resync(world.fake.config);
  assert.equal(statesOf(world, 'volume').length, before + 1);
});

test('search: a TV found by SSDP goes to a free slot, a moved TV to its new address', async (t) => {
  const tv = pairedTv();
  const saphi = new FakePhilips({ kind: 'saphi' });
  saphi.networkDevices = []; // its MAC: the one the core saw
  const world = await createWorld({
    tvs: { [HOST_1]: tv },
    config: { tv_1_host: HOST_1, language: 'en' },
  });
  t.after(() => world.app.stop());
  world.network.tvs[HOST_2] = saphi;
  const ssdp = (ip, mac) => ({
    source_ip: ip,
    ...(mac ? { source_mac: mac } : {}),
    source_port: 1900,
    headers: 'HTTP/1.1 200 OK\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n',
  });
  world.fake.scanResults.ssdp = [
    ssdp(HOST_2, '02-00-5E-10-00-0B'),
    ssdp(HOST_2),
    ssdp(HOST_1),
    ssdp('192.0.2.99'), // a speaker: no JointSpace API
    { source_ip: 'fe80::1', headers: '' },
  ];
  const ack = await world.fake.action('search');
  assert.equal(ack.success, true, ack.error);
  assert.match(message(ack), /Philips 50PUS6804\/12 \(192\.0\.2\.11\) added as TV 2/);
  assert.match(message(ack), /Philips 65OLED855\/12: already TV 1/);
  assert.equal(world.fake.config.tv_2_host, HOST_2, 'written in the configuration');
  assert.equal(world.fake.scans.at(-1).type, 'ssdp');
  assert.equal(world.fake.discoveredDevices.length, 2);
  assert.equal(world.hub.records.get(2).identity.mac, '02:00:5e:10:00:0b', 'the MAC the core saw');

  // DHCP moved the Android TV: same identity, new address, pairing kept.
  delete world.network.tvs[HOST_1];
  world.network.tvs['192.0.2.20'] = tv;
  world.fake.scanResults.ssdp = [ssdp('192.0.2.20')];
  await world.fake.scanRequest();
  assert.equal(world.fake.config.tv_1_host, '192.0.2.20');
  const device = world.fake.discoveredDevices.find((item) => item.name === 'Philips 65OLED855/12');
  assert.deepEqual(device.params[0], { name: 'PHILIPS_HOST', value: '192.0.2.20' });
  assert.deepEqual(world.fake.connectionStatus, { connected: true }, 'still paired');
});

test('search: nothing found, and an older Gladys without the scan', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const none = await world.fake.action('search');
  assert.match(message(none), /No Philips TV answered/);
  world.gladys.scanNetwork = async () => {
    throw Object.assign(new Error('Not found'), { status: 404 });
  };
  const old = await world.fake.action('search');
  assert.match(message(old), /unavailable/);
});

test('the same TV in two slots: the second one is reported', async (t) => {
  const tv = pairedTv();
  const world = await createWorld({
    tvs: { [HOST_1]: tv, 'tv.local': tv },
    config: { tv_1_host: HOST_1, tv_2_host: 'tv.local', language: 'en' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.match(world.fake.connectionStatus.message.en, /the same TV as another slot/);
});

test('test the connection: one line per TV, in four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.match(message(ack), /OK, 65OLED855\/12, on, paired, 14 app\(s\)/);
  assert.match(message(ack, 'fr'), /allumé, appairé, 14 application\(s\)/);
  assert.match(message(ack, 'de'), /eingeschaltet/);
  assert.match(message(ack, 'es'), /encendido/);
});

test('no TV configured, or an address not understood', async (t) => {
  const world = await createWorld({ config: { tv_1_host: 'http://user:pw@192.0.2.10' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /Address not understood/);
  await world.fake.configUpdated({});
  assert.match(world.fake.connectionStatus.message.fr, /Rechercher les téléviseurs/);
});

test('SSDP answers and MAC addresses', () => {
  assert.deepEqual(
    ssdpCandidates([
      { source_ip: '192.0.2.5' },
      { source_ip: '192.0.2.5', source_mac: '02:00:5E:10:00:05' },
      { source_ip: 'tv.local' },
      null,
    ]),
    [{ host: '192.0.2.5', mac: '02:00:5e:10:00:05' }],
  );
  assert.deepEqual(ssdpCandidates(undefined), []);
  assert.equal(normalizeMac('0200.5e10.0005'), '02:00:5e:10:00:05');
  assert.equal(normalizeMac('00:00:00:00:00:00'), null);
  assert.equal(normalizeMac(undefined), null);
  assert.equal(
    macOf(
      [
        { mac: '02-00-5E-10-00-02', ip: '192.0.2.99' },
        { mac: '02:00:5e:10:00:01', ip: '192.0.2.10' },
      ],
      '192.0.2.10',
    ),
    '02:00:5e:10:00:01',
  );
  assert.equal(macOf([{ mac: '02-00-5E-10-00-02', ip: 'x' }], '192.0.2.10'), '02:00:5e:10:00:02');
  assert.equal(macOf([{ mac: 'nope' }], 'x'), null);
  assert.equal(macOf({}, 'x'), null);
});

test('the credentials never reach the logs nor Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.action('test_connection');
  const sent = JSON.stringify(world.fake.requests);
  assert.ok(!sent.includes(CREDENTIALS.password));
  assert.ok(!sent.includes(CREDENTIALS.user));
});
