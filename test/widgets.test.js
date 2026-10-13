// -----------------------------------------------------------------------------
// The four dashboard widgets: contents valid for the core (the SDK's
// validateWidgetContent, budget included), localized, and their buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS, DEFAULT_KEYS, DEFAULT_STYLES, resolveShortcuts } from '../src/widgets.js';
import { FakePhilips, HOST_1, HOST_2, createWorld, deviceOf, pairedTv } from './helpers/world.js';

async function content(world, key, settings = {}, language = 'en') {
  const ack = await world.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: body } = ack.data;
  assert.deepEqual(validateWidgetContent(body), [], `${key}: valid content`);
  assert.ok(body.components.length <= 8, `${key}: 8 components at most`);
  assert.ok(
    body.components.filter((c) => c.type === 'text').length <= 2,
    `${key}: 2 texts at most`,
  );
  const keys = body.components.filter((c) => c.type === 'button').map((c) => c.action.key);
  assert.equal(new Set(keys).size, keys.length, `${key}: unique action keys`);
  assert.ok(keys.length <= 4, `${key}: 4 buttons at most`);
  return body;
}

const buttons = (body) => body.components.filter((component) => component.type === 'button');
const status = (body) => body.components.find((component) => component.type === 'status').items;
const action = (world, key, button, settings = {}) =>
  world.fake.widgetAction(key, button.action.key, button.action.params ?? {}, { settings });

test('every widget, in every language and every state, fits the core', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const states = [
    () => {},
    () => world.tv.showNetflix(),
    () => world.tv.watchHdmi(),
    () => {
      world.tv.power = 'Standby';
    },
    () => {
      world.tv.online = false;
    },
  ];
  for (const change of states) {
    change();
    await world.hub.pollAll();
    for (const key of Object.values(WIDGET_KEYS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        await content(world, key, {}, language);
        await content(world, key, { device: deviceOf(world).external_id }, language);
      }
    }
  }
});

test('remote: state, screen, volume, and four buttons that act', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.REMOTE, {}, 'fr');
  assert.deepEqual(
    status(body).map((item) => [item.label, item.value]),
    [
      ['Philips 65OLED855/12', 'Allumée'],
      ["À l'écran", '1 · Irdeto scrambled'],
      ['Volume', 18],
    ],
  );
  assert.deepEqual(
    buttons(body).map((button) => button.action.key),
    [ACTIONS.POWER, ACTIONS.VOLUME_DOWN, ACTIONS.VOLUME_UP, ACTIONS.MUTE],
  );
  const [power, down, up, mute] = buttons(body);
  await action(world, WIDGET_KEYS.REMOTE, up);
  assert.equal(world.tv.keys.at(-1), 'VolumeUp');
  await action(world, WIDGET_KEYS.REMOTE, down);
  assert.equal(world.tv.keys.at(-1), 'VolumeDown');
  await action(world, WIDGET_KEYS.REMOTE, mute);
  assert.equal(world.tv.keys.at(-1), 'Mute');
  const ack = await action(world, WIDGET_KEYS.REMOTE, power);
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.fr, /éteint/);
  assert.equal(world.tv.power, 'Standby');
  body = await content(world, WIDGET_KEYS.REMOTE, {}, 'en');
  assert.equal(buttons(body)[0].label, 'Turn on');
});

test('ambilight: state and style, on / off, three styles, the current one checked', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.AMBILIGHT, {}, 'en');
  assert.deepEqual(
    status(body)
      .slice(1)
      .map((item) => [item.label, item.value]),
    [
      ['Ambilight', 'On'],
      ['Style', 'Follow video · Standard'],
    ],
  );
  const [toggle, ...styles] = buttons(body);
  assert.equal(toggle.label, 'Ambilight off');
  assert.deepEqual(
    styles.map((button) => button.action.params.style),
    DEFAULT_STYLES,
  );
  assert.equal(styles[0].icon, 'check-circle', 'the current style');
  await action(world, WIDGET_KEYS.AMBILIGHT, styles[2]);
  assert.equal(world.tv.ambilightConfiguration.menuSetting, 'HOT_LAVA');
  await action(world, WIDGET_KEYS.AMBILIGHT, toggle);
  assert.equal(world.tv.ambilightPower, 'Off');
  body = await content(world, WIDGET_KEYS.AMBILIGHT, { style_1: 'color' }, 'fr');
  assert.equal(buttons(body)[0].label, "Allumer l'Ambilight");
  assert.equal(buttons(body)[1].label, 'Couleur fixe');
  await action(world, WIDGET_KEYS.AMBILIGHT, buttons(body)[1]);
  assert.equal(world.tv.ambilightConfiguration.isExpert, true);
});

test('ambilight: a TV without Ambilight says so', async (t) => {
  const tv = pairedTv();
  tv.system.featuring.jsonfeatures.ambilight = [];
  const world = await createWorld({ tvs: { [HOST_1]: tv } });
  t.after(() => world.app.stop());
  const body = await content(world, WIDGET_KEYS.AMBILIGHT, {}, 'en');
  assert.match(body.components[0].text, /no Ambilight/);
});

test('keys: four keys of the settings, arrows by default', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.KEYS);
  assert.deepEqual(
    buttons(body).map((button) => button.action.params.key),
    DEFAULT_KEYS,
  );
  body = await content(world, WIDGET_KEYS.KEYS, {
    key_1: 'confirm',
    key_2: 'back',
    key_3: 'nope',
    key_4: 'play_pause',
  });
  assert.deepEqual(
    buttons(body).map((button) => button.action.params.key),
    ['confirm', 'back', 'left', 'play_pause'],
  );
  await action(world, WIDGET_KEYS.KEYS, buttons(body)[0]);
  assert.equal(world.tv.keys.at(-1), 'Confirm');
  await action(world, WIDGET_KEYS.KEYS, buttons(body)[3]);
  assert.equal(world.tv.keys.at(-1), 'Confirm', 'Play / pause is OK on Android');
});

test('shortcuts: sources and apps by name, the missing ones said', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.SHORTCUTS);
  assert.deepEqual(
    buttons(body).map((button) => button.label),
    ['TV', 'HDMI 1', 'HDMI 2', 'HDMI 3'],
  );
  assert.equal(buttons(body)[0].icon, 'check-circle', 'the tuner is on screen');
  body = await content(world, WIDGET_KEYS.SHORTCUTS, {
    shortcut_1: 'Netflix',
    shortcut_2: 'hdmi 2',
    shortcut_3: 'Molotov',
  });
  assert.deepEqual(
    buttons(body).map((button) => button.label),
    ['Netflix', 'HDMI 2'],
  );
  assert.equal(body.components[1].text, 'Not found: Molotov');
  const ack = await action(world, WIDGET_KEYS.SHORTCUTS, buttons(body)[0]);
  assert.equal(ack.data.message.en, 'Netflix on screen.');
  assert.equal(world.tv.launches.at(-1).component.packageName, 'com.netflix.ninja');
  await action(world, WIDGET_KEYS.SHORTCUTS, buttons(body)[1]);
  assert.match(world.tv.launches.at(-1).extras.uri, /HW6$/);
  assert.deepEqual(resolveShortcuts({ apps: [] }, { shortcut_1: ' ' }).shortcuts.length, 4);
});

test('shortcuts on a Saphi TV, and the widgets without a TV or with a gone one', async (t) => {
  const world = await createWorld({
    tvs: { [HOST_1]: new FakePhilips({ kind: 'saphi' }) },
  });
  t.after(() => world.app.stop());
  const body = await content(world, WIDGET_KEYS.SHORTCUTS);
  assert.match(body.components[0].text, /neither apps nor sources|nor sources/);
  const gone = await content(world, WIDGET_KEYS.REMOTE, { device: 'ext:test-integration:tv:x' });
  assert.match(gone.components[0].text, /no longer in the configuration/);
  await world.fake.configUpdated({});
  const none = await content(world, WIDGET_KEYS.KEYS);
  assert.match(none.components[0].text, /Enter the address/);
  const ack = await world.fake.widgetAction(WIDGET_KEYS.KEYS, 'key_1', { key: 'home' }, {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Aucun téléviseur/, 'French, the default language');
});

test('two TVs: each widget follows its device', async (t) => {
  const second = new FakePhilips({ kind: 'saphi', power: 'Standby' });
  const world = await createWorld({
    tvs: { [HOST_1]: pairedTv(), [HOST_2]: second },
    config: { tv_1_host: HOST_1, tv_2_host: HOST_2, language: 'en' },
  });
  t.after(() => world.app.stop());
  const saphi = world.fake.discoveredDevices.find((device) => device.name.includes('50PUS'));
  const body = await content(world, WIDGET_KEYS.REMOTE, { device: saphi.external_id });
  assert.equal(status(body)[0].value, 'Standby');
  await action(world, WIDGET_KEYS.REMOTE, buttons(body)[0], { device: saphi.external_id });
  assert.equal(second.power, 'On');
});
