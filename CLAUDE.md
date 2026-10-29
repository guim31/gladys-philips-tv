# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/hub.test.js              # one file
node --test --test-name-pattern "pairing" # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: registerHandlers, shutdown, connect()
src/app.js                        every SDK handler, wired to the hub (the tests use it too)
src/hub.js                        PhilipsHub: one record per TV, poll timer, states, scene event,
                                  commands, pairing, SSDP search
src/devices.js                    the device of a TV: features by capability, names, options, states
src/philips/client.js             JointSpace 6 client: /system on 1925 and 1926, Digest, pairing
src/philips/digest.js             HTTP Digest (client side, and the check of the fake TV)
src/philips/crypto.js             the shared key: HMAC signature of the pairing, AES of /system
src/philips/http.js               the only network code (node:http / node:https), a test seam
src/philips/model.js              parsers of the answers, sources, Ambilight styles, colours, names
src/philips/keys.js               remote keys: our stable keys, JointSpace names, labels, icons
src/scenes.js                     scene action handlers (manifest `scene_actions`)
src/widgets.js                    dashboard widgets: remote, ambilight, keys, shortcuts
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/store.js                      /data/philips-state.json: credentials, identity and lists of each TV
src/texts.js                      messages in four languages (status, errors, reports, styles)
gladys-assistant-integration.json manifest: name, config_schema, actions, scenes, widgets...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys, same sections
test/fixtures/philips/            real answers kept by ha-philipsjs (MIT)
test/helpers/fakePhilips.js       in-memory TV (Android: Digest + pairing; Saphi), also served over HTTP(S)
test/helpers/philipsServer.js     the fake TV on a real port (Docker checks)
test/                             node --test, against the SDK's fake Gladys (integration-sdk/testing)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en": ..., "fr": ... }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text** exists in four languages (English, French, German with
  "du", Spanish with "usted"): action messages, manifest texts, widget
  contents, feature names, and `docs/{en,fr,de,es}.md` with the same sections.
  `test/i18n.test.js` checks them.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

---

# Notes du mainteneur (guim31)

Ce qui suit complète les règles du template ci-dessus. Ce sont des faits vérifiés dans le code du
cœur Gladys ou payés sur les intégrations déjà publiées par guim31. Ils ne se lisent pas dans le
code de ce dépôt. Compléter ce fichier quand un nouveau piège est découvert.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test`. Prettier contrôle **aussi le Markdown** : lancer `npm run format` après avoir
  modifié ce fichier, le README ou la documentation, sinon la CI tombe.
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel se fait ailleurs.
  Le dire, plutôt que de conclure que « ça marche ».
- **Tout le code de démonstration du template disparaît** : station météo, prise, lampe, caméra,
  capteur de mouvement, `src/weather.js`, leurs tests, leurs entrées du manifeste et de la
  documentation. Il ne reste que ce que l'intégration fait vraiment.
- **Publier n'est jamais le travail d'une session de code** : ni Release, ni tag, ni topic, ni
  version modifiée à la main. L'orchestrateur s'en charge une fois la PR fusionnée. Les workflows
  sont ceux du template : ne pas les modifier.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe, **en millisecondes** (1000, 2000, 10000,
  15000, 30000, 60000). Le template publie `poll_frequency: 300` sans `should_poll` : c'est faux,
  le cœur répond 400 à la découverte. Pour une cadence hors liste, publier `should_poll: false` et
  pousser les états depuis le conteneur, en gardant un `onPoll` de repli.
- **Polling du cœur 5.2.0 (GladysAssistant/Gladys#3198, correctif #3199)** : un appareil **déjà
  créé** sans `should_poll` n'est jamais sondé, même après le correctif. Ne jamais dépendre du
  seul `onPoll` : ici les téléviseurs sont lus par le minuteur interne du hub (`pollTimer`,
  `poll_interval`), `should_poll: false`, et `onPoll` reste un repli. `test/logs.test.js` le
  prouve sans aucun appel à `onPoll`.
- **Logs** : au niveau info, seulement le cycle de vie (démarrage, perte et retour d'un
  téléviseur, appairage, Wake-on-LAN, erreurs utiles). Rien par lecture ni par état publié. Une
  erreur qui se répète à chaque lecture passe par `hub.problem(key, …)` (un avertissement au
  premier échec, le reste en debug) et `hub.recovered(key)` (une ligne au rétablissement).
  `test/logs.test.js` capture le logger injecté (`createWorld({ logger: captureLogger() })`).
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- Un état publié sur une fonctionnalité **pas encore ajoutée** dans Gladys reçoit un 200 puis est
  jeté (simple ligne de log) : republier les états dans `onDeviceCreated`.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- **Détecteur d'ouverture (`opening-sensor`) : 0 = ouvert, 1 = fermé** (`OPENING_SENSOR_STATE`), à
  l'inverse de l'intuition et des autres détecteurs (mouvement, fuite, fumée : 1 = détecté). Une
  porte ouverte publiée à 1 s'affiche « Fermé » et fausse scènes et historique. Le figer par un test.
- **Un `external_id` de fonctionnalité ne change jamais d'appareil** d'une version à l'autre. UniFi
  1.5.2 avait sorti les ports PoE dans un appareil dédié, la 1.6.0 les a remis dans la passerelle avec
  les mêmes identifiants : ceux qui avaient ajouté l'appareil dédié ne peuvent plus « Mettre à jour » la
  passerelle (409 `external_id must be unique`). Pour regrouper, garder l'appareil existant
  (`gladys.getDevices()`) ou changer d'identifiant.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié.
- **Aucune commande d'appareil ne permet un choix multiple** : un `text/select` n'a qu'un choix
  actif.
- Un changement de structure fait proposer « Mettre à jour » dans l'onglet Découverte
  (`structure_changed`). Un changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language` si des textes partent du
  conteneur. Le superviseur injecte `TZ`, le fuseau de Gladys. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus **sans `step`** : le navigateur n'accepte alors que `min + k`.
  Min et défaut **entiers** seulement ; une valeur décimale passe par un `select` ou par un
  `string` parsé (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir, et une action
  n'applique **aucun `default`** tout en exigeant les champs `required` (422). Issues
  GladysAssistant/Gladys#3154 et #3155.

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- **Cibler la dernière version publiée du cœur, pas `master`** : la spec de `master` décrit des
  fonctions non publiées. Les boutons de widget qui ouvrent un formulaire (#3168, commit 3feb2cf8)
  sont absents de la 5.1.4 mais **livrés dans la 5.2.0** (sortie le 12/10/2026) : `gladys_version`
  `>=5.2.0` si on s'en sert, ou un bouton direct en repli. Vérifier par `git tag --contains`.

- Un réglage de widget ne propose en liste que les **appareils** de l'intégration
  (`source: "devices"`, seule source dynamique).
- Budget du cœur : **8 composants par widget, dont 2 textes au plus**, appliqué **avant** la
  résolution des références ; un contenu amputé reste en cache jusqu'au TTL. Appeler
  `requestWidgetRefresh` à la création d'un appareil. `validateWidgetContent` est exporté pour les
  tests, mais ne vérifie pas que les `external_id` liés existent : les croiser avec `buildDevice`.
- Une ligne de `status` exige un `value` (nombre ou texte ≤ 40).
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées.
- Le vocabulaire des widgets n'a ni liste ni curseur, **par choix** du cœur. Seul un bouton
  `device_feature` numérique a un état actif natif.
- **En mode sombre, le style `primary` d'un bouton de widget ne se voit pas** (#3153) : signaler
  un choix courant par l'icône (`check-circle`), jamais par le style.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s. Un toast d'action est tronqué à 200 caractères.
- Le cœur met le contenu d'un widget en cache par (réglages, langue, unités) : pré-localiser
  d'après `language` est correct.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil reste le travail d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- `gladys_version` `>=5.1.0` dès qu'il y a widgets, déclencheurs ou actions de scène.

## Store

- Validateur officiel, depuis la racine : `npx -y github:GladysAssistant/integration-store .`
  (schéma, `description` **100 caractères au plus par langue**, documentation de 300 caractères
  au moins, image Docker, cover de **150 Ko au plus**). Il demande Node ≥ 24 mais tourne sous
  Node 22 avec un avertissement.
- L'indexeur lit le manifeste de la **dernière release**, pas celui de `main` : une correction du
  manifeste (catégorie, description…) n'atteint le store qu'avec une release.
- L'indexeur rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  `https://integration-store-storage.gladysassistant.com/index.json`.
- **Image de base** : `FROM mirror.gcr.io/library/node:…` (miroir Docker Hub de Google, même
  empreinte, sans compte) et non `node:…` de Docker Hub ni `public.ecr.aws/docker/library/node:…`
  d'ECR Public : tous deux refusent en 429 les pulls anonymes des runners GitHub dès qu'il y a
  plusieurs builds à la fois (ECR depuis fin octobre 2026). Un échec 429 dans le job « Docker build »
  n'est pas un bug du code. Même parade dans `.github/workflows/build.yml` (posée par
  l'orchestrateur, ne pas la retirer) : QEMU et BuildKit tirés de `mirror.gcr.io`.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi.

### Langues (depuis le 11/10/2026)

Tout texte montré à l'utilisateur existe en **`en`, `fr`, `de` et `es`** : manifeste, contenu des widgets, messages,
noms de fonctionnalités. L'allemand **tutoie** (« du »), l'espagnol **vouvoie** (« usted ») : décision de Guilhem,
appliquée à ses 21 intégrations. `test/i18n.test.js` doit échouer sur une langue manquante, un texte vide ou trop
long, et sur un « Sie »/« Ihr… » de politesse en allemand. Le store exige `docs/en.md` et `docs/fr.md`
(`DOCS_LANGUAGES`) et publie aussi `docs/de.md` et `docs/es.md` quand ils existent
(`DOCS_OPTIONAL_LANGUAGES` d'integration-store) : écrire les quatre, avec les mêmes sections.

## Choix par défaut de Guilhem (12/10/2026)

- Langue par défaut des noms de fonctionnalités et des textes produits par le conteneur : **`fr`**.
- Fichier `LICENSE` Apache-2.0 (texte complet) à la racine.
- `transports` : `local` seul quand le cloud n'est qu'une option annexe.
- Docs `en`, `fr`, `de`, `es` avec les mêmes sections.
- Chauffe, ouverture, sécurité : ne rien rendre pilotable « comme un thermostat » ou par un assistant
  vocal quand une erreur serait dangereuse (leçon d'OctoPrint).

## Philips TV (propre à cette intégration)

**API JointSpace 6** (ha-philipsjs, MIT, et l'intégration HA `philips_js` pour l'usage ; pylips,
MIT, pour la doc communautaire des points d'accès) :

- `GET /6/system` répond **sans authentification**, en HTTP sur 1925 et/ou en HTTPS sur 1926 :
  on essaie les deux. `featuring.systemfeatures.secured_transport` (`"true"`, chaîne) et
  `pairing_type: "digest_auth_pairing"` disent « Android, HTTPS 1926, Digest » ; sinon Saphi,
  HTTP 1925, rien. `featuring.jsonfeatures` dit ce que le téléviseur sait faire : `applications`,
  `activities: ["intent"]` (lancement d'applis et de sources), `ambilight: ["Ambilight", "Hue"…]`.
  Les fonctionnalités de l'appareil en dépendent (`featuresOf`) : un Saphi n'a ni source ni appli.
- Les champs `*_encrypted` de `/system` (numéro de série, modèle…) sont en AES-128-CBC (IV en tête,
  base64) avec les 16 premiers octets de la **clé partagée** de tous les clients JointSpace (publique,
  dans l'appli Philips, ha-philipsjs, pylips) : ce n'est pas un secret. Le modèle Saphi vaut
  `1_50PUS6804/12` : on retire le préfixe `\d+_`. Identité = `sn-<numéro de série>` (minuscules,
  alphanumérique), sinon `id-<deviceid>`.
- **Appairage** : `POST pair/request` (sans authentification) `{ access: { scope, featuring },
device: { id, app_id, app_name, device_name, device_os, type } }` → `{ error_id: "SUCCESS",
auth_key, timestamp, timeout }`, le code s'affiche. Puis `POST pair/grant` en **Digest** (user =
  notre `device.id` aléatoire, mot de passe = `auth_key`) avec `auth_signature` =
  base64(HMAC-SHA1(clé partagée, timestamp + PIN)) — vecteur de test : 1128 + `0667` →
  `rdPzC+bdWQHQMcwe3X+LddeG/tA=`. `INVALID_PIN` : mauvais code, l'appairage en cours reste valable.
  Les identifiants (device id, clé) sont ceux du Digest de toutes les requêtes suivantes ; ils vivent
  dans `/data/philips-state.json` (mode 0600), par identité du téléviseur, jamais dans la config.
- Un champ `required: true` dans une action de configuration est évité (le code PIN est
  `required: false` et validé par le code) : même règle que les autres intégrations.
- Digest (MD5, `qop="auth"`, comme le `CachedDigestAuth` de ha-philipsjs ; le realm du faux
  téléviseur est inventé) : le défi est gardé et réutilisé (`nc` croissant) ; un nonce périmé répond
  401 avec un nouveau défi, on renvoie une fois.
- `powerstate` vaut `On`, `Standby` ou `StandbyKeep` (veille avec réseau). Beaucoup de téléviseurs
  coupent le réseau en veille : plus de réponse du tout → « éteint », transport `unreachable`,
  allumage par `gladys.wakeOnLan(mac)` (MAC lue dans `GET network/devices`), puis `POST powerstate
On` dès qu'il répond en veille (un Android réveillé par WoL peut rester écran éteint).
- `activities/current` donne le **composant** de l'appli au premier plan (contrairement à Sony) :
  l'id d'appli est `<className>-<packageName>`, comme dans `applications`. Le lecteur TV
  (`org.droidtv.playtv`) couvre le tuner **et** les entrées HDMI : `context.level1` (`WatchTv`,
  `WatchSatellite` / `WatchExtension`…) et `activities/tv` (`ccid: "@"` sur une source HDMI)
  départagent. Le téléviseur ne dit jamais **quelle** entrée HDMI : on montre celle que Gladys a
  choisie, sinon « Source HDMI ».
- Sources : intent `org.droidtv.playtv.SELECTURI` avec l'URI passthrough
  `content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW5…8`
  (HDMI 1 à 4, puces MediaTek des modèles 2019+, liste de ha-philipsjs) ; le tuner :
  `content://android.media.tv/channel[/<ccid>]`.
- Chaînes : `activities/tv` ne donne souvent que le `ccid` ; numéro et nom viennent de
  `channeldb/tv/channelLists/<id>` (lu au plus une fois par jour). `POST activities/tv`
  `{ channelList: { id }, channel: { ccid } }`.
- Ambilight : `ambilight/power` (`On`/`Off`), `ambilight/currentconfiguration`
  `{ styleName, isExpert: false, menuSetting }` pour un style des menus. Les firmwares Android et
  Saphi **omettent** `menuSettings` dans `supportedstyles` : listes de repli de ha-philipsjs par
  famille. Couleur fixe = style lounge (`Lounge light` ou `FOLLOW_COLOR`, celui qui liste
  `MANUAL_HUE`) en mode expert, `colorSettings: { color: { hue, saturation, brightness } (0-255),
colorDelta, algorithm: "MANUAL_HUE" }, speed` (forme de Home Assistant, non éprouvée sur un vrai
  téléviseur).
- Les réponses ne sont pas toujours du JSON valide (`{,`, `,,`, `Context Service not started`) :
  `decodeBody` les répare comme ha-philipsjs. Un point d'accès en 404/403 est marqué mort jusqu'à la
  prochaine lecture complète.
- **Recherche** : les services mDNS des téléviseurs (`_philipstv_rpc._tcp`, `_philipstv_s_rpc._tcp`,
  ceux de HA) contiennent un `_` **refusé par le cœur et par le store** (`MDNS_SERVICE_REGEX =
/^_[a-z0-9-]+\._(tcp|udp)$/`, déjà dans 5.1.0) : la recherche passe par **SSDP**
  (`urn:schemas-upnp-org:device:MediaRenderer:1`, le rendu DLNA des téléviseurs). Tout renderer
  répond (enceintes, autres téléviseurs) : le conteneur lit `/6/system` de chaque adresse, en
  parallèle, et **écrit l'adresse dans la config** (`gladys.setConfig({ tv_N_host })`) :
  emplacement libre pour un nouveau téléviseur, même emplacement pour un téléviseur connu qui a
  changé d'adresse (l'appairage, rangé par identité, suit). La `source_mac` de la réponse, quand le
  cœur la connaît, sert au Wake-on-LAN avant que le téléviseur ait donné la sienne.

**Pièges rencontrés ici**

- Les fixtures de ha-philipsjs donnent **le même numéro de série** chiffré aux deux téléviseurs
  (Android et Saphi) : le faux Saphi en reçoit un autre (`encryptField`), sinon ils se confondent.
- Le faux Gladys enregistre `setConfig` dans `fake.config` (`POST /config`), mais ne renvoie aucun
  `config-updated` : le hub se reconfigure lui-même après l'écriture.
- Libellé d'un bouton de widget : 24 caractères au plus (« Suivre la vidéo · Standard » est trop
  long) ; les boutons de style ne portent que le réglage, l'icône dit la famille.
- `validateWidgetContent` refuse aussi les libellés trop longs : le test des widgets l'appelle dans
  chaque état et chaque langue.
