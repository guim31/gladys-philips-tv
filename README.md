# Philips TV for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that controls **Philips TVs** (Android TV and Google TV since 2016, and the
Saphi / Linux models) over their local **JointSpace** API: power, volume,
sources, apps, channels, **Ambilight** (on / off, style, fixed colour,
Ambilight + Hue) and every key of the remote, from the dashboard and from
scenes.

> **Developed without the hardware: feedback welcome.** The integration was
> built and tested against the real answers of Philips TVs kept by
> [ha-philipsjs](https://github.com/danielperna84/ha-philipsjs) and the
> community documentation of [pylips](https://github.com/eslavnov/pylips), with
> a simulated TV, not against a real Philips TV. Please report what works and
> what does not on the [Gladys forum](https://community.gladysassistant.com) or
> in the [issues](https://github.com/guim31/gladys-philips-tv/issues).

## Features

- **Up to three TVs**, found on the network (the _Search for TVs_ action and
  the Discover tab, SSDP through the Gladys core) or typed by address.
- **Pairing of the Android TVs** in two actions: _Show a pairing code on the
  TV_, then _Confirm the pairing code_. The Saphi TVs need none.
- **One device per TV**: power (Wake-on-LAN through the Gladys core when the
  TV network sleeps in standby), volume slider, volume up and down, mute,
  **source** (TV, HDMI 1 to 4) and **app** lists (Android TVs; the TV says
  which app is in front), channel number, channel up and down, what is on
  screen as a text, **Ambilight** on / off, **style** (the menus of the TV) and
  **fixed colour**, **Ambilight + Hue**.
- **Dashboard widgets** (the core allows four buttons per widget, hence four
  of them):
  - _Philips remote_: state, what is on screen, volume; Power, Volume −,
    Volume +, Mute;
  - _Philips Ambilight_: on / off and three styles of your choice;
  - _Philips keys_: four remote keys chosen in the widget settings;
  - _Philips shortcuts_: four favorite sources or apps typed by name.
- **Scene trigger** _TV: app, channel or source changed_ (turning on
  included, app to app too), with filters on the TV, the kind of screen, its
  exact name and who changed it (Gladys or the TV and its remote).
- **Scene actions** _Open an app on the TV_, _Choose a TV source_, _Set the
  Ambilight_ (a style, a fixed colour or off), _Send a remote control key_.
- Everything local: no cloud, no Philips account. Texts in English, French,
  German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Philips TV with the JointSpace API 6 on the local network, with a fixed IP
  address. To turn it on from Gladys: _Switch on with Wi-Fi (WoWLAN)_ or
  _Switch on with Chromecast_ on the TV.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-philips-tv`
   (or install **Philips TV** from the catalog once it is listed).
2. Turn the TV on. In **Configuration**, click **Search for TVs** (or type the
   address of the TV), save. An Android TV: click **Show a pairing code on the
   TV**, then type the code in **Confirm the pairing code**. Then click **Test
   the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- **JointSpace API 6**: `GET /6/system` (no authentication, on both ports)
  says whether the TV is an Android one (`secured_transport`,
  `pairing_type: digest_auth_pairing`: HTTPS on port 1926, self-signed
  certificate) or a Saphi one (HTTP on port 1925, no authentication), and what
  it can do (`featuring.jsonfeatures`). Its serial number, AES-encrypted with
  the key every Philips client shares, is the identity of the device.
- **Pairing**: `POST /6/pair/request` makes the TV show a PIN and gives a key;
  `POST /6/pair/grant`, authenticated by HTTP Digest with our random device id
  and that key, sends the PIN with its HMAC-SHA1 signature. The device id and
  the key are then the Digest credentials of every request; they are kept in
  `/data/philips-state.json` (owner-only), never in the configuration nor the
  logs.
- **Reads**: `powerstate`, `audio/volume`, `activities/current` (the app in
  front), `activities/tv` and `context` (channel or HDMI source),
  `ambilight/power`, `ambilight/currentconfiguration`, `HueLamp/power`;
  `applications`, `ambilight/supportedstyles`, `channeldb/tv` and
  `network/devices` (the MAC address for Wake-on-LAN) now and then. The TVs are
  read on a timer of the container (10 s by default, 5 s to 60 s); a TV in
  standby is only asked its power state and its Ambilight. The devices are
  published with `should_poll: false`. Only changes are sent to Gladys, and
  everything again when a device is added or Gladys reconnects.
- **Commands**: `powerstate`, `audio/volume`, `input/key`, `activities/launch`
  (an app's intent, or `org.droidtv.playtv.SELECTURI` with the passthrough URI
  of an HDMI input), `activities/tv`, `ambilight/power`,
  `ambilight/currentconfiguration` (a style of the menus; a fixed colour is the
  lounge style in expert mode, manual hue), `HueLamp/power`.
- A TV whose network sleeps in standby does not answer at all: it is shown
  off, its badge _unreachable_, and turning it on sends a Wake-on-LAN packet
  through the core (`network_wake`), then asks the TV to turn on once it
  answers.
- **Search**: the core sends an SSDP search for the UPnP media renderers
  (`network_discovery`, `urn:schemas-upnp-org:device:MediaRenderer:1`); the
  container reads `/6/system` at each address that answered, in parallel, and writes the new TVs in the free slots of the configuration (or the
  new address of a known TV in its slot).

## Checked, and what was not

The tests (`npm test`) run the integration against the SDK's fake Gladys and
an in-memory TV built from the real answers of ha-philipsjs
(`test/fixtures/philips/`): Digest authentication, pairing with the HMAC
signature vector of ha-philipsjs, decryption of the real encrypted serial
numbers, conformity of every device with the Gladys core, the four languages,
standby, a sleeping network, Wake-on-LAN, the SSDP search, every command,
widget and scene action.

The Docker image was also run with the Gladys sandbox constraints (read-only
root, all capabilities dropped, 256 MB, bridge network) against the same fake
TV served over HTTPS with Digest authentication in another container
(`test/helpers/philipsServer.js`): pairing, reads and commands.

**Not checked**: a real Philips TV. The HDMI passthrough addresses of each
model, the behaviour of WoWLAN and Wake-on-LAN, the fixed-colour payload and
the menu names come from ha-philipsjs, Home Assistant and pylips, not from a
test on the hardware.

## Limitations

- JointSpace API 6 only (2016 and later): the older sets (JointSpace 1) are
  not supported.
- Sources and apps on the Android TVs only; the TV does not say which HDMI
  input is on screen (the one Gladys chose is shown).
- The HDMI addresses are those of the 2019+ models (MediaTek): on older Android
  TVs, the _Sources_ key remains.
- Ambilight: styles and a fixed colour; not the per-pixel colours nor the
  brightness.
- Wake-on-LAN does not cross routers or VLANs, and needs WoWLAN on the TV.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

`PHILIPS_KIND=saphi node test/helpers/philipsServer.js` serves the fake Saphi
TV on port 1925; without `PHILIPS_KIND`, the Android one on port 1926 over
HTTPS, with the key and certificate given in `PHILIPS_TLS_KEY` and
`PHILIPS_TLS_CERT` (a throwaway self-signed pair), pairing PIN `0667`.

## Credits

- Protocol, quirks and test data from
  [ha-philipsjs](https://github.com/danielperna84/ha-philipsjs) (MIT, Daniel
  Perna), the Home Assistant
  [`philips_js`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/philips_js)
  integration (Apache-2.0) and the community documentation of
  [pylips](https://github.com/eslavnov/pylips) (MIT, Evgeny Slavnov). The
  fixtures of `test/fixtures/philips/` are the answers kept in ha-philipsjs.
- Cover: the Philips wordmark from Wikimedia Commons
  ([Philips_logo_new.svg](https://commons.wikimedia.org/wiki/File:Philips_logo_new.svg)),
  public domain (simple text logo), a trademark of Koninklijke Philips N.V.
- Structure, tests and conventions from the other integrations of guim31
  (above all [gladys-sony-bravia](https://github.com/guim31/gladys-sony-bravia)),
  and the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js).

## Disclaimer

Not affiliated with, endorsed by or sponsored by Philips or TP Vision. Philips
and Ambilight are trademarks of Koninklijke Philips N.V.

## License

[Apache-2.0](LICENSE)
