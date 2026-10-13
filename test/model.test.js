// -----------------------------------------------------------------------------
// Parsers of the JointSpace answers, on the real answers of ha-philipsjs, and
// the name matching of the scenes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOURCES,
  appIdOf,
  channelListIds,
  colorStyleName,
  contextActivity,
  findApp,
  findSource,
  hsbToRgb,
  isPlayTv,
  isWatchingTv,
  normalize,
  parseApps,
  parseChannelList,
  parseConfiguration,
  parseCurrentChannel,
  parsePower,
  parseStyles,
  parseSystem,
  parseVolume,
  rgbToHsb,
  sourceIntent,
} from '../src/philips/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/philips/${name}.json`, import.meta.url), 'utf8'));

test('/system: identity, transport and capabilities of an Android and a Saphi TV', () => {
  const android = parseSystem(fixture('system-android'));
  assert.deepEqual(android, {
    platformId: 'sn-abcdefghijklf',
    serial: 'ABCDEFGHIJKLF',
    model: '65OLED855/12',
    name: '65OLED855/12',
    softwareVersion: 'TPM191E_R.101.001.208.001',
    apiVersion: 6,
    secure: true,
    pairing: true,
    android: true,
    osType: 'MSAF_2019_P',
    capabilities: { apps: true, launch: true, ambilight: true, hue: true },
  });
  const saphi = parseSystem(fixture('system-saphi'));
  assert.equal(saphi.model, '50PUS6804/12');
  assert.equal(saphi.osType, 'Linux');
  assert.equal(saphi.secure, false);
  assert.equal(saphi.pairing, false);
  assert.deepEqual(saphi.capabilities, { apps: false, launch: false, ambilight: true, hue: true });
  // No serial: the device id; neither: no identity.
  const { serialnumber_encrypted: _serial, ...noSerial } = fixture('system-saphi');
  assert.equal(parseSystem(noSerial).platformId, 'id-1234567890');
  assert.equal(parseSystem({ name: 'x', api_version: { Major: 6 } }).platformId, null);
});

test('power, volume', () => {
  assert.equal(parsePower(fixture('powerstate')), 'on');
  assert.equal(parsePower({ powerstate: 'Standby' }), 'standby');
  assert.equal(parsePower({ powerstate: 'StandbyKeep' }), 'standby');
  assert.equal(parsePower({}), null);
  assert.deepEqual(parseVolume(fixture('audio-volume')), {
    volume: 18,
    min: 0,
    max: 60,
    muted: false,
  });
  assert.equal(parseVolume({}), null);
  assert.equal(parseVolume({ current: 5, max: 0 }), null);
  assert.equal(parseVolume({ current: 90, min: 0, max: 60, muted: 'true' }).volume, 60);
});

test('applications, the app in front', () => {
  const apps = parseApps(fixture('applications'));
  assert.equal(apps.length, 14);
  const netflix = apps.find((app) => app.label === 'Netflix');
  assert.equal(netflix.id, 'com.netflix.ninja.MainActivity-com.netflix.ninja');
  assert.equal(netflix.intent.component.packageName, 'com.netflix.ninja');
  assert.deepEqual(parseApps({}), []);
  assert.deepEqual(parseApps({ applications: [{ label: 'x' }, { id: 'a', label: '' }] }), []);
  const current = fixture('activities-current').component;
  assert.equal(
    appIdOf(current),
    'org.droidtv.nettv.market.MarketMainActivity-org.droidtv.nettv.market',
  );
  assert.equal(appIdOf(undefined), null);
  assert.equal(isPlayTv({ packageName: 'org.droidtv.playtv' }), true);
  assert.equal(isPlayTv(current), false);
});

test('channels, the channel on screen, the context', () => {
  assert.deepEqual(channelListIds(fixture('channeldb-tv-android')), ['all']);
  assert.deepEqual(parseChannelList(fixture('channellist-all'), 'all'), [
    { ccid: 1648, preset: 1, name: 'Irdeto scrambled', listId: 'all' },
    { ccid: 1649, preset: 2, name: null, listId: 'all' },
  ]);
  assert.deepEqual(parseCurrentChannel(fixture('activities-tv-android')), {
    ccid: 1648,
    preset: null,
    name: null,
    listId: '1',
  });
  // On an HDMI source the TV answers "@".
  assert.equal(parseCurrentChannel({ channel: { ccid: '@', preset: 0, name: '@' } }), null);
  assert.equal(contextActivity(fixture('context')), 'WatchTv');
  assert.equal(isWatchingTv('WatchSatellite'), true);
  assert.equal(isWatchingTv('WatchExtension'), false);
});

test('sources and their intent', () => {
  assert.deepEqual(
    SOURCES.map((source) => source.name),
    ['TV', 'HDMI 1', 'HDMI 2', 'HDMI 3', 'HDMI 4'],
  );
  assert.equal(findSource('hdmi 2').key, 'hdmi_2');
  assert.equal(findSource('HDMI2').key, 'hdmi_2');
  assert.equal(findSource('hdmi_4').key, 'hdmi_4');
  assert.equal(findSource('tv').key, 'tv');
  assert.equal(findSource('HDMI 5'), null);
  assert.equal(findSource(''), null);
  assert.deepEqual(sourceIntent('content://x'), {
    extras: { uri: 'content://x' },
    action: 'org.droidtv.playtv.SELECTURI',
    component: {
      packageName: 'org.droidtv.playtv',
      className: 'org.droidtv.playtv.PlayTvActivity',
    },
  });
});

test('apps by name: exact, accents and case ignored, then the start of the name', () => {
  const apps = parseApps(fixture('applications'));
  assert.equal(findApp(apps, 'netflix').label, 'Netflix');
  assert.equal(findApp(apps, 'You').label, 'YouTube');
  assert.equal(findApp(apps, 'sa har').label, 'Så här......');
  assert.equal(findApp(apps, 'com.netflix.ninja.MainActivity-com.netflix.ninja').label, 'Netflix');
  assert.equal(findApp(apps, 'Molotov'), null);
  assert.equal(findApp(apps, '  '), null);
  assert.equal(normalize('Écran d’accueil'), 'ecrandaccueil');
});

test('Ambilight styles: the TV list, the firmware fallbacks', () => {
  const android = parseStyles(fixture('ambilight-supportedstyles-android'), { android: true });
  const keys = android.map((style) => style.key);
  assert.ok(keys.includes('video_standard'));
  assert.ok(keys.includes('audio_vu_meter'));
  assert.ok(keys.includes('lounge_hot_lava'));
  assert.ok(!keys.includes('lounge_custom_color'), 'the custom colour is the colour feature');
  assert.equal(android.find((style) => style.key === 'lounge_hot_lava').styleName, 'FOLLOW_COLOR');
  const saphi = parseStyles(fixture('ambilight-supportedstyles-saphi'), { android: false });
  assert.equal(saphi.find((style) => style.key === 'lounge_deep_water').styleName, 'Lounge light');
  assert.ok(
    saphi.some((style) => style.key === 'video_sports'),
    'video, even unlisted',
  );
  const listed = parseStyles({
    supportedStyles: [{ styleName: 'FOLLOW_VIDEO', menuSettings: ['STANDARD', 'GAME'] }],
  });
  assert.deepEqual(
    listed.map((style) => style.key),
    ['video_standard', 'video_game'],
  );
  assert.ok(parseStyles(null).length > 10, 'not read yet: the fallback');
  assert.equal(colorStyleName(fixture('ambilight-supportedstyles-android')), 'FOLLOW_COLOR');
  assert.equal(colorStyleName(fixture('ambilight-supportedstyles-saphi')), 'Lounge light');
});

test('the current Ambilight configuration', () => {
  assert.deepEqual(parseConfiguration(fixture('ambilight-currentconfiguration')), {
    style: 'video_standard',
    color: null,
  });
  assert.deepEqual(parseConfiguration({ styleName: 'OFF' }), { style: null, color: null });
  assert.deepEqual(
    parseConfiguration({
      styleName: 'Lounge light',
      isExpert: true,
      colorSettings: { color: { hue: 0, saturation: 255, brightness: 255 } },
    }),
    { style: 'color', color: 0xff0000 },
  );
  assert.deepEqual(
    parseConfiguration({ styleName: 'FOLLOW_AUDIO', isExpert: true, audioSettings: {} }),
    { style: null, color: null },
  );
});

test('colours: RGB to the Ambilight HSB and back', () => {
  assert.deepEqual(rgbToHsb(0xff0000), { hue: 0, saturation: 255, brightness: 255 });
  assert.deepEqual(rgbToHsb(0xffffff), { hue: 0, saturation: 0, brightness: 255 });
  assert.deepEqual(rgbToHsb(0), { hue: 0, saturation: 0, brightness: 0 });
  for (const rgb of [0xff8800, 0x00ff00, 0x0000ff, 0x123456, 0xabcdef]) {
    const back = hsbToRgb(rgbToHsb(rgb));
    for (const shift of [16, 8, 0]) {
      assert.ok(
        Math.abs(((back >> shift) & 0xff) - ((rgb >> shift) & 0xff)) <= 3,
        `${rgb.toString(16)} → ${back.toString(16)}`,
      );
    }
  }
});
