// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake Philips TVs on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs: the tests read the TVs
// with `world.hub.pollAll()`, and the waits of the commands are instant.
// -----------------------------------------------------------------------------

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ANDROID_SERIAL, FakePhilips, MAC, PIN, createNetwork } from './fakePhilips.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const HOST_1 = '192.0.2.10';
export const HOST_2 = '192.0.2.11';
export const HOST_3 = '192.0.2.12';
export const PLATFORM_ID = `sn-${ANDROID_SERIAL.toLowerCase()}`;
export const CREDENTIALS = { user: 'gladys-test-device', password: 'gladys-test-key' };

/** A manual clock; `sleep` moves it forward instead of waiting. */
export function createClock(start = Date.UTC(2026, 9, 13, 19, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
    sleep: async (ms) => {
      clock.time += ms;
    },
  };
  return clock;
}

export const defaultConfig = () => ({ tv_1_host: HOST_1, language: 'en' });

/** A /data where a TV was paired before (its credentials, by identity). */
export function pairedDataDir(platformId = PLATFORM_ID, credentials = CREDENTIALS) {
  const dir = mkdtempSync(join(tmpdir(), 'gladys-philips-'));
  writeFileSync(
    join(dir, 'philips-state.json'),
    JSON.stringify({ tvs: {}, credentials: { [platformId]: credentials } }),
  );
  return dir;
}

/** An Android TV already paired with the credentials of pairedDataDir. */
export const pairedTv = (options = {}) => {
  const tv = new FakePhilips(options);
  tv.pairClient(CREDENTIALS.user, CREDENTIALS.password);
  return tv;
};

/**
 * @param {object} [options]
 * @param {Record<string, FakePhilips>} [options.tvs] by host
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir] the /data of the integration (paired by default)
 * @param {object} [options.logger] the hub's logger (see captureLogger)
 */
export async function createWorld({
  clock = createClock(),
  tvs,
  config = defaultConfig(),
  devices = [],
  connect = true,
  dataDir = pairedDataDir(),
  timings = {},
  logger,
} = {}) {
  const network = createNetwork(tvs ?? { [HOST_1]: pairedTv() });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers: false,
    timings,
    now: clock.now,
    sleep: clock.sleep,
    logger,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return {
    gladys,
    fake: gladys.fake,
    network,
    tv: network.tvs[HOST_1],
    app,
    hub: app.hub,
    clock,
    dataDir,
  };
}

/** The discovered device of a TV, by its index. */
export const deviceOf = (world, index = 0) => world.fake.discoveredDevices[index];

/** A feature of a discovered device, by key. */
export const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id === `${device.external_id}:${key}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** A logger that keeps its lines, to check what reaches the info level. */
export function captureLogger() {
  const lines = [];
  const logger = { lines, child: () => logger };
  for (const level of ['debug', 'info', 'warn', 'error']) {
    logger[level] = (...args) =>
      lines.push({
        level,
        text: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
      });
  }
  /** Lines at info level and above (what `docker logs` shows by default). */
  logger.visible = () => lines.filter((line) => line.level !== 'debug');
  logger.clear = () => lines.splice(0);
  return logger;
}

export { FakePhilips, MAC, PIN };
