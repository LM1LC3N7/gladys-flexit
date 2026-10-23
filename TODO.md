# TODO — Flexit Nordic v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`
  (Node 22 and 24), `npm run audit`, `npx github:GladysAssistant/integration-store .`,
  then update README, `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- No forum topic of its own, no forum post from a module session: the batch
  reserved in /t/10385 (lot 14) gets one recap message there.
- The `gladys-assistant-integration` topic is added at the first real release only.

## Status

- [x] **Milestone 1 — core** (2026-10-23): the unit by IPv4 address and
      BACnet device id, three ReadPropertyMultiple every interval (never
      sooner, even after a restart), identity by serial kept in /data with a
      two-press "Accept the unit", one device, ventilation mode and setpoint
      selects, rapid ventilation / fireplace / cooker hood / heater / comfort
      / filter reset buttons behind `allow_commands` (off), heater off,
      cooker hood off and fireplace stop never held back, test button, docs
      en/fr, cover. Tested against a fake unit and a loopback UDP socket
      only. The store validator was not run by the dev session (it needs the
      real terminal).
- [x] **Review 1 fixes** (2026-10-23): comfort off refused on a stopped unit
      (B1); commands refused until a serial is learnt, Device object also
      read by the wildcard instance 4194303, status says so (I2); "always
      allowed" commands refused toward another identified unit; ventilation
      mode refused while the comfort button is off; segmented answer no longer
      announced as accepted, its reason kept; UNSIGNED of 1-4 bytes; 0.x,
      multicast and broadcast addresses refused; docs fr/en corrected.
- [ ] **Milestone 2 — real unit**: run against a real Flexit Nordic (see "To check").
- [ ] **Milestone 3 — more**: fan setpoints per mode, durations of the
      fireplace and rapid modes (selects), heater nominal power, if asked.

## To check on a real unit

- That the answers are never segmented with these three groups (segmentation
  is announced as not accepted; a segmented answer is refused) and that the
  unit accepts a fresh invoke id per request.
- That the unit answers the wildcard Device instance 4194303 (standard
  BACnet) with its own Device object, or at least an access error for it
  (not an Error for the whole request).
- That the description of the Device object is the serial (`800xxx-xxxxxx`)
  and stays the same across restarts and firmware updates.
- Whether the fireplace trigger is a toggle (Home Assistant says so) and
  whether the rapid ventilation trigger is one too (treated as one here); what
  the operation mode reads during each (6, 7).
- That a written ventilation mode shows at once in MSV 42 (with the comfort
  button on; with it off, the mode command is refused, as flexit_bacnet says
  the register then stays Away).
- What the room humidity objects (AV 2093-2095) read without a CI77 sensor
  (0 is taken as absent) and AI 96 on models without an extract sensor.
- Whether the filter reset shows at once on AV 285 (the confirmation).
- How the unit answers a write it refuses (Error PDU expected).

## Decisions

- **Version 0.1.0 set by hand** in `package.json`, `package-lock.json`, the
  manifest and `docker_image` (`ghcr.io/lm1lc3n7/gladys-flexit:0.1.0`); the
  first patch release gives 0.1.1. The manifest test checks the semver shape
  and that the four agree, never a pinned value.
- **Reference**: flexit_bacnet 2.2.3 (MIT, LICENSE file read: Copyright (c)
  2022 Piotr Buliński), cloned read-only in `_ref/flexit_bacnet`. Credited in
  `THIRD_PARTY_NOTICES.md` with the full license text, copied in the image.
  Home Assistant's `flexit_bacnet` integration (Apache-2.0) read for the
  default device id (2), the setpoint range (10-30 °C by 0.5) and the toggle
  note; nothing copied. No object outside flexit_bacnet is read or written.
- **Sibling modules**: gladys-danfoss-air (structure, polling, guards,
  protective command, publisher, store) and gladys-zehnder-comfoair (domain).
- **No discovery**: flexit_bacnet finds units with a Siemens private-transfer
  broadcast whose payload was captured from Flexit's mobile app (it carries
  an app id); sending it would imitate the app. The address is typed.
- **Address**: IPv4 only (no host name): the answer must come from the exact
  address and port asked; fixed for each request. Each request has its own
  socket and its own invoke id (flexit_bacnet uses a fixed id 1): a late
  answer is never taken for the next request.
- **Identity (FROZEN RULE)**: device `flexit:unit`, one per integration,
  never the IP address nor the serial (a replaced unit keeps the device and
  its history once accepted). The serial (Device object description) is
  learnt at the first read and kept in /data. The Device object is asked by
  the wildcard instance 4194303 and by the configured device id (two serials
  in one answer: unknown), so a wrong device id still gives the identity. A
  read showing another serial is not applied (status, badge unreachable,
  every command refused, the "always allowed" ones included); "Accept the
  unit at this address" pressed twice within 2 minutes pins exactly the
  serial shown, without a read. An unreadable serial is never "another
  unit": the read is applied, but the commands (except the "always allowed"
  ones) are refused. No serial ever learnt: the status says "check the BACnet
  device id" and the commands (except the "always allowed" ones) are refused.
- **Reads**: three ReadPropertyMultiple (state + identity, measures, slower
  values) of at most 17 objects, answers far under one frame; the first
  failing fails the read; another one failing leaves its values unknown this
  time (logged), never republished as new. Access errors and implausible
  values are unknown, never 0 (temperatures -60..90 °C, setpoints 5..40 °C,
  % 0..100, rpm 0..10000, kW 0..30, minutes 0..1440, hours 0..200000);
  a room humidity of exactly 0 is "no sensor". AI 95 replaces AI 59 when it
  reads 0 (flexit_bacnet).
- **Commands** (behind `allow_commands`, off): ventilation mode (select Away,
  Home, High; Stop is never written), setpoints Home and Away (selects 10.0
  to 30.0 by 0.5; Home Assistant's range, not a heating setpoint of water),
  rapid ventilation start, fireplace start, cooker hood on, heater on,
  comfort on/off, filter timer reset. Selects and buttons, never a switch nor
  a thermostat (a "turn everything off" never reaches them). Values strictly
  from the lists; buttons strictly 1.
- **Stopped unit**: when the operation mode reads off or the ventilation mode
  reads stop, the commands that may start the fans or the heater (mode,
  rapid, fireplace start, cooker hood on, heater on, comfort on, and comfort
  off, which overrides Stop and sends the unit Away) are refused. The
  ventilation mode is refused while the comfort button reads off (it would
  stay Away);
  stopping the ventilation is not offered in v1 (if ever: its own option,
  off by default, a list value).
- **"Always allowed" commands** (called protective in the code): heater off
  (removes a heat source), cooker hood off and fireplace stop (they bring the
  ventilation back to normal; not a safety action: they remove the air
  compensation of a hood or a stove; the fireplace mode is an overpressure,
  supply 90 % / extract 50 % by default, the lot proposal's "dépression" is
  wrong). Heater off and cooker hood off: one absolute write, always, no
  fresh read, confirmed by the read back. Fireplace stop: a toggle, written
  only when a fresh read shows the mode on, never blind (a failed read
  refuses it, the stop guard sends it at the next reads). Never held back by
  the option, another command or a backoff; refused only toward another unit
  identified at the address; possible before the first read after a restart
  and with an unreadable serial; a second press joins the first. Each one
  bumps a counter checked in the `beforeSend` of the other commands: a
  command not written yet gives way ("a priority command was sent
  meanwhile"). Not confirmed: a stop guard per target (2
  minutes) resends it, twice at most, a second after a read that shows the
  target still on, unless an "on" command of that target actually left after
  it (number set in `beforeSend`; a write refused by the unit does not count).
  A fireplace stop while a start is sent and not seen yet is deferred to the
  reads (the guard sends it when the mode shows on).
- **Toggles**: the fireplace and rapid ventilation triggers (MSV 360, 357,
  value 2) are written only when the state read just before is not the one
  asked; the guard is set right before the bytes leave and lifted only by the
  state asked seen after a move, or after 90 s; while it is up, no other
  trigger of that mode is sent.
- **Deadlines**: fresh read 1.5 s max, write by 3.5 s after the click
  (checked right before the bytes), read back until 4.3 s. The written flag
  is set in `beforeSend`: a write cut afterwards is always "sent, without
  confirmation"; an Error/Reject/Abort answer to a write is "refused by the
  unit" (not applied). Follow-up reads 5 s and 20 s after a command not
  confirmed are the one exception to the interval.
- **No 429/5xx** (UDP): failures back off 30 s, 1, 2, 5 min, never under the
  interval. No credentials, nothing secret: `/data` holds only the time of
  the last read (written at most once a minute, before the read) and the
  serial of the unit.
- **Units**: °C, %, kW (energy-sensor/power, never an index), minutes and
  hours (duration). Fan speeds in rpm and heat exchanger percentages are
  `unknown` integer sensors (no unit for that category in the core).
- **Operation mode** published as stable English keys (`home`, `fireplace`…)
  on a read-only text feature, whatever the language (scenes keep working).
- **Fireplace mode**: Flexit's fireplace function raises the supply over the
  extract (overpressure, to help a stove draw), confirmed by review 1
  (flexit_bacnet's FIRE setpoints 90 % / 50 %); the lot proposal's
  "dépression" is wrong.
- **Addresses**: IPv4 unicast only: 0.x, multicast (224-239) and
  reserved/broadcast (240-255) refused as invalid.
- **Frames**: segmentation announced as not accepted (byte 0x00), unlike
  flexit_bacnet: a unit that would need it answers an Abort; the reason of a
  protocol error ("segmented answer"…) is kept in the status and the logs.
  An UNSIGNED write takes 1 to 4 bytes; anything else is refused before a
  byte is built.
- **Interval**: 60 s by default, 30 s – 1 h.
- **Not done**: Bluetooth (none), scenes, widgets, fan setpoints per mode,
  durations, heater nominal power, ventilation stop.
