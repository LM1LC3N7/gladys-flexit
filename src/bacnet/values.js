// -----------------------------------------------------------------------------
// The values read, made plain and plausible (pure): an object that answered
// an access error, an unexpected type or an implausible value is unknown
// (undefined), never 0. Roundings follow flexit_bacnet.
// -----------------------------------------------------------------------------

import {
  DEVICE_NAMES,
  NORDIC_MODELS,
  OBJECT_TYPES,
  OPERATION_MODES,
  POINTS,
  PROPERTIES,
  VENTILATION_MODES,
  WILDCARD_DEVICE_ID,
} from '../constants.js';
import { objectKey } from './protocol.js';

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const number = (raw, min, max, digits) =>
  typeof raw === 'number' && within(raw, min, max) ? round(raw, digits) : undefined;
const enumOf = (table) => (raw) =>
  Number.isInteger(raw) && Object.hasOwn(table, raw) ? table[raw] : undefined;

const DECODERS = {
  operationMode: enumOf(OPERATION_MODES),
  ventilationMode: enumOf(VENTILATION_MODES),
  bit: (raw) => (raw === 1 || raw === true ? true : raw === 0 || raw === false ? false : undefined),
  temperature: (raw) => number(raw, -60, 90, 1),
  setpoint: (raw) => number(raw, 5, 40, 1),
  humidity: (raw) => number(raw, 0, 100, 1),
  // A room humidity sensor (CI77) that is not installed: 0 is never a reading.
  roomHumidity: (raw) => (raw === 0 ? undefined : number(raw, 0, 100, 1)),
  percent: (raw) => number(raw, 0, 100, 0),
  rpm: (raw) => number(raw, 0, 10_000, 0),
  kilowatt: (raw) => number(raw, 0, 30, 3),
  minutes: (raw) => number(raw, 0, 1_440, 0),
  hours: (raw) => number(raw, 0, 200_000, 0),
};

/** The Device object of the unit (its name and its serial number). */
export const deviceSpec = (deviceId) => ({
  type: OBJECT_TYPES.DEVICE,
  instance: deviceId,
  properties: [PROPERTIES.OBJECT_NAME, PROPERTIES.DESCRIPTION],
});

/** The Device objects asked with a poll or a command: the wildcard instance, and the configured one. */
export const deviceSpecs = (deviceId) =>
  deviceId === WILDCARD_DEVICE_ID
    ? [deviceSpec(deviceId)]
    : [deviceSpec(WILDCARD_DEVICE_ID), deviceSpec(deviceId)];

export const pointSpec = (key) => ({ type: POINTS[key].type, instance: POINTS[key].instance });

/**
 * The plain values of the `keys` read in one answer (a key that is not there
 * or not plausible is left out), with the identity when the Device object was
 * read: `serial` (string, else undefined), `name`.
 */
export function plainValues(objects, keys, withDevice = false) {
  const values = {};
  for (const key of keys) {
    const raw = objects.get(objectKey(POINTS[key]))?.get(PROPERTIES.PRESENT_VALUE);
    const value = DECODERS[POINTS[key].decode](raw);
    if (value !== undefined) {
      values[key] = value;
    }
  }
  // Some models keep the extract air temperature on AI 95 (flexit_bacnet reads it when AI 59 is 0).
  if (keys.includes('extract') && values.extract === 0 && values.extractAlt !== undefined) {
    values.extract = values.extractAlt;
  }
  delete values.extractAlt;
  if (withDevice) {
    // The Device object, asked by the wildcard instance and by the configured one: whatever
    // instance it answers with. Two different serials in one answer: unknown.
    const serials = new Set();
    for (const [key, device] of objects) {
      if (!key.startsWith(`${OBJECT_TYPES.DEVICE}:`)) continue;
      const serial = device.get(PROPERTIES.DESCRIPTION);
      const name = device.get(PROPERTIES.OBJECT_NAME);
      if (typeof serial === 'string' && /^[\w.-]{1,40}$/.test(serial.trim())) {
        serials.add(serial.trim());
      }
      if (typeof name === 'string' && values.name === undefined) {
        values.name = name;
      }
    }
    if (serials.size === 1) {
      [values.serial] = serials;
    }
  }
  return values;
}

/** The model from the first six digits of the serial (flexit_bacnet's table), else undefined. */
export function modelOf(serial) {
  const prefix = /^(\d{6})/.exec(serial ?? '')?.[1];
  return prefix && Object.hasOwn(NORDIC_MODELS, prefix) ? NORDIC_MODELS[prefix] : undefined;
}

export const knownName = (name) =>
  typeof name === 'string' && Object.hasOwn(DEVICE_NAMES, name) ? DEVICE_NAMES[name] : undefined;
