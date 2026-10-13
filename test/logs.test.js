// -----------------------------------------------------------------------------
// Polling and logs: the TVs are read by the integration's own timer (Gladys
// never polls these devices), and `docker logs` stays quiet at info level:
// nothing per read or per state, one line when a TV or a failure comes and
// goes, never one per attempt.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLogger, createWorld, deviceOf, pairedTv, HOST_1 } from './helpers/world.js';

const state = (world, key) => world.fake.lastState(`${deviceOf(world).external_id}:${key}`);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the internal timer refreshes the states, without any onPoll from Gladys', async (t) => {
  const tv = pairedTv();
  const world = await createWorld({ tvs: { [HOST_1]: tv } });
  t.after(() => world.app.stop());
  // Core 5.2.0 never polls a device published without should_poll (#3198).
  assert.equal(deviceOf(world).should_poll, false);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  world.hub.timersEnabled = true;
  world.hub.schedulePoll();
  const interval = world.hub.config.pollIntervalMs;

  for (const volume of [25, 31]) {
    tv.volume.current = volume;
    t.mock.timers.tick(interval);
    for (let i = 0; i < 500 && state(world, 'volume') !== volume; i += 1) {
      await flush();
    }
    assert.equal(state(world, 'volume'), volume, `volume ${volume} read by the timer`);
  }
});

test('a normal life writes nothing at info level, a TV off one line', async (t) => {
  const logger = captureLogger();
  const tv = pairedTv();
  const world = await createWorld({ tvs: { [HOST_1]: tv }, logger });
  t.after(() => world.app.stop());
  logger.clear();

  for (const volume of [20, 21, 22, 23]) {
    tv.volume.current = volume;
    await world.hub.pollAll();
  }
  assert.equal(state(world, 'volume'), 23, 'the states were published');
  assert.deepEqual(logger.visible(), [], 'reads and states: nothing at info level');

  // Off, its network asleep: five reads without an answer, one line.
  tv.online = false;
  for (let i = 0; i < 5; i += 1) {
    await world.hub.pollAll();
  }
  assert.equal(state(world, 'power'), 0);
  assert.deepEqual(
    logger.visible().map((line) => line.level),
    ['info'],
  );
  assert.match(logger.visible()[0].text, /no answer/);

  // Back: one line, then quiet again.
  logger.clear();
  tv.online = true;
  for (let i = 0; i < 3; i += 1) {
    await world.hub.pollAll();
  }
  assert.equal(state(world, 'power'), 1);
  assert.deepEqual(
    logger.visible().map((line) => line.text),
    ['TV 1 (Philips 65OLED855/12): answers again'],
  );
});

test('states refused by Gladys at every read: one warning, one line when it ends', async (t) => {
  const logger = captureLogger();
  const tv = pairedTv();
  const world = await createWorld({ tvs: { [HOST_1]: tv }, logger });
  t.after(() => world.app.stop());
  logger.clear();
  const publishStates = world.gladys.publishStates.bind(world.gladys);
  world.gladys.publishStates = async () => {
    throw new Error('Gladys is restarting');
  };
  for (const volume of [20, 21, 22, 23]) {
    tv.volume.current = volume;
    await world.hub.pollAll();
  }
  assert.deepEqual(
    logger.visible().map((line) => line.level),
    ['warn'],
  );
  assert.match(logger.visible()[0].text, /States of TV 1 .* refused: Gladys is restarting/);
  assert.ok(logger.lines.filter((line) => line.level === 'debug').length >= 3, 'retries: debug');

  logger.clear();
  world.gladys.publishStates = publishStates;
  for (let i = 0; i < 3; i += 1) {
    await world.hub.pollAll();
  }
  assert.equal(state(world, 'volume'), 23, 'sent again once Gladys accepts');
  assert.deepEqual(
    logger.visible().map((line) => line.level),
    ['info'],
  );
  assert.match(logger.visible()[0].text, /back to normal/);
});

test('a read that crashes at every poll: one error with its stack, one line when it ends', async (t) => {
  const logger = captureLogger();
  const world = await createWorld({ logger });
  t.after(() => world.app.stop());
  logger.clear();
  const read = world.hub.read.bind(world.hub);
  world.hub.read = async () => {
    throw new TypeError('boom');
  };
  for (let i = 0; i < 4; i += 1) {
    await world.hub.pollAll();
  }
  assert.deepEqual(
    logger.visible().map((line) => line.level),
    ['error'],
  );
  world.hub.read = read;
  logger.clear();
  await world.hub.pollAll();
  await world.hub.pollAll();
  assert.deepEqual(
    logger.visible().map((line) => line.text),
    ['TV 1 (Philips 65OLED855/12): read failed: back to normal'],
  );
});
