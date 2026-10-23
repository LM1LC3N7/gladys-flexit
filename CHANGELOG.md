# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-23

### Added

- Flexit Nordic units (S2, S3, S4, CL2, CL3, CL4, KS3) over local BACnet/IP
  (UDP 47808), by IP address and BACnet device id: one Gladys device with the
  temperatures, setpoints, humidities, fans, heat exchanger, electric heater,
  filter, operation mode, comfort button, cooker hood and fireplace modes.
- Read every interval (60 s by default), never sooner, even after a restart.
- The serial number of the unit is kept and checked: another unit at the
  address is never shown nor driven until "Accept the unit at this address"
  is pressed twice; the commands wait until the serial number has been read.
- Commands behind "Allow the commands" (off by default): ventilation mode
  (with the comfort button on), air temperature setpoints (10 to 30 °C), rapid
  ventilation and fireplace mode start, cooker hood and electric heater on,
  comfort button, filter timer reset. Selects and buttons only. A stopped
  unit is never restarted.
- Always allowed (except toward another unit identified at the address):
  electric heater off, cooker hood off, fireplace mode stop.
- Guides in English and French, cover image.

[Unreleased]: https://github.com/LM1LC3N7/gladys-flexit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-flexit/releases/tag/v0.1.1
