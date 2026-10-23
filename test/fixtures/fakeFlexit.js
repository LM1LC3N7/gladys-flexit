// -----------------------------------------------------------------------------
// A fake Flexit Nordic behind the injected socket factory (no network): it
// decodes the ReadPropertyMultiple and WriteProperty requests with its own
// minimal parser, answers from its objects after a delay (mocked timers) and
// applies the writes (the fireplace and rapid ventilation triggers toggle).
// Values made up, never from a real unit.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

export const HOST = '192.168.1.80';
export const PORT = 47808;
export const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
export const SERIAL = '800121-000123';

const AI = 0;
const AO = 1;
const AV = 2;
const BV = 5;
const DEV = 8;
const MSV = 19;
const PIV = 48;

/** Present values by "type:instance" (reals as numbers, others as integers). */
export function defaultObjects() {
  return {
    [`${MSV}:361`]: 3, // operation mode home
    [`${MSV}:42`]: 3, // ventilation mode home
    [`${BV}:50`]: 1, // comfort on
    [`${BV}:445`]: 0, // heater off
    [`${BV}:402`]: 0, // cooker hood off
    [`${BV}:400`]: 0, // fireplace off
    [`${AV}:2038`]: 0,
    [`${AV}:2031`]: 0,
    [`${BV}:522`]: 0,
    [`${AV}:1994`]: 20,
    [`${AV}:1985`]: 18,
    [`${AI}:1`]: 4.68,
    [`${AI}:4`]: 18.81,
    [`${AI}:11`]: 6.2,
    [`${AI}:59`]: 21.5,
    [`${AI}:95`]: 21.1,
    [`${AI}:75`]: 22.2,
    [`${AI}:96`]: 41.3,
    [`${AV}:2093`]: 0,
    [`${AV}:2094`]: 0,
    [`${AV}:2095`]: 0,
    [`${AI}:5`]: 2480,
    [`${AI}:12`]: 2410,
    [`${AO}:3`]: 55,
    [`${AO}:4`]: 52,
    [`${AO}:0`]: 100,
    [`${AV}:2023`]: 81.46,
    [`${AV}:194`]: 0,
    [`${AV}:285`]: 1234,
    [`${AV}:286`]: 4380,
    [`${PIV}:270`]: 10,
    [`${PIV}:293`]: 10,
  };
}

const REALS = new Set([AI, AO, AV]);

/** One application-tagged value, as a unit encodes it. */
function encodeValue(type, value) {
  if (REALS.has(type)) {
    const b = Buffer.alloc(5);
    b[0] = 0x44;
    b.writeFloatBE(value, 1);
    return b;
  }
  if (type === BV) return Buffer.from([0x91, value]);
  if (value > 255) return Buffer.from([0x22, value >> 8, value & 0xff]);
  return Buffer.from([0x21, value]);
}

const string = (text) => {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.from([0x75, bytes.length + 1, 0x00, ...bytes]);
};

const objectId = (type, instance) => {
  const b = Buffer.alloc(5);
  b[0] = 0x0c;
  b.writeUInt32BE(((type << 22) | instance) >>> 0, 1);
  return b;
};

const wrap = (apdu) => {
  const length = 6 + apdu.length;
  return Buffer.concat([Buffer.from([0x81, 0x0a, length >> 8, length & 0xff, 0x01, 0x00]), apdu]);
};

export function fakeFlexit({ deviceId = 2, serial = SERIAL, delay = 30 } = {}) {
  const unit = {
    objects: defaultObjects(),
    serial,
    name: 'HvacFnct21y_A',
    deviceId,
    delay,
    /** Every request: { op: 'read', objects } | { op: 'write', key, value, priority }. */
    log: [],
    /** Set to stop answering (requests still logged). */
    silent: false,
    /** Set to stop answering writes only. */
    silentWrites: false,
    /** Set to refuse the writes with an Error PDU. */
    refuseWrites: false,
    /** Writes whose effect is ignored (the unit acks, nothing changes). */
    ignoreWrites: false,
    /** Answer from another address (a stranger). */
    fromAddress: HOST,
    sockets: 0,
    writes() {
      return this.log
        .filter((r) => r.op === 'write')
        .map(({ op, key, value }) => ({ op, key, value }));
    },
    reads() {
      return this.log.filter((r) => r.op === 'read').length;
    },
    socketFactory: undefined,
  };

  function readAnswer(invokeId, body) {
    const parts = [Buffer.from([0x30, invokeId, 0x0e])];
    const objects = [];
    let i = 0;
    while (i < body.length) {
      if (body[i] !== 0x0c) throw new Error('fake: bad object id');
      const raw = body.readUInt32BE(i + 1);
      const type = raw >>> 22;
      const instance = raw & 0x3fffff;
      i += 5;
      if (body[i] !== 0x1e) throw new Error('fake: no list');
      i += 1;
      const properties = [];
      while (body[i] !== 0x1f) {
        if (body[i] !== 0x09) throw new Error('fake: bad property');
        properties.push(body[i + 1]);
        i += 2;
      }
      i += 1;
      objects.push(`${type}:${instance}`);
      parts.push(objectId(type, instance), Buffer.from([0x1e]));
      for (const property of properties) {
        parts.push(Buffer.from([0x29, property]));
        const key = `${type}:${instance}`;
        let value;
        if (type === DEV && instance === unit.deviceId) {
          if (property === 77) value = string(unit.name);
          if (property === 28 && unit.serial != null) value = string(unit.serial);
        } else if (property === 85 && Object.hasOwn(unit.objects, key)) {
          value = encodeValue(type, unit.objects[key]);
        }
        if (value) {
          parts.push(Buffer.from([0x4e]), value, Buffer.from([0x4f]));
        } else {
          // Error class object (1), code unknown-object (31).
          parts.push(Buffer.from([0x5e, 0x91, 0x01, 0x91, 0x1f, 0x5f]));
        }
      }
      parts.push(Buffer.from([0x1f]));
    }
    unit.log.push({ op: 'read', objects });
    return wrap(Buffer.concat(parts));
  }

  function writeAnswer(invokeId, body) {
    const raw = body.readUInt32BE(1);
    const type = raw >>> 22;
    const instance = raw & 0x3fffff;
    const key = `${type}:${instance}`;
    let i = 5;
    if (body[i] !== 0x19 || body[i + 1] !== 85 || body[i + 2] !== 0x3e)
      throw new Error('fake: bad write');
    i += 3;
    const tag = body[i];
    let value;
    if (tag === 0x44) value = body.readFloatBE(i + 1);
    else if (tag === 0x91 || tag === 0x21) value = body[i + 1];
    else if (tag === 0x22) value = body.readUInt16BE(i + 1);
    else throw new Error('fake: bad value');
    i += tag === 0x44 ? 5 : tag === 0x22 ? 3 : 2;
    if (body[i] !== 0x3f) throw new Error('fake: no close');
    const priority = body[i + 1] === 0x49 ? body[i + 2] : undefined;
    unit.log.push({ op: 'write', key, value: Math.round(value * 100) / 100, priority });
    if (unit.silentWrites) return undefined;
    if (unit.refuseWrites) {
      // Error: class property (2), code write-access-denied (40).
      return wrap(Buffer.from([0x50, invokeId, 0x0f, 0x91, 0x02, 0x91, 0x28]));
    }
    if (!unit.ignoreWrites) apply(key, value);
    return wrap(Buffer.from([0x20, invokeId, 0x0f]));
  }

  function apply(key, value) {
    const o = unit.objects;
    if (key === `${MSV}:360` && value === 2) {
      const on = o[`${BV}:400`] === 1;
      o[`${BV}:400`] = on ? 0 : 1;
      o[`${MSV}:361`] = on ? 3 : 6;
      o[`${AV}:2038`] = on ? 0 : o[`${PIV}:270`];
    } else if (key === `${MSV}:357` && value === 2) {
      const on = o[`${AV}:2031`] > 0;
      o[`${AV}:2031`] = on ? 0 : o[`${PIV}:293`];
      o[`${MSV}:361`] = on ? 3 : 7;
    } else if (key === `${MSV}:613` && value === 2) {
      o[`${AV}:285`] = 0;
    } else if (Object.hasOwn(o, key)) {
      o[key] = value;
    }
  }

  function answer(request) {
    if (request[0] !== 0x81 || request[1] !== 0x0a) throw new Error('fake: bad BVLC');
    if (request.readUInt16BE(2) !== request.length) throw new Error('fake: bad length');
    if (request[4] !== 0x01 || request[5] !== 0x04) throw new Error('fake: bad NPDU');
    const apdu = request.subarray(6);
    if (apdu[0] !== 0x02 || apdu[1] !== 0x44) throw new Error('fake: bad APDU header');
    const invokeId = apdu[2];
    const body = apdu.subarray(4);
    if (apdu[3] === 14) return readAnswer(invokeId, body);
    if (apdu[3] === 15) return writeAnswer(invokeId, body);
    throw new Error('fake: unknown service');
  }

  unit.socketFactory = () => {
    const socket = new EventEmitter();
    let closed = false;
    unit.sockets += 1;
    socket.send = (payload, port, host, callback) => {
      if (host !== HOST || port !== PORT) {
        setTimeout(() => callback?.(new Error('unreachable')), 0);
        return;
      }
      callback?.(null);
      if (unit.silent) {
        unit.log.push({ op: 'lost' });
        return;
      }
      const reply = answer(Buffer.from(payload));
      if (!reply) return;
      setTimeout(() => {
        if (!closed) socket.emit('message', reply, { address: unit.fromAddress, port: PORT });
      }, unit.delay);
    };
    socket.close = () => {
      closed = true;
    };
    return socket;
  };
  return unit;
}

export const settle = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
