// -----------------------------------------------------------------------------
// The integration: the unit typed in the configuration (its IPv4 address and
// BACnet device id), one read of its objects every poll interval (three
// ReadPropertyMultiple requests over UDP), the Gladys device and its states,
// the transport badge, the "Test the connection" and "Accept the unit"
// buttons, and the commands. index.js only wires the SDK handlers to it
// (src/handlers.js).
//
// Reads follow the rules learnt on the previous modules:
//   - never sooner than the interval after the last one: not for the test
//     button, a Discovery scan, a reconnection to Gladys, a configuration
//     saved unchanged, nor a restart of the container (the time of the last
//     read is kept in /data, written at most once a minute, BEFORE the read);
//     a reconnection during a read joins it;
//   - an answer that arrives for an old configuration (generation) publishes
//     nothing and sets no status; a read begun before a command left is not
//     applied; a value not read this time is never republished as new;
//   - identity: the serial number of the unit (BACnet Device object) is
//     learnt at the first read and kept in /data; a read that shows another
//     serial is not applied (status says so, commands refused) until "Accept
//     the unit" is pressed twice; an unreadable serial is never "another unit".
//
// Commands (ventilation mode, setpoints, rapid ventilation, fireplace start,
// cooker hood on, heater on, comfort button, filter timer reset):
//   - refused unless "Allow the commands" is on, checked on arrival and again
//     right before the write (nothing runs in between);
//   - decided on a fresh read of the objects concerned and of the identity,
//     never on the state in memory; refused when a value cannot be read; a
//     unit stopped is never restarted; not written when already so (unless a
//     guard says a previous command may not show yet); a toggle (fireplace,
//     rapid ventilation trigger) is never written while a previous one is not
//     seen yet;
//   - written within 3.5 s of the click or refused unsent; confirmed only by a
//     read back equal to the value asked, by 4.3 s; else "sent, without
//     confirmation" and spaced reads; never retried; one at a time;
//   - the ack never waits for a publication to Gladys.
// Protective commands (heater off, cooker hood off, fireplace stop): never
// held back by the option, another command or a backoff (one try); refused
// only toward another unit identified at the address; the fireplace stop (a
// toggle) needs a fresh read showing the mode on, the two others are written
// blind; possible before the first read after a restart; a command not
// written yet gives way to them; reaffirmed (twice at most) by the reads of
// the next two minutes when not confirmed, unless an "on" command of the same
// target actually left after them.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { addressKey, normalizeConfig } from './config.js';
import {
  COMMANDS,
  FEATURES,
  POINTS,
  PRESSED,
  READ_GROUPS,
  SECOND,
  STARTS_OF,
  TIMINGS,
  TOGGLES,
  TRIGGERS,
  TRIGGER_VALUE,
} from './constants.js';
import { ERROR_KINDS, UnitError, errorReason, request, udpSocket } from './bacnet/client.js';
import {
  parseReadAnswer,
  parseWriteAnswer,
  readPropertyMultiple,
  writeProperty,
} from './bacnet/protocol.js';
import { deviceSpecs, modelOf, plainValues, pointSpec } from './bacnet/values.js';
import { buildDevice, commandOf, deviceStates, parseFeatureId, unitIds } from './devices.js';
import { ERRORS, T, age, join, word } from './i18n.js';
import { StatePublisher } from './publisher.js';
import { fileStore, normalizeMemory } from './store.js';

/** A refusal: the message Gladys shows. */
class Refusal extends Error {}

/** The protective command of each target. */
const STOP_ROLE = {
  heater: FEATURES.HEATER_OFF,
  cookerHood: FEATURES.COOKER_HOOD_OFF,
  fireplace: FEATURES.FIREPLACE_STOP,
};

const equal = (a, b) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.05 : a === b;

const freshUnit = () => ({
  /** The values of the last read (only those read that time). */
  values: undefined,
  online: undefined,
  failures: 0,
  wait: undefined,
  error: undefined,
  timer: undefined,
  running: undefined,
  /** The serial of another unit answering at the address, while it does. */
  mismatch: undefined,
  model: undefined,
  followUps: new Set(),
});

export class FlexitApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'flexit' }),
    socketFactory = udpSocket,
    now = Date.now,
    timers = globalThis,
    store = fileStore(),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.socketFactory = socketFactory;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
    this.config = normalizeConfig();
    this.memory = normalizeMemory(null, now());
    this.unit = freshUnit();
    this.generation = 0;
    this.started = false;
    /** The time of the last read sent to the unit (exact; /data keeps it within a minute). */
    this.lastAttemptAt = -Infinity;
    this.lastStatus = undefined;
    this.published = undefined;
    this.badge = undefined;
    /** The abort functions of the requests running. */
    this.requests = new Set();
    /** The command in flight (one at a time), and the protective ones by target. */
    this.inFlight = undefined;
    this.protecting = new Map();
    /** Counts the protective commands: a command that sees it change before its write gives way. */
    this.protectSeq = 0;
    /** When the last write left (a read begun before it is not applied). */
    this.lastSentAt = -Infinity;
    /** Numbers the writes that actually left; per target, the number of the last "on" sent. */
    this.sendCounter = 0;
    this.onSent = { heater: 0, cookerHood: 0, fireplace: 0 };
    /** Key -> { from, expected, moved, until }: a command sent, not seen yet. */
    this.guards = new Map();
    /** Target -> { mark, until, reasserts }: a protective command not confirmed. */
    this.stopGuards = new Map();
    this.reassertTimers = new Map();
    /** The first press of "Accept the unit": { serial, until }. */
    this.pendingAccept = undefined;
  }

  // --- Lifecycle -------------------------------------------------------------

  /**
   * `fresh`: started for a new address while running (a read may go at
   * once); otherwise (container start) the first read waits for the
   * interval after the last read kept in /data.
   */
  async start(raw = {}, { fresh = false } = {}) {
    this.stop();
    // Set at once: a `connected` or a configuration saved during this start
    // compares with it (never a restart, never a read before the interval).
    this.config = normalizeConfig(raw);
    const generation = this.generation;
    await this.unit.running;
    if (generation !== this.generation) {
      return;
    }
    this.memory = normalizeMemory(await this.store.load().catch(() => null), this.now());
    if (generation !== this.generation) {
      return;
    }
    this.unit = freshUnit();
    this.published = undefined;
    this.badge = undefined;
    this.lastStatus = undefined;
    this.pendingAccept = undefined;
    this.publisher.start();
    if (!this.config.address) {
      // The device already created is shown unreachable.
      await this.publishAll();
      return;
    }
    await this.setStatus(false, this.status());
    if (generation !== this.generation) {
      return;
    }
    const wait = fresh ? 0 : this.firstWait();
    if (wait > 0) {
      this.schedule(wait);
      await this.publishAll();
      return;
    }
    await this.tick();
  }

  /** The wait before the first read after a container start, from the time kept in /data. */
  firstWait() {
    const stored = this.memory.lastAttemptAt;
    if (stored === null) {
      return 0;
    }
    this.lastAttemptAt = Math.max(this.lastAttemptAt, stored);
    // A read may have left up to a minute after the time kept (written at most once a minute).
    const due = stored + TIMINGS.attemptWriteEvery + this.interval;
    return Math.min(this.interval, Math.max(0, due - this.now()));
  }

  stop() {
    this.generation += 1;
    this.clearTimer();
    for (const handle of this.unit.followUps) {
      this.timers.clearTimeout(handle);
    }
    this.unit.followUps.clear();
    for (const abort of [...this.requests]) {
      abort();
    }
    this.publisher.stop();
    // Guards and reaffirmations belong to this address and this run only.
    this.guards.clear();
    this.stopGuards.clear();
    for (const handle of this.reassertTimers.values()) {
      this.timers.clearTimeout(handle);
    }
    this.reassertTimers.clear();
  }

  clearTimer() {
    if (this.unit.timer) {
      this.timers.clearTimeout(this.unit.timer);
      this.unit.timer = undefined;
    }
  }

  /**
   * Connected to Gladys. The first time, start; after a reconnection, resend
   * what Gladys keeps in memory only (status, Discovery list, badge) and the
   * last states, without reading the unit.
   */
  async connected(raw = {}) {
    if (!this.started) {
      this.started = true;
      await this.start(raw);
      return;
    }
    if (this.needsRestart(raw)) {
      await this.start(raw, { fresh: true });
      return;
    }
    const previous = this.config;
    this.config = normalizeConfig(raw);
    this.published = undefined;
    this.badge = undefined;
    this.lastStatus = undefined;
    this.gladys.forgetPublishedStates?.();
    this.rescheduleOnNewInterval(previous);
    await this.publishAll();
  }

  /** Only a new address or device id restarts (an interval only reschedules). */
  needsRestart(raw) {
    const next = normalizeConfig(raw);
    return (
      JSON.stringify(next.address ?? null) !== JSON.stringify(this.config.address ?? null) ||
      next.deviceId !== this.config.deviceId ||
      next.invalid !== this.config.invalid
    );
  }

  /** A new interval: the next read follows it, counted from the last read. */
  rescheduleOnNewInterval(previous) {
    const u = this.unit;
    if (
      this.config.pollInterval !== previous.pollInterval &&
      this.config.address &&
      !u.running &&
      u.online !== false &&
      u.timer
    ) {
      this.schedule();
    }
  }

  async configUpdated(raw = {}) {
    if (this.needsRestart(raw)) {
      await this.start(raw, { fresh: true });
      return;
    }
    const previous = this.config;
    this.config = normalizeConfig(raw);
    this.rescheduleOnNewInterval(previous);
    if (this.config.allowCommands !== previous.allowCommands) {
      this.logger.info(`Flexit commands ${this.config.allowCommands ? 'allowed' : 'disabled'}`);
    }
    if (this.config.language !== previous.language) {
      this.published = undefined;
      this.lastStatus = undefined;
      await this.publishAll();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async saveMemory() {
    await this.store
      .save(this.memory)
      .catch((err) => this.logger.warn(`Saving the state to /data failed: ${err.message}`));
  }

  // --- Requests --------------------------------------------------------------------

  /** One request to the unit of the current configuration (address fixed for the request). */
  send(options) {
    const { host, port } = this.config.address;
    return request({
      host,
      port,
      socketFactory: this.socketFactory,
      timers: this.timers,
      now: this.now,
      track: this.requests,
      ...options,
    });
  }

  /** One ReadPropertyMultiple of `keys` (and of the Device object when `withDevice`). */
  async readKeys(keys, { withDevice = false, timeoutMs = TIMINGS.requestTimeout } = {}) {
    const specs = keys.map(pointSpec);
    if (withDevice) {
      specs.unshift(...deviceSpecs(this.config.deviceId));
    }
    const objects = await this.send({
      build: (invokeId) => readPropertyMultiple(invokeId, specs),
      parse: parseReadAnswer,
      timeoutMs,
    });
    return plainValues(objects, keys, withDevice);
  }

  /** One WriteProperty of the present value of `object`. */
  write(object, value, options) {
    return this.send({
      build: (invokeId) => writeProperty(invokeId, object, value),
      parse: parseWriteAnswer,
      ...options,
    });
  }

  // --- Polling ---------------------------------------------------------------

  get interval() {
    return this.config.pollInterval * SECOND;
  }

  /** The earliest time the next polling read may go: the interval after the last one. */
  get due() {
    return this.lastAttemptAt + this.interval;
  }

  /** The next read: after its backoff, else the interval; never sooner than the interval after the last read. */
  schedule(delay) {
    const u = this.unit;
    this.clearTimer();
    let wait = delay ?? (u.online === false ? u.wait : this.interval);
    // Capped at the interval: a clock set back never stops the reads.
    wait = Math.max(wait ?? this.interval, Math.min(this.interval, this.due - this.now()), 0);
    const generation = this.generation;
    u.timer = this.timers.setTimeout(() => {
      u.timer = undefined;
      if (generation === this.generation && u === this.unit) {
        this.tick().catch(() => this.logger.error('Flexit refresh failed'));
      }
    }, wait);
  }

  /** One read at a time: a tick during a read joins it. */
  tick() {
    const u = this.unit;
    if (!u.running) {
      u.running = this.run().finally(() => {
        u.running = undefined;
      });
    }
    return u.running;
  }

  /**
   * Keeps the time of this read; when the write of the minute is due, in
   * /data BEFORE the read (a container stopped during the read keeps it). At
   * most one write a minute.
   */
  async noteAttempt() {
    const now = this.now();
    this.lastAttemptAt = now;
    const stored = this.memory.lastAttemptAt;
    if (stored === null || now - stored >= TIMINGS.attemptWriteEvery) {
      this.memory.lastAttemptAt = now;
      await this.saveMemory();
    }
  }

  async run() {
    const generation = this.generation;
    if (!this.config.address) {
      return;
    }
    const startedAt = this.now();
    await this.noteAttempt();
    if (generation !== this.generation) {
      return;
    }
    let values;
    let failure;
    try {
      values = await this.readAll(generation);
    } catch (err) {
      failure = err;
    }
    if (generation !== this.generation) {
      return;
    }
    let delay;
    if (failure?.kind === ERROR_KINDS.ABORTED) {
      this.logger.debug('Flexit: read aborted');
    } else if (failure) {
      delay = this.failed(failure);
    } else if (startedAt <= this.lastSentAt) {
      // Begun before a command left: it may show the state before it.
      this.logger.debug('Flexit: read begun before a command, not applied');
    } else {
      await this.applyRead(values, generation);
    }
    if (generation !== this.generation) {
      return;
    }
    await this.publishAll();
    if (generation === this.generation) {
      this.schedule(delay);
    }
  }

  /**
   * The groups of objects, one request each, one after the other. The first
   * (state and identity) failing fails the read; another one failing leaves
   * its values unknown this time (logged).
   */
  async readAll(generation) {
    const values = {};
    for (const [index, keys] of READ_GROUPS.entries()) {
      try {
        Object.assign(values, await this.readKeys(keys, { withDevice: index === 0 }));
      } catch (err) {
        if (index === 0 || err.kind === ERROR_KINDS.ABORTED) {
          throw err;
        }
        this.logger.warn(`Flexit: read of group ${index + 1} failed (${errorReason(err)})`);
      }
      if (generation !== this.generation) {
        throw new UnitError(ERROR_KINDS.ABORTED, 'configuration changed');
      }
    }
    return values;
  }

  /** A read: identity first, then the values of this read only (a value not read is unknown). */
  async applyRead(values, generation) {
    const u = this.unit;
    u.online = true;
    u.failures = 0;
    u.wait = undefined;
    u.error = undefined;
    const serial = values.serial;
    if (serial !== undefined && this.memory.serial !== null && serial !== this.memory.serial) {
      if (u.mismatch !== serial) {
        this.logger.warn('Flexit: another unit answers at this address, not applied');
      }
      u.mismatch = serial;
      u.values = undefined;
      return;
    }
    u.mismatch = undefined;
    if (serial !== undefined && this.memory.serial === null) {
      this.memory.serial = serial;
      this.logger.info('Flexit: serial number of the unit kept');
      await this.saveMemory();
      if (generation !== this.generation) {
        return;
      }
    }
    u.model = modelOf(serial) ?? u.model;
    u.values = values;
    this.observe(values);
  }

  /** A failed read: the delay before the next one. */
  failed(err) {
    const u = this.unit;
    const reason = errorReason(err);
    const wait = Math.max(
      this.interval,
      TIMINGS.backoff[Math.min(u.failures, TIMINGS.backoff.length - 1)],
    );
    u.failures += 1;
    u.online = false;
    u.wait = wait;
    u.error = err?.kind ?? 'error';
    u.reason = reason;
    this.logger.warn(`Flexit: ${reason}; next try in ${Math.round(wait / 1000)} s`);
    return wait;
  }

  /** The connection status of the configuration screen. */
  status() {
    const u = this.unit;
    const c = this.config;
    if (!c.address) {
      return c.invalid ? T.invalid(c.invalid) : T.noHost;
    }
    if (u.online === false) {
      const wait = age(u.wait ?? this.interval);
      return [ERROR_KINDS.TIMEOUT, ERROR_KINDS.NETWORK].includes(u.error)
        ? T.unreachable(addressKey(c.address), c.deviceId, wait)
        : T.failing(u.reason ?? 'error', wait);
    }
    if (u.online === undefined) {
      return u.timer && this.due > this.now()
        ? T.waiting(age(this.due - this.now()))
        : T.connecting;
    }
    if (u.mismatch) {
      return T.otherUnit(u.mismatch, this.memory.serial);
    }
    const connected = T.connected(T.summary(u.values ?? {}, u.model));
    return this.memory.serial === null ? join(connected, T.serialUnknown) : connected;
  }

  get shown() {
    return this.unit.online === true && !this.unit.mismatch;
  }

  async updateStatus() {
    await this.setStatus(this.shown && Boolean(this.config.address), this.status());
  }

  // --- Gladys ----------------------------------------------------------------

  createdDevice() {
    const id = unitIds(this.gladys).device;
    return (this.gladys.devices ?? []).find((d) => d?.external_id === id);
  }

  async publishAll() {
    const generation = this.generation;
    await this.publishDevices();
    if (generation !== this.generation) {
      return;
    }
    this.queueStates();
    await this.flush();
    if (generation !== this.generation) {
      return;
    }
    await this.publishBadge();
    if (generation !== this.generation) {
      return;
    }
    await this.updateStatus();
  }

  async flush() {
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
  }

  /** The device, once the unit answered (every feature, always). */
  async publishDevices() {
    if (!this.shown) {
      return;
    }
    const devices = [buildDevice(this.gladys, { language: this.config.language })];
    const json = JSON.stringify(devices);
    if (json === this.published) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = json;
    } catch (err) {
      this.logger.warn(`Publishing the discovered devices failed: ${err.message}`);
    }
  }

  createdFeatures() {
    return new Set((this.createdDevice()?.features ?? []).map((f) => f?.external_id));
  }

  /** Pushes the given values (only these) to the created features. */
  queueValues(values, created = this.createdFeatures()) {
    for (const { device_feature_external_id: id, ...value } of deviceStates(
      unitIds(this.gladys),
      values,
    )) {
      if (created.has(id)) {
        this.publisher.push(id, value);
      }
    }
  }

  queueStates(created) {
    if (this.shown && this.unit.values) {
      this.queueValues(this.unit.values, created);
    }
  }

  async publishBadge() {
    const device = this.createdDevice();
    const online = this.unit.online;
    if (!device || (online === undefined && this.config.address)) {
      return;
    }
    const entries = [
      {
        external_id: device.external_id,
        transport: this.shown ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
      },
    ];
    const json = JSON.stringify(entries);
    if (json === this.badge) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      this.badge = json;
    } catch (err) {
      this.logger.warn(`Transport badge failed: ${err.message}`);
    }
  }

  /** A device was created (or updated): send its last values at once. */
  async deviceCreated(device) {
    this.badge = undefined;
    const created = this.createdFeatures();
    for (const f of device?.features ?? []) {
      created.add(f?.external_id);
    }
    this.queueStates(created);
    await this.flush();
    await this.publishBadge();
  }

  async deviceDeleted(device) {
    this.badge = undefined;
    if (typeof device?.external_id === 'string') {
      this.publisher.forget(device.external_id);
    }
  }

  /** The Discovery tab asks for a scan: the device sent again (no read). */
  async scan() {
    this.published = undefined;
    await this.publishDevices();
  }

  // --- Configuration buttons -------------------------------------------------------

  /** A read now, unless the last one is more recent than the interval (then its result). */
  async testConnection() {
    if (!this.config.address) {
      return this.status();
    }
    const u = this.unit;
    const current = () => JSON.parse(this.lastStatus ?? '[false,null]')[1] ?? this.status();
    if (u.running) {
      await u.running;
      return current();
    }
    if (this.now() < this.due) {
      const waited = T.waiting(age(this.due - this.now()));
      return Number.isFinite(this.lastAttemptAt) && u.online !== undefined
        ? join(join(current(), T.lastRead(age(this.now() - this.lastAttemptAt))), waited)
        : waited;
    }
    this.clearTimer();
    await this.tick();
    return current();
  }

  /**
   * Another unit answers at the address: the first press shows its serial,
   * a second press within 2 minutes drives it (exactly the serial shown). No
   * read: it shows from the next one.
   */
  async acceptUnit() {
    const serial = this.unit.mismatch;
    if (!serial) {
      this.pendingAccept = undefined;
      return T.acceptNothing;
    }
    const pending = this.pendingAccept;
    if (pending && pending.serial === serial && this.now() < pending.until) {
      this.pendingAccept = undefined;
      this.memory.serial = serial;
      await this.saveMemory();
      this.unit.mismatch = undefined;
      this.unit.values = undefined;
      // The guards were about the other unit.
      this.guards.clear();
      this.stopGuards.clear();
      this.logger.info('Flexit: another unit accepted at this address');
      await this.updateStatus();
      return T.accepted(serial);
    }
    this.pendingAccept = { serial, until: this.now() + TIMINGS.acceptWindow };
    return T.acceptConfirm(serial);
  }

  // --- Commands --------------------------------------------------------------------

  refusal(text) {
    return new Refusal(word(text, this.config.language));
  }

  async setValue(_device, feature, value) {
    // The deadlines count from the arrival of the command, before any wait.
    const received = this.now();
    const role = parseFeatureId(feature?.external_id);
    const command = role ? commandOf(role) : undefined;
    if (!command) {
      throw this.refusal(ERRORS.readOnly);
    }
    let written;
    let expected = command.expected;
    if (command.values) {
      // Strictly one of the values of the select: never trimmed, re-cased nor a number.
      if (typeof value !== 'string' || !Object.hasOwn(command.values, value)) {
        throw this.refusal(ERRORS.badValue);
      }
      written = command.values[value];
      expected = command.point === 'ventilationMode' ? value : written;
    } else {
      // Strictly 1: null, '', true, 0 or "on" never press a button.
      if (value !== PRESSED && value !== String(PRESSED)) {
        throw this.refusal(ERRORS.badButton);
      }
      written = command.toggle || command.trigger ? TRIGGER_VALUE : command.value;
    }
    if (!this.config.address) {
      throw this.refusal(ERRORS.noHost);
    }
    const plan = { role, command, written, expected };
    if (command.protective) {
      return this.protect(plan, received);
    }
    if (!this.config.allowCommands) {
      throw this.refusal(ERRORS.disabled);
    }
    if (this.inFlight) {
      throw this.refusal(ERRORS.busy);
    }
    const promise = this.command(plan, received);
    this.inFlight = promise;
    try {
      return await promise;
    } finally {
      if (this.inFlight === promise) {
        this.inFlight = undefined;
      }
    }
  }

  /** The values a command read or confirmed: in memory and to Gladys in the background. */
  noteValues(values, { fromCommand = false } = {}) {
    if (!this.shown || !this.unit.values) {
      return;
    }
    const plain = { ...values };
    delete plain.serial;
    delete plain.name;
    Object.assign(this.unit.values, plain);
    this.observe(plain, { fromCommand });
    this.queueValues(plain);
    // Shown in the background: the ack never waits for Gladys.
    this.flush().catch(() => {});
  }

  /** The object a command writes, and the keys whose read decides and confirms it. */
  target(command) {
    if (command.toggle) {
      const toggle = TOGGLES[command.toggle];
      return {
        object: TRIGGERS[toggle.trigger],
        reads: toggle.reads,
        guardKey: `toggle:${command.toggle}`,
      };
    }
    if (command.trigger) {
      return {
        object: TRIGGERS[command.trigger],
        reads: [command.confirmWith],
        guardKey: undefined,
      };
    }
    return { object: POINTS[command.point], reads: [command.point], guardKey: command.point };
  }

  /** The state a command looks at in `values`: undefined when unknown. */
  stateOf(command, values) {
    if (command.toggle) return TOGGLES[command.toggle].active(values);
    if (command.trigger) return values[command.confirmWith];
    return values[command.point];
  }

  confirmed(plan, values) {
    const { command } = plan;
    const state = this.stateOf(command, values);
    if (command.trigger) return command.confirm(state);
    return state !== undefined && equal(state, plan.expected);
  }

  async command(plan, received) {
    const { command } = plan;
    const generation = this.generation;
    const seq = this.protectSeq;
    const sendBy = received + TIMINGS.commandSendBy;
    const answerBy = received + TIMINGS.commandAnswerBy;
    const { object, reads, guardKey } = this.target(command);
    // The checks before the write, on the latest configuration.
    const check = () => {
      if (!this.config.allowCommands) {
        throw this.refusal(ERRORS.disabled);
      }
      if (generation !== this.generation || !this.config.address) {
        throw this.refusal(ERRORS.configChanged);
      }
      if (seq !== this.protectSeq) {
        throw this.refusal(ERRORS.protectMeanwhile);
      }
      if (this.unit.mismatch) {
        throw this.refusal(ERRORS.otherUnit);
      }
    };
    const state = { written: false };
    try {
      check();
      // The state just before acting, read now, never the one in memory, with the identity.
      const budget = Math.min(TIMINGS.commandReadMax, sendBy - TIMINGS.commandMinSend - this.now());
      if (budget < TIMINGS.commandMinRead) {
        throw this.refusal(ERRORS.tooSlow);
      }
      const keys = [
        ...new Set([
          'operationMode',
          'ventilationMode',
          ...(command.needsComfort ? ['comfort'] : []),
          ...reads,
        ]),
      ];
      let fresh;
      try {
        fresh = await this.readKeys(keys, { withDevice: true, timeoutMs: budget });
      } catch (err) {
        if (err.kind === ERROR_KINDS.ABORTED) {
          throw this.refusal(ERRORS.configChanged);
        }
        throw this.refusal(ERRORS.unknownState(errorReason(err)));
      }
      check();
      // Never a command to a unit whose identity is not known and checked.
      if (this.memory.serial === null) {
        throw this.refusal(ERRORS.identityNotLearnt);
      }
      if (fresh.serial === undefined) {
        throw this.refusal(ERRORS.identityUnknown);
      }
      if (fresh.serial !== this.memory.serial) {
        throw this.refusal(ERRORS.otherUnit);
      }
      // A fresh read of a command never reaffirms a protective command.
      this.noteValues(fresh, { fromCommand: true });
      if (command.mayStart) {
        if (fresh.operationMode === undefined || fresh.ventilationMode === undefined) {
          throw this.refusal(ERRORS.unknownState(word(ERRORS.unreadable, this.config.language)));
        }
        if (fresh.operationMode === 'off' || fresh.ventilationMode === 'stop') {
          throw this.refusal(ERRORS.unitOff);
        }
      }
      if (command.needsComfort) {
        if (fresh.comfort === undefined) {
          throw this.refusal(ERRORS.unknownState(word(ERRORS.unreadable, this.config.language)));
        }
        if (fresh.comfort === false) {
          throw this.refusal(ERRORS.comfortOff);
        }
      }
      const from = this.stateOf(command, fresh);
      if (!command.trigger && from === undefined) {
        throw this.refusal(ERRORS.unknownState(word(ERRORS.unreadable, this.config.language)));
      }
      if (command.toggle && this.guardActive(guardKey)) {
        // A trigger not seen yet: another one could undo it.
        throw this.refusal(ERRORS.togglePending);
      }
      if (!command.trigger && equal(from, plan.expected) && !this.guardActive(guardKey)) {
        this.logger.info(`Flexit: ${plan.role} already so, nothing sent`);
        return;
      }
      const started = Object.keys(STARTS_OF).find((t) => STARTS_OF[t].includes(plan.role));
      this.logger.info(`Flexit: ${plan.role}`);
      await this.write(object, plan.written, {
        timeoutMs: Math.max(100, answerBy - this.now() - TIMINGS.commandMinRead),
        startBy: sendBy,
        beforeSend: () => {
          // The option, the configuration, a protective command: checked right before the write.
          check();
          state.written = true;
          this.lastSentAt = this.now();
          this.sendCounter += 1;
          if (started) {
            state.previousMark = this.onSent[started];
            state.started = started;
            this.onSent[started] = this.sendCounter;
          }
          if (guardKey) {
            // Set before the bytes leave: a toggle is never sent twice blind.
            this.guards.set(guardKey, {
              from,
              expected: plan.expected,
              moved: false,
              until: this.now() + TIMINGS.guard,
            });
          }
        },
      });
      // Confirmed only by the state read back equal to the value asked.
      const left = answerBy - this.now();
      if (left < 50) {
        throw new UnitError(ERROR_KINDS.TIMEOUT, 'no time left to read back', { sent: true });
      }
      const back = await this.readKeys(reads, { timeoutMs: left });
      if (generation !== this.generation) {
        return;
      }
      if (!this.confirmed(plan, back)) {
        this.noteValues(back);
        throw new UnitError(ERROR_KINDS.PROTOCOL, 'read back differs', { sent: true });
      }
      if (guardKey) this.guards.delete(guardKey);
      this.noteValues(back);
      this.logger.info(`Flexit: ${plan.role} confirmed by the unit`);
    } catch (err) {
      throw this.commandError(err, plan, state, guardKey);
    }
  }

  /** The answer to Gladys of a command that did not end confirmed. */
  commandError(err, plan, state, guardKey) {
    if (err instanceof Refusal || err?.beforeSend) {
      return err;
    }
    const reason = errorReason(err);
    // Only the write says whether the command may have left (a read never does).
    if (!state.written) {
      this.logger.warn(`Flexit: command NOT sent (${plan.role}): ${reason}`);
      if (err?.kind === ERROR_KINDS.LATE) {
        return this.refusal(ERRORS.tooSlow);
      }
      if (err?.kind === ERROR_KINDS.ABORTED) {
        return this.refusal(ERRORS.configChanged);
      }
      return this.refusal(ERRORS.notSent(reason));
    }
    if (err?.kind === ERROR_KINDS.REFUSED) {
      // The unit got it and did not apply it: it does not count as sent.
      if (state.started && this.onSent[state.started] === this.sendCounter) {
        this.onSent[state.started] = state.previousMark;
      }
      if (guardKey) this.guards.delete(guardKey);
      this.logger.warn(`Flexit: command refused by the unit (${plan.role}): ${reason}`);
      return this.refusal(ERRORS.refused(err.detail ?? 'error'));
    }
    if (guardKey && !this.guards.has(guardKey)) {
      this.guards.set(guardKey, {
        from: undefined,
        expected: plan.expected,
        moved: true,
        until: this.now() + TIMINGS.guard,
      });
    }
    this.followUp();
    this.logger.warn(`Flexit: command sent, NOT confirmed (${plan.role}): ${reason}`);
    return this.refusal(ERRORS.sentUnconfirmed(reason));
  }

  // --- Protective commands ---------------------------------------------------------

  /** A second press while one of the same target runs joins it. */
  async protect(plan, received) {
    const target = plan.command.target;
    if (this.protecting.has(target)) {
      return this.protecting.get(target);
    }
    // Another unit identified at the address: never driven, not even a protective command
    // (before the first read, or with a serial unreadable, it goes).
    if (this.unit.mismatch) {
      throw this.refusal(ERRORS.otherUnit);
    }
    // A command not written yet gives way (checked right before its write).
    this.protectSeq += 1;
    const promise = plan.command.toggle
      ? this.stopToggle(plan, received)
      : this.sendStop(plan, received);
    this.protecting.set(target, promise);
    try {
      return await promise;
    } finally {
      if (this.protecting.get(target) === promise) {
        this.protecting.delete(target);
      }
    }
  }

  /**
   * Heater off, cooker hood off: one write, without a fresh read, never held
   * back; the present value read back confirms it.
   */
  async sendStop(plan, received) {
    const { command } = plan;
    const target = command.target;
    const answerBy = received + TIMINGS.commandAnswerBy;
    const state = { written: false, mark: undefined };
    this.logger.info(`Flexit: ${plan.role}`);
    try {
      await this.write(POINTS[command.point], plan.written, {
        timeoutMs: Math.min(
          TIMINGS.requestTimeout,
          Math.max(500, answerBy - this.now() - TIMINGS.commandMinRead),
        ),
        beforeSend: () => {
          state.written = true;
          this.sendCounter += 1;
          state.mark = this.sendCounter;
          this.lastSentAt = this.now();
        },
      });
      const back = await this.readKeys([command.point], {
        timeoutMs: Math.min(TIMINGS.requestTimeout, Math.max(300, answerBy - this.now())),
      });
      if (back[command.point] === plan.expected) {
        this.stopGuards.delete(target);
        this.noteValues(back);
        this.logger.info(`Flexit: ${plan.role} confirmed by the unit`);
        return;
      }
      this.noteValues(back);
      throw new UnitError(ERROR_KINDS.PROTOCOL, 'still on', { sent: true });
    } catch (err) {
      return this.stopFailed(plan, state, err);
    }
  }

  /** A protective command not confirmed: reaffirmed by the next reads, and the answer. */
  stopFailed(plan, state, err) {
    const reason = errorReason(err);
    this.keepStopGuard(plan.command.target, state.mark ?? this.sendCounter);
    this.followUp();
    this.logger.warn(`Flexit: ${plan.role} not confirmed (${reason})`);
    if (err instanceof Refusal) {
      throw err;
    }
    if (!state.written) {
      throw this.refusal(ERRORS.notSent(reason));
    }
    if (err?.kind === ERROR_KINDS.REFUSED) {
      throw this.refusal(ERRORS.refused(err.detail ?? 'error'));
    }
    throw this.refusal(ERRORS.sentUnconfirmed(reason));
  }

  /**
   * Fireplace stop: the trigger is a toggle, so it is written only when the
   * mode reads on (never blind); never held back by the option or another
   * command. A start sent and not seen yet: the stop waits for a read that
   * shows the mode on (stop guard).
   */
  async stopToggle(plan, received) {
    const { command } = plan;
    const sendBy = received + TIMINGS.commandSendBy;
    const answerBy = received + TIMINGS.commandAnswerBy;
    const toggle = TOGGLES[command.toggle];
    const guardKey = `toggle:${command.toggle}`;
    const state = { written: false, mark: undefined };
    this.logger.info(`Flexit: ${plan.role}`);
    try {
      let fresh;
      try {
        fresh = await this.readKeys(toggle.reads, {
          timeoutMs: Math.min(TIMINGS.commandReadMax, sendBy - TIMINGS.commandMinSend - this.now()),
        });
      } catch (err) {
        throw this.refusal(ERRORS.unknownState(errorReason(err)));
      }
      const active = toggle.active(fresh);
      if (active === undefined) {
        throw this.refusal(ERRORS.unknownState(word(ERRORS.unreadable, this.config.language)));
      }
      const pending = this.guardActive(guardKey) ? this.guards.get(guardKey) : undefined;
      if (!active) {
        if (pending?.expected === true) {
          throw this.refusal(ERRORS.stopDeferred);
        }
        this.stopGuards.delete(command.target);
        this.noteValues(fresh, { fromCommand: true });
        this.logger.info(`Flexit: ${plan.role} already so, nothing sent`);
        return;
      }
      if (pending?.expected === false) {
        // A stop sent and not seen yet: another trigger would start it again.
        throw this.refusal(ERRORS.togglePending);
      }
      await this.write(TRIGGERS[toggle.trigger], plan.written, {
        timeoutMs: Math.max(100, answerBy - this.now() - TIMINGS.commandMinRead),
        startBy: sendBy,
        beforeSend: () => {
          state.written = true;
          this.sendCounter += 1;
          state.mark = this.sendCounter;
          this.lastSentAt = this.now();
          this.guards.set(guardKey, {
            from: true,
            expected: false,
            moved: false,
            until: this.now() + TIMINGS.guard,
          });
        },
      });
      const back = await this.readKeys(toggle.reads, {
        timeoutMs: Math.max(50, answerBy - this.now()),
      });
      if (toggle.active(back) === false) {
        this.guards.delete(guardKey);
        this.stopGuards.delete(command.target);
        this.noteValues(back);
        this.logger.info(`Flexit: ${plan.role} confirmed by the unit`);
        return;
      }
      throw new UnitError(ERROR_KINDS.PROTOCOL, 'still on', { sent: true });
    } catch (err) {
      if (err?.kind === ERROR_KINDS.REFUSED && state.written) {
        this.guards.delete(guardKey);
      }
      return this.stopFailed(plan, state, err);
    }
  }

  keepStopGuard(target, mark) {
    const current = this.stopGuards.get(target);
    if (current && this.now() < current.until) {
      current.mark = Math.max(current.mark, mark);
      return;
    }
    this.stopGuards.set(target, { mark, until: this.now() + TIMINGS.stopGuard, reasserts: 0 });
  }

  // --- Guards --------------------------------------------------------------------

  guardActive(key) {
    if (key === undefined) return false;
    const guard = this.guards.get(key);
    if (guard && this.now() >= guard.until) {
      this.guards.delete(key);
      return false;
    }
    return Boolean(guard);
  }

  /**
   * A read through the guards: a guard lifts when the value moved from the
   * start state to the one asked (never on an unknown value); a protective
   * command not confirmed is sent again when its target shows on and no "on"
   * command of that target left after it.
   */
  observe(values, { fromCommand = false } = {}) {
    for (const key of [...this.guards.keys()]) {
      const value = key.startsWith('toggle:') ? TOGGLES[key.slice(7)].active(values) : values[key];
      if (!this.guardActive(key) || value === undefined) {
        continue;
      }
      const guard = this.guards.get(key);
      if (!equal(value, guard.from)) {
        guard.moved = true;
      }
      if (guard.moved && equal(value, guard.expected)) {
        this.guards.delete(key);
      }
    }
    for (const [target, stop] of [...this.stopGuards]) {
      if (this.now() >= stop.until || this.onSent[target] > stop.mark) {
        this.stopGuards.delete(target);
        continue;
      }
      const on = target === 'fireplace' ? TOGGLES.fireplace.active(values) : values[target];
      if (on === false) {
        this.stopGuards.delete(target);
        continue;
      }
      if (
        on !== true ||
        fromCommand ||
        this.protecting.has(target) ||
        this.reassertTimers.has(target) ||
        stop.reasserts >= TIMINGS.stopReasserts ||
        (target === 'fireplace' && this.guardActive('toggle:fireplace'))
      ) {
        continue;
      }
      stop.reasserts += 1;
      this.logger.warn(`Flexit: ${target} still on after a protective command, sent again`);
      const generation = this.generation;
      const role = STOP_ROLE[target];
      const handle = this.timers.setTimeout(() => {
        this.reassertTimers.delete(target);
        const current = this.stopGuards.get(target);
        if (
          generation !== this.generation ||
          !this.config.address ||
          !current ||
          this.onSent[target] > current.mark
        ) {
          return;
        }
        const command = COMMANDS[role];
        this.protect(
          {
            role,
            command,
            written: command.toggle ? TRIGGER_VALUE : command.value,
            expected: command.expected,
          },
          this.now(),
        ).catch((err) => this.logger.warn(`Flexit: ${role} reaffirmed: ${err.message}`));
      }, TIMINGS.reassertDelay);
      this.reassertTimers.set(target, handle);
    }
  }

  /**
   * Spaced reads after a command: its effect, then a check. One series
   * pending at a time (a scene pressing in a loop never multiplies them).
   */
  followUp() {
    const generation = this.generation;
    const u = this.unit;
    for (const handle of u.followUps) {
      this.timers.clearTimeout(handle);
    }
    u.followUps.clear();
    for (const delay of TIMINGS.followUps) {
      const handle = this.timers.setTimeout(() => {
        u.followUps.delete(handle);
        if (generation === this.generation) {
          Promise.resolve(u.running)
            .then(() => this.tick())
            .catch(() => this.logger.error('Flexit refresh failed'));
        }
      }, delay);
      u.followUps.add(handle);
    }
  }
}
