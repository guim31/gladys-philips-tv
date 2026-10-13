// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the reports of the configuration actions, the
// errors of the commands and scene actions, the names of the Ambilight
// styles. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './philips/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noTv: {
    en: 'Enter the address of your TV in the configuration, or run "Search for TVs".',
    fr: "Saisissez l'adresse de votre téléviseur dans la configuration, ou lancez « Rechercher les téléviseurs ».",
    de: 'Gib die Adresse deines Fernsehers in der Konfiguration ein oder starte „Fernseher suchen“.',
    es: 'Introduzca la dirección de su televisor en la configuración o ejecute «Buscar televisores».',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.20',
    fr: 'Adresse incomprise, ex. 192.168.1.20',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20',
    es: 'Dirección no válida, p. ej. 192.168.1.20',
  },
};

// One short explanation per error kind (src/philips/client.js), plus the TV
// never reached since the integration started.
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer (off with its network asleep, or wrong address)',
    fr: 'ne répond pas (éteint avec le réseau en veille, ou mauvaise adresse)',
    de: 'antwortet nicht (aus mit schlafendem Netzwerk, oder falsche Adresse)',
    es: 'no responde (apagado con la red en reposo, o dirección incorrecta)',
  },
  notReached: {
    en: 'not reached yet: turn the TV on once',
    fr: 'pas encore joint : allumez le téléviseur une fois',
    de: 'noch nicht erreicht: Schalte den Fernseher einmal ein',
    es: 'aún no se ha conectado: encienda el televisor una vez',
  },
  duplicate: {
    en: 'the same TV as another slot: empty this one',
    fr: "le même téléviseur qu'un autre emplacement : videz celui-ci",
    de: 'derselbe Fernseher wie in einem anderen Platz: Leere diesen',
    es: 'el mismo televisor que otra posición: vacíe esta',
  },
  [ERROR_KINDS.NOT_PAIRED]: {
    en: 'not paired yet: run "Show a pairing code on the TV"',
    fr: "pas encore appairé : lancez « Afficher un code d'appairage sur le téléviseur »",
    de: 'noch nicht gekoppelt: Starte „Kopplungscode am Fernseher anzeigen“',
    es: 'aún no emparejado: ejecute «Mostrar un código de emparejamiento en el televisor»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'pairing refused by the TV: pair it again',
    fr: 'appairage refusé par le téléviseur : appairez-le à nouveau',
    de: 'Kopplung vom Fernseher abgelehnt: Kopple ihn erneut',
    es: 'emparejamiento rechazado por el televisor: vuelva a emparejarlo',
  },
  [ERROR_KINDS.NOT_PHILIPS]: {
    en: 'no Philips TV API at this address',
    fr: "pas d'API de téléviseur Philips à cette adresse",
    de: 'keine Philips-TV-API unter dieser Adresse',
    es: 'no hay API de televisor Philips en esta dirección',
  },
  [ERROR_KINDS.TOO_OLD]: {
    en: 'TV from before 2016 (JointSpace 1): not supported',
    fr: 'téléviseur antérieur à 2016 (JointSpace 1) : non pris en charge',
    de: 'Fernseher von vor 2016 (JointSpace 1): nicht unterstützt',
    es: 'televisor anterior a 2016 (JointSpace 1): no compatible',
  },
  [ERROR_KINDS.UNSUPPORTED]: {
    en: 'this TV does not offer this function',
    fr: 'ce téléviseur ne propose pas cette fonction',
    de: 'dieser Fernseher bietet diese Funktion nicht',
    es: 'este televisor no ofrece esta función',
  },
  [ERROR_KINDS.PAIRING]: {
    en: 'pairing refused',
    fr: 'appairage refusé',
    de: 'Kopplung abgelehnt',
    es: 'emparejamiento rechazado',
  },
  [ERROR_KINDS.API]: {
    en: 'the TV refused the request, see the logs',
    fr: 'le téléviseur a refusé la demande, voir les logs',
    de: 'der Fernseher hat die Anfrage abgelehnt, sieh in den Protokollen nach',
    es: 'el televisor ha rechazado la solicitud, consulte los registros',
  },
};

// The "Test the connection" report, one line per TV.
export const REPORT_TEXT = {
  en: {
    on: (model) => `OK, ${model}, on`,
    standby: (model) => `OK, ${model}, in standby`,
    asleep: (model) => `${model}, asleep (no answer)`,
    apps: (count) => `${count} app(s)`,
    paired: 'paired',
  },
  fr: {
    on: (model) => `OK, ${model}, allumé`,
    standby: (model) => `OK, ${model}, en veille`,
    asleep: (model) => `${model}, en veille profonde (pas de réponse)`,
    apps: (count) => `${count} application(s)`,
    paired: 'appairé',
  },
  de: {
    on: (model) => `OK, ${model}, eingeschaltet`,
    standby: (model) => `OK, ${model}, im Standby`,
    asleep: (model) => `${model}, im Tiefschlaf (keine Antwort)`,
    apps: (count) => `${count} App(s)`,
    paired: 'gekoppelt',
  },
  es: {
    on: (model) => `OK, ${model}, encendido`,
    standby: (model) => `OK, ${model}, en espera`,
    asleep: (model) => `${model}, en reposo profundo (sin respuesta)`,
    apps: (count) => `${count} aplicación(es)`,
    paired: 'emparejado',
  },
};

// The pairing actions.
export const PAIR_TEXT = {
  en: {
    shown: (slot, seconds) =>
      `A code is shown on the TV: type it in "Confirm the pairing code" for TV ${slot}${seconds ? `, within ${seconds} s` : ''}.`,
    notNeeded: 'This TV needs no pairing: Gladys controls it already.',
    noAddress: (slot) => `Enter the address of TV ${slot} first, then save.`,
    noRequest: (slot) => `Run "Show a pairing code on the TV" for TV ${slot} first.`,
    expired: 'The code has expired: show a new one on the TV.',
    wrongPin: 'Wrong code: check the code on the TV and try again.',
    badPin: 'Type the 4 digits shown on the TV.',
    paired: (name) => `${name} is paired: Gladys can control it.`,
    refused: (reason) => `The TV refused the pairing (${reason}).`,
  },
  fr: {
    shown: (slot, seconds) =>
      `Un code s'affiche sur le téléviseur : saisissez-le dans « Confirmer le code d'appairage » pour le téléviseur ${slot}${seconds ? `, dans les ${seconds} s` : ''}.`,
    notNeeded: "Ce téléviseur n'a pas besoin d'appairage : Gladys le pilote déjà.",
    noAddress: (slot) => `Saisissez d'abord l'adresse du téléviseur ${slot}, puis enregistrez.`,
    noRequest: (slot) =>
      `Lancez d'abord « Afficher un code d'appairage sur le téléviseur » pour le téléviseur ${slot}.`,
    expired: 'Le code a expiré : affichez-en un nouveau sur le téléviseur.',
    wrongPin: 'Code erroné : vérifiez le code affiché sur le téléviseur et réessayez.',
    badPin: 'Saisissez les 4 chiffres affichés sur le téléviseur.',
    paired: (name) => `${name} est appairé : Gladys peut le piloter.`,
    refused: (reason) => `Le téléviseur a refusé l'appairage (${reason}).`,
  },
  de: {
    shown: (slot, seconds) =>
      `Der Fernseher zeigt einen Code: Gib ihn bei „Kopplungscode bestätigen“ für Fernseher ${slot} ein${seconds ? `, innerhalb von ${seconds} s` : ''}.`,
    notNeeded: 'Dieser Fernseher braucht keine Kopplung: Gladys steuert ihn bereits.',
    noAddress: (slot) => `Gib zuerst die Adresse von Fernseher ${slot} ein und speichere.`,
    noRequest: (slot) =>
      `Starte zuerst „Kopplungscode am Fernseher anzeigen“ für Fernseher ${slot}.`,
    expired: 'Der Code ist abgelaufen: Lass am Fernseher einen neuen anzeigen.',
    wrongPin: 'Falscher Code: Prüfe den Code am Fernseher und versuche es erneut.',
    badPin: 'Gib die 4 am Fernseher angezeigten Ziffern ein.',
    paired: (name) => `${name} ist gekoppelt: Gladys kann ihn steuern.`,
    refused: (reason) => `Der Fernseher hat die Kopplung abgelehnt (${reason}).`,
  },
  es: {
    shown: (slot, seconds) =>
      `El televisor muestra un código: introdúzcalo en «Confirmar el código de emparejamiento» para el televisor ${slot}${seconds ? `, en menos de ${seconds} s` : ''}.`,
    notNeeded: 'Este televisor no necesita emparejamiento: Gladys ya lo controla.',
    noAddress: (slot) => `Introduzca primero la dirección del televisor ${slot} y guarde.`,
    noRequest: (slot) =>
      `Ejecute primero «Mostrar un código de emparejamiento en el televisor» para el televisor ${slot}.`,
    expired: 'El código ha caducado: muestre uno nuevo en el televisor.',
    wrongPin: 'Código incorrecto: compruebe el código del televisor y vuelva a intentarlo.',
    badPin: 'Introduzca las 4 cifras que muestra el televisor.',
    paired: (name) => `${name} está emparejado: Gladys puede controlarlo.`,
    refused: (reason) => `El televisor ha rechazado el emparejamiento (${reason}).`,
  },
};

// The "Search for TVs" action and the Discovery tab.
export const SEARCH_TEXT = {
  en: {
    none: 'No Philips TV answered on the network (TVs asleep do not answer: turn them on).',
    unavailable: 'Network search unavailable on this Gladys: type the address of the TV.',
    added: (name, host, slot) => `${name} (${host}) added as TV ${slot}`,
    moved: (name, host, slot) => `${name}: new address ${host} for TV ${slot}`,
    known: (name, slot) => `${name}: already TV ${slot}`,
    full: (name, host) => `${name} (${host}): no free slot, empty one first`,
    pair: 'then pair the Android TVs with "Show a pairing code on the TV".',
  },
  fr: {
    none: "Aucun téléviseur Philips n'a répondu sur le réseau (un téléviseur en veille profonde ne répond pas : allumez-le).",
    unavailable: "Recherche réseau indisponible sur ce Gladys : saisissez l'adresse du téléviseur.",
    added: (name, host, slot) => `${name} (${host}) ajouté comme téléviseur ${slot}`,
    moved: (name, host, slot) => `${name} : nouvelle adresse ${host} pour le téléviseur ${slot}`,
    known: (name, slot) => `${name} : déjà téléviseur ${slot}`,
    full: (name, host) => `${name} (${host}) : aucun emplacement libre, videz-en un d'abord`,
    pair: "puis appairez les téléviseurs Android avec « Afficher un code d'appairage sur le téléviseur ».",
  },
  de: {
    none: 'Kein Philips-Fernseher hat im Netzwerk geantwortet (schlafende Fernseher antworten nicht: Schalte sie ein).',
    unavailable:
      'Netzwerksuche auf diesem Gladys nicht verfügbar: Gib die Adresse des Fernsehers ein.',
    added: (name, host, slot) => `${name} (${host}) als Fernseher ${slot} hinzugefügt`,
    moved: (name, host, slot) => `${name}: neue Adresse ${host} für Fernseher ${slot}`,
    known: (name, slot) => `${name}: bereits Fernseher ${slot}`,
    full: (name, host) => `${name} (${host}): kein freier Platz, leere zuerst einen`,
    pair: 'kopple dann die Android-Fernseher mit „Kopplungscode am Fernseher anzeigen“.',
  },
  es: {
    none: 'Ningún televisor Philips ha respondido en la red (un televisor en reposo profundo no responde: enciéndalo).',
    unavailable:
      'Búsqueda en red no disponible en este Gladys: introduzca la dirección del televisor.',
    added: (name, host, slot) => `${name} (${host}) añadido como televisor ${slot}`,
    moved: (name, host, slot) => `${name}: nueva dirección ${host} para el televisor ${slot}`,
    known: (name, slot) => `${name}: ya es el televisor ${slot}`,
    full: (name, host) => `${name} (${host}): no hay ninguna posición libre, vacíe una primero`,
    pair: 'después empareje los televisores Android con «Mostrar un código de emparejamiento en el televisor».',
  },
};

// Errors of the commands, scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  en: {
    noTv: 'No TV is configured.',
    unknownTv: 'This TV is no longer in the configuration.',
    chooseTv: 'Several TVs are configured: choose one.',
    unknownApp: (name) => `No app "${name}" on this TV.`,
    unknownSource: (name) => `No source "${name}": TV, HDMI 1, HDMI 2, HDMI 3 or HDMI 4.`,
    unknownChannel: (number) => `No channel ${number} on this TV.`,
    unknownKey: (key) => `Unknown key "${key}".`,
    unknownStyle: (style) => `This TV has no Ambilight style "${style}".`,
    badColor: (value) => `Colour not understood: "${value}" (e.g. #FF8800).`,
    noAmbilight: 'This TV has no Ambilight.',
    noApps: 'This TV does not open apps nor sources through its API (not an Android TV).',
    notOn:
      'The TV did not turn on: on the TV, enable "Switch on with Wi-Fi (WoWLAN)" or "Switch on with Chromecast".',
    noWake: 'The TV does not answer, and its MAC address is unknown for Wake-on-LAN.',
    wakeRefused: 'Gladys refused to send the Wake-on-LAN packet: see the Gladys logs.',
  },
  fr: {
    noTv: "Aucun téléviseur n'est configuré.",
    unknownTv: "Ce téléviseur n'est plus dans la configuration.",
    chooseTv: 'Plusieurs téléviseurs sont configurés : choisissez-en un.',
    unknownApp: (name) => `Aucune application « ${name} » sur ce téléviseur.`,
    unknownSource: (name) => `Aucune source « ${name} » : TV, HDMI 1, HDMI 2, HDMI 3 ou HDMI 4.`,
    unknownChannel: (number) => `Aucune chaîne ${number} sur ce téléviseur.`,
    unknownKey: (key) => `Touche inconnue « ${key} ».`,
    unknownStyle: (style) => `Ce téléviseur n'a pas de style Ambilight « ${style} ».`,
    badColor: (value) => `Couleur incomprise : « ${value} » (ex. #FF8800).`,
    noAmbilight: "Ce téléviseur n'a pas d'Ambilight.",
    noApps:
      "Ce téléviseur n'ouvre ni applications ni sources par son API (ce n'est pas un téléviseur Android).",
    notOn:
      "Le téléviseur ne s'est pas allumé : activez sur le téléviseur « Allumer avec le Wi-Fi (WoWLAN) » ou « Allumer avec Chromecast ».",
    noWake: 'Le téléviseur ne répond pas, et son adresse MAC est inconnue pour le Wake-on-LAN.',
    wakeRefused: "Gladys a refusé d'envoyer le paquet Wake-on-LAN : voir les logs de Gladys.",
  },
  de: {
    noTv: 'Kein Fernseher ist konfiguriert.',
    unknownTv: 'Dieser Fernseher ist nicht mehr in der Konfiguration.',
    chooseTv: 'Mehrere Fernseher sind konfiguriert: Wähle einen aus.',
    unknownApp: (name) => `Keine App „${name}“ auf diesem Fernseher.`,
    unknownSource: (name) => `Keine Quelle „${name}“: TV, HDMI 1, HDMI 2, HDMI 3 oder HDMI 4.`,
    unknownChannel: (number) => `Kein Kanal ${number} auf diesem Fernseher.`,
    unknownKey: (key) => `Unbekannte Taste „${key}“.`,
    unknownStyle: (style) => `Dieser Fernseher hat keinen Ambilight-Stil „${style}“.`,
    badColor: (value) => `Farbe nicht verstanden: „${value}“ (z. B. #FF8800).`,
    noAmbilight: 'Dieser Fernseher hat kein Ambilight.',
    noApps:
      'Dieser Fernseher öffnet über seine API weder Apps noch Quellen (kein Android-Fernseher).',
    notOn:
      'Der Fernseher hat sich nicht eingeschaltet: Aktiviere am Fernseher „Mit WLAN einschalten (WoWLAN)“ oder „Mit Chromecast einschalten“.',
    noWake: 'Der Fernseher antwortet nicht, und seine MAC-Adresse ist für Wake-on-LAN unbekannt.',
    wakeRefused:
      'Gladys hat das Senden des Wake-on-LAN-Pakets abgelehnt: Sieh in den Gladys-Protokollen nach.',
  },
  es: {
    noTv: 'No hay ningún televisor configurado.',
    unknownTv: 'Este televisor ya no está en la configuración.',
    chooseTv: 'Hay varios televisores configurados: elija uno.',
    unknownApp: (name) => `No hay ninguna aplicación «${name}» en este televisor.`,
    unknownSource: (name) =>
      `No hay ninguna fuente «${name}»: TV, HDMI 1, HDMI 2, HDMI 3 o HDMI 4.`,
    unknownChannel: (number) => `No hay ningún canal ${number} en este televisor.`,
    unknownKey: (key) => `Tecla desconocida «${key}».`,
    unknownStyle: (style) => `Este televisor no tiene ningún estilo Ambilight «${style}».`,
    badColor: (value) => `Color no válido: «${value}» (p. ej. #FF8800).`,
    noAmbilight: 'Este televisor no tiene Ambilight.',
    noApps:
      'Este televisor no abre aplicaciones ni fuentes a través de su API (no es un televisor Android).',
    notOn:
      'El televisor no se ha encendido: active en el televisor «Encender con Wi-Fi (WoWLAN)» o «Encender con Chromecast».',
    noWake: 'El televisor no responde y su dirección MAC es desconocida para Wake-on-LAN.',
    wakeRefused:
      'Gladys se ha negado a enviar el paquete Wake-on-LAN: consulte los registros de Gladys.',
  },
};

// --- Ambilight styles -------------------------------------------------------------------

export const STYLE_FAMILY_TEXT = {
  video: { en: 'Follow video', fr: 'Suivre la vidéo', de: 'Video folgen', es: 'Seguir el vídeo' },
  audio: { en: 'Follow audio', fr: "Suivre l'audio", de: 'Audio folgen', es: 'Seguir el audio' },
  lounge: { en: 'Lounge light', fr: 'Lounge light', de: 'Lounge Light', es: 'Lounge light' },
};

// The menu settings of the styles, as the Philips menus name them (the
// "Follow audio" ones are product names: Lumina, Colora, Retro…).
export const STYLE_SETTING_TEXT = {
  STANDARD: { en: 'Standard', fr: 'Standard', de: 'Standard', es: 'Estándar' },
  NATURAL: { en: 'Natural', fr: 'Naturel', de: 'Natürlich', es: 'Natural' },
  VIVID: { en: 'Vivid', fr: 'Éclatant', de: 'Lebhaft', es: 'Intenso' },
  IMMERSIVE: { en: 'Immersive', fr: 'Immersif', de: 'Immersiv', es: 'Inmersivo' },
  GAME: { en: 'Game', fr: 'Jeu', de: 'Spiel', es: 'Juego' },
  COMFORT: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  RELAX: { en: 'Relax', fr: 'Détente', de: 'Entspannung', es: 'Relax' },
  CINEMA: { en: 'Cinema', fr: 'Cinéma', de: 'Kino', es: 'Cine' },
  SPORTS: { en: 'Sports', fr: 'Sport', de: 'Sport', es: 'Deportes' },
  ENERGY_ADAPTIVE_BRIGHTNESS: {
    en: 'Lumina',
    fr: 'Lumina',
    de: 'Lumina',
    es: 'Lumina',
  },
  ENERGY_ADAPTIVE_COLORS: { en: 'Colora', fr: 'Colora', de: 'Colora', es: 'Colora' },
  VU_METER: { en: 'Retro', fr: 'Retro', de: 'Retro', es: 'Retro' },
  SPECTRUM_ANALYZER: { en: 'Spectrum', fr: 'Spectrum', de: 'Spectrum', es: 'Spectrum' },
  KNIGHT_RIDER_CLOCKWISE: { en: 'Scanner', fr: 'Scanner', de: 'Scanner', es: 'Scanner' },
  KNIGHT_RIDER_ALTERNATING: { en: 'Rhythm', fr: 'Rhythm', de: 'Rhythm', es: 'Rhythm' },
  RANDOM_PIXEL_FLASH: { en: 'Flash', fr: 'Flash', de: 'Flash', es: 'Flash' },
  STROBO: { en: 'Strobe', fr: 'Stroboscope', de: 'Stroboskop', es: 'Estroboscopio' },
  STROBE: { en: 'Strobe', fr: 'Stroboscope', de: 'Stroboskop', es: 'Estroboscopio' },
  PARTY: { en: 'Party', fr: 'Party', de: 'Party', es: 'Party' },
  MODE_RANDOM: { en: 'Random', fr: 'Aléatoire', de: 'Zufall', es: 'Aleatorio' },
  HOT_LAVA: { en: 'Hot lava', fr: 'Lave en fusion', de: 'Heiße Lava', es: 'Lava ardiente' },
  DEEP_WATER: { en: 'Deep water', fr: 'Eau profonde', de: 'Tiefes Wasser', es: 'Agua profunda' },
  FRESH_NATURE: {
    en: 'Fresh nature',
    fr: 'Nature fraîche',
    de: 'Frische Natur',
    es: 'Naturaleza fresca',
  },
  ISF: { en: 'Warm white', fr: 'Blanc chaud', de: 'Warmweiß', es: 'Blanco cálido' },
  ISF_BLUE: { en: 'ISF blue', fr: 'Bleu ISF', de: 'ISF-Blau', es: 'Azul ISF' },
  PTA_LOUNGE: { en: 'Cool white', fr: 'Blanc froid', de: 'Kaltweiß', es: 'Blanco frío' },
};

/** "SOME_SETTING" → "Some setting", for a setting not in the table. */
const humanize = (value) => {
  const words = String(value).toLowerCase().replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The label of a style: "Follow video · Standard". */
export function styleLabel(style, language) {
  const family = pick(STYLE_FAMILY_TEXT[style.family], language);
  const setting = STYLE_SETTING_TEXT[style.menuSetting];
  return `${family} · ${setting ? pick(setting, language) : humanize(style.menuSetting)}`;
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export function pick(text, language) {
  return text[language] ?? text[LANGUAGE_FALLBACK];
}

/** An Error whose message is in the configured language (Gladys shows it). */
export function failure(language, key, ...args) {
  const table = pick(ACTION_TEXT, language);
  const entry = table[key];
  const error = new Error(typeof entry === 'function' ? entry(...args) : entry);
  error.userFacing = true;
  return error;
}

/** The same message in the four languages (configuration actions answer that). */
export function everyLanguage(table, render) {
  return Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text)]),
  );
}
