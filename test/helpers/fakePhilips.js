// -----------------------------------------------------------------------------
// An in-memory Philips TV speaking JointSpace 6, built on the real answers
// kept in ha-philipsjs (test/fixtures/philips/, MIT): an Android TV (HTTPS on
// 1926, Digest authentication, pairing by PIN with the HMAC signature) or a
// Saphi TV (HTTP on 1925, no authentication). It records what it was asked
// (keys, launches, posts) and serves the same answers over real HTTP(S) in
// test/helpers/philipsServer.js.
// -----------------------------------------------------------------------------

import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AUTH_SHARED_KEY, pairingSignature } from '../../src/philips/crypto.js';
import { verifyAuthorization } from '../../src/philips/digest.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/philips/${name}.json`, import.meta.url), 'utf8'));

export const ANDROID_SERIAL = 'ABCDEFGHIJKLF'; // decrypted from the fixture
export const SAPHI_SERIAL = 'ZX1234567890'; // invented: the fixtures share one serial
export const PIN = '0667';
export const TIMESTAMP = 1128; // with PIN: the signature vector of ha-philipsjs
export const MAC = '02:00:5e:10:00:01';
const REALM = 'XTV';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Encrypt a /system field as the TVs do (AES-128-CBC, IV first, base64). */
export function encryptField(value) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-cbc', AUTH_SHARED_KEY.subarray(0, 16), iv);
  return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final()]).toString('base64');
}
const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? '' : JSON.stringify(body),
});

const NETFLIX = {
  packageName: 'com.netflix.ninja',
  className: 'com.netflix.ninja.MainActivity',
};
const PLAY_TV = {
  packageName: 'org.droidtv.playtv',
  className: 'org.droidtv.playtv.PlayTvActivity',
};

export class FakePhilips {
  /**
   * @param {object} [options]
   * @param {'android'|'saphi'} [options.kind]
   * @param {'On'|'Standby'|'StandbyKeep'} [options.power]
   * @param {{ user: string, password: string }|null} [options.credentials] already paired
   * @param {object} [options.system] another /system answer
   * @param {boolean} [options.hue] Ambilight + Hue
   * @param {string} [options.serial] another serial number
   */
  constructor({
    kind = 'android',
    power = 'On',
    credentials = null,
    system,
    hue = true,
    serial = kind === 'saphi' ? SAPHI_SERIAL : null,
  } = {}) {
    this.kind = kind;
    this.android = kind === 'android';
    this.system = clone(system ?? fixture(this.android ? 'system-android' : 'system-saphi'));
    if (serial) {
      this.system.serialnumber_encrypted = encryptField(serial);
    }
    if (!hue) {
      const ambilight = this.system.featuring?.jsonfeatures?.ambilight;
      if (ambilight) {
        this.system.featuring.jsonfeatures.ambilight = ambilight.filter((item) => item !== 'Hue');
      }
    }
    this.power = power;
    this.volume = fixture('audio-volume');
    this.apps = fixture('applications');
    this.component = clone(PLAY_TV);
    this.context = fixture('context'); // WatchTv
    this.channel = fixture(this.android ? 'activities-tv-android' : 'activities-tv-saphi');
    this.channelDb = fixture(this.android ? 'channeldb-tv-android' : 'channeldb-tv-saphi');
    this.channelList = fixture('channellist-all');
    this.ambilightPower = 'On';
    this.ambilightConfiguration = fixture('ambilight-currentconfiguration');
    this.styles = fixture(
      this.android ? 'ambilight-supportedstyles-android' : 'ambilight-supportedstyles-saphi',
    );
    this.huePower = 'Off';
    this.networkDevices = [{ mac: MAC, ip: '192.0.2.10', type: 'Wifi', 'wake-on-lan': 'Enabled' }];
    // Authentication (Android): the paired clients, the challenge in force.
    this.clients = new Map(credentials ? [[credentials.user, credentials.password]] : []);
    this.nonce = randomBytes(8).toString('hex');
    this.pin = PIN;
    this.pending = null;
    this.pairingTimeout = 30;
    // What it was asked.
    this.keys = [];
    this.launches = [];
    this.posts = [];
    this.requests = [];
    // Failures to play: endpoint → HTTP status.
    this.failures = {};
  }

  get port() {
    return this.android ? 1926 : 1925;
  }

  /** A paired client of this TV (the credentials a pairing would give). */
  pairClient(user = 'gladys-test-device', password = 'gladys-test-key') {
    this.clients.set(user, password);
    return { user, password };
  }

  /** A new nonce: the next authenticated request is challenged again. */
  rotateNonce() {
    this.nonce = randomBytes(8).toString('hex');
  }

  // --- What the remote does --------------------------------------------------------

  openApp(id) {
    const app = this.apps.applications.find((item) => item.id === id);
    this.component = clone(app.intent.component);
    this.context = { level1: 'NA', level2: 'NA', level3: 'NA', data: 'NA' };
  }

  showNetflix() {
    this.component = clone(NETFLIX);
    this.context = { level1: 'NA', level2: 'NA', level3: 'NA', data: 'NA' };
  }

  watchChannel(ccid) {
    const channel = this.channelList.Channel.find((item) => item.ccid === ccid);
    this.component = clone(PLAY_TV);
    this.context = { level1: 'WatchTv', level2: 'Playstate', level3: 'NA', data: 'NA' };
    this.channel = {
      channel: { ccid, preset: channel?.preset ?? '0', name: channel?.name ?? '' },
      channelList: { id: 'all', version: '10' },
    };
  }

  watchHdmi() {
    this.component = clone(PLAY_TV);
    this.context = { level1: 'WatchExtension', level2: 'NA', level3: 'NA', data: 'NA' };
    this.channel = { channel: { ccid: '@', preset: 0, name: '@' }, channelList: { id: 'all' } };
  }

  // --- HTTP ---------------------------------------------------------------------------

  /**
   * @param {{ url: string, method: string, headers: object, body?: string }} request
   * @returns {{ status: number, headers: object, body: string }}
   */
  handle({ url, method, headers = {}, body }) {
    const target = new URL(url);
    const match = /^\/(\d+)\/(.+)$/.exec(target.pathname);
    this.requests.push({ method, path: target.pathname });
    if (!match) {
      return json(404, undefined);
    }
    const [, version, path] = match;
    if (version !== '6') {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: 'Not found' };
    }
    if (this.failures[path]) {
      return json(this.failures[path], undefined);
    }
    let payload;
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        return json(400, undefined);
      }
    }
    if (path === 'system') {
      return json(200, this.system);
    }
    if (path === 'pair/request') {
      return this.pairRequest(payload);
    }
    if (path === 'pair/grant') {
      return this.pairGrant(payload, headers, method, target.pathname);
    }
    if (this.android && !this.authorized(headers, method)) {
      return {
        status: 401,
        headers: {
          'content-type': 'text/html',
          'www-authenticate': `Digest realm="${REALM}", qop="auth", nonce="${this.nonce}", opaque="opaque-${this.nonce}"`,
        },
        body: '<html>Unauthorized</html>',
      };
    }
    return method === 'GET' ? this.get(path) : this.post(path, payload);
  }

  authorized(headers, method) {
    const header = headers.authorization;
    if (typeof header !== 'string') {
      return false;
    }
    const user = /username="([^"]*)"/.exec(header)?.[1];
    const password = this.clients.get(user);
    return (
      password !== undefined &&
      verifyAuthorization(header, { user, password, realm: REALM, nonce: this.nonce }, method)
    );
  }

  get(path) {
    const standby = this.power !== 'On';
    switch (path) {
      case 'powerstate':
        return json(200, { powerstate: this.power });
      case 'audio/volume':
        return standby ? json(200, {}) : json(200, this.volume);
      case 'activities/current':
        if (!this.android) {
          return json(404, undefined);
        }
        return json(200, standby ? {} : { component: this.component });
      case 'activities/tv':
        return json(200, this.channel);
      case 'context':
        return json(200, this.context);
      case 'applications':
        return this.android ? json(200, this.apps) : json(404, undefined);
      case 'channeldb/tv':
        return json(200, this.channelDb);
      case 'channeldb/tv/channelLists/all':
        return json(200, this.channelList);
      case 'network/devices':
        return json(200, this.networkDevices);
      case 'ambilight/power':
        return json(200, { power: this.ambilightPower });
      case 'ambilight/currentconfiguration':
        return json(200, this.ambilightConfiguration);
      case 'ambilight/supportedstyles':
        return json(200, this.styles);
      case 'HueLamp/power':
        return this.system.featuring.jsonfeatures.ambilight?.includes('Hue')
          ? json(200, { power: this.huePower })
          : json(404, undefined);
      default:
        return json(404, undefined);
    }
  }

  post(path, payload) {
    this.posts.push({ path, payload });
    switch (path) {
      case 'powerstate':
        this.power = payload.powerstate === 'On' ? 'On' : 'Standby';
        return json(200, undefined);
      case 'audio/volume':
        if (payload.current !== undefined) {
          this.volume.current = payload.current;
        }
        if (payload.muted !== undefined) {
          this.volume.muted = payload.muted;
        }
        return json(200, undefined);
      case 'input/key':
        this.keys.push(payload.key);
        if (payload.key === 'Mute') {
          this.volume.muted = !this.volume.muted;
        } else if (payload.key === 'VolumeUp') {
          this.volume.current = Math.min(this.volume.max, this.volume.current + 1);
        } else if (payload.key === 'VolumeDown') {
          this.volume.current = Math.max(this.volume.min, this.volume.current - 1);
        } else if (payload.key === 'Standby') {
          this.power = 'Standby';
        }
        return json(200, undefined);
      case 'activities/launch': {
        if (!this.android) {
          return json(404, undefined);
        }
        this.launches.push(payload.intent);
        const uri = payload.intent?.extras?.uri;
        if (uri?.includes('/passthrough/')) {
          this.watchHdmi();
        } else if (uri?.startsWith('content://android.media.tv/channel')) {
          this.watchChannel(Number(uri.split('/').at(-1)) || 1648);
        } else {
          this.component = clone(payload.intent.component);
          this.context = { level1: 'NA', level2: 'NA', level3: 'NA', data: 'NA' };
        }
        return json(200, undefined);
      }
      case 'activities/tv':
        this.watchChannel(payload.channel.ccid);
        return json(200, undefined);
      case 'ambilight/power':
        this.ambilightPower = payload.power;
        return json(200, undefined);
      case 'ambilight/currentconfiguration':
        this.ambilightConfiguration = clone(payload);
        this.ambilightPower = 'On';
        return json(200, undefined);
      case 'HueLamp/power':
        this.huePower = payload.power;
        return json(200, undefined);
      default:
        return json(404, undefined);
    }
  }

  pairRequest(payload) {
    if (!this.android) {
      return json(404, undefined);
    }
    if (!payload?.device?.id || !Array.isArray(payload?.access?.scope)) {
      return json(200, { error_id: 'INVALID_PARAMETER', error_text: 'Invalid parameters' });
    }
    this.pending = {
      id: payload.device.id,
      authKey: randomBytes(16).toString('hex'),
      timestamp: TIMESTAMP,
    };
    return json(200, {
      error_id: 'SUCCESS',
      error_text: 'Authorization required',
      auth_key: this.pending.authKey,
      timestamp: this.pending.timestamp,
      timeout: this.pairingTimeout,
    });
  }

  pairGrant(payload, headers, method, uri) {
    const pending = this.pending;
    if (!pending) {
      return json(200, { error_id: 'TIMEOUT', error_text: 'No pairing in progress' });
    }
    const header = headers.authorization;
    const authorized =
      typeof header === 'string' &&
      verifyAuthorization(
        header,
        { user: pending.id, password: pending.authKey, realm: REALM, nonce: this.nonce },
        method,
      );
    if (!authorized) {
      return {
        status: 401,
        headers: {
          'content-type': 'text/html',
          'www-authenticate': `Digest realm="${REALM}", qop="auth", nonce="${this.nonce}"`,
        },
        body: `<html>Unauthorized ${uri}</html>`,
      };
    }
    const auth = payload?.auth ?? {};
    if (
      auth.pin !== this.pin ||
      auth.auth_signature !== pairingSignature(auth.auth_timestamp, auth.pin)
    ) {
      return json(200, { error_id: 'INVALID_PIN', error_text: 'Invalid pin' });
    }
    this.clients.set(pending.id, pending.authKey);
    this.pending = null;
    return json(200, { error_id: 'SUCCESS', error_text: 'Pairing completed' });
  }
}

/**
 * A fake network of TVs, by host: the HTTP seam of the client. A TV answers
 * on its own port only; `online: false` is a TV whose network sleeps.
 */
export function createNetwork(tvs) {
  const network = {
    tvs,
    async request(url, { method = 'GET', headers = {}, body } = {}) {
      const target = new URL(url);
      const tv = network.tvs[target.hostname];
      if (!tv || tv.online === false) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      if (tv.online === 'timeout') {
        const error = new Error('Timed out after 8000 ms');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      const secure = target.protocol === 'https:';
      if (Number(target.port) !== tv.port || secure !== tv.android) {
        const error = new Error(`connect ECONNREFUSED ${target.host}`);
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return tv.handle({ url, method, headers, body });
    },
  };
  return network;
}
