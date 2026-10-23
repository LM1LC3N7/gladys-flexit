# gladys-flexit

A [Gladys Assistant](https://gladysassistant.com) external integration for
**Flexit Nordic** heat recovery ventilation units (S2, S3, S4, CL2, CL3, CL4,
KS3) over local **BACnet/IP** (UDP 47808): temperatures, humidity, fans, heat
exchanger, electric heater, filter, operation mode, fireplace and cooker hood
modes, and optional commands (off by default). Unofficial, not affiliated with
Flexit. Never tested with a real device.

- User guide: [English](docs/en.md) · [Français](docs/fr.md)
- Changes: [CHANGELOG.md](CHANGELOG.md) · Plan and decisions: [TODO.md](TODO.md)
- Rules for contributors: [CLAUDE.md](CLAUDE.md)

## How it works

- One device per integration, keyed by the unit it drives (never its IP
  address); the unit's serial number is checked at each read and before each
  command.
- One read every interval (60 s by default, never sooner, even after a
  restart): three BACnet ReadPropertyMultiple requests.
- Commands as selects and buttons only (never a switch), refused unless
  "Allow the commands" is on, except turning the heater or the cooker hood off
  and stopping the fireplace mode.

## Development

```bash
npm install
npm run format:check
npm run lint
npm test
npm run audit
npm run cover       # cover.png, plain Node
```

The tests run against the SDK's fake Gladys and a fake unit behind an
injected socket factory, plus a real loopback UDP socket; nothing reaches the
network.

## Credits

The BACnet requests and the list of Flexit objects are ported from
[flexit_bacnet](https://github.com/piotrbulinski/flexit_bacnet) (MIT, Piotr
Buliński), the library of Home Assistant's Flexit Nordic integration. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Apache License 2.0, see [LICENSE](LICENSE).
