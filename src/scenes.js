// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// The features already cover "turn on", "set the volume", "choose a source in
// the list". These actions take what a scene author types or picks instead:
// an application or a source by name ("Netflix", "HDMI 2"), an Ambilight
// style (or off, or a fixed colour), and any key of the remote. They turn the
// TV on first when needed, and return what they did for the next actions of
// the scene. Gladys applies the field defaults to scene actions.
// -----------------------------------------------------------------------------

import { stylesOf } from './devices.js';
import { COLOR_STYLE } from './philips/model.js';
import { failure, styleLabel } from './texts.js';

// The styles a scene can ask for (manifest `ambilight_style` options):
// permanent once published. A TV that lacks one answers with an error.
export const SCENE_STYLES = Object.freeze([
  'video_standard',
  'video_natural',
  'video_vivid',
  'video_immersive',
  'video_game',
  'video_comfort',
  'video_cinema',
  'video_sports',
  'audio_energy_adaptive_brightness',
  'audio_energy_adaptive_colors',
  'audio_vu_meter',
  'audio_spectrum_analyzer',
  'audio_knight_rider_clockwise',
  'audio_knight_rider_alternating',
  'audio_random_pixel_flash',
  'audio_party',
  'lounge_hot_lava',
  'lounge_deep_water',
  'lounge_fresh_nature',
  'lounge_isf',
  'lounge_pta_lounge',
  COLOR_STYLE,
  'off',
]);

/** "#FF8800", "ff8800", "FF8800" → 0xff8800; null when not a colour. */
export function parseColor(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(text) ? Number.parseInt(text, 16) : null;
}

export const SCENE_ACTIONS = {
  async open_app(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const app = await hub.openApp(record, String(fields.app ?? ''));
    return { app: app ? app.label : '' };
  },

  async select_source(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const source = await hub.selectSource(record, String(fields.source ?? ''));
    return { source: source ? source.name : '' };
  },

  async ambilight_style(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const style = String(fields.style ?? '');
    if (style === 'off') {
      await hub.setAmbilight(record, false);
      return { style: 'off' };
    }
    if (style === COLOR_STYLE) {
      const typed = fields.color === undefined || fields.color === null ? '' : String(fields.color);
      const color =
        typed.trim() === '' ? (record.snapshot.ambilight?.color ?? 0xffffff) : parseColor(typed);
      if (color === null) {
        throw failure(hub.language, 'badColor', typed.slice(0, 20));
      }
      await hub.setAmbilightColor(record, color);
      return { style: COLOR_STYLE };
    }
    const applied = await hub.setAmbilightStyle(record, style);
    const known = stylesOf(record).find((item) => item.key === applied.key);
    return { style: known ? styleLabel(known, hub.language) : applied.key };
  },

  async send_key(hub, { fields = {} }) {
    const record = hub.target(fields.device || null);
    const presses = await hub.sendKey(record, String(fields.key ?? ''), fields.repeat ?? 1);
    return { presses };
  },
};
