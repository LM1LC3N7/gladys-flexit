// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake Flexit Nordic,
// with the exact wiring of the container (src/handlers.js) and a mocked clock.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { FlexitApp } from '../src/app.js';
import { MINUTE, SECOND } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { memoryStore } from '../src/store.js';
import { HOST, NOW, SERIAL, fakeFlexit, settle } from './fixtures/fakeFlexit.js';

const CFG = { host: HOST };
const ALLOW = { host: HOST, allow_commands: true };
const DEVICE = 'ext:test-integration:flexit:unit';
const feature = (role) => `${DEVICE}:${role}`;

async function setup(
  t,
  { config = CFG, unit = fakeFlexit(), store = memoryStore(), create = true, boot = 500 } = {},
) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOW });
  const gladys = createFakeGladys({ config });
  const logs = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((l) => [
      l,
      (...a) => logs.push(`${l}: ${a.map((x) => (x instanceof Error ? x.message : x)).join(' ')}`),
    ]),
  );
  const app = new FlexitApp({
    gladys,
    logger,
    socketFactory: unit.socketFactory,
    now: () => Date.now(),
    store,
  });
  registerHandlers(gladys, app, logger);
  const advance = async (ms, step = 10) => {
    for (let e = 0; e < ms; e += step) {
      t.mock.timers.tick(Math.min(step, ms - e));
      await settle(3);
    }
  };
  const connecting = gladys.connect();
  await settle();
  await advance(boot);
  await connecting;
  t.after(() => app.stop());
  if (create && gladys.fake.discoveredDevices.length > 0) {
    await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
    await settle();
    await advance(1100);
  }
  const fire = (role, value = 1) => {
    const device = gladys.fake.devices.find((d) => d.external_id === DEVICE) ?? {
      external_id: DEVICE,
    };
    return gladys.fake.setValue(device, { external_id: feature(role) }, value);
  };
  const press = async (role, value = 1, wait = 5 * SECOND) => {
    const ack = fire(role, value);
    await advance(wait, 50);
    return ack;
  };
  const state = (role) =>
    gladys.fake.states.findLast((s) => s.device_feature_external_id === feature(role));
  return { gladys, app, unit, advance, logs, fire, press, store, state };
}

test('discovery: one device, every value read and published, no switch', async (t) => {
  const ctx = await setup(t);
  const [device] = ctx.gladys.fake.discoveredDevices;
  assert.equal(device.external_id, DEVICE);
  const types = device.features.map((f) => `${f.category}/${f.type}`);
  assert.ok(!types.some((x) => x.startsWith('switch/')), 'never a switch');
  assert.ok(!types.some((x) => x.startsWith('thermostat/')), 'never a thermostat');
  for (const f of device.features.filter((f) => !f.read_only)) {
    assert.ok(
      (f.category === 'button' && f.type === 'push') ||
        (f.category === 'text' && f.type === 'select'),
      `${f.external_id} is writable`,
    );
  }
  assert.equal(ctx.state('temperature-outdoor').state, 4.7);
  assert.equal(ctx.state('temperature-extract').state, 21.5);
  assert.equal(ctx.state('humidity-extract').state, 41.3);
  assert.equal(ctx.state('humidity-room-1'), undefined, '0 % is no sensor');
  assert.equal(ctx.state('fan-supply').state, 55);
  assert.equal(ctx.state('fan-supply-rpm').state, 2480);
  assert.equal(ctx.state('heat-exchanger-efficiency').state, 81);
  assert.equal(ctx.state('filter-operating-time').state, 1234);
  assert.equal(ctx.state('electric-heater').state, 0);
  assert.equal(ctx.state('operation-mode').text, 'home');
  assert.equal(ctx.state('ventilation-mode').text, 'home');
  assert.equal(ctx.state('setpoint-home').text, '20.0');
  assert.equal(ctx.state('temperature-setpoint-away').state, 18);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  const badge = ctx.gladys.fake.transports.at(-1);
  assert.equal(badge.device_external_id ?? badge.external_id, DEVICE);
  assert.equal(badge.transport, DEVICE_TRANSPORTS.LOCAL);
  // The serial is kept in /data, with the time of the read; nothing else.
  assert.deepEqual(Object.keys(ctx.store.data).sort(), ['lastAttemptAt', 'serial']);
  assert.equal(ctx.store.data.serial, SERIAL);
});

test('the commands are off by default: refused, nothing written', async (t) => {
  const ctx = await setup(t);
  const ack = await ctx.press('ventilation-mode', 'high');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /Autoriser les commandes/);
  for (const role of ['electric-heater-on', 'fireplace-start', 'rapid-ventilation-start']) {
    assert.equal((await ctx.press(role)).success, false, role);
  }
  assert.equal((await ctx.press('setpoint-home', '21.0')).success, false);
  assert.deepEqual(ctx.unit.writes(), []);
});

test('the ventilation mode: fresh read, written with priority 13, confirmed', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  const reads = ctx.unit.reads();
  const ack = await ctx.press('ventilation-mode', 'high');
  assert.equal(ack.success, true, String(ack.error));
  const writes = ctx.unit.log.filter((r) => r.op === 'write');
  assert.deepEqual(writes, [{ op: 'write', key: '19:42', value: 4, priority: 13 }]);
  assert.ok(ctx.unit.reads() >= reads + 2, 'a fresh read before, a read back after');
  assert.equal(ctx.state('ventilation-mode').text, 'high');
  // Already so: nothing written, success.
  assert.equal((await ctx.press('ventilation-mode', 'high')).success, true);
  assert.equal(ctx.unit.writes().length, 1);
  // Strict values only; "stop" is never offered.
  for (const bad of ['stop', 'HIGH', ' high', 4, null, '']) {
    assert.equal((await ctx.press('ventilation-mode', bad, 100)).success, false, String(bad));
  }
  assert.equal(ctx.unit.writes().length, 1);
});

test('a setpoint: one of the list (10 to 30 °C by 0.5), written as a real', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  const ack = await ctx.press('setpoint-home', '21.5');
  assert.equal(ack.success, true, String(ack.error));
  assert.deepEqual(ctx.unit.writes(), [{ op: 'write', key: '2:1994', value: 21.5 }]);
  assert.equal(ctx.state('setpoint-home').text, '21.5');
  for (const bad of ['31.0', '9.5', '21.3', '21', 21.5, '21,5']) {
    assert.equal((await ctx.press('setpoint-home', bad, 100)).success, false, String(bad));
  }
  assert.equal(ctx.unit.writes().length, 1);
});

test('a stopped unit is never restarted; the heater off still goes', async (t) => {
  const unit = fakeFlexit();
  unit.objects['19:361'] = 1;
  unit.objects['19:42'] = 1;
  unit.objects['5:445'] = 1;
  const ctx = await setup(t, { config: ALLOW, unit });
  // Comfort off overrides Stop: it would restart the unit (review 1, B1).
  for (const role of [
    'comfort-on',
    'comfort-off',
    'electric-heater-on',
    'fireplace-start',
    'cooker-hood-on',
    'rapid-ventilation-start',
  ]) {
    const ack = await ctx.press(role);
    assert.equal(ack.success, false, role);
    assert.match(String(ack.error), /arrêtée/);
  }
  assert.equal((await ctx.press('ventilation-mode', 'home')).success, false);
  assert.deepEqual(ctx.unit.writes(), []);
  const off = await ctx.press('electric-heater-off');
  assert.equal(off.success, true, String(off.error));
  assert.deepEqual(ctx.unit.writes(), [{ op: 'write', key: '5:445', value: 0 }]);
});

test('protective commands work with the commands off, before any read', async (t) => {
  const unit = fakeFlexit();
  unit.objects['5:402'] = 1;
  // The last read was a few seconds ago (restart): no read before the interval.
  const store = memoryStore({ lastAttemptAt: NOW - 5 * SECOND, serial: SERIAL });
  const ctx = await setup(t, { unit, store, create: false });
  assert.equal(unit.reads(), 0, 'no read sooner than the interval');
  const ack = await ctx.press('cooker-hood-off');
  assert.equal(ack.success, true, String(ack.error));
  assert.deepEqual(
    unit.log.filter((r) => r.op === 'write'),
    [{ op: 'write', key: '5:402', value: 0, priority: 13 }],
  );
});

test('the fireplace toggle: written only when off; the stop only when on', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  const start = await ctx.press('fireplace-start');
  assert.equal(start.success, true, String(start.error));
  assert.deepEqual(ctx.unit.writes(), [{ op: 'write', key: '19:360', value: 2 }]);
  assert.equal(ctx.unit.objects['5:400'], 1);
  // Already on: a second start sends nothing (it would stop it).
  assert.equal((await ctx.press('fireplace-start')).success, true);
  assert.equal(ctx.unit.writes().length, 1);
  // The stop is protective: with the commands off too.
  await ctx.app.configUpdated({ host: HOST, allow_commands: false });
  const stop = await ctx.press('fireplace-stop');
  assert.equal(stop.success, true, String(stop.error));
  assert.equal(ctx.unit.writes().length, 2);
  assert.equal(ctx.unit.objects['5:400'], 0);
  // Already off: nothing sent.
  assert.equal((await ctx.press('fireplace-stop')).success, true);
  assert.equal(ctx.unit.writes().length, 2);
});

test('a toggle not seen yet is never followed by another trigger', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  ctx.unit.ignoreWrites = true;
  const start = await ctx.press('rapid-ventilation-start');
  assert.equal(start.success, false);
  assert.match(String(start.error), /envoyée, sans confirmation/);
  const again = await ctx.press('rapid-ventilation-start');
  assert.equal(again.success, false);
  assert.match(String(again.error), /pas encore visible/);
  assert.equal(ctx.unit.writes().length, 1);
});

test('a write refused by the unit is "refused", never "sent"', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  ctx.unit.refuseWrites = true;
  const ack = await ctx.press('electric-heater-on');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /a refusé/);
  assert.doesNotMatch(String(ack.error), /envoyée, sans/);
});

test('a write without ack: "sent, without confirmation", spaced reads after', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  ctx.unit.silentWrites = true;
  const reads = ctx.unit.reads();
  const ack = await ctx.press('comfort-off');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /envoyée, sans confirmation/);
  await ctx.advance(21 * SECOND, 100);
  assert.ok(ctx.unit.reads() >= reads + 1 + 6, 'two follow-up reads (3 requests each)');
});

test('a heater off not confirmed is reaffirmed by the next reads, twice at most', async (t) => {
  const unit = fakeFlexit();
  unit.objects['5:445'] = 1;
  const ctx = await setup(t, { unit });
  unit.ignoreWrites = true;
  const ack = await ctx.press('electric-heater-off');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /envoyée, sans confirmation/);
  await ctx.advance(2 * MINUTE, 200);
  const writes = unit.writes().filter((w) => w.key === '5:445');
  assert.equal(writes.length, 3, 'the stop and two reaffirmations');
  assert.ok(writes.every((w) => w.value === 0));
});

test('a protective command makes a command not written yet give way', async (t) => {
  const ctx = await setup(t, { config: ALLOW });
  ctx.unit.delay = 400;
  const on = ctx.fire('electric-heater-on');
  await ctx.advance(100);
  const off = ctx.fire('electric-heater-off');
  await ctx.advance(5 * SECOND, 50);
  const [onAck, offAck] = await Promise.all([on, off]);
  assert.equal(onAck.success, false);
  assert.match(String(onAck.error), /prioritaire/);
  assert.equal(offAck.success, true, String(offAck.error));
  assert.deepEqual(ctx.unit.writes(), [{ op: 'write', key: '5:445', value: 0 }]);
});

test('another unit at the address: nothing applied, commands refused, accepted twice', async (t) => {
  const unit = fakeFlexit({ serial: '800120-999999' });
  const store = memoryStore({ lastAttemptAt: null, serial: SERIAL });
  const ctx = await setup(t, { config: ALLOW, unit, store, create: false });
  assert.equal(ctx.gladys.fake.discoveredDevices.length, 0);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.match(String(ctx.gladys.fake.connectionStatus.message?.fr), /800120-999999/);
  const ack = await ctx.press('comfort-off');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /autre centrale/);
  // Not even a protective command toward a unit known to be another one.
  for (const role of ['electric-heater-off', 'cooker-hood-off', 'fireplace-stop']) {
    const refused = await ctx.press(role);
    assert.equal(refused.success, false, role);
    assert.match(String(refused.error), /autre centrale/);
  }
  assert.deepEqual(unit.writes(), []);
  const first = await ctx.app.acceptUnit();
  assert.match(first.fr, /800120-999999/);
  assert.equal(store.data.serial, SERIAL, 'one press changes nothing');
  const second = await ctx.app.acceptUnit();
  assert.match(second.fr, /acceptée/);
  assert.equal(store.data.serial, '800120-999999');
  await ctx.advance(MINUTE + SECOND, 200);
  assert.equal(ctx.gladys.fake.discoveredDevices.length, 1);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
});

test('an unreadable serial is never "another unit"; commands then refused', async (t) => {
  const unit = fakeFlexit({ serial: null });
  const store = memoryStore({ lastAttemptAt: null, serial: SERIAL });
  const ctx = await setup(t, { config: ALLOW, unit, store });
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  assert.equal(ctx.state('temperature-outdoor').state, 4.7);
  const ack = await ctx.press('comfort-off');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /numéro de série/);
  assert.deepEqual(unit.writes(), []);
});

test('a wrong device id: the wildcard Device instance still gives the serial', async (t) => {
  const unit = fakeFlexit({ deviceId: 7 });
  const ctx = await setup(t, { config: ALLOW, unit });
  assert.equal(ctx.store.data.serial, SERIAL);
  const ack = await ctx.press('comfort-off');
  assert.equal(ack.success, true, String(ack.error));
});

test('no serial ever learnt: the status says so, the commands are refused', async (t) => {
  const unit = fakeFlexit({ deviceId: 7 });
  unit.wildcard = false;
  const ctx = await setup(t, { config: ALLOW, unit });
  assert.equal(ctx.store.data.serial, null);
  assert.match(String(ctx.gladys.fake.connectionStatus.message?.fr), /numéro d’appareil BACnet/);
  const ack = await ctx.press('electric-heater-on');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /jamais pu être lu/);
  assert.deepEqual(unit.writes(), []);
  // A protective command still goes (no unit identified as another one).
  assert.equal((await ctx.press('electric-heater-off')).success, true);
});

test('the ventilation mode with the comfort button off: refused with the reason', async (t) => {
  const unit = fakeFlexit();
  unit.objects['5:50'] = 0;
  unit.objects['19:42'] = 2;
  const ctx = await setup(t, { config: ALLOW, unit });
  const ack = await ctx.press('ventilation-mode', 'high');
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /bouton confort/);
  assert.deepEqual(unit.writes(), []);
});

test('reads: never sooner than the interval (button, reconnection, restart)', async (t) => {
  const store = memoryStore();
  const ctx = await setup(t, { store });
  const reads = ctx.unit.reads();
  const answer = await ctx.app.testConnection();
  assert.match(answer.fr, /Prochaine lecture/);
  await ctx.app.connected({ host: HOST });
  await ctx.app.configUpdated({ host: HOST });
  await ctx.advance(10 * SECOND, 100);
  assert.equal(ctx.unit.reads(), reads);
  await ctx.advance(MINUTE, 200);
  assert.equal(ctx.unit.reads(), reads + 3, 'the next read, after the interval');
});

test('a failed read backs off and says so; a stranger datagram is ignored', async (t) => {
  const unit = fakeFlexit();
  unit.fromAddress = '192.168.1.99';
  const ctx = await setup(t, { unit, create: false, boot: 2000 });
  assert.equal(ctx.gladys.fake.discoveredDevices.length, 0);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.match(String(ctx.gladys.fake.connectionStatus.message?.fr), /Pas de réponse/);
});

test('a configuration without address, or a bad one, says so', async (t) => {
  const ctx = await setup(t, { config: { host: 'flexit.local' }, create: false });
  assert.match(String(ctx.gladys.fake.connectionStatus.message?.fr), /invalide/);
  assert.equal(ctx.unit.sockets, 0);
});
