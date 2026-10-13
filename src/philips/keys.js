// -----------------------------------------------------------------------------
// Remote control keys (POST /input/key { key }): our stable keys (manifest
// `send_key` action and `keys` widget, permanent once published), the
// JointSpace key names, the labels in the four languages and the icons of the
// widget buttons. The JointSpace names come from the pylips documentation
// (MIT) and ha-philipsjs.
// -----------------------------------------------------------------------------

export const KEYS = Object.freeze({
  home: 'Home',
  back: 'Back',
  up: 'CursorUp',
  down: 'CursorDown',
  left: 'CursorLeft',
  right: 'CursorRight',
  confirm: 'Confirm',
  options: 'Options',
  source: 'Source',
  info: 'Info',
  adjust: 'Adjust',
  watch_tv: 'WatchTV',
  volume_up: 'VolumeUp',
  volume_down: 'VolumeDown',
  mute: 'Mute',
  channel_up: 'ChannelStepUp',
  channel_down: 'ChannelStepDown',
  play_pause: 'PlayPause',
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  rewind: 'Rewind',
  fast_forward: 'FastForward',
  previous: 'Previous',
  next: 'Next',
  record: 'Record',
  ambilight: 'AmbilightOnOff',
  subtitle: 'Subtitle',
  teletext: 'Teletext',
  red: 'RedColour',
  green: 'GreenColour',
  yellow: 'YellowColour',
  blue: 'BlueColour',
  num_0: 'Digit0',
  num_1: 'Digit1',
  num_2: 'Digit2',
  num_3: 'Digit3',
  num_4: 'Digit4',
  num_5: 'Digit5',
  num_6: 'Digit6',
  num_7: 'Digit7',
  num_8: 'Digit8',
  num_9: 'Digit9',
});

// The keys that change what is on screen (their effect is Gladys' own).
export const CONTENT_KEYS = new Set([
  'home',
  'back',
  'confirm',
  'source',
  'watch_tv',
  'channel_up',
  'channel_down',
]);

const same = (label) => ({ en: label, fr: label, de: label, es: label });

export const KEY_LABELS = Object.freeze({
  home: { en: 'Home', fr: 'Accueil', de: 'Home', es: 'Inicio' },
  back: { en: 'Back', fr: 'Retour', de: 'Zurück', es: 'Volver' },
  up: { en: 'Up', fr: 'Haut', de: 'Hoch', es: 'Arriba' },
  down: { en: 'Down', fr: 'Bas', de: 'Runter', es: 'Abajo' },
  left: { en: 'Left', fr: 'Gauche', de: 'Links', es: 'Izquierda' },
  right: { en: 'Right', fr: 'Droite', de: 'Rechts', es: 'Derecha' },
  confirm: same('OK'),
  options: { en: 'Options', fr: 'Options', de: 'Optionen', es: 'Opciones' },
  source: { en: 'Sources', fr: 'Sources', de: 'Quellen', es: 'Fuentes' },
  info: same('Info'),
  adjust: {
    en: 'Quick settings',
    fr: 'Réglages rapides',
    de: 'Schnelleinstellungen',
    es: 'Ajustes rápidos',
  },
  watch_tv: { en: 'Watch TV', fr: 'Regarder la TV', de: 'Fernsehen', es: 'Ver la TV' },
  volume_up: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  volume_down: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  mute: { en: 'Mute', fr: 'Muet', de: 'Stumm', es: 'Silenciar' },
  channel_up: { en: 'Channel +', fr: 'Chaîne +', de: 'Kanal +', es: 'Canal +' },
  channel_down: { en: 'Channel −', fr: 'Chaîne −', de: 'Kanal −', es: 'Canal −' },
  play_pause: {
    en: 'Play / pause',
    fr: 'Lecture / pause',
    de: 'Abspielen / Pause',
    es: 'Reproducir / pausa',
  },
  play: { en: 'Play', fr: 'Lecture', de: 'Abspielen', es: 'Reproducir' },
  pause: same('Pause'),
  stop: { en: 'Stop', fr: 'Stop', de: 'Stopp', es: 'Detener' },
  rewind: { en: 'Rewind', fr: 'Retour rapide', de: 'Zurückspulen', es: 'Retroceder' },
  fast_forward: {
    en: 'Fast forward',
    fr: 'Avance rapide',
    de: 'Vorspulen',
    es: 'Avance rápido',
  },
  previous: { en: 'Previous', fr: 'Précédent', de: 'Vorheriger', es: 'Anterior' },
  next: { en: 'Next', fr: 'Suivant', de: 'Weiter', es: 'Siguiente' },
  record: { en: 'Record', fr: 'Enregistrer', de: 'Aufnehmen', es: 'Grabar' },
  ambilight: same('Ambilight'),
  subtitle: { en: 'Subtitles', fr: 'Sous-titres', de: 'Untertitel', es: 'Subtítulos' },
  teletext: { en: 'Teletext', fr: 'Télétexte', de: 'Videotext', es: 'Teletexto' },
  red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
  green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  blue: { en: 'Blue', fr: 'Bleu', de: 'Blau', es: 'Azul' },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [`num_${digit}`, same(String(digit))]),
  ),
});

export const KEY_ICONS = Object.freeze({
  home: 'home',
  back: 'corner-up-left',
  up: 'chevron-up',
  down: 'chevron-down',
  left: 'chevron-left',
  right: 'chevron-right',
  confirm: 'check',
  options: 'more-horizontal',
  source: 'log-in',
  info: 'info',
  adjust: 'sliders',
  watch_tv: 'tv',
  volume_up: 'volume-2',
  volume_down: 'volume-1',
  mute: 'volume-x',
  channel_up: 'chevrons-up',
  channel_down: 'chevrons-down',
  play_pause: 'play-circle',
  play: 'play',
  pause: 'pause',
  stop: 'square',
  rewind: 'rewind',
  fast_forward: 'fast-forward',
  previous: 'skip-back',
  next: 'skip-forward',
  record: 'circle',
  ambilight: 'sun',
  subtitle: 'message-square',
  teletext: 'file-text',
  red: 'circle',
  green: 'circle',
  yellow: 'circle',
  blue: 'circle',
});

/**
 * The JointSpace name of a key. Android TVs ignore PlayPause: Confirm plays
 * and pauses there (ha-philipsjs `quirk_playpause_spacebar`).
 */
export function keyName(key, { android = false } = {}) {
  if (key === 'play_pause' && android) {
    return 'Confirm';
  }
  return KEYS[key] ?? null;
}
