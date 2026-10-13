// -----------------------------------------------------------------------------
// HTTP Digest authentication (RFC 7616, the subset the TVs use): the Android
// TVs protect their API on port 1926 with the device id and the key obtained
// at pairing, as user name and password.
//
// The challenge of the TV is kept and reused for the next requests (with an
// increasing nonce count), so a poll costs one request per endpoint and not
// two; a stale nonce answers 401 with a new challenge, and the request is
// sent again once. (After ha-philipsjs' CachedDigestAuth, MIT.)
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

const HASHES = {
  MD5: 'md5',
  'MD5-SESS': 'md5',
  'SHA-256': 'sha256',
  'SHA-256-SESS': 'sha256',
  'SHA-512-256': 'sha512-256',
  'SHA-512-256-SESS': 'sha512-256',
};

/** The `key=value` / `key="value"` pairs of a Digest header, keys lowercased. */
function parseFields(text) {
  const fields = {};
  const pattern = /([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]*))/gi;
  for (const match of text.matchAll(pattern)) {
    fields[match[1].toLowerCase()] =
      match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : match[3];
  }
  return fields;
}

/**
 * Parse a `WWW-Authenticate` header (one string, or the list Node gives).
 * @returns {object|null} the Digest challenge, null when there is none
 */
export function parseChallenge(header) {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const digest = values.find((value) => /^\s*digest\s/i.test(value));
  if (!digest) {
    return null;
  }
  const fields = parseFields(digest.replace(/^\s*digest\s+/i, ''));
  if (!fields.nonce) {
    return null;
  }
  const algorithm = (fields.algorithm || 'MD5').toUpperCase();
  if (!HASHES[algorithm]) {
    return null;
  }
  const qops = (fields.qop || '')
    .split(',')
    .map((qop) => qop.trim().toLowerCase())
    .filter(Boolean);
  if (qops.length > 0 && !qops.includes('auth')) {
    return null; // auth-int only: never seen on a TV
  }
  return {
    realm: fields.realm ?? '',
    nonce: fields.nonce,
    opaque: fields.opaque,
    algorithm,
    qop: qops.includes('auth') ? 'auth' : null,
    count: 0,
  };
}

/**
 * The `Authorization` header of a request, for a challenge (whose nonce
 * count it advances).
 * @param {object} challenge from parseChallenge
 * @param {{ user: string, password: string }} credentials
 * @param {string} method
 * @param {string} uri path and query of the request
 */
export function authorization(challenge, { user, password }, method, uri) {
  const hash = (text) => createHash(HASHES[challenge.algorithm]).update(text).digest('hex');
  challenge.count += 1;
  const nc = challenge.count.toString(16).padStart(8, '0');
  const cnonce = randomBytes(8).toString('hex');
  let ha1 = hash(`${user}:${challenge.realm}:${password}`);
  if (challenge.algorithm.endsWith('-SESS')) {
    ha1 = hash(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = hash(`${method}:${uri}`);
  const response = challenge.qop
    ? hash(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : hash(`${ha1}:${challenge.nonce}:${ha2}`);
  const quote = (value) => `"${String(value).replace(/(["\\])/g, '\\$1')}"`;
  const parts = [
    `username=${quote(user)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(uri)}`,
    `algorithm=${challenge.algorithm}`,
    `response=${quote(response)}`,
  ];
  if (challenge.opaque !== undefined) {
    parts.push(`opaque=${quote(challenge.opaque)}`);
  }
  if (challenge.qop) {
    parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce=${quote(cnonce)}`);
  }
  return `Digest ${parts.join(', ')}`;
}

/**
 * Check an `Authorization` header against the expected credentials: the
 * server side, used by the fake TV of the tests.
 * @returns {boolean}
 */
export function verifyAuthorization(header, { user, password, realm, nonce }, method) {
  if (typeof header !== 'string' || !/^digest\s/i.test(header)) {
    return false;
  }
  const fields = parseFields(header.replace(/^digest\s+/i, ''));
  if (fields.username !== user || fields.nonce !== nonce || fields.realm !== realm) {
    return false;
  }
  const algorithm = (fields.algorithm || 'MD5').toUpperCase();
  if (!HASHES[algorithm]) {
    return false;
  }
  const hash = (text) => createHash(HASHES[algorithm]).update(text).digest('hex');
  let ha1 = hash(`${user}:${realm}:${password}`);
  if (algorithm.endsWith('-SESS')) {
    ha1 = hash(`${ha1}:${nonce}:${fields.cnonce}`);
  }
  const ha2 = hash(`${method}:${fields.uri}`);
  const expected = fields.qop
    ? hash(`${ha1}:${nonce}:${fields.nc}:${fields.cnonce}:${fields.qop}:${ha2}`)
    : hash(`${ha1}:${nonce}:${ha2}`);
  return fields.response === expected;
}
