// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to three TVs, each in its own slot: address and name. The pairing
// credentials of the Android TVs are not configuration: the pairing actions
// keep them under /data (src/store.js). The device identity is the serial
// number read from the TV: the slot only says where to reach it.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const SLOTS = [1, 2, 3];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['5', '10', '30', '60'];

export const DEFAULT_CONFIG = {
  tv_1_host: '',
  tv_1_name: '',
  tv_2_host: '',
  tv_2_name: '',
  tv_3_host: '',
  tv_3_name: '',
  wake_on_lan: true,
  poll_interval: '10',
  language: 'fr',
};

const MAX_NAME_LENGTH = 40;

/**
 * The host of the address typed by the user: a bare IP or name
 * (`192.0.2.10`, `tv.local`), or a URL whose scheme, port and path are
 * dropped (the API ports are fixed: 1925 and 1926).
 * @param {unknown} raw
 * @returns {string|null} the host (IPv6 without brackets), null when unusable
 */
export function parseHost(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const typed = raw.trim();
  if (!typed) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    // A bare IPv6 address.
    return /^[0-9a-f:]+$/i.test(typed) && typed.includes(':') ? typed.toLowerCase() : null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  return url.hostname.replace(/^\[|\]$/g, '');
}

/** The PIN as the TV shows it: four digits, spaces ignored. */
export function parsePin(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }
  const digits = String(raw).replace(/\s+/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const tvs = [];
  const invalid = [];
  for (const slot of SLOTS) {
    const typed = text(`tv_${slot}_host`);
    if (!typed) {
      continue;
    }
    const host = parseHost(typed);
    if (!host) {
      invalid.push(slot);
      continue;
    }
    tvs.push({
      slot,
      host,
      name: text(`tv_${slot}_name`).slice(0, MAX_NAME_LENGTH) || null,
    });
  }

  return {
    tvs,
    invalidSlots: invalid,
    wakeOnLan: source.wake_on_lan === undefined ? true : isTrue(source.wake_on_lan),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
