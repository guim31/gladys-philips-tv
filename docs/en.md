# Philips TV

Control your Philips TVs from Gladys, over your local network: turn them on
and off, set the volume, switch sources, open an app, change the channel, set
the Ambilight (style, fixed colour, on or off), press any key of the remote,
from the dashboard or from a scene. And react to what happens on screen: "when
Netflix opens on the TV, dim the lights".

> **Developed without the hardware: feedback welcome.** This integration was
> built and tested against the real answers of Philips TVs kept by the
> open-source ha-philipsjs library (the one Home Assistant uses) and the
> community documentation of the JointSpace API, with a simulated TV, not
> against a real Philips TV. If something does not work as described, please
> say so on the [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-philips-tv/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Philips TV** with the JointSpace API 6, on the same local network as
  Gladys, with a fixed IP address (a DHCP reservation in your router):
  - an **Android TV or Google TV** model (2016 and later): paired once with
    Gladys, with a code shown on the TV;
  - or a **Saphi** (Linux) model: no pairing.
- To turn the TV on from Gladys: on the TV, **Switch on with Wi-Fi (WoWLAN)**
  or **Switch on with Chromecast** turned on (usually in **Settings → Wireless
  and networks → Wired or Wi-Fi**). Without it, many TVs turn their network
  off in standby.

## Set up

1. Install the integration from the Gladys catalog.
2. Turn the TV on. In **Configuration**, click **Search for TVs**: the TVs that
   answer on your network are put in the free slots (_TV 1_, _TV 2_, _TV 3_),
   with their address. Or type the **Address** of the TV yourself (for example
   `192.168.1.20`). Optionally give it a **Name**, then save.
3. An **Android TV** is then paired once:
   1. click **Show a pairing code on the TV** (choose the TV): a 4-digit code
      appears on screen;
   2. type it in **Confirm the pairing code** (same TV), and run it, quickly:
      the TV waits about 30 seconds.

   Gladys appears on the TV as _Gladys Assistant_. The pairing is kept by the
   integration: no code is needed again. A Saphi TV needs no pairing.

4. Click **Test the connection**: the message under the button says, for each
   TV, whether it answers, its model, whether it is on and paired.
5. Open the **Discover** tab: one device per TV. Click **Add**, pick a room,
   save. A TV appears there once it has answered at least once: turn it on if
   it does not show up. **Search** in this tab also looks for new TVs.

The options at the bottom of the page:

- **Wake-on-LAN** (on by default): a TV whose network sleeps in standby does
  not answer at all. Gladys then asks its core to send a Wake-on-LAN packet to
  the MAC address the TV gave, which wakes it up. The integration declares it,
  as the install screen shows.
- **Refresh interval**: how often the TVs are read (10 s by default). A TV in
  standby is only asked its power state and its Ambilight.
- **Language of the feature names**: the names given to the features when you
  add a device, and the texts of the lists and of the scene events.

## The device of each TV

| Feature          | What it does                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Power            | On or standby. Turning it on asks the TV, or sends a Wake-on-LAN packet when it does not answer at all.                                                       |
| Volume           | The volume, as a slider, within the bounds of the TV (0 to 60 on most models).                                                                                |
| Volume down      | One step down, like the remote.                                                                                                                               |
| Volume up        | One step up.                                                                                                                                                  |
| Mute             | Mutes or unmutes the sound.                                                                                                                                   |
| Source           | Android TVs: _TV_ (the tuner) or _HDMI 1_ to _HDMI 4_, and to switch to another one. _Other_ is an app; choosing it presses Home.                             |
| App              | Android TVs: the app in front (the TV says which), and to open another one. _Home screen or other_ presses Home.                                              |
| Channel          | The number of the channel on screen, and to switch to another number.                                                                                         |
| Channel down     | Previous channel.                                                                                                                                             |
| Channel up       | Next channel.                                                                                                                                                 |
| Now playing      | What is on screen, as a text: `5 · France 5`, `Netflix`, `HDMI 2`, _HDMI source_, or _Off_.                                                                   |
| Ambilight        | Ambilight on or off.                                                                                                                                          |
| Ambilight style  | The style, from the menus of the TV: _Follow video_ (Standard, Vivid, Game…), _Follow audio_ (Lumina, Retro…), _Lounge light_ (Hot lava…), or _Fixed colour_. |
| Ambilight colour | A fixed colour, with the Gladys colour picker.                                                                                                                |
| Ambilight + Hue  | The Hue lamps that follow the Ambilight, on or off (TVs with Ambilight + Hue only).                                                                           |

The TV says what it can do: a Saphi TV has no _Source_ nor _App_, a TV without
Ambilight no Ambilight features. The lists (apps, Ambilight styles, channels)
are read from the TV and kept by the integration: they are there even when the
TV sleeps. A command that needs the screen (a source, an app, a channel) turns
the TV on first and waits for it, up to 25 seconds.

## Dashboard

Four widgets, to place side by side; each one shows one TV (the first one of
the configuration when none is chosen in its settings). The core allows four
buttons per widget, hence four of them.

- **Philips remote**: the state of the TV, what is on screen, the volume, and
  the buttons **Turn on** (or _Turn off_), **Volume −**, **Volume +** and
  **Mute**.
- **Philips Ambilight**: the Ambilight and its style, a button to turn it on or
  off, and three styles chosen in the widget settings (a fixed colour among
  them); the current one is checked.
- **Philips keys**: four keys of the remote, chosen in the widget settings: the
  arrows by default. Add a second one with _OK_, _Back_, _Home_, _Sources_, or
  _Play / pause_…
- **Philips shortcuts**: up to four favorite sources or apps, typed by name in
  the settings (`HDMI 2`, `Netflix`…); _TV_ and _HDMI 1_ to _HDMI 3_ when none is
  typed. One tap shows it, the TV turned on first. A name the TV does not know
  is reported under the buttons.

## Scenes

### Trigger

**TV: app, channel or source changed**: what is on screen changed, turning on
included. Filters: the TV, what is now on screen (app or home screen, channel,
HDMI source), its name exactly as the TV shows it (`Netflix`, `YouTube`), and
who changed it (Gladys, or the TV and its remote, a console over HDMI-CEC…).
Variables: the TV, the kind (`app`, `channel`, `source`), the name (of the app,
the channel or the source), the channel number, and who changed it.

The TV tells which app is in front: going from one app to another fires the
trigger. For an HDMI source, the TV does not say which one: the name is the
one Gladys chose, _HDMI source_ otherwise.

No "TV turned on" or "TV turned off" trigger: the **Power** feature already
triggers scenes, like any device.

### Actions

- **Open an app on the TV**: by its name as on the TV (`Netflix`, `youtube`:
  case, accents and spaces do not matter). Output: the app opened.
- **Choose a TV source**: _TV_ or _HDMI 1_ to _HDMI 4_. Output: the source
  chosen.
- **Set the Ambilight**: a style (_Follow video · Standard_, _Lounge light ·
  Hot lava_…), a fixed colour (typed as `#FF8800`, the last one when empty), or
  off. A style the TV does not have is refused. Output: the style applied.
- **Send a remote control key**: Home, Back, arrows, OK, Sources, volume,
  channel, playback, colors, digits, Ambilight…, one to ten times. Output: the
  presses sent.

The first two need an Android TV, and turn the TV on first when needed. With
several TVs, choose the TV in the action. The **Power**, **Volume**,
**Channel** and Ambilight features are in the usual _Control a device_ action.

### Scene ideas

- **Movie night**: at 9 pm on Fridays, _Open an app on the TV_ `Netflix`, _Set
  the Ambilight_ to _Follow video · Immersive_, dim the living room lights.
- **Netflix opened**: trigger _TV: app, channel or source changed_, now on
  screen _App_, name `Netflix`: close the shutters.
- **Goodnight**: at 11 pm, _Set the Ambilight_ to a fixed colour `#FF6A00`,
  then turn the **Power** of the TV off a few minutes later.
- **Leaving home**: in the "everyone left" scene, turn the **Power** of the TVs
  off.

## Troubleshooting

- **"Not reached yet: turn the TV on once"**: the TV never answered. Check its
  address and turn it on.
- **"Not paired yet"**: an Android TV needs the pairing: _Show a pairing code
  on the TV_, then _Confirm the pairing code_.
- **"Pairing refused by the TV: pair it again"**: the pairing was removed on
  the TV (a reset, a new firmware). Pair it again the same way.
- **"Wrong code"**: type the 4 digits shown, again. **"The code has expired"**:
  show a new one, and confirm it within 30 seconds.
- **"No Philips TV API at this address"**: another device answers there.
- **"TV from before 2016 (JointSpace 1)"**: these older models are not
  supported.
- **The TV does not turn on**: turn on _Switch on with Wi-Fi (WoWLAN)_ or
  _Switch on with Chromecast_ on the TV, and keep _Wake-on-LAN_ on; the packet
  does not cross routers or VLANs.
- **Search for TVs finds nothing**: the TV must be on, on the same network;
  type its address instead.
- **An HDMI source does not switch**: the HDMI addresses are those of the 2019+
  models; on older Android TVs, use the _Sources_ key.
- The logs of the integration (**Configuration** tab) say what each TV answers;
  no pairing key is ever written there.

## Limits

- Developed without the hardware: the behaviors come from ha-philipsjs, pylips
  and their real answers, not from a real TV.
- Philips TVs with the JointSpace API 6: Android TV and Google TV models from
  2016, Saphi models. The models before 2016 (JointSpace 1) are not supported.
- Sources and apps: Android TVs only. The TV does not say which HDMI input is
  on screen.
- Ambilight: the styles of the TV menus and a fixed colour; the per-pixel
  colours and the brightness of the Ambilight are not driven.
- Channels: those of the TV channel lists, read once a day.
- Everything stays on your local network: no cloud, no Philips account. The
  integration only talks to the TVs you configured, and asks the Gladys core
  for Wake-on-LAN packets and SSDP searches.
- Not affiliated with Philips or TP Vision. Philips and Ambilight are
  trademarks of Koninklijke Philips N.V.
