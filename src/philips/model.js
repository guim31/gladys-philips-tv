// -----------------------------------------------------------------------------
// Parsers of the JointSpace answers (API 6), and the name matching of the
// applications, sources and channels a user types in a scene.
//
// The shapes follow the real answers kept in ha-philipsjs (MIT) and the
// community documentation of pylips (MIT): see test/fixtures/philips/.
// -----------------------------------------------------------------------------

import { decodeSystem } from './crypto.js';

// What is on screen (`kind` of the scene event).
export const CONTENT_KINDS = Object.freeze({
  APP: 'app',
  CHANNEL: 'channel',
  SOURCE: 'source',
});

// The packages of the TV player (tuner and HDMI passthrough), by generation.
const PLAY_TV_PACKAGES = new Set(['org.droidtv.playtv', 'org.droidtv.zapster']);

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** A stable piece of an external id: lowercase letters and digits only. */
const idPart = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const featureList = (system, group) => {
  const list = system?.featuring?.jsonfeatures?.[group];
  return Array.isArray(list) ? list : [];
};

/**
 * What /system says about a TV: identity, transport, API version and what it
 * can do. The serial number is the identity; the device id when there is none.
 * @param {object} raw the /system answer (encrypted fields included)
 */
export function parseSystem(raw) {
  const system = decodeSystem(raw);
  const serial = text(system.serialnumber);
  const deviceId = text(system.deviceid);
  let platformId = null;
  if (idPart(serial)) {
    platformId = `sn-${idPart(serial)}`;
  } else if (idPart(deviceId)) {
    platformId = `id-${idPart(deviceId)}`;
  }
  const features = system.featuring?.systemfeatures ?? {};
  const major = Number(system.api_version?.Major);
  const osType = text(system.os_type) || text(features.os_type) || null;
  const ambilight = featureList(system, 'ambilight');
  // The model of /system ("1_50PUS6804/12" on Saphi) or its name.
  const model = text(system.model).replace(/^\d+_/, '') || text(system.name) || null;
  return {
    platformId,
    serial: serial || null,
    model,
    name: text(system.name) || model,
    softwareVersion: text(system.softwareversion) || null,
    apiVersion: Number.isInteger(major) ? major : null,
    secure: features.secured_transport === true || features.secured_transport === 'true',
    pairing: features.pairing_type === 'digest_auth_pairing',
    android: Boolean(osType?.startsWith('MSAF_')),
    osType,
    capabilities: {
      apps: featureList(system, 'applications').length > 0,
      launch: featureList(system, 'activities').includes('intent'),
      ambilight: ambilight.includes('Ambilight'),
      hue: ambilight.includes('Hue'),
    },
  };
}

/** `On`, `Standby`, `StandbyKeep`… → 'on' | 'standby' | null. */
export function parsePower(answer) {
  const state = text(answer?.powerstate);
  if (!state) {
    return null;
  }
  return state.toLowerCase() === 'on' ? 'on' : 'standby';
}

/** @returns {{ volume: number, min: number, max: number, muted: boolean }|null} */
export function parseVolume(answer) {
  const current = Number(answer?.current);
  const min = Number(answer?.min ?? 0);
  const max = Number(answer?.max);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  return {
    volume: Math.round(Math.max(min, Math.min(max, current))),
    min: Number.isFinite(min) ? min : 0,
    max: Math.round(max),
    muted: answer.muted === true || answer.muted === 'true',
  };
}

/** The id ha-philipsjs and the TV give an app: `<className>-<packageName>`. */
export function appIdOf(component) {
  const className = text(component?.className);
  const packageName = text(component?.packageName);
  return className || packageName ? `${className || 'None'}-${packageName || 'None'}` : null;
}

/** The TV player is in front: the tuner, or an HDMI source. */
export const isPlayTv = (component) => PLAY_TV_PACKAGES.has(text(component?.packageName));

/** @returns {Array<{ id: string, label: string, intent: object }>} */
export function parseApps(answer) {
  const seen = new Set();
  const apps = [];
  for (const app of Array.isArray(answer?.applications) ? answer.applications : []) {
    const id = text(app?.id) || appIdOf(app?.intent?.component);
    const label = text(app?.label);
    if (!id || !label || seen.has(id) || !app.intent?.component) {
      continue;
    }
    seen.add(id);
    apps.push({ id, label, intent: app.intent });
  }
  return apps;
}

/** The ids of the channel lists of /channeldb/tv. */
export function channelListIds(answer) {
  const ids = (Array.isArray(answer?.channelLists) ? answer.channelLists : [])
    .map((list) => text(list?.id))
    .filter(Boolean);
  return [...new Set(ids)];
}

const presetOf = (value) => {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

/** @returns {Array<{ ccid: number, preset: number|null, name: string|null, listId: string }>} */
export function parseChannelList(answer, listId) {
  const channels = [];
  for (const channel of Array.isArray(answer?.Channel) ? answer.Channel : []) {
    const ccid = Number(channel?.ccid);
    if (!Number.isInteger(ccid)) {
      continue;
    }
    channels.push({
      ccid,
      preset: presetOf(channel.preset),
      name: text(channel.name) || null,
      listId: text(answer.id) || listId,
    });
  }
  return channels;
}

/**
 * The channel of /activities/tv; null on an HDMI source (`ccid: "@"`) or none.
 * @returns {{ ccid: number, preset: number|null, name: string|null, listId: string }|null}
 */
export function parseCurrentChannel(answer) {
  const ccid = Number(answer?.channel?.ccid);
  if (!Number.isInteger(ccid) || ccid <= 0) {
    return null;
  }
  const name = text(answer.channel.name);
  return {
    ccid,
    preset: presetOf(answer.channel.preset),
    name: name && name !== '@' ? name : null,
    listId: text(answer.channelList?.id) || 'all',
  };
}

/** The level-1 activity of /context (`WatchTv`, `WatchSatellite`, `WatchExtension`…). */
export const contextActivity = (answer) => text(answer?.level1) || null;

/** The tuner is on screen, by the context the TV reports. */
export const isWatchingTv = (activity) => activity === 'WatchTv' || activity === 'WatchSatellite';

// --- Sources -----------------------------------------------------------------------

const passthrough = (input) =>
  `content://android.media.tv/passthrough/${encodeURIComponent(input)}`;

// The sources an Android TV switches to with an intent (the URIs of
// ha-philipsjs, those of the MediaTek chips of the 2019+ models).
export const SOURCES = Object.freeze([
  { key: 'tv', name: 'TV', uri: 'content://android.media.tv/channel' },
  ...[1, 2, 3, 4].map((index) => ({
    key: `hdmi_${index}`,
    name: `HDMI ${index}`,
    uri: passthrough(`com.mediatek.tvinput/.hdmi.HDMIInputService/HW${index + 4}`),
  })),
]);

/** The intent that shows a source (`org.droidtv.playtv.SELECTURI`). */
export function sourceIntent(uri) {
  return {
    extras: { uri },
    action: 'org.droidtv.playtv.SELECTURI',
    component: {
      packageName: 'org.droidtv.playtv',
      className: 'org.droidtv.playtv.PlayTvActivity',
    },
  };
}

// --- Ambilight ---------------------------------------------------------------------

// Our style families, and the style names the TVs give them.
export const AMBILIGHT_FAMILIES = Object.freeze({
  video: ['FOLLOW_VIDEO'],
  audio: ['FOLLOW_AUDIO'],
  lounge: ['Lounge light', 'FOLLOW_COLOR'],
});

// The menu settings of each family, when the TV does not list them (the
// Android and Saphi firmwares omit them; the lists of ha-philipsjs).
const FALLBACK_MENUS = {
  android: {
    video: ['STANDARD', 'VIVID', 'IMMERSIVE', 'NATURAL', 'GAME'],
    audio: ['ENERGY_ADAPTIVE_BRIGHTNESS', 'VU_METER', 'RANDOM_PIXEL_FLASH'],
    lounge: ['HOT_LAVA', 'DEEP_WATER', 'FRESH_NATURE', 'ISF'],
  },
  saphi: {
    video: ['STANDARD', 'NATURAL', 'VIVID', 'CINEMA', 'GAME', 'SPORTS', 'COMFORT'],
    audio: [
      'ENERGY_ADAPTIVE_BRIGHTNESS',
      'ENERGY_ADAPTIVE_COLORS',
      'VU_METER',
      'SPECTRUM_ANALYZER',
      'KNIGHT_RIDER_CLOCKWISE',
      'KNIGHT_RIDER_ALTERNATING',
      'RANDOM_PIXEL_FLASH',
      'STROBE',
      'PARTY',
    ],
    lounge: ['PTA_LOUNGE', 'DEEP_WATER', 'HOT_LAVA', 'FRESH_NATURE', 'ISF_BLUE'],
  },
};

// The custom colour of the lounge family is the `color` feature.
const SKIPPED_SETTINGS = new Set(['CUSTOM_COLOR']);

export const COLOR_STYLE = 'color';

const familyOf = (styleName) =>
  Object.keys(AMBILIGHT_FAMILIES).find((family) =>
    AMBILIGHT_FAMILIES[family].includes(styleName),
  ) ?? null;

/** Our stable key of a style: `video_standard`, `lounge_hot_lava`… */
export const styleKey = (family, menuSetting) => `${family}_${String(menuSetting).toLowerCase()}`;

/**
 * The Ambilight styles of a TV, from /ambilight/supportedstyles (null: not
 * read yet, the fallback lists of its firmware family).
 * @returns {Array<{ key: string, family: string, styleName: string, menuSetting: string }>}
 */
export function parseStyles(answer, { android = true } = {}) {
  const supported = (Array.isArray(answer?.supportedStyles) ? answer.supportedStyles : []).filter(
    (style) => typeof style?.styleName === 'string',
  );
  const fallback = android ? FALLBACK_MENUS.android : FALLBACK_MENUS.saphi;
  const styles = [];
  const seen = new Set();
  for (const family of Object.keys(AMBILIGHT_FAMILIES)) {
    const names = AMBILIGHT_FAMILIES[family];
    // The TV's own name for the family, the first one known otherwise.
    const listed = names
      .map((name) => supported.find((style) => style.styleName === name))
      .find(Boolean);
    // Every Ambilight TV follows the video, listed or not (ha-philipsjs
    // adds it on Android and Saphi); the other families when listed.
    if (supported.length > 0 && !listed && family !== 'video') {
      continue;
    }
    const styleName = listed?.styleName ?? names[0];
    const menus =
      Array.isArray(listed?.menuSettings) && listed.menuSettings.length > 0
        ? listed.menuSettings
        : fallback[family];
    for (const menuSetting of menus) {
      if (typeof menuSetting !== 'string' || SKIPPED_SETTINGS.has(menuSetting)) {
        continue;
      }
      const key = styleKey(family, menuSetting);
      if (!seen.has(key)) {
        seen.add(key);
        styles.push({ key, family, styleName, menuSetting });
      }
    }
  }
  return styles;
}

/** The style name a TV uses for a fixed colour (expert lounge style). */
export function colorStyleName(answer) {
  const supported = Array.isArray(answer?.supportedStyles) ? answer.supportedStyles : [];
  const manual = supported.find(
    (style) =>
      AMBILIGHT_FAMILIES.lounge.includes(style?.styleName) &&
      Array.isArray(style.algorithms) &&
      style.algorithms.includes('MANUAL_HUE'),
  );
  return manual?.styleName ?? 'FOLLOW_COLOR';
}

/**
 * Our view of /ambilight/currentconfiguration.
 * @returns {{ style: string|null, color: number|null }} style key (or
 *   `color`), RGB colour of a fixed colour
 */
export function parseConfiguration(answer) {
  const styleName = text(answer?.styleName);
  const expert = answer?.isExpert === true || answer?.isExpert === 'true';
  if (!styleName || styleName === 'OFF') {
    return { style: null, color: null };
  }
  if (expert) {
    const settings = answer.colorSettings ?? answer.audioSettings;
    const color = settings?.color;
    if (familyOf(styleName) === 'lounge' && color) {
      return { style: COLOR_STYLE, color: hsbToRgb(color) };
    }
    return { style: null, color: null };
  }
  const family = familyOf(styleName);
  const menuSetting = text(answer.menuSetting);
  return { style: family && menuSetting ? styleKey(family, menuSetting) : null, color: null };
}

/** Ambilight colour (hue, saturation, brightness, 0-255 each) → 0xRRGGBB. */
export function hsbToRgb({ hue, saturation, brightness }) {
  const raw = Number(hue);
  const h = (((((Number.isFinite(raw) ? raw : 0) % 255) + 255) % 255) / 255) * 6;
  const s = Math.max(0, Math.min(1, (Number(saturation) || 0) / 255));
  const v = Math.max(0, Math.min(1, (Number(brightness) || 0) / 255));
  const sector = Math.floor(h) % 6;
  const f = h - Math.floor(h);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][sector];
  const byte = (x) => Math.round(x * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** 0xRRGGBB → Ambilight colour (hue, saturation, brightness, 0-255 each). */
export function rgbToHsb(rgb) {
  const value = Math.max(0, Math.min(0xffffff, Math.round(Number(rgb) || 0)));
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue = (hue < 0 ? hue + 6 : hue) / 6;
  }
  return {
    hue: Math.round(hue * 255),
    saturation: Math.round(max === 0 ? 0 : (delta / max) * 255),
    brightness: Math.round(max * 255),
  };
}

// --- Name matching ---------------------------------------------------------------------

/** Lowercase, no accents, no spaces nor punctuation: "HDMI 2" = "hdmi2". */
export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** An application by id or by name (exact, then the start of its name). */
export function findApp(apps, query) {
  const raw = text(query);
  if (!raw) {
    return null;
  }
  const exact = apps.find((app) => app.id === raw);
  if (exact) {
    return exact;
  }
  const wanted = normalize(raw);
  if (!wanted) {
    return null;
  }
  return (
    apps.find((app) => normalize(app.label) === wanted) ??
    apps.find((app) => normalize(app.label).startsWith(wanted)) ??
    null
  );
}

/** A source by key or by name ("HDMI 2", "hdmi2", "TV"). */
export function findSource(query) {
  const wanted = normalize(query);
  if (!wanted) {
    return null;
  }
  return (
    SOURCES.find(
      (source) => normalize(source.key) === wanted || normalize(source.name) === wanted,
    ) ?? null
  );
}
