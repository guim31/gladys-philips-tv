// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+). The core allows four
// buttons per widget, so the remote is split in four widgets a user places
// side by side, each bound to one TV (the first one when none is chosen):
//
//   - `remote`: what the TV does (state, what is on screen, volume) and
//     Power, Volume −, Volume +, Mute;
//   - `ambilight`: its state and style, an On / Off button and three styles
//     chosen in the widget settings;
//   - `keys`: four remote keys chosen in the widget settings (arrows by
//     default; a second instance for OK, Back, Home, Sources…);
//   - `shortcuts`: four favorite sources or applications, typed by name in
//     the settings ("HDMI 2", "Netflix"); TV and HDMI 1 to 3 by default.
//
// The current choice is shown by the check-circle icon, never by the style
// (`primary` is invisible in dark mode, GladysAssistant/Gladys#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { fit, playingText, screenOf, stylesOf, tvName } from './devices.js';
import { WIDGET_KEYS } from './hub.js';
import { KEYS, KEY_ICONS, KEY_LABELS } from './philips/keys.js';
import { COLOR_STYLE, CONTENT_KINDS, SOURCES, findApp, findSource } from './philips/model.js';
import { SCENE_STYLES } from './scenes.js';
import { STYLE_SETTING_TEXT, failure, labelled, pick, styleLabel } from './texts.js';

// Action keys of the buttons: permanent once published (unique within a
// content, the core drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  POWER: 'power',
  VOLUME_DOWN: 'volume_down',
  VOLUME_UP: 'volume_up',
  MUTE: 'mute',
  AMBILIGHT: 'ambilight',
});
export const SLOT_COUNT = 4;
export const STYLE_SLOT_COUNT = 3;
export const KEY_ACTION = (index) => `key_${index}`;
export const SHORTCUT_ACTION = (index) => `shortcut_${index}`;
export const STYLE_ACTION = (index) => `style_${index}`;

// Defaults of the widget settings (mirror the manifest defaults).
export const DEFAULT_KEYS = ['up', 'down', 'left', 'right'];
export const DEFAULT_STYLES = [
  'video_standard',
  'audio_energy_adaptive_brightness',
  'lounge_hot_lava',
];
export const DEFAULT_SHORTCUTS = ['tv', 'hdmi_1', 'hdmi_2', 'hdmi_3'];

// The styles a widget button may apply: those of the scene action, but "off"
// (the On / Off button does that).
export const WIDGET_STYLES = SCENE_STYLES.filter((style) => style !== 'off');

const ACTIVE_ICON = 'check-circle';

export const TEXT = {
  pick: {
    en: 'Enter the address of your TV in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre téléviseur dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Fernsehers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su televisor en la configuración de la integración.',
  },
  unknown: {
    en: 'This TV is no longer in the configuration: choose another one in the widget settings.',
    fr: "Ce téléviseur n'est plus dans la configuration : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Fernseher ist nicht mehr in der Konfiguration: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este televisor ya no está en la configuración: elija otro en la configuración del widget.',
  },
  noAmbilight: {
    en: 'This TV has no Ambilight.',
    fr: "Ce téléviseur n'a pas d'Ambilight.",
    de: 'Dieser Fernseher hat kein Ambilight.',
    es: 'Este televisor no tiene Ambilight.',
  },
  noShortcut: {
    en: 'This TV does not open apps nor sources through its API.',
    fr: "Ce téléviseur n'ouvre ni applications ni sources par son API.",
    de: 'Dieser Fernseher öffnet über seine API weder Apps noch Quellen.',
    es: 'Este televisor no abre aplicaciones ni fuentes a través de su API.',
  },
  notFound: { en: 'Not found', fr: 'Introuvable', de: 'Nicht gefunden', es: 'No encontrado' },
  on: { en: 'On', fr: 'Allumée', de: 'Ein', es: 'Encendida' },
  lit: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  ambilightOn: {
    en: 'Ambilight on',
    fr: "Allumer l'Ambilight",
    de: 'Ambilight ein',
    es: 'Encender Ambilight',
  },
  ambilightOff: {
    en: 'Ambilight off',
    fr: "Éteindre l'Ambilight",
    de: 'Ambilight aus',
    es: 'Apagar Ambilight',
  },
  standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En espera' },
  unreachable: {
    en: 'Not answering',
    fr: 'Ne répond pas',
    de: 'Antwortet nicht',
    es: 'No responde',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  screen: { en: 'On screen', fr: "À l'écran", de: 'Auf dem Bildschirm', es: 'En pantalla' },
  volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  muted: { en: 'Muted', fr: 'Coupé', de: 'Stumm', es: 'Silenciado' },
  style: { en: 'Style', fr: 'Style', de: 'Stil', es: 'Estilo' },
  color: { en: 'Fixed colour', fr: 'Couleur fixe', de: 'Feste Farbe', es: 'Color fijo' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  volumeDown: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  volumeUp: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  mute: { en: 'Mute', fr: 'Muet', de: 'Stumm', es: 'Silenciar' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    turningOn: (name) => `Turning ${name} on…`,
    turnedOff: (name) => `${name} turned off.`,
    opened: (name) => `${name} on screen.`,
  },
  fr: {
    turningOn: (name) => `Allumage de ${name}…`,
    turnedOff: (name) => `${name} éteint.`,
    opened: (name) => `${name} à l'écran.`,
  },
  de: {
    turningOn: (name) => `${name} wird eingeschaltet…`,
    turnedOff: (name) => `${name} ausgeschaltet.`,
    opened: (name) => `${name} auf dem Bildschirm.`,
  },
  es: {
    turningOn: (name) => `Encendiendo ${name}…`,
    turnedOff: (name) => `${name} apagado.`,
    opened: (name) => `${name} en pantalla.`,
  },
};

const t = (text, language) => pick(text, language);
const done = (render) =>
  Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The record a widget shows, or the content to show instead. */
function recordFor(hub, settings, language) {
  if (hub.records.size === 0) {
    return { content: message(TEXT.pick, language) };
  }
  const record = hub.view(settings?.device);
  return record ? { record } : { content: message(TEXT.unknown, language) };
}

/** The record a widget button acts on. */
function actionRecord(hub, settings) {
  const record = hub.view(settings?.device);
  if (!record) {
    throw failure(hub.language, hub.records.size === 0 ? 'noTv' : 'unknownTv');
  }
  return record;
}

const isOn = (record) => record.snapshot.power === 'on';

/** The first status row: the TV and its state. */
function tvRow(record, language) {
  const label = fit(tvName(record), 40);
  if (record.error) {
    return {
      label,
      icon: 'alert-triangle',
      value: t(TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (record.snapshot.reachable === false) {
    return {
      label,
      icon: 'tv',
      value: t(record.identity ? TEXT.standby : TEXT.unreachable, language),
      color: record.identity ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.WARNING,
    };
  }
  if (record.snapshot.power === 'on') {
    return { label, icon: 'tv', value: t(TEXT.on, language), color: WIDGET_COLORS.SUCCESS };
  }
  if (record.snapshot.power === 'standby') {
    return { label, icon: 'tv', value: t(TEXT.standby, language), color: WIDGET_COLORS.NEUTRAL };
  }
  return { label, icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
}

// --- remote ------------------------------------------------------------------

function remoteContent(record, language) {
  const items = [tvRow(record, language)];
  const volume = record.snapshot.volume;
  const on = isOn(record);
  if (on) {
    items.push({
      label: t(TEXT.screen, language),
      icon: 'airplay',
      value: fit(playingText(record, language), 40),
      color: WIDGET_COLORS.INFO,
    });
    if (volume) {
      items.push({
        label: t(TEXT.volume, language),
        icon: volume.muted ? 'volume-x' : 'volume-2',
        value: volume.muted ? t(TEXT.muted, language) : volume.volume,
        color: volume.muted ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  return {
    ttl_seconds: on ? 30 : 120,
    components: [
      { type: 'status', items },
      {
        type: 'button',
        label: t(on ? TEXT.turnOff : TEXT.turnOn, language),
        icon: 'power',
        style: 'secondary',
        action: { key: ACTIONS.POWER, params: { on: !on } },
      },
      {
        type: 'button',
        label: t(TEXT.volumeDown, language),
        icon: 'volume-1',
        style: 'secondary',
        action: { key: ACTIONS.VOLUME_DOWN },
      },
      {
        type: 'button',
        label: t(TEXT.volumeUp, language),
        icon: 'volume-2',
        style: 'secondary',
        action: { key: ACTIONS.VOLUME_UP },
      },
      {
        type: 'button',
        label: t(TEXT.mute, language),
        icon: volume?.muted ? ACTIVE_ICON : 'volume-x',
        style: 'secondary',
        action: { key: ACTIONS.MUTE },
      },
    ],
  };
}

const remote = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    return content ?? remoteContent(record, language);
  },

  async action(hub, { actionKey, params = {}, settings }) {
    const record = actionRecord(hub, settings);
    const name = tvName(record);
    switch (actionKey) {
      case ACTIONS.POWER: {
        const on = params.on === true;
        await hub.setPower(record, on);
        return { message: done((text) => (on ? text.turningOn(name) : text.turnedOff(name))) };
      }
      case ACTIONS.VOLUME_DOWN:
        await hub.stepVolume(record, false);
        return undefined;
      case ACTIONS.VOLUME_UP:
        await hub.stepVolume(record, true);
        return undefined;
      case ACTIONS.MUTE:
        await hub.toggleMute(record);
        return undefined;
      default:
        throw new Error(`Unknown action ${actionKey}`);
    }
  },
};

// --- ambilight -----------------------------------------------------------------

/** The three styles of an `ambilight` widget, from its settings. */
export function chosenStyles(settings = {}) {
  return Array.from({ length: STYLE_SLOT_COUNT }, (_, index) => {
    const value = settings?.[`style_${index + 1}`];
    return WIDGET_STYLES.includes(value) ? value : DEFAULT_STYLES[index];
  });
}

const hex = (rgb) => `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;

function styleName(record, key, language) {
  if (key === COLOR_STYLE) {
    return t(TEXT.color, language);
  }
  const style = stylesOf(record).find((item) => item.key === key);
  if (style) {
    return styleLabel(style, language);
  }
  const [family, ...setting] = key.split('_');
  return styleLabel({ family, menuSetting: setting.join('_').toUpperCase() }, language);
}

// A button names the setting only ("Hot lava"): the icon tells the family.
const FAMILY_ICONS = { video: 'film', audio: 'music', lounge: 'coffee' };
const familyOf = (key) => key.split('_')[0];

function buttonLabel(key, language) {
  if (key === COLOR_STYLE) {
    return t(TEXT.color, language);
  }
  const setting = STYLE_SETTING_TEXT[key.split('_').slice(1).join('_').toUpperCase()];
  return setting ? t(setting, language) : styleName({ apps: [], styles: null }, key, language);
}

const ambilightWidget = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    if (content) {
      return content;
    }
    if (record.identity && !record.identity.capabilities?.ambilight) {
      return message(TEXT.noAmbilight, language);
    }
    const ambilight = record.snapshot.ambilight;
    const lit = ambilight?.power === true;
    const items = [tvRow(record, language)];
    if (record.snapshot.reachable && ambilight) {
      items.push({
        label: 'Ambilight',
        icon: 'sun',
        value: t(lit ? TEXT.lit : TEXT.off, language),
        color: lit ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      });
      if (lit && ambilight.style) {
        items.push({
          label: t(TEXT.style, language),
          icon: 'droplet',
          value: fit(
            ambilight.style === COLOR_STYLE && Number.isInteger(ambilight.color)
              ? hex(ambilight.color)
              : styleName(record, ambilight.style, language),
            40,
          ),
          color: WIDGET_COLORS.INFO,
        });
      }
    }
    return {
      ttl_seconds: isOn(record) ? 30 : 120,
      components: [
        { type: 'status', items },
        {
          type: 'button',
          label: t(lit ? TEXT.ambilightOff : TEXT.ambilightOn, language),
          icon: lit ? ACTIVE_ICON : 'sun',
          style: 'secondary',
          action: { key: ACTIONS.AMBILIGHT, params: { on: !lit } },
        },
        ...chosenStyles(settings).map((style, index) => ({
          type: 'button',
          label: fit(buttonLabel(style, language), 24),
          icon:
            lit && ambilight?.style === style
              ? ACTIVE_ICON
              : (FAMILY_ICONS[familyOf(style)] ?? 'droplet'),
          style: 'secondary',
          action: { key: STYLE_ACTION(index + 1), params: { style } },
        })),
      ],
    };
  },

  async action(hub, { actionKey, params = {}, settings }) {
    const record = actionRecord(hub, settings);
    if (actionKey === ACTIONS.AMBILIGHT) {
      await hub.setAmbilight(record, params.on === true);
      return undefined;
    }
    await hub.setAmbilightStyle(record, String(params.style ?? ''));
    return undefined;
  },
};

// --- keys ----------------------------------------------------------------------

/** The four keys of a `keys` widget, from its settings. */
export function chosenKeys(settings = {}) {
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const value = settings?.[`key_${index + 1}`];
    return KEYS[value] ? value : DEFAULT_KEYS[index];
  });
}

const keys = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    if (content) {
      return content;
    }
    return {
      ttl_seconds: isOn(record) ? 60 : 300,
      components: [
        { type: 'status', items: [tvRow(record, language)] },
        ...chosenKeys(settings).map((key, index) => ({
          type: 'button',
          label: t(KEY_LABELS[key], language),
          icon: KEY_ICONS[key] ?? 'circle',
          style: 'secondary',
          action: { key: KEY_ACTION(index + 1), params: { key } },
        })),
      ],
    };
  },

  async action(hub, { params = {}, settings }) {
    const record = actionRecord(hub, settings);
    await hub.sendKey(record, String(params.key ?? ''));
    return undefined;
  },
};

// --- shortcuts -------------------------------------------------------------------

/**
 * The shortcuts of a widget: the names typed in its settings, resolved to a
 * source (first) or an application of the TV; TV and HDMI 1 to 3 when none
 * is typed.
 * @returns {{ shortcuts: Array<{ kind: string, key: string, name: string }>, missing: string[] }}
 */
export function resolveShortcuts(record, settings = {}) {
  const typed = Array.from({ length: SLOT_COUNT }, (_, index) =>
    typeof settings?.[`shortcut_${index + 1}`] === 'string'
      ? settings[`shortcut_${index + 1}`].trim()
      : '',
  ).filter(Boolean);
  if (typed.length === 0) {
    return {
      shortcuts: DEFAULT_SHORTCUTS.map((key) => SOURCES.find((source) => source.key === key)).map(
        (source) => ({ kind: CONTENT_KINDS.SOURCE, key: source.key, name: source.name }),
      ),
      missing: [],
    };
  }
  const shortcuts = [];
  const missing = [];
  for (const query of typed) {
    const source = findSource(query);
    const app = source ? null : findApp(record.apps, query);
    if (source) {
      shortcuts.push({ kind: CONTENT_KINDS.SOURCE, key: source.key, name: source.name });
    } else if (app) {
      shortcuts.push({ kind: CONTENT_KINDS.APP, key: app.id, name: app.label });
    } else {
      missing.push(query);
    }
  }
  return { shortcuts, missing };
}

function isCurrent(record, shortcut, language) {
  const screen = isOn(record) ? screenOf(record, language) : null;
  if (!screen) {
    return false;
  }
  if (shortcut.kind === CONTENT_KINDS.APP) {
    return screen.kind === CONTENT_KINDS.APP && screen.key === shortcut.key;
  }
  return shortcut.key === 'tv'
    ? screen.kind === CONTENT_KINDS.CHANNEL
    : screen.kind === CONTENT_KINDS.SOURCE && screen.key === shortcut.key;
}

const shortcutsWidget = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    if (content) {
      return content;
    }
    if (record.identity && !record.identity.capabilities?.launch) {
      return message(TEXT.noShortcut, language);
    }
    const { shortcuts, missing } = resolveShortcuts(record, settings);
    const components = [{ type: 'status', items: [tvRow(record, language)] }];
    if (missing.length > 0) {
      components.push({
        type: 'text',
        variant: 'caption',
        text: fit(labelled(t(TEXT.notFound, language), missing.join(', '), language), 80),
      });
    }
    shortcuts.forEach((shortcut, index) => {
      components.push({
        type: 'button',
        label: fit(shortcut.name, 24),
        icon: isCurrent(record, shortcut, language)
          ? ACTIVE_ICON
          : shortcut.kind === CONTENT_KINDS.SOURCE
            ? 'log-in'
            : 'grid',
        style: 'secondary',
        action: {
          key: SHORTCUT_ACTION(index + 1),
          params: { kind: shortcut.kind, key: shortcut.key },
        },
      });
    });
    return { ttl_seconds: isOn(record) ? 30 : 300, components };
  },

  async action(hub, { params = {}, settings }) {
    const record = actionRecord(hub, settings);
    const key = String(params.key ?? '');
    if (params.kind === CONTENT_KINDS.APP) {
      const app = await hub.openApp(record, key);
      return app ? { message: done((text) => text.opened(app.label)) } : undefined;
    }
    const source = await hub.selectSource(record, key);
    return source ? { message: done((text) => text.opened(source.name)) } : undefined;
  },
};

export const WIDGETS = {
  [WIDGET_KEYS.REMOTE]: remote,
  [WIDGET_KEYS.AMBILIGHT]: ambilightWidget,
  [WIDGET_KEYS.KEYS]: keys,
  [WIDGET_KEYS.SHORTCUTS]: shortcutsWidget,
};
