// -----------------------------------------------------------------------------
// Flexit Nordic constants: the BACnet objects read and written, manifest keys,
// feature roles, limits and timings.
//
// Flexit Nordic units (S2, S3, S4, CL2, CL3, CL4, KS3) answer BACnet/IP on
// UDP port 47808 of their local network, without authentication. The objects
// below are those of flexit_bacnet (MIT, 2.2.3, the library of Home
// Assistant's Flexit Nordic integration), itself based on the list of BACnet
// objects Flexit publishes ("BACnet Nordic Basic"). No other object is ever
// read or written.
// -----------------------------------------------------------------------------

export const DEFAULT_PORT = 47808;

/** The BACnet device instance of a Flexit Nordic unit unless changed (Home Assistant's default). */
export const DEFAULT_DEVICE_ID = 2;
export const MAX_DEVICE_ID = 4_194_302;
/** The wildcard Device instance (ASHRAE 135): a unit answers it with its own Device object. */
export const WILDCARD_DEVICE_ID = 4_194_303;

/** BACnet object types (ASHRAE 135). */
export const OBJECT_TYPES = {
  ANALOG_INPUT: 0,
  ANALOG_OUTPUT: 1,
  ANALOG_VALUE: 2,
  BINARY_VALUE: 5,
  DEVICE: 8,
  MULTI_STATE_VALUE: 19,
  POSITIVE_INTEGER_VALUE: 48,
};

/** BACnet property identifiers. */
export const PROPERTIES = {
  DESCRIPTION: 28,
  OBJECT_NAME: 77,
  PRESENT_VALUE: 85,
};

const { ANALOG_INPUT: AI, ANALOG_OUTPUT: AO, ANALOG_VALUE: AV } = OBJECT_TYPES;
const { BINARY_VALUE: BV, MULTI_STATE_VALUE: MSV, POSITIVE_INTEGER_VALUE: PIV } = OBJECT_TYPES;

const point = (type, instance, decode, extra = {}) => ({ type, instance, decode, ...extra });

/**
 * The objects read (present value), by key. `decode` names the plausibility
 * rule of src/bacnet/values.js; `priority` is the BACnet write priority
 * flexit_bacnet uses for that object (13), when it is written.
 */
export const POINTS = {
  // The state of the unit.
  operationMode: point(MSV, 361, 'operationMode'),
  ventilationMode: point(MSV, 42, 'ventilationMode', { priority: 13 }),
  comfort: point(BV, 50, 'bit', { priority: 13 }),
  heater: point(BV, 445, 'bit'),
  cookerHood: point(BV, 402, 'bit', { priority: 13 }),
  fireplace: point(BV, 400, 'bit'),
  fireplaceRemaining: point(AV, 2038, 'minutes'),
  rapidRemaining: point(AV, 2031, 'minutes'),
  filterPolluted: point(BV, 522, 'bit'),
  setpointHome: point(AV, 1994, 'setpoint'),
  setpointAway: point(AV, 1985, 'setpoint'),
  // Measures.
  outdoor: point(AI, 1, 'temperature'),
  supply: point(AI, 4, 'temperature'),
  exhaust: point(AI, 11, 'temperature'),
  extract: point(AI, 59, 'temperature'),
  extractAlt: point(AI, 95, 'temperature'),
  room: point(AI, 75, 'temperature'),
  humidityExtract: point(AI, 96, 'humidity'),
  humidityRoom1: point(AV, 2093, 'roomHumidity'),
  humidityRoom2: point(AV, 2094, 'roomHumidity'),
  humidityRoom3: point(AV, 2095, 'roomHumidity'),
  supplyRpm: point(AI, 5, 'rpm'),
  exhaustRpm: point(AI, 12, 'rpm'),
  supplyFan: point(AO, 3, 'percent'),
  exhaustFan: point(AO, 4, 'percent'),
  exchangerSpeed: point(AO, 0, 'percent'),
  exchangerEfficiency: point(AV, 2023, 'percent'),
  // Slower values.
  heaterPower: point(AV, 194, 'kilowatt'),
  filterHours: point(AV, 285, 'hours'),
  filterInterval: point(AV, 286, 'hours'),
  fireplaceRuntime: point(PIV, 270, 'minutes'),
  rapidRuntime: point(PIV, 293, 'minutes'),
};

/** Objects only ever written (a trigger, value 2), never read. */
export const TRIGGERS = {
  fireplace: point(MSV, 360, 'none'),
  rapid: point(MSV, 357, 'none'),
  filterReset: point(MSV, 613, 'none'),
};
export const TRIGGER_VALUE = 2;

/**
 * The reads of a poll, one ReadPropertyMultiple each (answers well under one
 * BACnet frame, never segmented). The first one also reads the identity of the
 * unit (its Device object); when it fails, the read fails; when another one
 * fails, its values are unknown this time.
 */
export const READ_GROUPS = [
  [
    'operationMode',
    'ventilationMode',
    'comfort',
    'heater',
    'cookerHood',
    'fireplace',
    'fireplaceRemaining',
    'rapidRemaining',
    'filterPolluted',
    'setpointHome',
    'setpointAway',
  ],
  [
    'outdoor',
    'supply',
    'exhaust',
    'extract',
    'extractAlt',
    'room',
    'humidityExtract',
    'humidityRoom1',
    'humidityRoom2',
    'humidityRoom3',
    'supplyRpm',
    'exhaustRpm',
    'supplyFan',
    'exhaustFan',
    'exchangerSpeed',
    'exchangerEfficiency',
  ],
  ['heaterPower', 'filterHours', 'filterInterval', 'fireplaceRuntime', 'rapidRuntime'],
];

/** Operation mode (MSV 361, read only), by value. */
export const OPERATION_MODES = {
  1: 'off',
  2: 'away',
  3: 'home',
  4: 'high',
  5: 'cooker-hood',
  6: 'fireplace',
  7: 'temporary-high',
};

/** Ventilation mode (MSV 42), by value; `stop` (1) is read, never written. */
export const VENTILATION_MODES = { 1: 'stop', 2: 'away', 3: 'home', 4: 'high' };
/** The ventilation modes Gladys may write. */
export const WRITABLE_MODES = { away: 2, home: 3, high: 4 };

/** Air temperature setpoints offered: 10 to 30 °C by 0.5 (Home Assistant's range and step). */
export const SETPOINTS = Array.from({ length: 41 }, (_, i) => (10 + i / 2).toFixed(1));

/** Device names (object name of the Device object) and models (first six digits of the serial). */
export const DEVICE_NAMES = { HvacFnct21y_A: 'Flexit Nordic' };
export const NORDIC_MODELS = {
  800111: 'S2 REL',
  800121: 'S3 REL',
  800110: 'S2 RER',
  800120: 'S3 RER',
  800221: 'CL4 REL',
  800220: 'CL4 RER',
  800130: 'S4 RER',
  800131: 'S4 REL',
  800210: 'CL2 RER',
  800211: 'CL2 REL',
  800200: 'CL3 RER',
  800201: 'CL3 REL',
  800300: 'KS3 RER',
  800301: 'KS3 REL',
};

/** Feature roles (the last part of the feature external ids): frozen. */
export const FEATURES = {
  OPERATION_MODE: 'operation-mode',
  VENTILATION_MODE: 'ventilation-mode',
  SETPOINT_HOME: 'setpoint-home',
  SETPOINT_AWAY: 'setpoint-away',
  COMFORT: 'comfort',
  HEATER: 'electric-heater',
  COOKER_HOOD: 'cooker-hood',
  FIREPLACE: 'fireplace',
  FILTER_POLLUTED: 'filter-polluted',
  TEMP_OUTDOOR: 'temperature-outdoor',
  TEMP_SUPPLY: 'temperature-supply',
  TEMP_EXTRACT: 'temperature-extract',
  TEMP_EXHAUST: 'temperature-exhaust',
  TEMP_ROOM: 'temperature-room',
  TEMP_SETPOINT_HOME: 'temperature-setpoint-home',
  TEMP_SETPOINT_AWAY: 'temperature-setpoint-away',
  HUMIDITY_EXTRACT: 'humidity-extract',
  HUMIDITY_ROOM_1: 'humidity-room-1',
  HUMIDITY_ROOM_2: 'humidity-room-2',
  HUMIDITY_ROOM_3: 'humidity-room-3',
  SUPPLY_FAN: 'fan-supply',
  EXHAUST_FAN: 'fan-exhaust',
  SUPPLY_RPM: 'fan-supply-rpm',
  EXHAUST_RPM: 'fan-exhaust-rpm',
  EXCHANGER_SPEED: 'heat-exchanger-speed',
  EXCHANGER_EFFICIENCY: 'heat-exchanger-efficiency',
  HEATER_POWER: 'electric-heater-power',
  FIREPLACE_REMAINING: 'fireplace-remaining',
  RAPID_REMAINING: 'rapid-ventilation-remaining',
  FIREPLACE_RUNTIME: 'fireplace-runtime',
  RAPID_RUNTIME: 'rapid-ventilation-runtime',
  FILTER_HOURS: 'filter-operating-time',
  FILTER_INTERVAL: 'filter-exchange-interval',
  RAPID_START: 'rapid-ventilation-start',
  FIREPLACE_START: 'fireplace-start',
  FIREPLACE_STOP: 'fireplace-stop',
  COOKER_HOOD_ON: 'cooker-hood-on',
  COOKER_HOOD_OFF: 'cooker-hood-off',
  HEATER_ON: 'electric-heater-on',
  HEATER_OFF: 'electric-heater-off',
  COMFORT_ON: 'comfort-on',
  COMFORT_OFF: 'comfort-off',
  FILTER_RESET: 'filter-reset',
};

const isFireplace = (v) =>
  v.fireplace === undefined && v.operationMode === undefined
    ? undefined
    : v.fireplace === true || v.operationMode === 'fireplace';
const isRapid = (v) =>
  v.rapidRemaining === undefined && v.operationMode === undefined
    ? undefined
    : (v.rapidRemaining ?? 0) > 0 || v.operationMode === 'temporary-high';

/**
 * Toggles: a trigger object whose write flips a mode (Home Assistant notes
 * that the fireplace trigger "acts as a toggle"; the rapid ventilation trigger
 * is treated the same way). `active(values)` reads the state from the objects
 * of `reads`, undefined when unknown.
 */
export const TOGGLES = {
  fireplace: { trigger: 'fireplace', reads: ['fireplace', 'operationMode'], active: isFireplace },
  rapid: { trigger: 'rapid', reads: ['rapidRemaining', 'operationMode'], active: isRapid },
};

/**
 * The commands, by feature role.
 *   - `point` + `value`: an absolute write of that object, confirmed by its
 *     present value read back equal to `expected`;
 *   - `values` (selects): the value written for each option;
 *   - `toggle` + `expected`: a trigger written only when the state read just
 *     before is not `expected`, confirmed by the state read back;
 *   - `trigger`: a one-shot trigger, confirmed by `confirm(values)`;
 *   - `mayStart`: may start the fans or the heater: refused on a unit
 *     stopped (operation mode off, ventilation mode stop);
 *   - `protective` + `target`: never held back by the option, another
 *     command, a failed read or a backoff (turning the heater or the cooker
 *     hood off, stopping the fireplace mode).
 */
export const COMMANDS = {
  [FEATURES.VENTILATION_MODE]: {
    point: 'ventilationMode',
    values: WRITABLE_MODES,
    mayStart: true,
    // The ventilation mode only applies while the comfort button is on (flexit_bacnet).
    needsComfort: true,
  },
  [FEATURES.SETPOINT_HOME]: {
    point: 'setpointHome',
    values: Object.fromEntries(SETPOINTS.map((s) => [s, Number(s)])),
  },
  [FEATURES.SETPOINT_AWAY]: {
    point: 'setpointAway',
    values: Object.fromEntries(SETPOINTS.map((s) => [s, Number(s)])),
  },
  [FEATURES.RAPID_START]: { toggle: 'rapid', expected: true, mayStart: true },
  [FEATURES.FIREPLACE_START]: { toggle: 'fireplace', expected: true, mayStart: true },
  [FEATURES.FIREPLACE_STOP]: {
    toggle: 'fireplace',
    expected: false,
    protective: true,
    target: 'fireplace',
  },
  [FEATURES.COOKER_HOOD_ON]: { point: 'cookerHood', value: 1, expected: true, mayStart: true },
  [FEATURES.COOKER_HOOD_OFF]: {
    point: 'cookerHood',
    value: 0,
    expected: false,
    protective: true,
    target: 'cookerHood',
  },
  [FEATURES.HEATER_ON]: { point: 'heater', value: 1, expected: true, mayStart: true },
  [FEATURES.HEATER_OFF]: {
    point: 'heater',
    value: 0,
    expected: false,
    protective: true,
    target: 'heater',
  },
  [FEATURES.COMFORT_ON]: { point: 'comfort', value: 1, expected: true, mayStart: true },
  // Comfort off overrides the ventilation mode (Stop included): the unit goes Away after its delay.
  [FEATURES.COMFORT_OFF]: { point: 'comfort', value: 0, expected: false, mayStart: true },
  [FEATURES.FILTER_RESET]: {
    trigger: 'filterReset',
    confirmWith: 'filterHours',
    confirm: (hours) => Number.isFinite(hours) && hours < 1,
  },
};

/** The "on" command whose sending lifts the stop guard of each protective target. */
export const STARTS_OF = {
  heater: [FEATURES.HEATER_ON],
  cookerHood: [FEATURES.COOKER_HOOD_ON],
  fireplace: [FEATURES.FIREPLACE_START],
};

/** The value of a button press (Gladys sends 1). */
export const PRESSED = 1;

export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  ACCEPT_UNIT: 'accept_unit',
};

/** The poll interval of the configuration, in seconds. */
export const POLL_INTERVAL = {
  min: 30,
  max: 3600,
  default: 60,
};

export const LIMITS = {
  /** Gladys: 300 states per minute for the whole integration. */
  statesPerMinute: 300,
  statesPerRequest: 100,
  /** A BACnet/IP datagram is at most 1497 bytes; anything longer is dropped unread. */
  datagramMax: 1497,
  /** A character string longer than this is unknown (a serial is 13 characters). */
  stringMax: 64,
};

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export const TIMINGS = {
  /** One answer to one request of a poll (flexit_bacnet waits 1 s). */
  requestTimeout: 1_500,
  /** Failed reads: 30 s, 1, 2, then 5 minutes, never shorter than the interval. */
  backoff: [30 * SECOND, MINUTE, 2 * MINUTE, 5 * MINUTE],
  /** The time of the last read goes to /data at most once a minute. */
  attemptWriteEvery: MINUTE,
  /** The publisher sends what is pending every second; unchanged states again every 30 min. */
  flushInterval: SECOND,
  stateHeartbeat: 30 * MINUTE,
  /**
   * Commands (Gladys waits 5 s for the ack): the fresh read and the write
   * must be done by 3.5 s after the click, or the command is refused unsent;
   * the read back that confirms it is awaited until 4.3 s, after which the
   * command is "sent, without confirmation".
   */
  commandSendBy: 3_500,
  commandAnswerBy: 4_300,
  /** The fresh read of a command: 1.5 s at most; 0.3 s at least left to send after it. */
  commandReadMax: 1_500,
  commandMinRead: 300,
  commandMinSend: 300,
  /** Reads after a command not confirmed, spaced: its effect, then a check. */
  followUps: [5 * SECOND, 20 * SECOND],
  /** A sent command keeps its guard until a read shows what it asked, or 90 s. */
  guard: 90 * SECOND,
  /** A protective command not confirmed is reaffirmed by the reads of the next 2 minutes, twice at most. */
  stopGuard: 2 * MINUTE,
  stopReasserts: 2,
  /** A reaffirmation leaves this long after the read that saw the target still on. */
  reassertDelay: SECOND,
  /** The second press of "Accept the unit" must come within this time. */
  acceptWindow: 2 * MINUTE,
};
