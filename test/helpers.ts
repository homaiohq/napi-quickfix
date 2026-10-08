// Shared helpers for the in-process loopback tests (an Acceptor and an
// Initiator talking over a localhost port). Mirrors the harness in
// loopback.test.ts; see that file for the end-to-end rationale.
import { createServer } from 'node:net';

import type { Acceptor, Initiator } from '../dist/esm/index.js';

/** Grab a free ephemeral loopback port from the OS to avoid collisions in CI. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** A promise that resolves when `emitter` fires `event`, or rejects on timeout. */
export function waitForEvent(
  emitter: Acceptor | Initiator,
  event: 'logon' | 'logout',
  label: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Poll `cond` every 25ms until it is true or `timeoutMs` elapses (returns false). */
export async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
}

/** Acceptor-side config for a SERVER<->CLIENT FIX.4.4 session on `port`. */
export function acceptorCfg(port: number): string {
  return `[DEFAULT]
ConnectionType=acceptor
SocketAcceptPort=${port}
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y
TimestampPrecision=6

[SESSION]
BeginString=FIX.4.4
SenderCompID=SERVER
TargetCompID=CLIENT
`;
}

/** Initiator-side config for a CLIENT<->SERVER FIX.4.4 session on `port`. */
export function initiatorCfg(port: number): string {
  return `[DEFAULT]
ConnectionType=initiator
SocketConnectHost=127.0.0.1
SocketConnectPort=${port}
HeartBtInt=2
ReconnectInterval=1
UseDataDictionary=N
StartTime=00:00:00
EndTime=00:00:00
ResetOnLogon=Y
TimestampPrecision=6

[SESSION]
BeginString=FIX.4.4
SenderCompID=CLIENT
TargetCompID=SERVER
`;
}
