// -----------------------------------------------------------------------------
// Normalization of the configuration: addresses, PIN, options.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHost, parsePin } from '../src/config.js';

test('the address of a TV: a bare IP, a name, or a URL whose port and path are dropped', () => {
  assert.equal(parseHost('192.0.2.10'), '192.0.2.10');
  assert.equal(parseHost(' https://192.0.2.10:1926/6/system '), '192.0.2.10');
  assert.equal(parseHost('tv.local'), 'tv.local');
  assert.equal(parseHost('http://[fe80::1]:1925'), 'fe80::1');
  assert.equal(parseHost('fe80::1'), 'fe80::1');
  assert.equal(parseHost('ftp://192.0.2.10'), null);
  assert.equal(parseHost('http://user:pass@192.0.2.10'), null, 'no credentials in the address');
  assert.equal(parseHost('not a host'), null);
  assert.equal(parseHost(''), null);
  assert.equal(parseHost(42), null);
});

test('the PIN is four digits', () => {
  assert.equal(parsePin('0667'), '0667');
  assert.equal(parsePin(' 06 67 '), '0667');
  assert.equal(parsePin(1234), '1234');
  assert.equal(parsePin('066'), null);
  assert.equal(parsePin('abcd'), null);
  assert.equal(parsePin(undefined), null);
});

test('defaults', () => {
  assert.deepEqual(normalizeConfig(), {
    tvs: [],
    invalidSlots: [],
    wakeOnLan: true,
    pollIntervalMs: 10_000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), normalizeConfig({}));
  assert.deepEqual(normalizeConfig(null), normalizeConfig({}));
});

test('three slots, names cut at 40 characters, the bad addresses reported', () => {
  const config = normalizeConfig({
    tv_1_host: '192.0.2.10',
    tv_1_name: '  Salon  ',
    tv_2_host: 'http://user:x@192.0.2.11',
    tv_3_host: 'tv.local',
    tv_3_name: 'x'.repeat(60),
    wake_on_lan: 'false',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(config.tvs, [
    { slot: 1, host: '192.0.2.10', name: 'Salon' },
    { slot: 3, host: 'tv.local', name: 'x'.repeat(40) },
  ]);
  assert.deepEqual(config.invalidSlots, [2]);
  assert.equal(config.wakeOnLan, false);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 10_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
