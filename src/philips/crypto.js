// -----------------------------------------------------------------------------
// The two pieces of cryptography of the JointSpace API, with the key every
// Philips TV and every client share (published in the Philips TV Remote app,
// and in ha-philipsjs and pylips; it is not a secret of the user):
//
//   - the HMAC-SHA1 signature of the pairing grant (timestamp + PIN);
//   - the AES-128-CBC decryption of the `*_encrypted` fields of /system
//     (serial number, model, software version, device id).
//
// (Ported from ha-philipsjs, MIT, Daniel Perna.)
// -----------------------------------------------------------------------------

import { createDecipheriv, createHmac } from 'node:crypto';

export const AUTH_SHARED_KEY = Buffer.from(
  'ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==',
  'base64',
);

/**
 * The `auth_signature` of a pairing grant.
 * @param {string|number} timestamp the `timestamp` of the pairing request answer
 * @param {string} pin the code shown on the TV
 */
export function pairingSignature(timestamp, pin, key = AUTH_SHARED_KEY) {
  return createHmac('sha1', key).update(String(timestamp)).update(String(pin)).digest('base64');
}

/**
 * Decrypt one `*_encrypted` field: base64 of IV (16 bytes) + AES-128-CBC data.
 * @returns {string|null} null when the field cannot be decrypted
 */
export function decryptField(value, key = AUTH_SHARED_KEY) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    const raw = Buffer.from(value.trim(), 'base64');
    if (raw.length < 32 || raw.length % 16 !== 0) {
      return null;
    }
    const decipher = createDecipheriv('aes-128-cbc', key.subarray(0, 16), raw.subarray(0, 16));
    return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** The /system answer with every `<name>_encrypted` field decrypted as `<name>`. */
export function decodeSystem(system) {
  const result = {};
  for (const [key, value] of Object.entries(system ?? {})) {
    if (key.endsWith('_encrypted')) {
      const decrypted = decryptField(value);
      if (decrypted !== null) {
        result[key.slice(0, -'_encrypted'.length)] = decrypted;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
