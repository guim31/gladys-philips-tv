// -----------------------------------------------------------------------------
// JointSpace client: the REST API of the Philips TVs (API 6, the Android TVs
// since 2016 and the Saphi / Linux ones).
//
//   - Android TVs: HTTPS on port 1926, HTTP Digest authentication with the
//     device id and key obtained by pairing (a PIN shown on the TV);
//   - Saphi TVs: HTTP on port 1925, no authentication.
//
// /system answers without authentication and says which of the two a TV is
// (`secured_transport`, `pairing_type`): it is read first, on both ports.
// Every failure becomes a PhilipsError with a `kind` the hub turns into a
// sentence for the user. Credentials never appear in an error or a log line.
// (After ha-philipsjs, MIT, Daniel Perna, and pylips, MIT, Evgeny Slavnov.)
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { pairingSignature } from './crypto.js';
import { authorization, parseChallenge } from './digest.js';
import { httpRequest } from './http.js';
import { parseSystem } from './model.js';

export const HTTP_PORT = 1925;
export const HTTPS_PORT = 1926;

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: off with its network asleep, wrong address
  NOT_PAIRED: 'notPaired', // the TV wants credentials, none yet
  AUTH: 'auth', // the credentials are refused (pairing removed on the TV)
  NOT_PHILIPS: 'notPhilips', // something answers, not a JointSpace API
  TOO_OLD: 'tooOld', // JointSpace 1 (before 2016): not supported
  UNSUPPORTED: 'unsupported', // this TV does not have this endpoint
  PAIRING: 'pairing', // the pairing was refused
  API: 'api', // any other refusal
});

export class PhilipsError extends Error {
  constructor(kind, message, { status, errorId } = {}) {
    super(message);
    this.name = 'PhilipsError';
    this.kind = kind;
    this.status = status;
    this.errorId = errorId;
  }
}

// Answers of the TVs that are not JSON but mean "nothing" (ha-philipsjs).
const IGNORED_BODIES = new Set([
  '',
  'Context Service not started',
  '}',
  '<html><head><title>Ok</title></head><body>Ok</body></html>',
]);

/** Parse an answer, with the repairs the TVs' slightly broken JSON needs. */
export function decodeBody(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (IGNORED_BODIES.has(text)) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    let fixed = text
      .replace(
        '"channelList": { "id": "version", "" }',
        '"channelList": { "id": "all", "version": "" }',
      )
      .replaceAll('{,', '{')
      .replaceAll(',}', '}');
    while (fixed.includes(',,')) {
      fixed = fixed.replace(',,', ',');
    }
    try {
      return JSON.parse(fixed);
    } catch {
      return undefined;
    }
  }
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);

/** The address typed by the user, as a host for the URLs (IPv6 in brackets). */
export const urlHost = (host) => (host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);

export class PhilipsClient {
  /**
   * @param {object} options
   * @param {string} options.host IP address or host name
   * @param {{ user: string, password: string }|null} [options.credentials]
   * @param {Function} [options.request] HTTP seam (src/philips/http.js)
   * @param {boolean|null} [options.secure] HTTPS on 1926, when already known
   * @param {number} [options.apiVersion]
   */
  constructor({ host, credentials = null, request, secure = null, apiVersion = 6 }) {
    this.host = host;
    this.request = request ?? httpRequest;
    this.credentials = credentials;
    this.secure = secure;
    this.apiVersion = apiVersion;
    this.challenge = null;
  }

  setCredentials(credentials) {
    this.credentials = credentials;
    this.challenge = null;
  }

  base(secure = this.secure) {
    return secure
      ? `https://${urlHost(this.host)}:${HTTPS_PORT}`
      : `http://${urlHost(this.host)}:${HTTP_PORT}`;
  }

  /** One HTTP exchange; network failures become UNREACHABLE. */
  async exchange(url, options) {
    try {
      return await this.request(url, options);
    } catch (err) {
      if (err.kind) {
        throw err;
      }
      const code = err.code ?? '';
      const network =
        NETWORK_CODES.has(code) ||
        code.startsWith('ERR_SSL') ||
        /socket hang up/i.test(err.message);
      throw new PhilipsError(
        network ? ERROR_KINDS.UNREACHABLE : ERROR_KINDS.API,
        `${new URL(url).host}: ${code || err.message}`,
      );
    }
  }

  /**
   * Read /system on the known port first, the other one then. Sets the
   * transport and the API version of the next requests.
   * @returns {Promise<{ raw: object, info: object }>}
   */
  async readSystem() {
    const order = this.secure === true ? [true, false] : [false, true];
    let unreachable = null;
    let answered = false;
    for (const secure of order) {
      let response;
      try {
        response = await this.exchange(`${this.base(secure)}/6/system`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          timeoutMs: 5_000,
        });
      } catch (err) {
        unreachable ??= err;
        continue;
      }
      answered = true;
      const raw = response.status === 200 ? decodeBody(response.body) : undefined;
      if (raw && typeof raw === 'object' && raw.api_version) {
        const info = parseSystem(raw);
        if (info.apiVersion !== null && info.apiVersion < 5) {
          throw new PhilipsError(ERROR_KINDS.TOO_OLD, `JointSpace ${info.apiVersion}`);
        }
        this.secure = info.secure || secure;
        this.apiVersion = info.apiVersion ?? 6;
        return { raw, info };
      }
    }
    if (!answered) {
      throw unreachable;
    }
    // JointSpace 1 (2011-2015 sets) only answers under /1/.
    try {
      const old = await this.exchange(`${this.base(false)}/1/system`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        timeoutMs: 5_000,
      });
      if (old.status === 200 && decodeBody(old.body)?.name !== undefined) {
        throw new PhilipsError(ERROR_KINDS.TOO_OLD, 'JointSpace 1');
      }
    } catch (err) {
      if (err.kind === ERROR_KINDS.TOO_OLD) {
        throw err;
      }
    }
    throw new PhilipsError(ERROR_KINDS.NOT_PHILIPS, `${this.host}: no JointSpace API`);
  }

  /**
   * A request to the API, authenticated when the TV asks for it.
   * @returns {Promise<object>} the decoded answer ({} for an empty one)
   */
  async call(method, path, body, { timeoutMs = 8_000 } = {}) {
    const secure = this.secure ?? false;
    const url = `${this.base(secure)}/${this.apiVersion}/${path}`;
    const uri = new URL(url).pathname;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const send = () => {
      const headers = { accept: 'application/json' };
      if (payload !== undefined) {
        headers['content-type'] = 'application/json';
      }
      if (this.credentials && this.challenge) {
        headers.authorization = authorization(this.challenge, this.credentials, method, uri);
      }
      return this.exchange(url, { method, headers, body: payload, timeoutMs });
    };

    let response = await send();
    if (response.status === 401 && this.credentials) {
      // First request, or a stale nonce: answer the new challenge once.
      const challenge = parseChallenge(response.headers?.['www-authenticate']);
      if (challenge) {
        this.challenge = challenge;
        response = await send();
      }
    }
    if (response.status === 401) {
      this.challenge = null;
      throw this.credentials
        ? new PhilipsError(ERROR_KINDS.AUTH, `${path}: credentials refused`, { status: 401 })
        : new PhilipsError(ERROR_KINDS.NOT_PAIRED, `${path}: pairing needed`, { status: 401 });
    }
    if (response.status === 403 || response.status === 404) {
      throw new PhilipsError(ERROR_KINDS.UNSUPPORTED, `${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new PhilipsError(ERROR_KINDS.API, `${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const decoded = decodeBody(response.body);
    if (decoded === undefined) {
      throw new PhilipsError(ERROR_KINDS.API, `${path}: not JSON`);
    }
    return decoded ?? {};
  }

  get(path, options) {
    return this.call('GET', path, undefined, options);
  }

  post(path, body, options) {
    return this.call('POST', path, body, options);
  }

  // --- Endpoints -------------------------------------------------------------------

  getPowerState() {
    return this.get('powerstate', { timeoutMs: 5_000 });
  }

  setPowerState(on) {
    return this.post('powerstate', { powerstate: on ? 'On' : 'Standby' });
  }

  getVolume() {
    return this.get('audio/volume');
  }

  /** @param {{ current?: number, muted: boolean }} volume */
  setVolume(volume) {
    return this.post('audio/volume', volume);
  }

  getCurrentActivity() {
    return this.get('activities/current');
  }

  getCurrentChannel() {
    return this.get('activities/tv');
  }

  setChannel(ccid, listId = 'all') {
    return this.post('activities/tv', { channelList: { id: listId }, channel: { ccid } });
  }

  getChannelDb() {
    return this.get('channeldb/tv');
  }

  getChannelList(id) {
    return this.get(`channeldb/tv/channelLists/${encodeURIComponent(id)}`, { timeoutMs: 15_000 });
  }

  getContext() {
    return this.get('context');
  }

  getApplications() {
    return this.get('applications', { timeoutMs: 15_000 });
  }

  launch(intent) {
    return this.post('activities/launch', { intent });
  }

  sendKey(name) {
    return this.post('input/key', { key: name });
  }

  getNetworkDevices() {
    return this.get('network/devices');
  }

  getAmbilightPower() {
    return this.get('ambilight/power');
  }

  setAmbilightPower(on) {
    return this.post('ambilight/power', { power: on ? 'On' : 'Off' });
  }

  getAmbilightConfiguration() {
    return this.get('ambilight/currentconfiguration');
  }

  setAmbilightConfiguration(configuration) {
    return this.post('ambilight/currentconfiguration', configuration);
  }

  getAmbilightStyles() {
    return this.get('ambilight/supportedstyles');
  }

  getHuePower() {
    return this.get('HueLamp/power');
  }

  setHuePower(on) {
    return this.post('HueLamp/power', { power: on ? 'On' : 'Off' });
  }

  // --- Pairing (Android TVs) -----------------------------------------------------------

  /**
   * Ask the TV to show a PIN. Resolves the state the grant needs: our new
   * device id, the key the TV gave, its timestamp and how long it waits.
   * @param {object} [featuring] the `featuring` of /system, sent back
   */
  async pairRequest(featuring) {
    const device = {
      device_name: 'Gladys',
      device_os: 'Gladys Assistant',
      app_id: 'gladysassistant.com',
      app_name: 'Gladys Assistant',
      type: 'native',
      id: randomBytes(16).toString('hex'),
    };
    const access = { scope: ['read', 'write', 'control'] };
    if (featuring) {
      access.featuring = featuring;
    }
    const response = await this.exchange(`${this.base()}/${this.apiVersion}/pair/request`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ access, device }),
      timeoutMs: 10_000,
    });
    const answer = decodeBody(response.body);
    if (response.status === 404) {
      throw new PhilipsError(ERROR_KINDS.UNSUPPORTED, 'pair/request: HTTP 404', { status: 404 });
    }
    if (!answer || answer.error_id !== 'SUCCESS' || !answer.auth_key) {
      throw new PhilipsError(
        ERROR_KINDS.PAIRING,
        `pair/request: ${answer?.error_id ?? response.status}`,
        {
          status: response.status,
          errorId: answer?.error_id,
        },
      );
    }
    return {
      device,
      authKey: String(answer.auth_key),
      timestamp: answer.timestamp,
      timeoutSeconds: Number(answer.timeout) || null,
    };
  }

  /**
   * Send the PIN the user read on the TV. Resolves the credentials.
   * @returns {Promise<{ user: string, password: string }>}
   */
  async pairGrant(pending, pin) {
    const credentials = { user: pending.device.id, password: pending.authKey };
    const body = JSON.stringify({
      auth: {
        auth_appId: '1',
        auth_timestamp: pending.timestamp,
        auth_signature: pairingSignature(pending.timestamp, pin),
        pin,
      },
      device: pending.device,
    });
    const url = `${this.base()}/${this.apiVersion}/pair/grant`;
    const uri = new URL(url).pathname;
    const send = (challenge) =>
      this.exchange(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(challenge
            ? { authorization: authorization(challenge, credentials, 'POST', uri) }
            : {}),
        },
        body,
        timeoutMs: 10_000,
      });
    let response = await send(null);
    if (response.status === 401) {
      const challenge = parseChallenge(response.headers?.['www-authenticate']);
      if (challenge) {
        response = await send(challenge);
      }
    }
    const answer = decodeBody(response.body);
    if (!answer || answer.error_id !== 'SUCCESS') {
      throw new PhilipsError(
        ERROR_KINDS.PAIRING,
        `pair/grant: ${answer?.error_id ?? response.status}`,
        {
          status: response.status,
          errorId: answer?.error_id ?? null,
        },
      );
    }
    this.setCredentials(credentials);
    return credentials;
  }
}
