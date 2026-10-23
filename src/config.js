// -----------------------------------------------------------------------------
// The configuration: the manifest `config_schema` values, normalized so the
// rest of the code never deals with strings typed in a form. No secret: the
// BACnet interface of the unit has no password.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';
import { DEFAULT_DEVICE_ID, DEFAULT_PORT, MAX_DEVICE_ID, POLL_INTERVAL } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULT_CONFIG = {
  host: '',
  device_id: DEFAULT_DEVICE_ID,
  allow_commands: false,
  poll_interval: POLL_INTERVAL.default,
  language: 'fr',
};

/**
 * The address of the unit typed by the user: an IPv4 address, with an
 * optional port (47808 otherwise). No host name: the answer must come from
 * the very address asked, fixed for the whole run.
 * @returns {{ host: string, port: number } | undefined} undefined when invalid or empty.
 */
export function parseAddress(raw) {
  const text = String(raw ?? '').trim();
  if (text === '' || text.length > 21) {
    return undefined;
  }
  const match = text.match(/^([\d.]+)(?::(\d{1,5}))?$/);
  if (!match || isIP(match[1]) !== 4) {
    return undefined;
  }
  const port = match[2] === undefined ? DEFAULT_PORT : Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  return { host: match[1], port };
}

export const addressKey = ({ host, port }) => (port === DEFAULT_PORT ? host : `${host}:${port}`);

/** A text without control characters (each becomes "?"). */
// eslint-disable-next-line no-control-regex
const printable = (text) => text.replace(/[\u0000-\u001f\u007f]/g, '?');

/** Only `true` (or the text "true") allows: anything else, missing included, refuses. */
const strictTrue = (value) => value === true || value === 'true';

/** The BACnet device instance: an integer 0..4194302, else undefined. */
function deviceId(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,7}$/.test(text)) {
    return undefined;
  }
  const value = Number(text);
  return value <= MAX_DEVICE_ID ? value : undefined;
}

export function normalizeConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (Object.hasOwn(DEFAULT_CONFIG, key) && value != null) {
      c[key] = value;
    }
  }
  const typed = typeof c.host === 'string' ? c.host.trim() : '';
  const address = parseAddress(typed);
  const id = deviceId(c.device_id);
  const interval = Number(c.poll_interval);
  let invalid;
  if (typed !== '' && !address) {
    invalid = printable(typed.slice(0, 60));
  } else if (address && id === undefined) {
    invalid = `device id ${printable(String(c.device_id).slice(0, 20))}`;
  }
  return {
    address: address && id !== undefined ? address : undefined,
    deviceId: id ?? DEFAULT_DEVICE_ID,
    /** What was typed, when it is not valid (shown in the status, without control characters). */
    invalid,
    allowCommands: strictTrue(c.allow_commands),
    pollInterval:
      Number.isFinite(interval) && String(c.poll_interval).trim() !== ''
        ? Math.min(POLL_INTERVAL.max, Math.max(POLL_INTERVAL.min, Math.round(interval)))
        : POLL_INTERVAL.default,
    language: c.language === 'en' ? 'en' : 'fr',
  };
}
