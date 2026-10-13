// -----------------------------------------------------------------------------
// The Philips hub: one record per configured TV, read on a timer of the
// container (the interval chosen in the configuration), its states published
// to Gladys when they change, the "content changed" scene event fired on
// transitions, every command (features, widgets, scene actions), the pairing
// of the Android TVs and the network search.
//
// Gladys never polls these devices (should_poll: false): the scene event must
// fire even for a TV whose device was not added, and a TV in standby is read
// cheaply (its power state and its Ambilight only).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { SLOTS, normalizeConfig, parsePin } from './config.js';
import {
  FEATURE_KEYS,
  HOME_APP,
  OTHER_SOURCE,
  buildDevice,
  deviceIds,
  featureValues,
  platformIdOf,
  screenOf,
  stylesOf,
  tvName,
} from './devices.js';
import { ERROR_KINDS, PhilipsClient } from './philips/client.js';
import { CONTENT_KEYS, KEYS, keyName } from './philips/keys.js';
import {
  COLOR_STYLE,
  CONTENT_KINDS,
  appIdOf,
  channelListIds,
  colorStyleName,
  contextActivity,
  findApp,
  findSource,
  isPlayTv,
  isWatchingTv,
  parseApps,
  parseChannelList,
  parseConfiguration,
  parseCurrentChannel,
  parsePower,
  parseVolume,
  rgbToHsb,
  sourceIntent,
} from './philips/model.js';
import {
  CONNECTION_TEXT,
  ERROR_TEXT,
  PAIR_TEXT,
  REPORT_TEXT,
  SEARCH_TEXT,
  everyLanguage,
  failure,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'philips-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  REMOTE: 'remote',
  AMBILIGHT: 'ambilight',
  KEYS: 'keys',
  SHORTCUTS: 'shortcuts',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  CONTENT_CHANGED: 'content_changed',
});

// Who changed what is on screen (`origin` filter and variable of the trigger).
export const ORIGINS = Object.freeze({
  GLADYS: 'gladys', // a feature, a widget button or a scene action
  TV: 'tv', // anything else: the remote, a console over HDMI-CEC, the TV itself
});

export const HUB_TIMINGS = {
  // The identity is read again daily (and at each start): a TV swapped
  // behind the same address becomes a new device.
  identityMs: 24 * 60 * 60_000,
  // Lists read again while the TV is on.
  appsMs: 6 * 60 * 60_000,
  channelsMs: 24 * 60 * 60_000,
  // A change seen this long after a Gladys command is Gladys' own.
  ownChangeMs: 20_000,
  // Read again this long after a command, to show its effect.
  afterCommandMs: [1_500, 5_000],
  // After a power on: read at these delays (a TV takes a few seconds).
  afterPowerOnMs: [3_000, 8_000, 15_000, 25_000],
  // A command that needs the screen on waits this long for it.
  powerOnWaitMs: 25_000,
  powerOnCheckMs: 1_500,
  // Between two presses of a repeated key.
  keyRepeatMs: 300,
  // A feature command still running after this is acknowledged to Gladys.
  featureAckMs: 4_000,
  // The network search of the Discovery tab and of the "Search" action.
  searchSeconds: 5,
};

const MAX_STATES_PER_REQUEST = 100;
const MAX_KEY_REPEAT = 10;
// Failures of a read that do not mean "this TV is misconfigured".
const TRANSIENT = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.UNSUPPORTED, ERROR_KINDS.API]);
// The pairing errors of the TV that mean "wrong code" or "too late".
const WRONG_PIN = new Set(['INVALID_PIN']);
const EXPIRED_PIN = new Set(['TIMEOUT', 'PAIRING_TIMEOUT', 'EXPIRED']);

const emptySnapshot = () => ({
  reachable: null,
  power: null,
  volume: null,
  activity: null,
  channel: null,
  sourceHint: null,
  ambilight: null,
  hue: null,
});

const sameScreen = (a, b) => Boolean(a && b && a.kind === b.kind && a.key === b.key);

export class PhilipsHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/philips/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ gladys, store, request, timers = true, timings, now, sleep }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.config = null;
    this.rawConfig = {};
    /** @type {Map<number, object>} TV records, by configuration slot */
    this.records = new Map();
    /** Pairings in progress, by slot: what the grant needs. */
    this.pairings = new Map();
    /** Last value published per feature external id. */
    this.published = new Map();
    this.transports = new Map();
    this.connection = null;
    this.devicesKey = null;
    this.saved = { tvs: {}, credentials: {} };
    this.pollTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(rawConfig) {
    const saved = await this.store.load();
    this.saved = {
      tvs: saved.tvs && typeof saved.tvs === 'object' ? saved.tvs : {},
      credentials:
        saved.credentials && typeof saved.credentials === 'object' ? saved.credentials : {},
    };
    await this.reconfigure(rawConfig);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(rawConfig) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(rawConfig);
  }

  /** @param {object} rawConfig the configuration as Gladys gives it */
  async reconfigure(rawConfig) {
    this.rawConfig = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
    const config = normalizeConfig(this.rawConfig);
    this.config = config;
    const wanted = new Map(config.tvs.map((tv) => [tv.slot, tv]));
    for (const [slot, record] of this.records) {
      const tv = wanted.get(slot);
      if (!tv || record.tv.host !== tv.host) {
        this.dropRecord(record);
        this.records.delete(slot);
        this.pairings.delete(slot);
      }
    }
    for (const tv of config.tvs) {
      const record = this.records.get(tv.slot);
      if (record) {
        record.tv = tv; // a new name: same client
      } else {
        this.records.set(tv.slot, this.newRecord(tv));
      }
    }
    // The language of the option labels may have changed.
    this.devicesKey = null;
    await this.publishDevices();
    await this.pollAll({ full: true });
    this.schedulePoll();
  }

  newRecord(tv) {
    const saved = this.saved.tvs[tv.slot] ?? {};
    // What was learned from the TV at this address before.
    const known = saved.host === tv.host ? saved : {};
    const identity =
      known.identity && typeof known.identity.platformId === 'string' ? known.identity : null;
    const record = {
      tv,
      client: new PhilipsClient({
        host: tv.host,
        request: this.request,
        secure: identity?.secure ?? null,
        apiVersion: identity?.apiVersion ?? 6,
        credentials: identity ? this.credentialsOf(identity.platformId) : null,
      }),
      identity,
      featuring: known.featuring ?? null,
      apps: Array.isArray(known.apps) ? known.apps : [],
      styles: known.styles ?? null,
      channels: null,
      channelsAt: 0,
      lastChannel: null,
      identityAt: 0,
      appsAt: 0,
      stylesRead: false,
      macRead: false,
      dead: new Set(),
      snapshot: emptySnapshot(),
      error: null,
      ownChangeUntil: 0,
      commandSeq: 0,
      polling: null,
      timers: new Set(),
      dropped: false,
    };
    return record;
  }

  credentialsOf(platformId) {
    const saved = this.saved.credentials[platformId];
    return saved && typeof saved.user === 'string' && typeof saved.password === 'string'
      ? { user: saved.user, password: saved.password }
      : null;
  }

  dropRecord(record) {
    record.dropped = true;
    for (const timer of record.timers) {
      clearTimeout(timer);
    }
    record.timers.clear();
    if (record.identity) {
      for (const { externalId } of featureValues(this.gladys, record, this.language)) {
        this.published.delete(externalId);
      }
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    for (const record of this.records.values()) {
      for (const timer of record.timers) {
        clearTimeout(timer);
      }
      record.timers.clear();
    }
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
      } catch (err) {
        logger.error('Poll failed', err);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read one TV again after these delays (a command's effect, a power on). */
  readLater(record, delays) {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    for (const delay of delays) {
      const timer = setTimeout(() => {
        record.timers.delete(timer);
        this.poll(record)
          .then((changed) => this.afterChanges(changed))
          .catch((err) => logger.error('Read failed', err));
      }, delay);
      timer.unref?.();
      record.timers.add(timer);
    }
  }

  // --- Devices -----------------------------------------------------------------

  /**
   * The same TV configured twice (its IP in one slot, its name in another):
   * only the first slot speaks for it, the other one is reported.
   */
  isDuplicate(record) {
    if (!record.identity) {
      return false;
    }
    return [...this.records.values()].some(
      (other) =>
        other.tv.slot < record.tv.slot && other.identity?.platformId === record.identity.platformId,
    );
  }

  /** A record whose device exists for Gladys: identified, not a duplicate. */
  isPublished(record) {
    return Boolean(record.identity) && !this.isDuplicate(record);
  }

  /** Publish the TVs that answered once; only when something changed. */
  async publishDevices() {
    const devices = [...this.records.values()]
      .filter((record) => this.isPublished(record))
      .map((record) => buildDevice(this.gladys, record, this.language));
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale TV.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
    } catch (err) {
      logger.warn(`Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: look for TVs on the network, read them all, publish. */
  async rediscover() {
    await this.search();
    this.devicesKey = null;
    await this.pollAll({ full: true });
    await this.publishDevices();
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const record = this.recordOfDevice(device.external_id);
    if (!record) {
      return;
    }
    await this.publishStates(record, { force: true });
    this.refreshWidgets();
  }

  refreshWidgets() {
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  recordOfDevice(externalId) {
    const platformId = platformIdOf(this.gladys, externalId);
    if (!platformId) {
      return null;
    }
    return (
      [...this.records.values()].find((record) => record.identity?.platformId === platformId) ??
      null
    );
  }

  saveRecord(record) {
    if (record.dropped) {
      return;
    }
    this.saved.tvs[record.tv.slot] = {
      host: record.tv.host,
      identity: record.identity,
      featuring: record.featuring,
      apps: record.apps,
      styles: record.styles,
    };
    this.store.save(this.saved);
  }

  // --- Reading the TVs -----------------------------------------------------------

  async pollAll({ full = false } = {}) {
    const records = [...this.records.values()];
    const changes = await Promise.all(records.map((record) => this.poll(record, { full })));
    await this.publishDevices();
    await this.afterChanges(changes.some(Boolean));
  }

  /**
   * Read one TV and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widgets show something new
   */
  poll(record, { full = false } = {}) {
    const current = record.polling;
    // A read in flight answers for this one, unless a command ran since it
    // started (its states are stale) or it does not read what `full` asks.
    if (current && current.seq === record.commandSeq && (current.full || !full)) {
      return current.promise;
    }
    const entry = { seq: record.commandSeq, full, promise: null };
    const previous = current ? current.promise.catch(() => {}) : Promise.resolve();
    entry.promise = previous
      .then(() => {
        entry.seq = record.commandSeq;
        return this.read(record, { full });
      })
      .finally(() => {
        if (record.polling === entry) {
          record.polling = null;
        }
      });
    record.polling = entry;
    return entry.promise;
  }

  /** A command starts or ends: the reads in flight are stale. */
  markCommand(record) {
    record.commandSeq += 1;
  }

  /** Changes of the screen seen from now on are Gladys' own. */
  ownChange(record) {
    record.ownChangeUntil = this.now() + this.timings.ownChangeMs;
  }

  label(record) {
    return `TV ${record.tv.slot} (${tvName(record)})`;
  }

  /** /system: identity, transport, capabilities. @returns {boolean} the device changed */
  async readIdentity(record) {
    const { raw, info } = await record.client.readSystem();
    record.identityAt = this.now();
    record.featuring = raw.featuring ?? null;
    return this.setIdentity(record, info);
  }

  async read(record, { full }) {
    const seq = record.commandSeq;
    const stale = () => record.commandSeq !== seq;
    let structureChanged = false;
    if (full) {
      record.dead.clear();
    }

    if (!record.identity || full || this.now() - record.identityAt >= this.timings.identityMs) {
      try {
        structureChanged = await this.readIdentity(record);
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        if (!record.identity || err.kind !== ERROR_KINDS.UNREACHABLE) {
          return stale() ? false : this.applyFailure(record, err);
        }
        // A known TV asleep: its power state says the same, read below.
      }
    }

    let power;
    try {
      power = parsePower(await record.client.getPowerState());
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return stale() ? false : this.applyFailure(record, err);
    }

    const now = this.now();
    let error = null;
    // Keep the first configuration problem of this read, ignore the passing
    // ones; an endpoint the TV does not have is not asked again.
    const attempt = async (path, fn) => {
      if (record.dead.has(path)) {
        return undefined;
      }
      try {
        return await fn();
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        if (err.kind === ERROR_KINDS.UNSUPPORTED) {
          record.dead.add(path);
        }
        if (!TRANSIENT.has(err.kind)) {
          error ??= err;
        }
        logger.debug(`${this.label(record)}: ${path} failed: ${err.message}`);
        return undefined;
      }
    };

    const caps = record.identity?.capabilities ?? {};
    const on = power === 'on';
    const next = {
      power,
      volume: null,
      activity: null,
      channel: null,
      sourceHint: record.snapshot.sourceHint,
      ambilight: null,
      hue: null,
    };
    if (on) {
      const volume = parseVolume(await attempt('audio/volume', () => record.client.getVolume()));
      next.volume = volume;
      if (volume && record.identity && record.identity.volumeMax !== volume.max) {
        record.identity = { ...record.identity, volumeMax: volume.max };
        this.saveRecord(record);
        structureChanged = true;
      }
      next.activity = await this.readActivity(record, attempt);
      next.channel = parseCurrentChannel(
        await attempt('activities/tv', () => record.client.getCurrentChannel()),
      );
      // Most TVs give the ccid only: the number and name come from the lists.
      if (
        next.channel &&
        (next.channel.preset === null || next.channel.name === null) &&
        (!record.channels || now - record.channelsAt >= this.timings.channelsMs)
      ) {
        const channels = await attempt('channeldb/tv', () => this.fetchChannels(record.client));
        if (channels) {
          record.channels = channels;
          record.channelsAt = now;
        }
      }
    }
    if (caps.ambilight) {
      next.ambilight = await this.readAmbilight(record, attempt, on);
    }
    if (caps.hue) {
      const answer = await attempt('HueLamp/power', () => record.client.getHuePower());
      next.hue = typeof answer?.power === 'string' ? answer.power.toLowerCase() === 'on' : null;
    }
    structureChanged =
      (await this.readLists(record, { full, on, now, attempt })) || structureChanged;
    if (stale()) {
      // A command ran meanwhile: what was read may predate it.
      return false;
    }
    if (structureChanged) {
      // The options of the selects first, then the states that use them.
      await this.publishDevices();
    }

    if (!error && this.isDuplicate(record)) {
      error = { kind: 'duplicate', message: 'the same TV as another slot' };
    }
    if (error) {
      const known = record.error?.kind;
      record.error = { kind: error.kind, message: error.message };
      if (known !== error.kind) {
        logger.warn(`${this.label(record)}: ${error.message}`);
      }
    } else {
      record.error = null;
    }
    return this.applySuccess(record, next);
  }

  /** What is in front: the application, and for the TV player, tuner or HDMI. */
  async readActivity(record, attempt) {
    const answer = await attempt('activities/current', () => record.client.getCurrentActivity());
    const component = answer?.component;
    // Saphi TVs have no activities: the tuner or a source is all they tell.
    const playTv = component ? isPlayTv(component) : true;
    let watchingTv = null;
    if (playTv) {
      const activity = contextActivity(await attempt('context', () => record.client.getContext()));
      watchingTv = activity ? isWatchingTv(activity) : null;
    }
    return { appId: component ? appIdOf(component) : null, playTv, watchingTv };
  }

  async readAmbilight(record, attempt, on) {
    const power = await attempt('ambilight/power', () => record.client.getAmbilightPower());
    const state = {
      power: typeof power?.power === 'string' ? power.power.toLowerCase() === 'on' : null,
      style: null,
      color: null,
    };
    if (on) {
      const configuration = await attempt('ambilight/currentconfiguration', () =>
        record.client.getAmbilightConfiguration(),
      );
      if (configuration) {
        Object.assign(state, parseConfiguration(configuration));
      }
    }
    return state;
  }

  /** The applications, the Ambilight styles and the MAC address, when stale. */
  async readLists(record, { full, on, now, attempt }) {
    const caps = record.identity?.capabilities ?? {};
    let changed = false;
    if (on && caps.apps && (full || now - record.appsAt >= this.timings.appsMs)) {
      const answer = await attempt('applications', () => record.client.getApplications());
      if (answer !== undefined) {
        record.appsAt = now;
        const apps = parseApps(answer);
        if (apps.length > 0 && JSON.stringify(apps) !== JSON.stringify(record.apps)) {
          record.apps = apps;
          changed = true;
        }
      }
    }
    if (on && caps.ambilight && (!record.stylesRead || full)) {
      const answer = await attempt('ambilight/supportedstyles', () =>
        record.client.getAmbilightStyles(),
      );
      if (answer !== undefined) {
        record.stylesRead = true;
        if (JSON.stringify(answer) !== JSON.stringify(record.styles)) {
          record.styles = answer;
          changed = true;
        }
      }
    }
    if (!record.macRead && record.identity) {
      const answer = await attempt('network/devices', () => record.client.getNetworkDevices());
      if (answer !== undefined) {
        record.macRead = true;
        const mac = macOf(answer, record.tv.host);
        if (mac && mac !== record.identity.mac) {
          record.identity = { ...record.identity, mac };
          this.saveRecord(record);
        }
      }
    }
    if (changed && record.identity) {
      this.saveRecord(record);
    }
    return changed;
  }

  /** @returns {boolean} whether the device changed */
  setIdentity(record, info) {
    if (!info.platformId || record.dropped) {
      return false;
    }
    const previous = record.identity;
    if (previous && previous.platformId !== info.platformId) {
      logger.warn(
        `${this.label(record)}: another TV answers at this address (${info.model ?? '?'}): new device`,
      );
      for (const { externalId } of featureValues(this.gladys, record, this.language)) {
        this.published.delete(externalId);
      }
      // Its lists are another TV's: read them again.
      record.apps = [];
      record.appsAt = 0;
      record.styles = null;
      record.stylesRead = false;
      record.macRead = false;
      record.channels = null;
      record.snapshot = emptySnapshot();
    }
    const sameTv = previous?.platformId === info.platformId;
    const identity = {
      ...info,
      mac: sameTv ? (previous.mac ?? null) : null,
      volumeMax: sameTv ? (previous.volumeMax ?? null) : null,
    };
    if (!sameTv) {
      record.client.setCredentials(this.credentialsOf(info.platformId));
    }
    if (JSON.stringify(previous) !== JSON.stringify(identity)) {
      record.identity = identity;
      this.saveRecord(record);
      return true;
    }
    return false;
  }

  async applySuccess(record, next) {
    if (record.dropped) {
      return false;
    }
    const previous = record.snapshot;
    if (next.power !== 'on') {
      next.sourceHint = null;
    } else if (
      next.activity &&
      (!next.activity.playTv || (next.channel && next.activity.watchingTv)) &&
      this.now() >= record.ownChangeUntil
    ) {
      // An application, or the tuner: the HDMI source Gladys chose is gone
      // (not a read right after the command, which may predate the switch).
      next.sourceHint = null;
    }
    if (next.channel) {
      record.lastChannel = next.channel.ccid;
    }
    const snapshot = { reachable: true, ...next };
    const widgetChanged =
      previous.reachable !== true ||
      JSON.stringify({ ...previous, turnedOn: undefined }) !== JSON.stringify(snapshot);
    const before = previous.power === 'on' ? screenOf(record, this.language) : null;
    record.snapshot = snapshot;
    await this.contentTransition(record, previous, before);
    await this.publishStates(record);
    return widgetChanged;
  }

  async applyFailure(record, err) {
    if (record.dropped) {
      return false;
    }
    const wasError = record.error?.kind;
    const previous = record.snapshot;
    if (err.kind === ERROR_KINDS.UNREACHABLE) {
      // A TV whose network sleeps with it does not answer at all when off.
      record.error = record.identity ? null : { kind: 'notReached', message: err.message };
      record.snapshot = {
        ...emptySnapshot(),
        reachable: false,
        power: record.identity ? 'standby' : null,
      };
      if (previous.reachable !== false) {
        logger.info(`${this.label(record)}: no answer (${err.message})`);
      }
    } else {
      // Something answered, but not as expected: keep the last known states.
      record.error = { kind: err.kind, message: err.message };
      if (wasError !== err.kind) {
        logger.warn(`${this.label(record)}: ${err.message}`);
      }
    }
    await this.publishStates(record);
    return previous.reachable !== record.snapshot.reachable || wasError !== record.error?.kind;
  }

  /** "Content changed": a new app, channel or source on screen (power on included). */
  async contentTransition(record, previous, before) {
    const next = record.snapshot;
    if (next.power !== 'on') {
      return;
    }
    const screen = screenOf(record, this.language);
    // The first read since the start says nothing about a change.
    if (!screen || previous.power === null) {
      return;
    }
    if (previous.power === 'on' && sameScreen(before, screen)) {
      return;
    }
    // On but the screen unknown (a read that failed): no change to tell,
    // unless Gladys has just turned it on.
    if (previous.power === 'on' && !before && !previous.turnedOn) {
      return;
    }
    const own = this.now() < record.ownChangeUntil;
    await this.fire(TRIGGERS.CONTENT_CHANGED, record, {
      kind: screen.kind,
      name: screen.name ?? '',
      channel_number: screen.kind === CONTENT_KINDS.CHANNEL ? screen.number : null,
      origin: own ? ORIGINS.GLADYS : ORIGINS.TV,
    });
  }

  async fire(key, record, data) {
    if (!this.isPublished(record)) {
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.identity.platformId).device,
        tv: tvName(record),
        ...data,
      });
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates(record, { force = false } = {}) {
    if (!this.isPublished(record)) {
      return;
    }
    const states = [];
    for (const { externalId, value } of featureValues(this.gladys, record, this.language)) {
      if (value === null || (!force && this.published.get(externalId) === value)) {
        continue;
      }
      states.push(
        typeof value === 'string'
          ? { device_feature_external_id: externalId, text: value }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        for (const state of batch) {
          this.published.set(state.device_feature_external_id, state.text ?? state.state);
        }
      } catch (err) {
        logger.warn(`States of ${this.label(record)} refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.refreshWidgets();
    }
  }

  async publishTransports() {
    const entries = [];
    for (const record of this.records.values()) {
      if (!this.isPublished(record) || record.snapshot.reachable === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, record.identity.platformId).device;
      const transport = record.snapshot.reachable
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.warn(`Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name: connected when every TV is set up right. */
  connectionStatus() {
    const { tvs, invalidSlots } = this.config;
    if (tvs.length === 0) {
      return {
        connected: false,
        message: invalidSlots.length ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noTv,
      };
    }
    // A TV that answered once and sleeps now is not a problem.
    const failing = [...this.records.values()].filter((record) => record.error);
    if (failing.length === 0 && invalidSlots.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noTv)) {
      const parts = failing.map((record) =>
        labelled(tvName(record), pick(ERROR_TEXT[record.error.kind], language), language),
      );
      if (invalidSlots.length) {
        parts.push(pick(CONNECTION_TEXT.invalidUrl, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    return { connected: failing.length < this.records.size, message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
    } catch (err) {
      logger.warn(`Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  /**
   * The TV a command targets: a device, or the only TV when none is chosen.
   * @param {string|null|undefined} deviceExternalId
   */
  target(deviceExternalId) {
    if (this.records.size === 0) {
      throw failure(this.language, 'noTv');
    }
    if (!deviceExternalId) {
      if (this.records.size > 1) {
        throw failure(this.language, 'chooseTv');
      }
      return [...this.records.values()][0];
    }
    const record = this.recordOfDevice(deviceExternalId);
    if (!record) {
      throw failure(this.language, 'unknownTv');
    }
    return record;
  }

  /** The error of a failed command, as a sentence for the user. */
  commandError(record, err) {
    logger.warn(`${this.label(record)}: command failed: ${err.message}`);
    let kind = err.kind;
    if (kind === ERROR_KINDS.UNREACHABLE && !record.identity) {
      kind = 'notReached';
    }
    const error = new Error(
      labelled(
        tvName(record),
        pick(ERROR_TEXT[kind] ?? ERROR_TEXT.api, this.language),
        this.language,
      ),
    );
    error.userFacing = true;
    return error;
  }

  /** Run a command on a TV; the API errors become a sentence for the user. */
  async command(record, fn) {
    this.markCommand(record);
    try {
      return await fn(record.client);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      throw this.commandError(record, err);
    } finally {
      // The reads that overlapped the command are stale too.
      this.markCommand(record);
    }
  }

  /** The commands ran: publish the optimistic states, read the TV soon. */
  async afterCommand(record, { content = false } = {}) {
    if (content) {
      this.ownChange(record);
    }
    await this.publishStates(record);
    this.refreshWidgets();
    this.readLater(record, this.timings.afterCommandMs);
  }

  canWake(record) {
    return Boolean(this.config.wakeOnLan && record.identity?.mac);
  }

  async wake(record) {
    this.markCommand(record);
    // What shows once it is awake is Gladys' doing.
    this.ownChange(record);
    try {
      await this.gladys.wakeOnLan(record.identity.mac);
      logger.info(`${this.label(record)}: Wake-on-LAN sent`);
    } catch (err) {
      // 429: a wake was sent less than 2 s ago, which is just as good.
      if (err.status === 429) {
        return;
      }
      logger.warn(`${this.label(record)}: Wake-on-LAN refused: ${err.message}`);
      throw failure(this.language, 'wakeRefused');
    }
  }

  /** The TV is in standby on the network: ask it to turn on. */
  async requestPowerOn(record) {
    await this.command(record, (client) => client.setPowerState(true));
  }

  /**
   * Turn a TV on: Wake-on-LAN when it does not answer, the power state
   * otherwise (Android TVs woken by a magic packet may stay in standby: it is
   * asked again once it answers). With `wait`, resolves once it is on.
   */
  async powerOn(record, { wait = false } = {}) {
    if (record.snapshot.power === 'on' && record.snapshot.reachable) {
      return;
    }
    this.ownChange(record);
    let woken = false;
    if (record.snapshot.reachable !== true) {
      if (this.canWake(record)) {
        await this.wake(record);
        woken = true;
      } else if (record.snapshot.reachable === false && record.identity) {
        throw failure(this.language, 'noWake');
      }
    }
    if (!woken) {
      try {
        await this.requestPowerOn(record);
      } catch (err) {
        if (!this.canWake(record)) {
          throw err;
        }
        await this.wake(record);
        woken = true;
      }
    }
    this.markCommand(record);
    this.readLater(record, this.timings.afterPowerOnMs);
    if (!woken) {
      record.snapshot = { ...record.snapshot, reachable: true, power: 'on', turnedOn: true };
      await this.afterCommand(record);
    }
    if (!wait) {
      if (woken) {
        this.followWake(record);
      }
      return;
    }
    await this.waitOn(record, { askAgain: woken });
  }

  /** After a magic packet, without waiting: ask the TV to turn on once it answers. */
  followWake(record) {
    this.waitOn(record, { askAgain: true }).catch((err) =>
      logger.info(`${this.label(record)}: did not turn on (${err.message})`),
    );
  }

  /** Wait for the TV to say it is on; ask it once more when it answers in standby. */
  async waitOn(record, { askAgain }) {
    const deadline = this.now() + this.timings.powerOnWaitMs;
    let asked = !askAgain;
    for (;;) {
      try {
        const power = parsePower(await record.client.getPowerState());
        if (power === 'on') {
          if (record.snapshot.power !== 'on') {
            record.snapshot = { ...record.snapshot, reachable: true, power: 'on', turnedOn: true };
            await this.publishStates(record);
            this.refreshWidgets();
          }
          return;
        }
        if (power === 'standby' && !asked) {
          asked = true;
          await record.client.setPowerState(true);
        }
      } catch {
        // still waking up
      }
      if (this.now() >= deadline) {
        throw failure(this.language, 'notOn');
      }
      await this.sleep(this.timings.powerOnCheckMs);
    }
  }

  /** Commands that need the screen on turn the TV on first, and wait for it. */
  ensureOn(record) {
    return this.powerOn(record, { wait: true });
  }

  /** The power feature and the widget button. */
  async setPower(record, on) {
    if (on) {
      await this.powerOn(record);
      return;
    }
    await this.command(record, async (client) => {
      try {
        await client.setPowerState(false);
      } catch (err) {
        // Older firmwares only take the Standby key.
        if (err.kind !== ERROR_KINDS.API && err.kind !== ERROR_KINDS.UNSUPPORTED) {
          throw err;
        }
        await client.sendKey('Standby');
      }
    });
    record.snapshot = { ...record.snapshot, power: 'standby', sourceHint: null };
    await this.afterCommand(record);
  }

  async setVolume(record, raw) {
    const known = record.snapshot.volume;
    const max = known?.max ?? record.identity?.volumeMax ?? 60;
    const min = known?.min ?? 0;
    const volume = Math.max(min, Math.min(max, Math.round(Number(raw) || 0)));
    await this.command(record, (client) => client.setVolume({ current: volume, muted: false }));
    if (known) {
      record.snapshot = { ...record.snapshot, volume: { ...known, volume, muted: false } };
    }
    await this.afterCommand(record);
    return volume;
  }

  /** Volume up or down (the buttons): the remote keys, as the TV's own steps. */
  async stepVolume(record, up) {
    await this.sendKey(record, up ? 'volume_up' : 'volume_down');
  }

  async toggleMute(record) {
    const known = record.snapshot.volume;
    await this.command(record, (client) => client.sendKey(KEYS.mute));
    if (known) {
      record.snapshot = { ...record.snapshot, volume: { ...known, muted: !known.muted } };
    }
    await this.afterCommand(record);
  }

  /** Every channel of the TV's channel lists (not its favourite lists). */
  async fetchChannels(client) {
    const ids = channelListIds(await client.getChannelDb());
    const all = [];
    for (const id of ids.length ? ids : ['all']) {
      all.push(...parseChannelList(await client.getChannelList(id), id));
    }
    return all;
  }

  /** Every channel of the TV's lists, read at most daily. */
  async loadChannels(record) {
    if (record.channels && this.now() - record.channelsAt < this.timings.channelsMs) {
      return record.channels;
    }
    const channels = await this.command(record, (client) => this.fetchChannels(client));
    record.channels = channels;
    record.channelsAt = this.now();
    return channels;
  }

  async setChannel(record, raw) {
    const number = Math.round(Number(raw));
    await this.ensureOn(record);
    const channels = await this.loadChannels(record);
    // The list on screen first: the same preset can exist in another one.
    const listId = record.snapshot.channel?.listId;
    const channel =
      channels.find((item) => item.preset === number && item.listId === listId) ??
      channels.find((item) => item.preset === number);
    if (!channel) {
      throw failure(this.language, 'unknownChannel', number);
    }
    this.ownChange(record);
    await this.command(record, (client) => client.setChannel(channel.ccid, channel.listId));
    record.snapshot = {
      ...record.snapshot,
      channel: {
        ccid: channel.ccid,
        preset: channel.preset,
        name: channel.name,
        listId: channel.listId,
      },
      sourceHint: null,
    };
    await this.afterCommand(record, { content: true });
    return channel;
  }

  requireLaunch(record) {
    if (!record.identity?.capabilities?.launch) {
      throw failure(this.language, 'noApps');
    }
  }

  /**
   * Show a source, by key or by name ("HDMI 2", "TV").
   * @returns {Promise<object|null>} the source, null for "Other" (the Home key)
   */
  async selectSource(record, query) {
    if (query === OTHER_SOURCE) {
      await this.sendKey(record, 'home');
      return null;
    }
    this.requireLaunch(record);
    const source = findSource(query);
    if (!source) {
      throw failure(this.language, 'unknownSource', String(query).slice(0, 60));
    }
    await this.ensureOn(record);
    this.ownChange(record);
    // Back to the tuner on the channel it showed last.
    const ccid = record.snapshot.channel?.ccid ?? record.lastChannel;
    const uri = source.key === 'tv' && ccid ? `${source.uri}/${ccid}` : source.uri;
    await this.command(record, (client) => client.launch(sourceIntent(uri)));
    record.snapshot = { ...record.snapshot, sourceHint: source.key };
    await this.afterCommand(record, { content: true });
    return source;
  }

  /** Lists read again when a name is not found in them (a new app installed…). */
  async refreshApps(record) {
    if (this.now() - record.appsAt < 60_000) {
      return;
    }
    const apps = parseApps(await this.command(record, (client) => client.getApplications()));
    record.appsAt = this.now();
    if (apps.length > 0) {
      record.apps = apps;
      if (record.identity) {
        this.saveRecord(record);
        await this.publishDevices();
      }
    }
  }

  /**
   * Open an application, by id or by name ("Netflix").
   * @returns {Promise<object|null>} the app, null for "Home screen" (the Home key)
   */
  async openApp(record, query) {
    if (query === HOME_APP) {
      await this.sendKey(record, 'home');
      return null;
    }
    this.requireLaunch(record);
    let app = findApp(record.apps, query);
    if (!app && record.identity?.capabilities?.apps) {
      await this.refreshApps(record);
      app = findApp(record.apps, query);
    }
    if (!app) {
      throw failure(this.language, 'unknownApp', String(query).slice(0, 60));
    }
    await this.ensureOn(record);
    this.ownChange(record);
    await this.command(record, (client) => client.launch(app.intent));
    await this.afterCommand(record, { content: true });
    return app;
  }

  /** A remote control key, `repeat` times. */
  async sendKey(record, key, repeat = 1) {
    if (!KEYS[key]) {
      throw failure(this.language, 'unknownKey', String(key).slice(0, 30));
    }
    const times = Math.max(1, Math.min(MAX_KEY_REPEAT, Math.round(Number(repeat) || 1)));
    const content = CONTENT_KEYS.has(key);
    if (content) {
      this.ownChange(record);
    }
    const name = keyName(key, { android: record.identity?.android === true });
    await this.command(record, async (client) => {
      for (let press = 0; press < times; press += 1) {
        if (press > 0) {
          await this.sleep(this.timings.keyRepeatMs);
        }
        await client.sendKey(name);
      }
    });
    await this.afterCommand(record, { content });
    return times;
  }

  // --- Ambilight ------------------------------------------------------------------------

  requireAmbilight(record) {
    if (!record.identity?.capabilities?.ambilight) {
      throw failure(this.language, 'noAmbilight');
    }
  }

  async setAmbilight(record, on) {
    this.requireAmbilight(record);
    await this.command(record, (client) => client.setAmbilightPower(on));
    record.snapshot = {
      ...record.snapshot,
      ambilight: { ...(record.snapshot.ambilight ?? { style: null, color: null }), power: on },
    };
    await this.afterCommand(record);
  }

  /**
   * An Ambilight style, by key (`video_standard`, `color`…) or label.
   * @returns {Promise<object>} the style
   */
  async setAmbilightStyle(record, query) {
    this.requireAmbilight(record);
    const wanted = String(query ?? '').trim();
    if (wanted === COLOR_STYLE) {
      const color = record.snapshot.ambilight?.color ?? 0xffffff;
      await this.setAmbilightColor(record, color);
      return { key: COLOR_STYLE };
    }
    const style = stylesOf(record).find((item) => item.key === wanted.toLowerCase());
    if (!style) {
      throw failure(this.language, 'unknownStyle', wanted.slice(0, 40));
    }
    await this.command(record, (client) =>
      client.setAmbilightConfiguration({
        styleName: style.styleName,
        isExpert: false,
        menuSetting: style.menuSetting,
      }),
    );
    record.snapshot = {
      ...record.snapshot,
      ambilight: { power: true, style: style.key, color: null },
    };
    await this.afterCommand(record);
    return style;
  }

  /** A fixed colour (0xRRGGBB): the lounge style in expert mode, manual hue. */
  async setAmbilightColor(record, raw) {
    this.requireAmbilight(record);
    const rgb = Math.max(0, Math.min(0xffffff, Math.round(Number(raw) || 0)));
    await this.command(record, (client) =>
      client.setAmbilightConfiguration({
        styleName: colorStyleName(record.styles),
        isExpert: true,
        colorSettings: {
          color: rgbToHsb(rgb),
          colorDelta: { hue: 0, saturation: 0, brightness: 0 },
          algorithm: 'MANUAL_HUE',
        },
        // The shape Home Assistant sends (ha-philipsjs, light.py).
        speed: 2,
      }),
    );
    record.snapshot = {
      ...record.snapshot,
      ambilight: { power: true, style: COLOR_STYLE, color: rgb },
    };
    await this.afterCommand(record);
    return rgb;
  }

  async setHue(record, on) {
    await this.command(record, (client) => client.setHuePower(on));
    record.snapshot = { ...record.snapshot, hue: on };
    await this.afterCommand(record);
  }

  /**
   * A feature of a device. Gladys waits 5 s for the answer of a device
   * command (COMMAND_TIMEOUT_MS of the core), while waking a TV and
   * switching it to a source can take 30: past `featureAckMs`, the command
   * is acknowledged and goes on, its failure logged.
   */
  async setValue(device, feature, value) {
    const work = this.featureCommand(device, feature, value);
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve('late'), this.timings.featureAckMs);
      timer.unref?.();
    });
    try {
      const outcome = await Promise.race([work.then(() => 'done'), late]);
      if (outcome === 'late') {
        logger.info(`${feature.external_id}: still running, acknowledged`);
        work.catch((err) => logger.warn(`${feature.external_id}: ${err.message}`));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Power, volume, buttons, source, app, channel, Ambilight. */
  async featureCommand(device, feature, value) {
    const record = this.recordOfDevice(device.external_id);
    if (!record) {
      throw failure(this.language, 'unknownTv');
    }
    const ids = deviceIds(this.gladys, record.identity.platformId);
    const key = Object.values(FEATURE_KEYS).find(
      (item) => ids.feature(item) === feature.external_id,
    );
    const on = Number(value) === 1;
    switch (key) {
      case FEATURE_KEYS.POWER:
        return this.setPower(record, on);
      case FEATURE_KEYS.VOLUME:
        return this.setVolume(record, value);
      case FEATURE_KEYS.VOLUME_UP:
        return this.stepVolume(record, true);
      case FEATURE_KEYS.VOLUME_DOWN:
        return this.stepVolume(record, false);
      case FEATURE_KEYS.MUTE:
        return this.toggleMute(record);
      case FEATURE_KEYS.SOURCE:
        return this.selectSource(record, String(value));
      case FEATURE_KEYS.APP:
        return this.openApp(record, String(value));
      case FEATURE_KEYS.CHANNEL:
        return this.setChannel(record, value);
      case FEATURE_KEYS.CHANNEL_UP:
        return this.sendKey(record, 'channel_up');
      case FEATURE_KEYS.CHANNEL_DOWN:
        return this.sendKey(record, 'channel_down');
      case FEATURE_KEYS.AMBILIGHT:
        return this.setAmbilight(record, on);
      case FEATURE_KEYS.AMBILIGHT_STYLE:
        return this.setAmbilightStyle(record, String(value));
      case FEATURE_KEYS.AMBILIGHT_COLOR:
        return this.setAmbilightColor(record, value);
      case FEATURE_KEYS.AMBILIGHT_HUE:
        return this.setHue(record, on);
      default:
        throw new Error(`Feature ${feature.external_id} cannot be controlled`);
    }
  }

  // --- Configuration actions -----------------------------------------------------------

  /** "Test the connection": read every TV now, one line each. */
  async testConnection() {
    await this.pollAll({ full: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (this.records.size === 0) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const lines = [...this.records.values()].map((record) => {
        const name = tvName(record);
        if (record.error) {
          return labelled(name, pick(ERROR_TEXT[record.error.kind], language), language);
        }
        const model = record.identity?.model ?? 'Philips';
        if (record.snapshot.reachable === false) {
          return labelled(name, text.asleep(model), language);
        }
        const parts = [record.snapshot.power === 'on' ? text.on(model) : text.standby(model)];
        if (record.identity?.pairing && record.client.credentials) {
          parts.push(text.paired);
        }
        if (record.apps.length) {
          parts.push(text.apps(record.apps.length));
        }
        return labelled(name, parts.join(', '), language);
      });
      if (this.config.invalidSlots.length) {
        lines.push(pick(CONNECTION_TEXT.invalidUrl, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  slotRecord(slot) {
    const number = Number(slot) || 1;
    const record = this.records.get(number);
    if (!record) {
      throw new Error(pick(PAIR_TEXT, this.language).noAddress(number));
    }
    return { number, record };
  }

  /** "Show a pairing code on the TV": the first step of the pairing of an Android TV. */
  async requestPairing(slot) {
    const { number, record } = this.slotRecord(slot);
    const answer = await this.command(record, async () => {
      const { raw, info } = await record.client.readSystem();
      record.featuring = raw.featuring ?? null;
      if (this.setIdentity(record, info)) {
        await this.publishDevices();
      }
      if (!info.pairing) {
        return null;
      }
      return record.client.pairRequest(raw.featuring);
    });
    if (!answer) {
      return everyLanguage(PAIR_TEXT, (text) => text.notNeeded);
    }
    this.pairings.set(number, answer);
    logger.info(`${this.label(record)}: pairing code requested`);
    return everyLanguage(PAIR_TEXT, (text) => text.shown(number, answer.timeoutSeconds));
  }

  /** "Confirm the pairing code": the PIN shown on the TV, then the credentials kept under /data. */
  async confirmPairing(slot, rawPin) {
    const { number, record } = this.slotRecord(slot);
    const texts = pick(PAIR_TEXT, this.language);
    const pin = parsePin(rawPin);
    if (!pin) {
      throw new Error(texts.badPin);
    }
    const pending = this.pairings.get(number);
    if (!pending) {
      throw new Error(texts.noRequest(number));
    }
    let credentials;
    this.markCommand(record);
    try {
      credentials = await record.client.pairGrant(pending, pin);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      logger.warn(`${this.label(record)}: pairing refused (${err.errorId ?? err.kind})`);
      if (err.kind !== ERROR_KINDS.PAIRING) {
        throw this.commandError(record, err);
      }
      if (WRONG_PIN.has(err.errorId)) {
        throw new Error(texts.wrongPin, { cause: err });
      }
      this.pairings.delete(number);
      if (EXPIRED_PIN.has(err.errorId)) {
        throw new Error(texts.expired, { cause: err });
      }
      throw new Error(texts.refused(String(err.errorId ?? err.status ?? '?').slice(0, 40)), {
        cause: err,
      });
    } finally {
      this.markCommand(record);
    }
    this.pairings.delete(number);
    if (record.identity) {
      this.saved.credentials[record.identity.platformId] = credentials;
      this.store.save(this.saved);
    }
    logger.info(`${this.label(record)}: paired`);
    record.error = null;
    record.macRead = false;
    await this.afterChanges(await this.poll(record, { full: true }));
    await this.publishDevices();
    return everyLanguage(PAIR_TEXT, (text) => text.paired(tvName(record)));
  }

  /**
   * Look for Philips TVs on the network (mDNS through the core), and put
   * the new ones in the free slots of the configuration, or the new address
   * of a known one in its slot.
   * @returns {Promise<object>} the report, in the four languages
   */
  async search() {
    let results;
    try {
      results = await this.gladys.scanNetwork('mdns', {
        timeoutSeconds: this.timings.searchSeconds,
      });
    } catch (err) {
      logger.warn(`Network search unavailable: ${err.message}`);
      return everyLanguage(SEARCH_TEXT, (text) => text.unavailable);
    }
    const hosts = [...new Set(results.map(addressOf).filter(Boolean))];
    const found = [];
    for (const host of hosts) {
      try {
        const { info } = await new PhilipsClient({ host, request: this.request }).readSystem();
        if (info.platformId) {
          found.push({ host, info });
        }
      } catch (err) {
        logger.debug(`Search: ${host} is not a Philips TV (${err.message})`);
      }
    }
    if (found.length === 0) {
      return everyLanguage(SEARCH_TEXT, (text) => text.none);
    }

    const patch = {};
    const used = new Set([...this.config.tvs.map((tv) => tv.slot), ...this.config.invalidSlots]);
    const lines = [];
    const seen = new Set();
    for (const { host, info } of found) {
      if (seen.has(info.platformId)) {
        continue;
      }
      seen.add(info.platformId);
      const name = `Philips ${info.model ?? host}`;
      const byIdentity = [...this.records.values()].find(
        (record) => record.identity?.platformId === info.platformId,
      );
      const byHost = this.config.tvs.find((tv) => tv.host === host);
      if (byIdentity && byIdentity.tv.host !== host) {
        patch[`tv_${byIdentity.tv.slot}_host`] = host;
        lines.push((text) => text.moved(name, host, byIdentity.tv.slot));
      } else if (byIdentity || byHost) {
        lines.push((text) => text.known(name, (byIdentity?.tv ?? byHost).slot));
      } else {
        const slot = SLOTS.find((candidate) => !used.has(candidate));
        if (!slot) {
          lines.push((text) => text.full(name, host));
          continue;
        }
        used.add(slot);
        patch[`tv_${slot}_host`] = host;
        lines.push((text) => text.added(name, host, slot));
      }
    }
    const needPairing = found.some(({ info }) => info.pairing);
    if (Object.keys(patch).length > 0) {
      try {
        await this.gladys.setConfig(patch);
      } catch (err) {
        logger.warn(`Configuration refused: ${err.message}`);
      }
      // A moved TV keeps its identity, lists and pairing: carry them over.
      for (const [key, host] of Object.entries(patch)) {
        const slot = Number(key.split('_')[1]);
        const saved = this.saved.tvs[slot];
        if (saved && saved.identity) {
          this.saved.tvs[slot] = { ...saved, host };
        }
      }
      await this.reconfigure({ ...this.rawConfig, ...patch });
    }
    return everyLanguage(SEARCH_TEXT, (text) =>
      [...lines.map((line) => line(text)), ...(needPairing ? [text.pair] : [])].join('\n'),
    );
  }

  /** What the widgets show: one TV, or the first one. */
  view(deviceExternalId) {
    if (deviceExternalId) {
      return this.recordOfDevice(deviceExternalId);
    }
    return [...this.records.values()][0] ?? null;
  }
}

/** The IPv4 address of an mDNS answer, its host name otherwise. */
export function addressOf(result) {
  const addresses = Array.isArray(result?.addresses) ? result.addresses : [];
  const ipv4 = addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address));
  if (ipv4) {
    return ipv4;
  }
  const host = typeof result?.host === 'string' ? result.host.replace(/\.$/, '') : '';
  return host || addresses[0] || null;
}

/** The MAC address of /network/devices: the interface at this address first. */
export function macOf(answer, host) {
  const interfaces = (Array.isArray(answer) ? answer : []).filter(
    (item) => typeof item?.mac === 'string' && /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(item.mac),
  );
  const chosen = interfaces.find((item) => item.ip === host) ?? interfaces[0];
  return chosen ? chosen.mac.toLowerCase().replace(/-/g, ':') : null;
}
