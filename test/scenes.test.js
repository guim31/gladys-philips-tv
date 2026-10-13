// -----------------------------------------------------------------------------
// Scene actions: by name, a TV to choose when there are several, the outputs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor } from '../src/scenes.js';
import { FakePhilips, HOST_1, HOST_2, createWorld, deviceOf, pairedTv } from './helpers/world.js';

test('open_app, select_source, send_key: done, with their outputs', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('open_app', { app: 'netflix' });
  assert.deepEqual(ack.data.outputs, { app: 'Netflix' });
  ack = await world.fake.sceneAction('select_source', { source: 'hdmi_3' });
  assert.deepEqual(ack.data.outputs, { source: 'HDMI 3' });
  assert.match(world.tv.launches.at(-1).extras.uri, /HW7$/);
  ack = await world.fake.sceneAction('send_key', { key: 'right', repeat: 3 });
  assert.deepEqual(ack.data.outputs, { presses: 3 });
  assert.deepEqual(world.tv.keys.slice(-3), ['CursorRight', 'CursorRight', 'CursorRight']);
  ack = await world.fake.sceneAction('send_key', { key: 'up', repeat: 99 });
  assert.deepEqual(ack.data.outputs, { presses: 10 });
  ack = await world.fake.sceneAction('send_key', { key: 'eject' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown key "eject"/);
});

test('ambilight_style: a style, off, a fixed colour typed or the last one', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('ambilight_style', { style: 'audio_vu_meter' });
  assert.deepEqual(ack.data.outputs, { style: 'Follow audio · Retro' });
  assert.equal(world.tv.ambilightConfiguration.styleName, 'FOLLOW_AUDIO');
  ack = await world.fake.sceneAction('ambilight_style', { style: 'off' });
  assert.deepEqual(ack.data.outputs, { style: 'off' });
  assert.equal(world.tv.ambilightPower, 'Off');
  ack = await world.fake.sceneAction('ambilight_style', { style: 'color', color: '#00FF00' });
  assert.deepEqual(ack.data.outputs, { style: 'color' });
  assert.deepEqual(world.tv.ambilightConfiguration.colorSettings.color, {
    hue: 85,
    saturation: 255,
    brightness: 255,
  });
  ack = await world.fake.sceneAction('ambilight_style', { style: 'color' });
  assert.equal(ack.success, true, 'the last colour');
  assert.equal(world.tv.ambilightConfiguration.colorSettings.color.hue, 85);
  ack = await world.fake.sceneAction('ambilight_style', { style: 'color', color: 'green' });
  assert.match(ack.error, /Colour not understood: "green"/);
  ack = await world.fake.sceneAction('ambilight_style', { style: 'video_sports' });
  assert.match(ack.error, /no Ambilight style "video_sports"/, 'not an Android menu');
});

test('several TVs: the action needs one, by device', async (t) => {
  const saphi = new FakePhilips({ kind: 'saphi' });
  const world = await createWorld({
    tvs: { [HOST_1]: pairedTv(), [HOST_2]: saphi },
    config: { tv_1_host: HOST_1, tv_2_host: HOST_2, language: 'en' },
  });
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('send_key', { key: 'home' });
  assert.match(ack.error, /Several TVs are configured/);
  const device = world.fake.discoveredDevices.find((item) => item.name.includes('50PUS'));
  ack = await world.fake.sceneAction('send_key', { device: device.external_id, key: 'home' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(saphi.keys, ['Home']);
  ack = await world.fake.sceneAction('send_key', {
    device: 'ext:test-integration:tv:zz',
    key: 'home',
  });
  assert.match(ack.error, /no longer in the configuration/);
  ack = await world.fake.sceneAction('open_app', { device: device.external_id, app: 'Netflix' });
  assert.match(ack.error, /not an Android TV/);
  assert.ok(deviceOf(world));
});

test('colours typed in a scene', () => {
  assert.equal(parseColor('#FF8800'), 0xff8800);
  assert.equal(parseColor(' ff8800 '), 0xff8800);
  assert.equal(parseColor('#F80'), null);
  assert.equal(parseColor(undefined), null);
});
