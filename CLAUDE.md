# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15), its only
runtime dependency (UDP goes through `node:dgram`). It reads a Flexit Nordic
ventilation unit over BACnet/IP (UDP 47808, no cloud, no authentication) and
shows it as one Gladys device; commands behind an off-by-default option,
heater off, cooker hood off and fireplace stop always allowed. Never tested
with a real device, not affiliated with Flexit.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npm run cover                             # cover.png (800x534), plain Node
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` (Node 22 and 24) and `audit` before every
commit.

## Architecture

```
index.js                  SDK bootstrap only
src/handlers.js           every SDK handler -> the app (shared with the tests)
src/app.js                FlexitApp: polling, backoff, identity, device, states,
                          badge, status, buttons, commands, guards
src/bacnet/client.js      one UDP request: own socket and invoke id, source checked,
                          error kinds, beforeSend/startBy
src/bacnet/protocol.js    ReadPropertyMultiple / WriteProperty (flexit_bacnet), pure
src/bacnet/values.js      plain and plausible values, identity, model (pure)
src/devices.js            -> the Gladys device and its states (pure)
src/publisher.js          states within 300/min
src/store.js              /data/flexit-state.json: time of the last read, serial
src/config.js             config_schema normalized (host, device_id, allow_commands,
                          interval, language)
src/constants.js          BACnet objects, commands, feature roles, limits, timings
src/i18n.js               runtime texts (en/fr)
test/fixtures/fakeFlexit.js  the fake unit behind the injected socket factory
scripts/cover.mjs         cover.png generator
```

## Rules

- **External ids are forever**: device `flexit:unit` (frozen rule: never the
  IP address nor the serial), feature roles in `FEATURES` of
  `src/constants.js`. Every role is always built: a republished device never
  loses a feature.
- Manifest keys (`host`, `device_id`, `allow_commands`, `poll_interval`,
  `language`, the actions `test_connection` and `accept_unit`) are frozen.
- **Identity**: the serial (Device object description, asked by the wildcard
  instance 4194303 and the configured id) is learnt once, kept in /data;
  another serial is never applied nor commanded (not even heater/hood off,
  fireplace stop) until `accept_unit` is pressed twice (exactly the serial
  shown); an unreadable serial is never "another unit" but refuses the
  commands; no serial ever learnt refuses the commands too (status says so).
  Only `electric-heater-off`, `cooker-hood-off`, `fireplace-stop` go without
  a known serial.
- **Commands**: never a switch, a writable binary or a thermostat; refused
  unless `allow_commands` (checked on arrival and in `beforeSend`), except
  `electric-heater-off`, `cooker-hood-off`, `fireplace-stop`; decided on a
  fresh read (state + identity); a stopped unit is never restarted (comfort
  off included: it overrides Stop); the ventilation mode needs the comfort
  button on; toggles
  (fireplace, rapid ventilation triggers) never sent twice blind; written
  within 3.5 s; confirmed only by a read back equal to the value asked; a
  written command is never "not sent"; never retried; the ack never waits
  for Gladys.
- Never read sooner than the interval (button, scan, reconnection, restart);
  only the follow-up reads after a command not confirmed (5 s, 20 s).
- **Answers are hostile**: one linear pass, every length checked, datagrams
  over 1497 bytes dropped, only the unit's address and port and our invoke id
  accepted; implausible values unknown; never log the bytes received.
- No discovery broadcast (it would imitate Flexit's app): the address is typed.
- Units only from the core's `DEVICE_FEATURE_UNITS_BY_CATEGORY`.
- Files are UTF-8 without BOM (`test/encoding.test.js`); tests never touch
  the network (loopback only).
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`; versions belong to the Release workflow.
