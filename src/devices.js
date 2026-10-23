// -----------------------------------------------------------------------------
// The unit -> one Gladys device and its states (pure).
//
// `ext:<selector>:flexit:unit`: one device per integration. FROZEN RULE: the
// device is keyed by the unit this integration drives, never by its IP
// address nor its serial number (a new address keeps the device and its
// history; a replaced unit is accepted on the same device by "Accept the unit
// at this address", pressed twice). The serial number, read from the BACnet
// Device object, is the identity checked at each read and before each
// command (src/app.js). The feature roles (the last part of their external
// ids) are published forever: never rename them. Every role is always built,
// so a republished device never loses a feature.
//
// No switch, no writable binary, no thermostat: a "turn everything off"
// (Google Home, Alexa, HomeKit, MCP, `switch.*` scenes) never reaches the
// ventilation. The commands are `text/select` features (ventilation mode,
// two air temperature setpoints) and `button/push` features; all are refused
// unless the configuration allows the commands, except the protective ones
// (heater off, cooker hood off, fireplace stop).
//
// Categories and units are those the core lists
// (DEVICE_FEATURE_UNITS_BY_CATEGORY): °C on temperature-sensor, % on
// humidity-sensor and fan, kW on energy-sensor/power, minutes and hours on
// duration. Fan speeds (rpm) and heat exchanger percentages have no unit in
// the core for their category: `unknown` sensors whose name says the unit.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { COMMANDS, FEATURES, SETPOINTS, WRITABLE_MODES } from './constants.js';
import { DEVICE_NAME, FEATURE_NAMES, MODE_NAMES, SETPOINT_NAME, word } from './i18n.js';

export const PLATFORM_ID = 'unit';

const sensor = (definition) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...definition,
});
const binary = sensor({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 });
const temperature = sensor({
  category: C.TEMPERATURE_SENSOR,
  type: T.SENSOR.DECIMAL,
  unit: U.CELSIUS,
  min: -60,
  max: 90,
});
const humidity = sensor({
  category: C.HUMIDITY_SENSOR,
  type: T.SENSOR.DECIMAL,
  unit: U.PERCENT,
  min: 0,
  max: 100,
});
const fan = sensor({ category: C.FAN, type: T.FAN.PERCENT, unit: U.PERCENT, min: 0, max: 100 });
const plain = (max) => sensor({ category: C.UNKNOWN, type: T.SENSOR.INTEGER, min: 0, max });
const minutes = sensor({
  category: C.DURATION,
  type: T.DURATION.INTEGER,
  unit: U.MINUTES,
  min: 0,
  max: 1_440,
});
const hours = sensor({
  category: C.DURATION,
  type: T.DURATION.INTEGER,
  unit: U.HOURS,
  min: 0,
  max: 200_000,
});
const select = {
  category: C.TEXT,
  type: T.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
};
const button = {
  category: C.BUTTON,
  type: T.BUTTON.PUSH,
  min: 0,
  max: 1,
  read_only: false,
  has_feedback: false,
  keep_history: false,
};

/** The features, by role, in display order. */
export const DEFINITIONS = {
  [FEATURES.OPERATION_MODE]: sensor({
    category: C.TEXT,
    type: T.TEXT.TEXT,
    min: 0,
    max: 0,
    keep_history: false,
  }),
  [FEATURES.VENTILATION_MODE]: select,
  [FEATURES.SETPOINT_HOME]: select,
  [FEATURES.SETPOINT_AWAY]: select,
  [FEATURES.COMFORT]: binary,
  [FEATURES.HEATER]: binary,
  [FEATURES.COOKER_HOOD]: binary,
  [FEATURES.FIREPLACE]: binary,
  [FEATURES.FILTER_POLLUTED]: binary,
  [FEATURES.TEMP_OUTDOOR]: temperature,
  [FEATURES.TEMP_SUPPLY]: temperature,
  [FEATURES.TEMP_EXTRACT]: temperature,
  [FEATURES.TEMP_EXHAUST]: temperature,
  [FEATURES.TEMP_ROOM]: temperature,
  [FEATURES.TEMP_SETPOINT_HOME]: temperature,
  [FEATURES.TEMP_SETPOINT_AWAY]: temperature,
  [FEATURES.HUMIDITY_EXTRACT]: humidity,
  [FEATURES.HUMIDITY_ROOM_1]: humidity,
  [FEATURES.HUMIDITY_ROOM_2]: humidity,
  [FEATURES.HUMIDITY_ROOM_3]: humidity,
  [FEATURES.SUPPLY_FAN]: fan,
  [FEATURES.EXHAUST_FAN]: fan,
  [FEATURES.SUPPLY_RPM]: plain(10_000),
  [FEATURES.EXHAUST_RPM]: plain(10_000),
  [FEATURES.EXCHANGER_SPEED]: plain(100),
  [FEATURES.EXCHANGER_EFFICIENCY]: plain(100),
  [FEATURES.HEATER_POWER]: sensor({
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.KILOWATT,
    min: 0,
    max: 30,
  }),
  [FEATURES.FIREPLACE_REMAINING]: minutes,
  [FEATURES.RAPID_REMAINING]: minutes,
  [FEATURES.FIREPLACE_RUNTIME]: minutes,
  [FEATURES.RAPID_RUNTIME]: minutes,
  [FEATURES.FILTER_HOURS]: hours,
  [FEATURES.FILTER_INTERVAL]: hours,
  [FEATURES.RAPID_START]: button,
  [FEATURES.FIREPLACE_START]: button,
  [FEATURES.FIREPLACE_STOP]: button,
  [FEATURES.COOKER_HOOD_ON]: button,
  [FEATURES.COOKER_HOOD_OFF]: button,
  [FEATURES.HEATER_ON]: button,
  [FEATURES.HEATER_OFF]: button,
  [FEATURES.COMFORT_ON]: button,
  [FEATURES.COMFORT_OFF]: button,
  [FEATURES.FILTER_RESET]: button,
};

export const ROLES = Object.keys(DEFINITIONS);

/** The value read for each numeric sensor role. */
const VALUE_OF = {
  [FEATURES.COMFORT]: 'comfort',
  [FEATURES.HEATER]: 'heater',
  [FEATURES.COOKER_HOOD]: 'cookerHood',
  [FEATURES.FIREPLACE]: 'fireplace',
  [FEATURES.FILTER_POLLUTED]: 'filterPolluted',
  [FEATURES.TEMP_OUTDOOR]: 'outdoor',
  [FEATURES.TEMP_SUPPLY]: 'supply',
  [FEATURES.TEMP_EXTRACT]: 'extract',
  [FEATURES.TEMP_EXHAUST]: 'exhaust',
  [FEATURES.TEMP_ROOM]: 'room',
  [FEATURES.TEMP_SETPOINT_HOME]: 'setpointHome',
  [FEATURES.TEMP_SETPOINT_AWAY]: 'setpointAway',
  [FEATURES.HUMIDITY_EXTRACT]: 'humidityExtract',
  [FEATURES.HUMIDITY_ROOM_1]: 'humidityRoom1',
  [FEATURES.HUMIDITY_ROOM_2]: 'humidityRoom2',
  [FEATURES.HUMIDITY_ROOM_3]: 'humidityRoom3',
  [FEATURES.SUPPLY_FAN]: 'supplyFan',
  [FEATURES.EXHAUST_FAN]: 'exhaustFan',
  [FEATURES.SUPPLY_RPM]: 'supplyRpm',
  [FEATURES.EXHAUST_RPM]: 'exhaustRpm',
  [FEATURES.EXCHANGER_SPEED]: 'exchangerSpeed',
  [FEATURES.EXCHANGER_EFFICIENCY]: 'exchangerEfficiency',
  [FEATURES.HEATER_POWER]: 'heaterPower',
  [FEATURES.FIREPLACE_REMAINING]: 'fireplaceRemaining',
  [FEATURES.RAPID_REMAINING]: 'rapidRemaining',
  [FEATURES.FIREPLACE_RUNTIME]: 'fireplaceRuntime',
  [FEATURES.RAPID_RUNTIME]: 'rapidRuntime',
  [FEATURES.FILTER_HOURS]: 'filterHours',
  [FEATURES.FILTER_INTERVAL]: 'filterInterval',
};

export const unitIds = (gladys) => gladys.externalIds('flexit', PLATFORM_ID);

/** The role of one of our feature external ids, else undefined. */
export function parseFeatureId(externalId) {
  if (typeof externalId !== 'string') {
    return undefined;
  }
  const match = new RegExp(`:flexit:${PLATFORM_ID}:([a-z0-9-]+)$`).exec(externalId);
  return match && ROLES.includes(match[1]) ? match[1] : undefined;
}

const options = (values, label, language) =>
  values.map((value, index) => ({
    value,
    label: word(label(value), language),
    sort_order: index,
  }));

/** The Gladys device of the unit. */
export function buildDevice(gladys, { language }) {
  const ids = unitIds(gladys);
  const modes = Object.keys(WRITABLE_MODES);
  return {
    name: word(DEVICE_NAME, language),
    external_id: ids.device,
    model: 'Flexit Nordic (BACnet)',
    should_poll: false,
    features: ROLES.map((role) => ({
      name: word(FEATURE_NAMES[role], language),
      external_id: ids.feature(role),
      ...DEFINITIONS[role],
      ...(role === FEATURES.VENTILATION_MODE
        ? { supported_options: options(modes, (m) => MODE_NAMES[m], language) }
        : {}),
      ...(role === FEATURES.SETPOINT_HOME || role === FEATURES.SETPOINT_AWAY
        ? { supported_options: options(SETPOINTS, SETPOINT_NAME, language) }
        : {}),
    })),
    params: [{ name: 'protocol', value: 'BACnet/IP UDP 47808' }],
  };
}

/** Whether a role is a command, and which. */
export const commandOf = (role) => (Object.hasOwn(COMMANDS, role) ? COMMANDS[role] : undefined);

/** The option of a setpoint select matching a value read, else undefined. */
const setpointOption = (value) =>
  Number.isFinite(value) ? SETPOINTS.find((s) => Math.abs(Number(s) - value) < 0.01) : undefined;

/**
 * The states of the values read this time (a value not read is left out:
 * Gladys keeps its last one, never republished as new). A value outside the
 * bounds of its feature is dropped.
 */
export function deviceStates(ids, values) {
  const states = [];
  const text = (role, value) =>
    states.push({ device_feature_external_id: ids.feature(role), text: value });
  if (typeof values.operationMode === 'string') {
    text(FEATURES.OPERATION_MODE, values.operationMode);
  }
  // The lists only show their options: "stop" (read) changes nothing there.
  if (Object.hasOwn(WRITABLE_MODES, values.ventilationMode ?? '')) {
    text(FEATURES.VENTILATION_MODE, values.ventilationMode);
  }
  const home = setpointOption(values.setpointHome);
  if (home) text(FEATURES.SETPOINT_HOME, home);
  const away = setpointOption(values.setpointAway);
  if (away) text(FEATURES.SETPOINT_AWAY, away);
  for (const [role, key] of Object.entries(VALUE_OF)) {
    let value = values[key];
    if (typeof value === 'boolean') value = value ? 1 : 0;
    const { min, max } = DEFINITIONS[role];
    if (Number.isFinite(value) && value >= min && value <= max) {
      states.push({ device_feature_external_id: ids.feature(role), state: value });
    }
  }
  return states;
}
