// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the real answers kept in ha-philipsjs): one to three TVs, Android
// (paired or not) and Saphi, on a channel, an HDMI source, an application, a
// fixed Ambilight colour or in standby, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys". The
// option lists follow the core's normalizeSupportedOptions (unique values,
// non-empty labels, strings on text/select only).
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled and guim31/gladys-sony-bravia.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUSH_KEYS } from '../src/devices.js';
import { FakePhilips, HOST_1, HOST_2, HOST_3, createWorld, pairedTv } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const threeTvs = {
  tv_1_host: HOST_1,
  tv_1_name: 'Salon',
  tv_2_host: `http://${HOST_2}:1925/`,
  tv_3_host: HOST_3,
};

const scenarios = [
  {
    label: 'one Android TV on a channel',
    config: undefined,
    tvs: () => ({ [HOST_1]: pairedTv() }),
  },
  {
    label: 'one Android TV on HDMI',
    config: undefined,
    tvs: () => {
      const tv = pairedTv();
      tv.watchHdmi();
      return { [HOST_1]: tv };
    },
  },
  {
    label: 'one Android TV in an app, fixed Ambilight colour',
    config: undefined,
    tvs: () => {
      const tv = pairedTv();
      tv.showNetflix();
      tv.ambilightConfiguration = {
        styleName: 'FOLLOW_COLOR',
        isExpert: true,
        colorSettings: {
          color: { hue: 23, saturation: 255, brightness: 200 },
          colorDelta: { hue: 0, saturation: 0, brightness: 0 },
          algorithm: 'MANUAL_HUE',
        },
      };
      return { [HOST_1]: tv };
    },
  },
  {
    label: 'one Android TV in standby',
    config: undefined,
    tvs: () => ({ [HOST_1]: pairedTv({ power: 'Standby' }) }),
  },
  {
    label: 'one Android TV not paired',
    config: undefined,
    // Its API answers nothing but /system before the pairing: no state at all.
    silent: true,
    tvs: () => ({ [HOST_1]: new FakePhilips() }),
  },
  ...['en', 'fr', 'de', 'es'].map((language) => ({
    label: `three TVs, names in ${language}`,
    config: { ...threeTvs, language },
    tvs: () => {
      const saphi = new FakePhilips({ kind: 'saphi', hue: false });
      return {
        [HOST_1]: pairedTv(),
        [HOST_2]: saphi,
        [HOST_3]: new FakePhilips({ kind: 'saphi', power: 'Standby', serial: 'ZX0000000003' }),
      };
    },
  })),
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, app } = await createWorld({
      config: scenario.config,
      tvs: scenario.tvs(),
    });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, scenario.config ? 3 : 1);
      assert.equal(new Set(devices.map((device) => device.external_id)).size, devices.length);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }
        for (const param of device.params ?? []) {
          assert.ok(!/^GLADYS_/i.test(param.name), `${where}: reserved param ${param.name}`);
          assert.equal(typeof param.value, 'string');
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The option lists, as the core's normalizeSupportedOptions wants them.
          const isSelect = feature.category === 'text' && feature.type === 'select';
          if (feature.supported_options !== undefined) {
            assert.ok(isSelect, `${at}: string options belong to text/select features only`);
            assert.ok(feature.supported_options.length > 0, `${at}: no option`);
            const values = feature.supported_options.map((option) => `${option.value}`);
            assert.equal(new Set(values).size, values.length, `${at}: duplicate option values`);
            for (const option of feature.supported_options) {
              assert.ok(
                typeof option.value === 'string' && option.value.trim().length > 0,
                `${at}: option value`,
              );
              assert.ok(
                typeof option.label === 'string' && option.label.trim().length > 0,
                `${at}: option label`,
              );
              assert.ok(Number.isInteger(option.sort_order), `${at}: option sort_order`);
            }
          } else {
            assert.ok(!isSelect, `${at}: a select without options`);
          }

          // The value published from the fixtures fits the feature.
          const key = feature.external_id.slice(device.external_id.length + 1);
          const value = gladys.fake.lastState(feature.external_id);
          if (PUSH_KEYS.has(key)) {
            assert.equal(value, undefined, `${at}: a push button has no state`);
            assert.equal(feature.read_only, false, `${at}: a push button is writable`);
            continue;
          }
          if (scenario.silent) {
            assert.equal(value, undefined, `${at}: a state without pairing`);
            continue;
          }
          if (value === undefined) {
            // Volume, channel, the selects and the colour say nothing while
            // off, elsewhere or unknown.
            assert.ok(
              ['volume', 'channel', 'source', 'app', 'ambilight_style', 'ambilight_color'].includes(
                key,
              ),
              `${at}: no state published`,
            );
            continue;
          }
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: ${value} is not a text`);
            assert.ok(value.trim().length > 0, `${at}: empty text`);
            if (isSelect) {
              assert.ok(
                feature.supported_options.some((option) => option.value === value),
                `${at}: ${value} is not one of the options`,
              );
            }
          } else {
            assert.equal(typeof value, 'number', `${at}: ${value} is not a number`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
