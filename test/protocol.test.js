// -----------------------------------------------------------------------------
// The BACnet frames: requests byte for byte as flexit_bacnet builds them (with
// our own invoke id), answers decoded linearly and refused when hostile.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { POINTS, TRIGGERS } from '../src/constants.js';
import { ERROR_KINDS, request } from '../src/bacnet/client.js';
import {
  BacnetError,
  answerInvokeId,
  parseReadAnswer,
  parseWriteAnswer,
  readPropertyMultiple,
  writeProperty,
} from '../src/bacnet/protocol.js';
import { deviceSpec, modelOf, plainValues, pointSpec } from '../src/bacnet/values.js';
import { normalizeConfig, parseAddress } from '../src/config.js';

const hex = (b) => b.toString('hex');
const wrap = (apdu) => {
  const length = 6 + apdu.length;
  return Buffer.from([0x81, 0x0a, length >> 8, length & 0xff, 0x01, 0x00, ...apdu]);
};

test('ReadPropertyMultiple: the bytes of flexit_bacnet', () => {
  const frame = readPropertyMultiple(7, [pointSpec('outdoor'), deviceSpec(2)]);
  // BVLC, NPDU, confirmed request (segmented accepted, 4 x 1024), invoke 7, service 14,
  // AI 1 [present value], Device 2 [object name, description].
  assert.equal(
    hex(frame),
    '810a001e' +
      '0104' +
      '0244070e' +
      '0c00000001' +
      '1e0955' +
      '1f' +
      '0c02000002' +
      '1e094d091c1f',
  );
});

test('WriteProperty: real, enumerated with priority, unsigned', () => {
  assert.equal(
    hex(writeProperty(1, POINTS.setpointHome, 21.5)),
    '810a0018' + '0104' + '0244010f' + '0c008007ca' + '1955' + '3e' + '4441ac0000' + '3f',
  );
  assert.equal(
    hex(writeProperty(2, POINTS.cookerHood, 0)),
    '810a0017' + '0104' + '0244020f' + '0c01400192' + '1955' + '3e' + '9100' + '3f' + '490d',
  );
  assert.equal(
    hex(writeProperty(3, TRIGGERS.fireplace, 2)),
    '810a0015' + '0104' + '0244030f' + '0c04c00168' + '1955' + '3e' + '2102' + '3f',
  );
});

test('a read answer: values, access errors unknown, identity', () => {
  const answer = wrap([
    0x30,
    9,
    0x0e,
    // AI 1: present value 4.5
    0x0c,
    0x00,
    0x00,
    0x00,
    0x01,
    0x1e,
    0x29,
    0x55,
    0x4e,
    0x44,
    0x40,
    0x90,
    0x00,
    0x00,
    0x4f,
    0x1f,
    // AI 96: unknown object
    0x0c,
    0x00,
    0x00,
    0x00,
    0x60,
    0x1e,
    0x29,
    0x55,
    0x5e,
    0x91,
    0x01,
    0x91,
    0x1f,
    0x5f,
    0x1f,
    // Device 2: name, description
    0x0c,
    0x02,
    0x00,
    0x00,
    0x02,
    0x1e,
    0x29,
    0x4d,
    0x4e,
    0x75,
    0x03,
    0x00,
    0x41,
    0x42,
    0x4f,
    0x29,
    0x1c,
    0x4e,
    0x75,
    0x0e,
    0x00,
    ...Buffer.from('800121-000123'),
    0x4f,
    0x1f,
  ]);
  assert.equal(answerInvokeId(answer), 9);
  const objects = parseReadAnswer(answer, 9);
  const values = plainValues(objects, ['outdoor', 'humidityExtract'], 2);
  assert.deepEqual(values, { outdoor: 4.5, serial: '800121-000123', name: 'AB' });
  assert.equal(modelOf(values.serial), 'S3 REL');
  assert.equal(modelOf('123'), undefined);
});

test('hostile answers are refused, never trusted', () => {
  const good = [
    0x30, 1, 0x0e, 0x0c, 0, 0, 0, 1, 0x1e, 0x29, 0x55, 0x4e, 0x44, 0, 0, 0, 0, 0x4f, 0x1f,
  ];
  assert.throws(() => parseReadAnswer(wrap(good), 2), /another request/);
  const truncated = wrap(good).subarray(0, 15);
  assert.throws(() => parseReadAnswer(truncated, 1), BacnetError);
  const badLength = wrap(good);
  badLength[3] += 1;
  assert.throws(() => parseReadAnswer(badLength, 1), /BVLC length/);
  const segmented = wrap([0x38, 1, 0, 1, 0x0e]);
  assert.throws(() => parseReadAnswer(segmented, 1), /segmented/);
  // A string announcing 4 GB, a length running past the end.
  const huge = wrap([
    0x30, 1, 0x0e, 0x0c, 0, 0, 0, 1, 0x1e, 0x29, 0x55, 0x4e, 0x75, 0xff, 0xff, 0xff, 0xff, 0xff,
  ]);
  assert.throws(() => parseReadAnswer(huge, 1), /truncated/);
  assert.throws(() => parseReadAnswer(Buffer.alloc(2000, 0x81), 1), /size/);
  // A network layer message, a forwarded NPDU: not an answer.
  assert.throws(() => parseReadAnswer(Buffer.from([0x81, 0x0a, 0, 6, 0x01, 0x80]), 1), BacnetError);
  // Error, reject, abort: refused by the unit.
  for (const apdu of [
    [0x50, 1, 0x0f, 0x91, 0x02, 0x91, 0x28],
    [0x60, 1, 0x02],
    [0x71, 1, 0x04],
  ]) {
    assert.throws(
      () => parseWriteAnswer(wrap(apdu), 1),
      (err) => err instanceof BacnetError && err.refused,
    );
  }
  parseWriteAnswer(wrap([0x20, 1, 0x0f]), 1);
  // Never on the prototype.
  const objects = parseReadAnswer(wrap(good), 1);
  assert.equal(Object.getPrototypeOf(objects), Map.prototype);
});

test('implausible values are unknown, never 0', () => {
  const objects = new Map([
    ['0:1', new Map([[85, 250]])],
    ['19:361', new Map([[85, 9]])],
    ['5:445', new Map([[85, 3]])],
    ['0:59', new Map([[85, 0]])],
    ['0:95', new Map([[85, 21.06]])],
  ]);
  const values = plainValues(objects, [
    'outdoor',
    'operationMode',
    'heater',
    'extract',
    'extractAlt',
  ]);
  assert.deepEqual(values, { extract: 21.1 });
});

test('the configuration: IPv4 only, a device id in range', () => {
  assert.deepEqual(parseAddress('192.168.1.80'), { host: '192.168.1.80', port: 47808 });
  assert.deepEqual(parseAddress('10.0.0.2:47809'), { host: '10.0.0.2', port: 47809 });
  for (const bad of ['flexit.local', '300.1.1.1', '1.2.3.4:0', '1.2.3.4:99999', '::1', '']) {
    assert.equal(parseAddress(bad), undefined, bad);
  }
  assert.equal(normalizeConfig({ host: '1.2.3.4' }).deviceId, 2);
  assert.equal(normalizeConfig({ host: '1.2.3.4', device_id: '7' }).deviceId, 7);
  const bad = normalizeConfig({ host: '1.2.3.4', device_id: 4194303 });
  assert.equal(bad.address, undefined);
  assert.match(bad.invalid, /device id/);
  assert.equal(normalizeConfig({ allow_commands: 'yes' }).allowCommands, false);
  assert.equal(normalizeConfig({ allow_commands: true }).allowCommands, true);
});

test('UDP: a real loopback socket, the answer of the right source only', async () => {
  const server = createSocket('udp4');
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const stranger = createSocket('udp4');
  await new Promise((resolve) => stranger.bind(0, '127.0.0.1', resolve));
  server.on('message', (message, rinfo) => {
    const invokeId = message[8];
    // A stranger answers first with the right invoke id: ignored.
    stranger.send(wrap([0x20, invokeId, 0x0f]), rinfo.port, rinfo.address);
    setTimeout(() => server.send(wrap([0x20, invokeId, 0x0f]), rinfo.port, rinfo.address), 20);
  });
  try {
    const sentBefore = [];
    await request({
      host: '127.0.0.1',
      port,
      build: (id) => writeProperty(id, POINTS.heater, 0),
      parse: parseWriteAnswer,
      beforeSend: () => sentBefore.push(true),
      timeoutMs: 1000,
    });
    assert.deepEqual(sentBefore, [true]);
    // Nobody answers: a timeout, marked sent.
    server.removeAllListeners('message');
    await assert.rejects(
      request({
        host: '127.0.0.1',
        port,
        build: (id) => readPropertyMultiple(id, [pointSpec('outdoor')]),
        parse: parseReadAnswer,
        timeoutMs: 100,
      }),
      (err) => err.kind === ERROR_KINDS.TIMEOUT && err.sent === true,
    );
    // Past its deadline: nothing sent.
    await assert.rejects(
      request({
        host: '127.0.0.1',
        port,
        build: (id) => readPropertyMultiple(id, [pointSpec('outdoor')]),
        parse: parseReadAnswer,
        startBy: Date.now() - 1,
      }),
      (err) => err.kind === ERROR_KINDS.LATE && err.sent === false,
    );
  } finally {
    server.close();
    stranger.close();
  }
});
