// -----------------------------------------------------------------------------
// The only network access: one UDP request to the unit and its answer.
//
// - Each request has its own socket (as flexit_bacnet) and its own invoke id:
//   a late answer to an earlier request is never taken for this one (its
//   socket is closed, its invoke id differs).
// - Only a datagram from the address and port of the unit is looked at; one
//   longer than a BACnet/IP datagram is dropped unread. Other datagrams are
//   ignored (a stranger cannot end the request).
// - Every wait is bounded. Nothing received is ever logged.
// - `sent` is set right before the bytes are handed to the socket, so a
//   command that may have reached the unit is never reported "not sent";
//   `beforeSend` (may throw) and `startBy` are checked right before.
// -----------------------------------------------------------------------------

import { createSocket } from 'node:dgram';
import { LIMITS, TIMINGS } from '../constants.js';
import { BacnetError, answerInvokeId } from './protocol.js';

export const ERROR_KINDS = {
  /** No answer in time (the request left). */
  TIMEOUT: 'timeout',
  /** The socket failed. */
  NETWORK: 'network',
  /** An answer that cannot be read. */
  PROTOCOL: 'protocol',
  /** The unit answered with an Error, a Reject or an Abort: not applied. */
  REFUSED: 'refused',
  /** Ended by the integration (stop, new configuration). */
  ABORTED: 'aborted',
  /** The deadline of a command passed before its bytes left: nothing sent. */
  LATE: 'late',
};

export class UnitError extends Error {
  constructor(kind, message, { sent = false, detail } = {}) {
    super(message);
    this.kind = kind;
    this.sent = sent;
    this.detail = detail;
  }
}

/** A short reason for the logs and the status (never the bytes received). */
export function errorReason(err) {
  if (err instanceof UnitError) {
    return err.detail ? `${err.kind}: ${err.detail}` : err.kind;
  }
  return 'error';
}

export const udpSocket = () => createSocket('udp4');

let nextInvokeId = Math.floor(Math.random() * 256);
export function newInvokeId() {
  nextInvokeId = (nextInvokeId + 1) % 256;
  return nextInvokeId;
}

/**
 * Sends `build(invokeId)` to host:port and resolves with `parse(answer,
 * invokeId)` of the first datagram of the unit carrying that invoke id.
 * `track`: a Set the request's abort function stays in while it runs.
 */
export function request({
  host,
  port,
  build,
  parse,
  timeoutMs = TIMINGS.requestTimeout,
  beforeSend,
  startBy = Infinity,
  socketFactory = udpSocket,
  timers = globalThis,
  now = Date.now,
  track,
}) {
  return new Promise((resolve, reject) => {
    if (now() > startBy) {
      reject(new UnitError(ERROR_KINDS.LATE, 'deadline passed before sending'));
      return;
    }
    const invokeId = newInvokeId();
    const payload = build(invokeId);
    let socket;
    let timer;
    let done = false;
    let sent = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      timers.clearTimeout(timer);
      track?.delete(abort);
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      fn(value);
    };
    const fail = (kind, message, detail) =>
      finish(reject, new UnitError(kind, message, { sent, detail }));
    const abort = () => fail(ERROR_KINDS.ABORTED, 'aborted');
    // The last checks: nothing else runs between them and the send.
    if (beforeSend) {
      try {
        beforeSend();
      } catch (err) {
        err.beforeSend = true;
        finish(reject, err);
        return;
      }
    }
    try {
      socket = socketFactory();
    } catch {
      fail(ERROR_KINDS.NETWORK, 'socket failed');
      return;
    }
    track?.add(abort);
    socket.on('error', () => fail(ERROR_KINDS.NETWORK, 'socket error'));
    socket.on('message', (message, rinfo) => {
      if (done || rinfo?.address !== host || rinfo?.port !== port) return;
      if (!Buffer.isBuffer(message) || message.length > LIMITS.datagramMax) return;
      if (answerInvokeId(message) !== invokeId) return;
      try {
        finish(resolve, parse(message, invokeId));
      } catch (err) {
        if (err instanceof BacnetError && err.refused) {
          fail(ERROR_KINDS.REFUSED, 'refused by the unit', err.detail);
        } else {
          fail(ERROR_KINDS.PROTOCOL, err instanceof BacnetError ? err.message : 'bad answer');
        }
      }
    });
    timer = timers.setTimeout(() => fail(ERROR_KINDS.TIMEOUT, 'no answer'), timeoutMs);
    sent = true;
    try {
      socket.send(payload, port, host, (err) => {
        if (err) fail(ERROR_KINDS.NETWORK, 'send failed');
      });
    } catch {
      fail(ERROR_KINDS.NETWORK, 'send failed');
    }
  });
}
