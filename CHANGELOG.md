# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.3] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.2] - 2026-10-19

### Fixed

- The store indexer rejected the manifest (119 KB, over its 100 KB limit):
  it is now printed wider (Prettier `printWidth` 160 for this file), 84 KB,
  with a test that keeps it under 95 KB (forum t/11344/3).

## [1.0.1] - 2026-10-13

### Changed

- Quieter logs: a failure that repeats at every read (Gladys refusing the
  states, an unexpected answer of the TV) is written once, then once more when
  it ends, instead of at every poll; a TV that answers again after a silence
  says so in one line.

## [1.0.0] - 2026-10-13

### Added

- Philips TVs with the JointSpace API 6 (Android TV and Google TV since 2016,
  Saphi models), up to three, on the local network: found by the _Search for
  TVs_ action or the Discover tab, or typed by address.
- Pairing of the Android TVs with a code shown on the TV (_Show a pairing code
  on the TV_, then _Confirm the pairing code_); the Saphi TVs need none.
- One device per TV: power (Wake-on-LAN when its network sleeps), volume
  slider, volume up and down, mute, source (TV, HDMI 1 to 4) and app lists,
  channel number, channel up and down, what is on screen as a text, Ambilight
  on / off, style and fixed colour, Ambilight + Hue.
- Dashboard widgets: _Philips remote_ (state, screen, volume, power, volume
  and mute buttons), _Philips Ambilight_ (on / off and three styles of your
  choice), _Philips keys_ (four remote keys of your choice) and _Philips
  shortcuts_ (four favorite sources or apps, one tap each).
- Scene trigger _TV: app, channel or source changed_, turning on and app to app
  included, with filters on the TV, the kind of screen, its name and who
  changed it.
- Scene actions _Open an app on the TV_, _Choose a TV source_, _Set the
  Ambilight_ (a style, a fixed colour or off) and _Send a remote control key_.
- _Test the connection_ action, connection status per TV, documentation in
  English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-philips-tv/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/guim31/gladys-philips-tv/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/guim31/gladys-philips-tv/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/guim31/gladys-philips-tv/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-philips-tv/releases/tag/v1.0.0
