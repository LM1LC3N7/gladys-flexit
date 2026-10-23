// -----------------------------------------------------------------------------
// BACnet/IP frames (pure): the two services flexit_bacnet uses,
// ReadPropertyMultiple and WriteProperty, encoded as it encodes them, and the
// answers decoded in one linear pass with every length checked against the
// datagram (an answer is hostile: never trusted, never logged).
//
// Frame: BVLC (0x81, 0x0A original-unicast, length) + NPDU (version 1,
// "expecting reply") + APDU (confirmed request: segmented answer accepted, at
// most 4 segments of 1024 bytes, invoke id, service). The reads of a poll are
// split so that an answer never needs segmenting; a segmented answer is
// refused. Unlike flexit_bacnet (a fixed invoke id 1), each request has its own
// invoke id and the answer must carry it.
// -----------------------------------------------------------------------------

import { LIMITS, OBJECT_TYPES, PROPERTIES } from '../constants.js';

const BVLC_TYPE = 0x81;
const BVLC_UNICAST = 0x0a;
const NPDU = [0x01, 0x04];

const PDU = { CONFIRMED: 0, SIMPLE_ACK: 2, COMPLEX_ACK: 3, ERROR: 5, REJECT: 6, ABORT: 7 };
export const SERVICES = { READ_PROPERTY_MULTIPLE: 14, WRITE_PROPERTY: 15 };

/** Segmented answer accepted (as flexit_bacnet), 4 segments, 1024-byte APDU. */
const CONFIRMED_HEADER = [(PDU.CONFIRMED << 4) | 0x02, (4 << 4) | 4];

export class BacnetError extends Error {
  /**
   * `refused`: the unit answered with an Error, a Reject or an Abort (it got
   * the request and did not apply it). Otherwise the answer is unreadable.
   */
  constructor(message, { refused = false, detail } = {}) {
    super(message);
    this.refused = refused;
    this.detail = detail;
  }
}

const objectId = (type, instance) => {
  const bytes = Buffer.alloc(5);
  bytes[0] = 0x0c; // context tag 0, length 4
  bytes.writeUInt32BE(((type << 22) | instance) >>> 0, 1);
  return bytes;
};

const frame = (apdu) => {
  const length = 4 + NPDU.length + apdu.length;
  const head = Buffer.from([BVLC_TYPE, BVLC_UNICAST, length >> 8, length & 0xff, ...NPDU]);
  return Buffer.concat([head, apdu]);
};

/**
 * A ReadPropertyMultiple of `specs` = [{ type, instance, properties: [id] }].
 */
export function readPropertyMultiple(invokeId, specs) {
  const parts = [
    Buffer.from([...CONFIRMED_HEADER, invokeId & 0xff, SERVICES.READ_PROPERTY_MULTIPLE]),
  ];
  for (const { type, instance, properties = [PROPERTIES.PRESENT_VALUE] } of specs) {
    parts.push(objectId(type, instance), Buffer.from([0x1e]));
    for (const property of properties) {
      parts.push(Buffer.from([0x09, property]));
    }
    parts.push(Buffer.from([0x1f]));
  }
  return frame(Buffer.concat(parts));
}

/**
 * A WriteProperty of the present value: a REAL for an analog value, an
 * ENUMERATED for a binary value, an UNSIGNED otherwise (as flexit_bacnet),
 * with the object's priority when it has one.
 */
export function writeProperty(invokeId, { type, instance, priority }, value) {
  let encoded;
  if (type === OBJECT_TYPES.ANALOG_VALUE) {
    encoded = Buffer.alloc(5);
    encoded[0] = 0x44; // application tag 4 (REAL), length 4
    encoded.writeFloatBE(value, 1);
  } else if (type === OBJECT_TYPES.BINARY_VALUE) {
    encoded = Buffer.from([0x91, value & 0xff]); // ENUMERATED, length 1
  } else if (value <= 0xff) {
    encoded = Buffer.from([0x21, value]); // UNSIGNED, length 1
  } else {
    encoded = Buffer.from([0x22, value >> 8, value & 0xff]);
  }
  const parts = [
    Buffer.from([...CONFIRMED_HEADER, invokeId & 0xff, SERVICES.WRITE_PROPERTY]),
    objectId(type, instance),
    Buffer.from([0x19, PROPERTIES.PRESENT_VALUE, 0x3e]),
    encoded,
    Buffer.from([0x3f]),
  ];
  if (priority !== undefined) {
    parts.push(Buffer.from([0x49, priority]));
  }
  return frame(Buffer.concat(parts));
}

/** A cursor over the bytes of one answer: every read is checked against the end. */
class Reader {
  constructor(bytes, offset = 0) {
    this.bytes = bytes;
    this.i = offset;
  }

  get eof() {
    return this.i >= this.bytes.length;
  }

  byte() {
    if (this.i >= this.bytes.length) throw new BacnetError('truncated answer');
    return this.bytes[this.i++];
  }

  take(n) {
    if (n < 0 || this.i + n > this.bytes.length) throw new BacnetError('truncated answer');
    const out = this.bytes.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }

  unsigned(n) {
    if (n < 1 || n > 4) throw new BacnetError('bad integer length');
    let value = 0;
    for (const b of this.take(n)) value = value * 256 + b;
    return value;
  }

  /** One tag: { number, context, lvt, open, close }; `length` for a primitive one. */
  tag() {
    const first = this.byte();
    let number = first >> 4;
    if (number === 0x0f) number = this.byte();
    const context = (first & 0x08) !== 0;
    let lvt = first & 0x07;
    if (context && lvt === 6) return { number, context, open: true };
    if (context && lvt === 7) return { number, context, close: true };
    if (!context && number === 1) return { number, context, length: 0, boolean: lvt };
    if (lvt === 5) {
      lvt = this.byte();
      if (lvt === 254) lvt = this.unsigned(2);
      else if (lvt === 255) lvt = this.unsigned(4);
    }
    return { number, context, length: lvt };
  }
}

/** Skips the NPDU (version 1, optional destination and source); returns the APDU start. */
function apduStart(bytes) {
  if (bytes.length < 4 || bytes.length > LIMITS.datagramMax) {
    throw new BacnetError('bad datagram size');
  }
  if (bytes[0] !== BVLC_TYPE || bytes[1] !== BVLC_UNICAST) {
    throw new BacnetError('not a BACnet/IP unicast answer');
  }
  if (bytes.readUInt16BE(2) !== bytes.length) {
    throw new BacnetError('bad BVLC length');
  }
  const r = new Reader(bytes, 4);
  if (r.byte() !== 0x01) throw new BacnetError('bad NPDU version');
  const control = r.byte();
  if (control & 0x80) throw new BacnetError('network layer message');
  if (control & 0x20) {
    r.take(2);
    r.take(r.byte());
  }
  if (control & 0x08) {
    r.take(2);
    const length = r.byte();
    if (length === 0) throw new BacnetError('bad source address');
    r.take(length);
  }
  if (control & 0x20) r.byte(); // hop count
  return r.i;
}

/** The invoke id an answer carries (undefined when it is not one of ours to match). */
export function answerInvokeId(bytes) {
  try {
    const i = apduStart(bytes);
    if (i + 1 >= bytes.length) return undefined;
    const type = bytes[i] >> 4;
    return [PDU.SIMPLE_ACK, PDU.COMPLEX_ACK, PDU.ERROR, PDU.REJECT, PDU.ABORT].includes(type)
      ? bytes[i + 1]
      : undefined;
  } catch {
    return undefined;
  }
}

/** One application-tagged value; undefined for a type the unit should not send. */
function appValue(r, tag) {
  switch (tag.number) {
    case 0:
      return null;
    case 1:
      return tag.boolean === 1;
    case 2:
    case 9:
      return tag.length >= 1 && tag.length <= 4 ? r.unsigned(tag.length) : skip(r, tag);
    case 3: {
      if (tag.length < 1 || tag.length > 4) return skip(r, tag);
      const raw = r.take(tag.length);
      return raw.readIntBE(0, tag.length);
    }
    case 4:
      return tag.length === 4 ? r.take(4).readFloatBE(0) : skip(r, tag);
    case 5:
      return tag.length === 8 ? r.take(8).readDoubleBE(0) : skip(r, tag);
    case 7: {
      if (tag.length < 1) return skip(r, tag);
      const raw = r.take(tag.length);
      // UTF-8 (0) only, bounded, without control characters.
      if (raw[0] !== 0 || raw.length - 1 > LIMITS.stringMax) return undefined;
      const text = raw.subarray(1).toString('utf8');
      // eslint-disable-next-line no-control-regex
      return /[\u0000-\u001f\u007f�]/.test(text) ? undefined : text;
    }
    default:
      return skip(r, tag);
  }
}

function skip(r, tag) {
  r.take(tag.length ?? 0);
  return undefined;
}

/**
 * The value inside [4] ... [4] (property value) or [5] ... [5] (access
 * error): the first primitive value, nested constructions skipped; an error
 * gives undefined.
 */
function propertyValue(r, opening) {
  let depth = 0;
  let value;
  let first = true;
  for (;;) {
    const tag = r.tag();
    if (tag.close) {
      if (depth === 0) {
        if (tag.number !== opening) throw new BacnetError('bad closing tag');
        return opening === 4 ? value : undefined;
      }
      depth -= 1;
      continue;
    }
    if (tag.open) {
      depth += 1;
      continue;
    }
    if (tag.context) {
      skip(r, tag);
      continue;
    }
    const v = appValue(r, tag);
    if (first && depth === 0) {
      value = v;
      first = false;
    } else {
      // A list where one value is expected: unknown.
      value = undefined;
    }
  }
}

/** The APDU header of an answer to `invokeId` and `service`, or the error it carries. */
function header(bytes, invokeId, service) {
  const r = new Reader(bytes, apduStart(bytes));
  const first = r.byte();
  const type = first >> 4;
  if (type === PDU.ABORT) {
    if (r.byte() !== invokeId) throw new BacnetError('answer to another request');
    throw new BacnetError('abort', { refused: true, detail: `abort ${r.byte()}` });
  }
  if (r.byte() !== invokeId) throw new BacnetError('answer to another request');
  if (type === PDU.REJECT) {
    throw new BacnetError('reject', { refused: true, detail: `reject ${r.byte()}` });
  }
  if (type === PDU.COMPLEX_ACK && (first & 0x08) !== 0) {
    throw new BacnetError('segmented answer');
  }
  if (r.byte() !== service) throw new BacnetError('answer to another service');
  if (type === PDU.ERROR) {
    const parts = [];
    for (let k = 0; k < 2 && !r.eof; k += 1) {
      const tag = r.tag();
      parts.push(tag.context || tag.open || tag.close ? '?' : appValue(r, tag));
    }
    throw new BacnetError('error', { refused: true, detail: `error ${parts.join('/')}` });
  }
  return { r, type };
}

/** A WriteProperty answer: resolves when it is a Simple-ACK, throws otherwise. */
export function parseWriteAnswer(bytes, invokeId) {
  const { type } = header(bytes, invokeId, SERVICES.WRITE_PROPERTY);
  if (type !== PDU.SIMPLE_ACK) throw new BacnetError('not a simple ack');
}

/**
 * A ReadPropertyMultiple answer: Map of `type:instance` -> Map of property
 * id -> value (undefined when the unit answered an access error).
 */
export function parseReadAnswer(bytes, invokeId) {
  const { r, type } = header(bytes, invokeId, SERVICES.READ_PROPERTY_MULTIPLE);
  if (type !== PDU.COMPLEX_ACK) throw new BacnetError('not a complex ack');
  const objects = new Map();
  while (!r.eof) {
    const id = r.tag();
    if (!id.context || id.number !== 0 || id.length !== 4) throw new BacnetError('bad object id');
    const raw = r.unsigned(4);
    const key = `${Math.floor(raw / 2 ** 22)}:${raw % 2 ** 22}`;
    const open = r.tag();
    if (!open.open || open.number !== 1) throw new BacnetError('bad result list');
    const properties = new Map();
    for (;;) {
      const tag = r.tag();
      if (tag.close && tag.number === 1) break;
      if (!tag.context || tag.number !== 2) throw new BacnetError('bad property id');
      const property = r.unsigned(tag.length);
      let next = r.tag();
      if (next.context && next.number === 3 && !next.open && !next.close) {
        r.take(next.length); // array index
        next = r.tag();
      }
      if (!next.open || (next.number !== 4 && next.number !== 5)) {
        throw new BacnetError('bad property result');
      }
      properties.set(property, propertyValue(r, next.number));
    }
    objects.set(key, properties);
  }
  return objects;
}

export const objectKey = ({ type, instance }) => `${type}:${instance}`;
