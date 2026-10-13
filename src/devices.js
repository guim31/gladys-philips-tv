// -----------------------------------------------------------------------------
// One Gladys device per TV.
//
// Identity: the serial number the TV gives in /system (its device id when it
// gives none) — never the address typed in the configuration, which DHCP can
// change. A TV is published once it answered at least once; what it said is
// kept under /data for the next starts.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js), by what the TV can do (`capabilities`):
//   - power: television/binary, writable (Wake-on-LAN when the TV sleeps deep);
//   - volume: television/volume, writable, the slider (bounds of the TV);
//   - volume up / down, mute, channel up / down: television push buttons
//     (write-only: the core shows them as buttons);
//   - source (Android TVs): text/select, TV and HDMI 1 to 4, plus "Other";
//   - app (Android TVs): text/select, the TV's applications, plus "Home
//     screen or other"; the TV says which application is in front;
//   - channel: television/channel, writable, the preset number on screen;
//   - now playing: text/text, read-only;
//   - Ambilight (Ambilight TVs): light/binary, its style (text/select) and a
//     fixed colour (light/color);
//   - Ambilight + Hue (TVs that drive Hue lamps): switch/binary.
//
// The devices are published with should_poll: false: the integration reads
// the TVs on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { COLOR_STYLE, CONTENT_KINDS, SOURCES, parseStyles } from './philips/model.js';
import { styleLabel } from './texts.js';

export const DEVICE_TYPE = 'tv';
export const HOST_PARAM = 'PHILIPS_HOST';
export const MODEL_PARAM = 'PHILIPS_MODEL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  POWER: 'power',
  VOLUME: 'volume',
  VOLUME_UP: 'volume_up',
  VOLUME_DOWN: 'volume_down',
  MUTE: 'mute',
  SOURCE: 'source',
  APP: 'app',
  CHANNEL: 'channel',
  CHANNEL_UP: 'channel_up',
  CHANNEL_DOWN: 'channel_down',
  PLAYING: 'playing',
  AMBILIGHT: 'ambilight',
  AMBILIGHT_STYLE: 'ambilight_style',
  AMBILIGHT_COLOR: 'ambilight_color',
  AMBILIGHT_HUE: 'ambilight_hue',
});

// Option values of the selects that are not a source or an application.
export const OTHER_SOURCE = 'other';
export const HOME_APP = 'home';

// The volume bounds of most Philips TVs, until the TV said its own.
export const DEFAULT_VOLUME_MAX = 60;

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.POWER]: 'Power',
    [FEATURE_KEYS.VOLUME]: 'Volume',
    [FEATURE_KEYS.VOLUME_UP]: 'Volume up',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Volume down',
    [FEATURE_KEYS.MUTE]: 'Mute',
    [FEATURE_KEYS.SOURCE]: 'Source',
    [FEATURE_KEYS.APP]: 'App',
    [FEATURE_KEYS.CHANNEL]: 'Channel',
    [FEATURE_KEYS.CHANNEL_UP]: 'Channel up',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Channel down',
    [FEATURE_KEYS.PLAYING]: 'Now playing',
    [FEATURE_KEYS.AMBILIGHT]: 'Ambilight',
    [FEATURE_KEYS.AMBILIGHT_STYLE]: 'Ambilight style',
    [FEATURE_KEYS.AMBILIGHT_COLOR]: 'Ambilight colour',
    [FEATURE_KEYS.AMBILIGHT_HUE]: 'Ambilight + Hue',
  },
  fr: {
    [FEATURE_KEYS.POWER]: 'Marche / arrêt',
    [FEATURE_KEYS.VOLUME]: 'Volume',
    [FEATURE_KEYS.VOLUME_UP]: 'Augmenter le volume',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Diminuer le volume',
    [FEATURE_KEYS.MUTE]: 'Muet',
    [FEATURE_KEYS.SOURCE]: 'Source',
    [FEATURE_KEYS.APP]: 'Application',
    [FEATURE_KEYS.CHANNEL]: 'Chaîne',
    [FEATURE_KEYS.CHANNEL_UP]: 'Chaîne suivante',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Chaîne précédente',
    [FEATURE_KEYS.PLAYING]: 'En cours',
    [FEATURE_KEYS.AMBILIGHT]: 'Ambilight',
    [FEATURE_KEYS.AMBILIGHT_STYLE]: 'Style Ambilight',
    [FEATURE_KEYS.AMBILIGHT_COLOR]: 'Couleur Ambilight',
    [FEATURE_KEYS.AMBILIGHT_HUE]: 'Ambilight + Hue',
  },
  de: {
    [FEATURE_KEYS.POWER]: 'Ein / Aus',
    [FEATURE_KEYS.VOLUME]: 'Lautstärke',
    [FEATURE_KEYS.VOLUME_UP]: 'Lautstärke höher',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Lautstärke niedriger',
    [FEATURE_KEYS.MUTE]: 'Stumm',
    [FEATURE_KEYS.SOURCE]: 'Quelle',
    [FEATURE_KEYS.APP]: 'App',
    [FEATURE_KEYS.CHANNEL]: 'Kanal',
    [FEATURE_KEYS.CHANNEL_UP]: 'Nächster Kanal',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Voriger Kanal',
    [FEATURE_KEYS.PLAYING]: 'Aktuelle Wiedergabe',
    [FEATURE_KEYS.AMBILIGHT]: 'Ambilight',
    [FEATURE_KEYS.AMBILIGHT_STYLE]: 'Ambilight-Stil',
    [FEATURE_KEYS.AMBILIGHT_COLOR]: 'Ambilight-Farbe',
    [FEATURE_KEYS.AMBILIGHT_HUE]: 'Ambilight + Hue',
  },
  es: {
    [FEATURE_KEYS.POWER]: 'Encendido',
    [FEATURE_KEYS.VOLUME]: 'Volumen',
    [FEATURE_KEYS.VOLUME_UP]: 'Subir volumen',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Bajar volumen',
    [FEATURE_KEYS.MUTE]: 'Silenciar',
    [FEATURE_KEYS.SOURCE]: 'Fuente',
    [FEATURE_KEYS.APP]: 'Aplicación',
    [FEATURE_KEYS.CHANNEL]: 'Canal',
    [FEATURE_KEYS.CHANNEL_UP]: 'Canal siguiente',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Canal anterior',
    [FEATURE_KEYS.PLAYING]: 'En reproducción',
    [FEATURE_KEYS.AMBILIGHT]: 'Ambilight',
    [FEATURE_KEYS.AMBILIGHT_STYLE]: 'Estilo Ambilight',
    [FEATURE_KEYS.AMBILIGHT_COLOR]: 'Color Ambilight',
    [FEATURE_KEYS.AMBILIGHT_HUE]: 'Ambilight + Hue',
  },
};

// Labels of the extra options and texts of the "Now playing" feature.
export const DEVICE_TEXT = {
  otherSource: { en: 'Other', fr: 'Autre', de: 'Andere', es: 'Otra' },
  homeApp: {
    en: 'Home screen or other',
    fr: 'Accueil ou autre',
    de: 'Startbildschirm oder andere',
    es: 'Inicio u otra',
  },
  home: {
    en: 'Home screen',
    fr: "Écran d'accueil",
    de: 'Startbildschirm',
    es: 'Pantalla de inicio',
  },
  hdmi: { en: 'HDMI source', fr: 'Source HDMI', de: 'HDMI-Quelle', es: 'Fuente HDMI' },
  tv: { en: 'TV', fr: 'TV', de: 'TV', es: 'TV' },
  off: { en: 'Off', fr: 'Éteinte', de: 'Aus', es: 'Apagada' },
  color: { en: 'Fixed colour', fr: 'Couleur fixe', de: 'Feste Farbe', es: 'Color fijo' },
};

const text = (table, language) => table[language] ?? table.en;

// Display bounds (the core never applies them on write).
const CHANNEL_MAX = 9999;
const COLOR_MAX = 0xffffff;

const binary = (category, type, history = true) => ({
  category,
  type,
  read_only: false,
  has_feedback: true,
  keep_history: history,
  min: 0,
  max: 1,
});

const push = (type) => ({
  category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
  type,
  read_only: false,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 1,
});

const select = () => ({
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
  read_only: false,
  has_feedback: true,
  keep_history: false,
  min: 0,
  max: 0,
});

const TV = DEVICE_FEATURE_TYPES.TELEVISION;

// Order = display order in Gladys; `when` = what the TV must be able to do.
const FEATURES = [
  {
    key: FEATURE_KEYS.POWER,
    definition: binary(DEVICE_FEATURE_CATEGORIES.TELEVISION, TV.BINARY),
  },
  {
    key: FEATURE_KEYS.VOLUME,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: TV.VOLUME,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: DEFAULT_VOLUME_MAX,
    },
  },
  { key: FEATURE_KEYS.VOLUME_DOWN, definition: push(TV.VOLUME_DOWN) },
  { key: FEATURE_KEYS.VOLUME_UP, definition: push(TV.VOLUME_UP) },
  { key: FEATURE_KEYS.MUTE, definition: push(TV.VOLUME_MUTE) },
  { key: FEATURE_KEYS.SOURCE, definition: select(), when: (caps) => caps.launch },
  { key: FEATURE_KEYS.APP, definition: select(), when: (caps) => caps.launch && caps.apps },
  {
    key: FEATURE_KEYS.CHANNEL,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: TV.CHANNEL,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: CHANNEL_MAX,
    },
  },
  { key: FEATURE_KEYS.CHANNEL_DOWN, definition: push(TV.CHANNEL_DOWN) },
  { key: FEATURE_KEYS.CHANNEL_UP, definition: push(TV.CHANNEL_UP) },
  {
    key: FEATURE_KEYS.PLAYING,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    },
  },
  {
    key: FEATURE_KEYS.AMBILIGHT,
    definition: binary(DEVICE_FEATURE_CATEGORIES.LIGHT, DEVICE_FEATURE_TYPES.LIGHT.BINARY),
    when: (caps) => caps.ambilight,
  },
  { key: FEATURE_KEYS.AMBILIGHT_STYLE, definition: select(), when: (caps) => caps.ambilight },
  {
    key: FEATURE_KEYS.AMBILIGHT_COLOR,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.LIGHT,
      type: DEVICE_FEATURE_TYPES.LIGHT.COLOR,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: COLOR_MAX,
    },
    when: (caps) => caps.ambilight,
  },
  {
    key: FEATURE_KEYS.AMBILIGHT_HUE,
    definition: binary(DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY, false),
    when: (caps) => caps.hue,
  },
];

/** Keys of the write-only buttons: no state to publish. */
export const PUSH_KEYS = new Set(
  FEATURES.filter(({ definition }) => !definition.has_feedback && !definition.read_only).map(
    ({ key }) => key,
  ),
);

const NO_CAPABILITIES = { apps: false, launch: false, ambilight: false, hue: false };

/** The features a TV has, by its capabilities. */
export const featuresOf = (identity) =>
  FEATURES.filter(({ when }) => !when || when(identity?.capabilities ?? NO_CAPABILITIES));

/** External ids of a TV's device and features. */
export const deviceIds = (gladys, platformId) => gladys.externalIds(DEVICE_TYPE, platformId);

/** The platform id of a device external id of ours, null otherwise. */
export function platformIdOf(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  return rest && !rest.includes(':') ? rest : null;
}

/** The name shown for a TV: the one typed in the configuration, else its model. */
export function tvName(record) {
  if (record.tv.name) {
    return record.tv.name;
  }
  if (record.identity?.model) {
    return `Philips ${record.identity.model}`;
  }
  return `Philips ${record.tv.host}`;
}

export const fit = (value, max) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/** The options of the source select. */
export function sourceOptions(language) {
  return [
    ...SOURCES.map((source, index) => ({
      value: source.key,
      label: source.key === 'tv' ? text(DEVICE_TEXT.tv, language) : source.name,
      sort_order: index,
    })),
    {
      value: OTHER_SOURCE,
      label: text(DEVICE_TEXT.otherSource, language),
      sort_order: SOURCES.length,
    },
  ];
}

/** The options of the application select. */
export function appOptions(record, language) {
  return [
    { value: HOME_APP, label: text(DEVICE_TEXT.homeApp, language), sort_order: 0 },
    ...record.apps.map((app, index) => ({
      value: app.id,
      label: fit(app.label, 60),
      sort_order: index + 1,
    })),
  ];
}

/** The Ambilight styles of a TV (its own list, or its firmware's). */
export const stylesOf = (record) =>
  parseStyles(record.styles, { android: record.identity?.android !== false });

/** The options of the Ambilight style select. */
export function styleOptions(record, language) {
  const styles = stylesOf(record);
  return [
    ...styles.map((style, index) => ({
      value: style.key,
      label: styleLabel(style, language),
      sort_order: index,
    })),
    { value: COLOR_STYLE, label: text(DEVICE_TEXT.color, language), sort_order: styles.length },
  ];
}

/**
 * The discovery payload of a TV that answered once.
 * @param {object} gladys SDK client
 * @param {object} record hub record: tv (config), identity, apps, styles
 * @param {string} language feature names language
 */
export function buildDevice(gladys, record, language = 'en') {
  const ids = deviceIds(gladys, record.identity.platformId);
  const names = NAMES[language] ?? NAMES.en;
  const params = [{ name: HOST_PARAM, value: record.tv.host }];
  if (record.identity.model) {
    params.push({ name: MODEL_PARAM, value: record.identity.model });
  }
  return {
    name: tvName(record),
    external_id: ids.device,
    should_poll: false,
    params,
    features: featuresOf(record.identity).map(({ key, definition }) => {
      const feature = { ...definition, name: names[key], external_id: ids.feature(key) };
      if (key === FEATURE_KEYS.VOLUME && record.identity.volumeMax) {
        feature.max = record.identity.volumeMax;
      } else if (key === FEATURE_KEYS.SOURCE) {
        feature.supported_options = sourceOptions(language);
      } else if (key === FEATURE_KEYS.APP) {
        feature.supported_options = appOptions(record, language);
      } else if (key === FEATURE_KEYS.AMBILIGHT_STYLE) {
        feature.supported_options = styleOptions(record, language);
      }
      return feature;
    }),
  };
}

/**
 * What is on screen, from a snapshot: `{ kind, key, name, number }` or null
 * (off, or not known). `key`: the source key, app id or channel ccid.
 */
export function screenOf(record, language) {
  const { power, activity, channel, sourceHint } = record.snapshot;
  if (power !== 'on' || !activity) {
    return null;
  }
  if (activity.playTv) {
    if (channel && activity.watchingTv !== false) {
      const known = record.channels?.find((item) => item.ccid === channel.ccid);
      return {
        kind: CONTENT_KINDS.CHANNEL,
        key: String(channel.ccid),
        name: channel.name ?? known?.name ?? null,
        number: channel.preset ?? known?.preset ?? null,
      };
    }
    const source = SOURCES.find((item) => item.key === sourceHint);
    if (source && source.key !== 'tv') {
      return { kind: CONTENT_KINDS.SOURCE, key: source.key, name: source.name, number: null };
    }
    return {
      kind: CONTENT_KINDS.SOURCE,
      key: OTHER_SOURCE,
      name: text(DEVICE_TEXT.hdmi, language),
      number: null,
    };
  }
  const app = record.apps.find((item) => item.id === activity.appId);
  return {
    kind: CONTENT_KINDS.APP,
    key: app ? app.id : HOME_APP,
    name: app ? app.label : text(DEVICE_TEXT.home, language),
    number: null,
  };
}

/** The "Now playing" text of a snapshot. */
export function playingText(record, language) {
  if (record.snapshot.power !== 'on') {
    return text(DEVICE_TEXT.off, language);
  }
  const screen = screenOf(record, language);
  if (!screen) {
    return text(DEVICE_TEXT.tv, language);
  }
  if (screen.kind === CONTENT_KINDS.CHANNEL) {
    const label = [screen.number, screen.name].filter((part) => part !== null).join(' · ');
    return fit(label || text(DEVICE_TEXT.tv, language), 100);
  }
  return fit(screen.name, 100);
}

/**
 * The state of every feature of a TV (null: nothing to publish). Text values
 * are strings, published as `{ text }`.
 * @returns {Array<{ key: string, externalId: string, value: number|string|null }>}
 */
export function featureValues(gladys, record, language) {
  const ids = deviceIds(gladys, record.identity.platformId);
  const { power, volume, ambilight, hue } = record.snapshot;
  const on = power === 'on';
  const screen = on ? screenOf(record, language) : null;
  const styleValues = new Set(styleOptions(record, language).map((option) => option.value));
  const values = {
    [FEATURE_KEYS.POWER]: on ? 1 : power === 'standby' ? 0 : null,
    [FEATURE_KEYS.VOLUME]: on && volume ? volume.volume : null,
    [FEATURE_KEYS.SOURCE]: !screen
      ? null
      : screen.kind === CONTENT_KINDS.CHANNEL
        ? 'tv'
        : screen.kind === CONTENT_KINDS.SOURCE
          ? screen.key
          : OTHER_SOURCE,
    [FEATURE_KEYS.APP]: !screen ? null : screen.kind === CONTENT_KINDS.APP ? screen.key : null,
    [FEATURE_KEYS.CHANNEL]:
      screen?.kind === CONTENT_KINDS.CHANNEL && screen.number !== null
        ? Math.min(CHANNEL_MAX, screen.number)
        : null,
    [FEATURE_KEYS.PLAYING]: power ? playingText(record, language) : null,
    [FEATURE_KEYS.AMBILIGHT]:
      ambilight?.power === null || !ambilight ? null : ambilight.power ? 1 : 0,
    [FEATURE_KEYS.AMBILIGHT_STYLE]:
      ambilight?.style && styleValues.has(ambilight.style) ? ambilight.style : null,
    [FEATURE_KEYS.AMBILIGHT_COLOR]:
      ambilight?.style === COLOR_STYLE && Number.isInteger(ambilight.color)
        ? ambilight.color
        : null,
    [FEATURE_KEYS.AMBILIGHT_HUE]: hue === null || hue === undefined ? null : hue ? 1 : 0,
  };
  // The app select: the TV player shows as its own entry ("TV") when listed.
  if (screen && screen.kind !== CONTENT_KINDS.APP && record.snapshot.activity?.appId) {
    const player = record.apps.find((item) => item.id === record.snapshot.activity.appId);
    values[FEATURE_KEYS.APP] = player ? player.id : HOME_APP;
  }
  return featuresOf(record.identity)
    .filter(({ key }) => !PUSH_KEYS.has(key))
    .map(({ key }) => ({ key, externalId: ids.feature(key), value: values[key] ?? null }));
}
