import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect as netConnect, createServer as createNetServer, Server as NetServer, Socket } from 'node:net';
import { createServer as createTlsServer, type TlsOptions } from 'node:tls';

import {
  Acceptor,
  Initiator,
  SessionSettings,
  SessionID,
  createMessage,
  createTlsTunnel,
  sendToTarget,
  FIELD,
  MsgType,
  Side,
  type TlsTunnel,
  type TlsTunnelSecureConnectInfo,
} from '../dist/esm/index.js';
import { acceptorCfg, freePort, initiatorCfg, waitForEvent, waitUntil } from './helpers.js';

// createTlsTunnel end to end. The FIX side is a plain Acceptor; in front of it
// the test runs the "server-side stunnel" (a tls.Server piping every TLS
// connection to the acceptor's port), and the Initiator reaches it through the
// tunnel under test:
//
//   Initiator --tcp--> tunnel --TLS--> test tls.Server --tcp--> Acceptor
//
// The certificates under fixtures/tls are TEST-ONLY (see the README there).

const HANDSHAKE_TIMEOUT_MS = 8000;

const fixture = (name: string) => readFileSync(new URL(`./fixtures/tls/${name}`, import.meta.url));
const CA = fixture('TEST-ONLY-ca.crt');
const OTHER_CA = fixture('TEST-ONLY-other-ca.crt');
const SERVER_CERT = fixture('TEST-ONLY-server.crt');
const SERVER_KEY = fixture('TEST-ONLY-server.key');
const CLIENT_CERT = fixture('TEST-ONLY-client.crt');
const CLIENT_KEY = fixture('TEST-ONLY-client.key');

/** The counterparty's TLS terminator: TLS on an ephemeral port, piped to `targetPort`. */
async function startTlsServer(
  targetPort: number,
  options: TlsOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server = createTlsServer({ cert: SERVER_CERT, key: SERVER_KEY, ...options }, (secure) => {
    const plain = netConnect(targetPort, '127.0.0.1');
    for (const s of [secure, plain]) {
      sockets.add(s);
      s.on('error', () => {});
      s.once('close', () => {
        sockets.delete(s);
        secure.destroy();
        plain.destroy();
      });
    }
    secure.pipe(plain);
    plain.pipe(secure);
  });
  server.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    port,
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** A started Acceptor on a fresh port, recording the symbols of inbound orders. */
async function startAcceptor(): Promise<{ acc: Acceptor; port: number; symbols: string[] }> {
  const port = await freePort();
  const symbols: string[] = [];
  const acc = new Acceptor({
    settings: SessionSettings.fromString(acceptorCfg(port)),
    store: 'memory',
    log: 'none',
    handlers: {
      fromApp(msg) {
        symbols.push(msg.getField(FIELD.Symbol));
      },
    },
  });
  await acc.start();
  return { acc, port, symbols };
}

function newInitiator(cfg: string): Initiator {
  return new Initiator({ settings: SessionSettings.fromString(cfg), store: 'memory', log: 'none' });
}

/** Collect a tunnel's 'tlsError's. */
function tlsErrors(tunnel: TlsTunnel): Error[] {
  const errors: Error[] = [];
  tunnel.on('tlsError', (err) => errors.push(err));
  return errors;
}

/**
 * Start an initiator on `cfg` and assert it does NOT log on while `tunnel`
 * reports at least two TLS failures (so QuickFIX is retrying, not stuck).
 */
async function assertNoLogon(cfg: string, tunnel: TlsTunnel): Promise<Error[]> {
  const errors = tlsErrors(tunnel);
  const ini = newInitiator(cfg);
  let loggedOn = false;
  ini.on('logon', () => (loggedOn = true));
  try {
    await ini.start();
    assert.ok(
      await waitUntil(() => errors.length >= 2, HANDSHAKE_TIMEOUT_MS),
      `expected repeated tlsError, got ${errors.length}`,
    );
    assert.equal(loggedOn, false, 'the initiator must not log on');
    return errors;
  } finally {
    await ini.stop(true);
  }
}

describe('createTlsTunnel', () => {
  test(
    'an Initiator logs on through the tunnel and an order round-trips',
    { timeout: HANDSHAKE_TIMEOUT_MS + 6000 },
    async () => {
      const { acc, port, symbols } = await startAcceptor();
      const server = await startTlsServer(port);
      const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: server.port, tls: { ca: CA } });
      const infos: TlsTunnelSecureConnectInfo[] = [];
      tunnel.on('secureConnect', (info) => infos.push(info));
      const errors = tlsErrors(tunnel);
      const ini = newInitiator(initiatorCfg(tunnel.port));
      try {
        assert.equal(tunnel.host, '127.0.0.1');
        assert.deepEqual(tunnel.remote, { host: '127.0.0.1', port: server.port });

        const logons = Promise.all([
          waitForEvent(acc, 'logon', 'acceptor logon', HANDSHAKE_TIMEOUT_MS),
          waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS),
        ]);
        await ini.start();
        await logons;

        const order = createMessage()
          .setField(FIELD.MsgType, MsgType.NewOrderSingle)
          .setField(FIELD.Symbol, 'AAPL')
          .setField(FIELD.Side, Side.Buy)
          .setField(FIELD.OrderQty, 100);
        assert.equal(await sendToTarget(order, new SessionID('FIX.4.4', 'CLIENT', 'SERVER')), true);
        assert.ok(await waitUntil(() => symbols.length > 0, 5000), 'the acceptor should receive the order');
        assert.deepEqual(symbols, ['AAPL']);

        assert.equal(infos.length, 1);
        assert.equal(infos[0].authorized, true);
        assert.equal(infos[0].authorizationError, undefined);
        assert.match(infos[0].protocol ?? '', /^TLSv1\.[23]$/);
        assert.equal(infos[0].peerCertificate.subject.CN, 'localhost');

        // A graceful stop (Logout, then the connection winds down) is not a TLS error.
        await ini.stop();
        assert.deepEqual(errors, []);
      } finally {
        await ini.stop();
        await acc.stop();
        await tunnel.close();
        await server.close();
      }
    },
  );

  test('mutual TLS: logs on with a client certificate', { timeout: HANDSHAKE_TIMEOUT_MS + 4000 }, async () => {
    const { acc, port } = await startAcceptor();
    const server = await startTlsServer(port, { ca: CA, requestCert: true, rejectUnauthorized: true });
    const tunnel = await createTlsTunnel({
      host: '127.0.0.1',
      port: server.port,
      tls: { ca: CA, cert: CLIENT_CERT, key: CLIENT_KEY },
    });
    const ini = newInitiator(initiatorCfg(tunnel.port));
    try {
      const logon = waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS);
      await ini.start();
      await logon;
    } finally {
      await ini.stop();
      await acc.stop();
      await tunnel.close();
      await server.close();
    }
  });

  test(
    'mutual TLS: without a client certificate the initiator never logs on and keeps retrying',
    { timeout: HANDSHAKE_TIMEOUT_MS + 4000 },
    async () => {
      const { acc, port } = await startAcceptor();
      const server = await startTlsServer(port, { ca: CA, requestCert: true, rejectUnauthorized: true });
      const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: server.port, tls: { ca: CA } });
      try {
        await assertNoLogon(initiatorCfg(tunnel.port), tunnel);
      } finally {
        await acc.stop();
        await tunnel.close();
        await server.close();
      }
    },
  );

  test('a server certificate from an untrusted CA is rejected', { timeout: HANDSHAKE_TIMEOUT_MS + 4000 }, async () => {
    const { acc, port } = await startAcceptor();
    const server = await startTlsServer(port);
    const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: server.port, tls: { ca: OTHER_CA } });
    try {
      const errors = await assertNoLogon(initiatorCfg(tunnel.port), tunnel);
      assert.equal((errors[0] as NodeJS.ErrnoException).code, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE');
    } finally {
      await acc.stop();
      await tunnel.close();
      await server.close();
    }
  });

  test('a server certificate for another name is rejected', { timeout: HANDSHAKE_TIMEOUT_MS + 4000 }, async () => {
    const { acc, port } = await startAcceptor();
    const server = await startTlsServer(port);
    const tunnel = await createTlsTunnel({
      host: '127.0.0.1',
      port: server.port,
      tls: { ca: CA, servername: 'fix.example.com' },
    });
    try {
      const errors = await assertNoLogon(initiatorCfg(tunnel.port), tunnel);
      assert.equal((errors[0] as NodeJS.ErrnoException).code, 'ERR_TLS_CERT_ALTNAME_INVALID');
    } finally {
      await acc.stop();
      await tunnel.close();
      await server.close();
    }
  });

  test('rejectUnauthorized: false reports the verification failure as a code', { timeout: 5000 }, async () => {
    const server = await startTlsServer(await freePort());
    const tunnel = await createTlsTunnel({
      host: '127.0.0.1',
      port: server.port,
      tls: { ca: OTHER_CA, rejectUnauthorized: false },
    });
    try {
      const secured = new Promise<TlsTunnelSecureConnectInfo>((resolve) => tunnel.once('secureConnect', resolve));
      netConnect(tunnel.port, '127.0.0.1').on('error', () => {});
      const info = await secured;
      assert.equal(info.authorized, false);
      assert.equal(info.authorizationError, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE');
    } finally {
      await tunnel.close();
      await server.close();
    }
  });

  test(
    'tls options: socket/path are ignored and servername: undefined keeps the SNI default',
    { timeout: 5000 },
    async () => {
      let sni: string | undefined;
      const server = createTlsServer(
        {
          cert: SERVER_CERT,
          key: SERVER_KEY,
          // Called during the ClientHello, only when the client sends SNI.
          SNICallback: (name, cb) => {
            sni = name;
            cb(null);
          },
        },
        (secure) => secure.destroy(),
      );
      server.on('tlsClientError', () => {});
      // Listen where 'localhost' resolves first; the tunnel tries every address.
      await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
      const addr = server.address();
      const tunnel = await createTlsTunnel({
        host: 'localhost',
        port: typeof addr === 'object' && addr ? addr.port : 0,
        // Excluded by the types, but plain JS callers can still pass them.
        tls: { ca: CA, servername: undefined, path: '/nonexistent', socket: new Socket() } as never,
      });
      try {
        const secured = new Promise<void>((resolve) => tunnel.once('secureConnect', () => resolve()));
        netConnect(tunnel.port, '127.0.0.1').on('error', () => {});
        await secured;
        assert.equal(sni, 'localhost');
      } finally {
        await tunnel.close();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );

  test(
    'a side that closes while the other is still sending is wound down, not reset',
    { timeout: 15000 },
    async () => {
      // Tearing a socket down with unread input sends a TCP RST, which can
      // discard what its peer has not read yet: here the 'BYE' (a Logout),
      // sent just before closing while the other side is still streaming.
      const flood = Buffer.alloc(8 * 1024 * 1024, 0x41);
      const run = (stream: Socket): Promise<{ text: string; error?: string }> =>
        new Promise((resolve) => {
          let text = '';
          let error: string | undefined;
          stream.on('data', (chunk: Buffer) => (text += chunk.toString().replaceAll('A', '')));
          stream.on('error', (err: NodeJS.ErrnoException) => (error ??= err.code));
          stream.once('close', () => resolve({ text, error }));
        });

      let onSecure: (secure: Socket) => void = () => {};
      const server = createTlsServer({ cert: SERVER_CERT, key: SERVER_KEY }, (secure) => onSecure(secure));
      server.on('tlsClientError', () => {});
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address();
      const tunnel = await createTlsTunnel({
        host: '127.0.0.1',
        port: typeof addr === 'object' && addr ? addr.port : 0,
        tls: { ca: CA },
      });
      const errors = tlsErrors(tunnel);
      try {
        // The counterparty says BYE and closes while the engine is still sending.
        onSecure = (secure) => secure.on('error', () => {}).resume().end('BYE');
        const engine = netConnect(tunnel.port, '127.0.0.1');
        const engineSide = run(engine);
        engine.write(flood);
        assert.deepEqual(await engineSide, { text: 'BYE', error: undefined }, 'counterparty closes first');

        // The engine says BYE and closes while the counterparty is still sending.
        const counterpartySide = new Promise<{ text: string; error?: string }>((resolve) => {
          onSecure = (secure) => {
            void run(secure).then(resolve);
            secure.write(flood);
          };
        });
        const engine2 = netConnect(tunnel.port, '127.0.0.1');
        engine2.on('error', () => {});
        engine2.resume();
        engine2.end('BYE');
        assert.deepEqual(await counterpartySide, { text: 'BYE', error: undefined }, 'engine closes first');
        assert.deepEqual(errors, []);
      } finally {
        await tunnel.close();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );

  test(
    'failover: one tunnel per SocketConnectHost<n>, the initiator moves on to the live one',
    { timeout: HANDSHAKE_TIMEOUT_MS + 4000 },
    async () => {
      const { acc, port } = await startAcceptor();
      const server = await startTlsServer(port);
      const dead = await createTlsTunnel({ host: '127.0.0.1', port: await freePort(), tls: { ca: CA } });
      const live = await createTlsTunnel({ host: '127.0.0.1', port: server.port, tls: { ca: CA } });
      const deadErrors = tlsErrors(dead);
      const cfg = initiatorCfg(dead.port).replace(
        `SocketConnectPort=${dead.port}\n`,
        `SocketConnectPort=${dead.port}\nSocketConnectHost1=${live.host}\nSocketConnectPort1=${live.port}\n`,
      );
      const ini = newInitiator(cfg);
      try {
        const logon = waitForEvent(ini, 'logon', 'initiator logon', HANDSHAKE_TIMEOUT_MS);
        await ini.start();
        await logon;
        assert.equal((deadErrors[0] as NodeJS.ErrnoException | undefined)?.code, 'ECONNREFUSED');
      } finally {
        await ini.stop();
        await acc.stop();
        await dead.close();
        await live.close();
        await server.close();
      }
    },
  );

  test('localPort binds the requested loopback port, and a port in use rejects', async () => {
    const localPort = await freePort();
    const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: 1, localPort });
    try {
      assert.equal(tunnel.port, localPort);
      await assert.rejects(createTlsTunnel({ host: '127.0.0.1', port: 1, localPort }), { code: 'EADDRINUSE' });
    } finally {
      await tunnel.close();
    }
  });

  test('close() destroys live connections, stops listening and is idempotent', async () => {
    const server = await startTlsServer(await freePort());
    const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: server.port, tls: { ca: CA } });
    try {
      const secured = new Promise<void>((resolve) => tunnel.once('secureConnect', () => resolve()));
      const client = netConnect(tunnel.port, '127.0.0.1');
      client.on('error', () => {});
      const clientClosed = new Promise<void>((resolve) => client.once('close', () => resolve()));
      await secured;

      const closing = tunnel.close();
      assert.equal(tunnel.close(), closing, 'a second close() returns the same Promise');
      await closing;
      await clientClosed;

      const refused = netConnect(tunnel.port, '127.0.0.1');
      await assert.rejects(
        new Promise((resolve, reject) => refused.once('connect', resolve).once('error', reject)),
        { code: 'ECONNREFUSED' },
      );
      refused.destroy();
    } finally {
      await server.close();
    }
  });

  test('tls options tls.connect throws on are a tlsError, not a crash', { timeout: 5000 }, async () => {
    // Accepted by createTlsTunnel; tls.connect only throws once a connection
    // comes in and it builds the secure context.
    const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: 1, tls: { key: 'not a pem', cert: 'not a pem' } });
    try {
      const failed = new Promise<Error>((resolve) => tunnel.once('tlsError', resolve));
      const client = netConnect(tunnel.port, '127.0.0.1');
      client.on('error', () => {});
      const clientClosed = new Promise<void>((resolve) => client.once('close', () => resolve()));
      assert.ok((await failed) instanceof Error);
      await clientClosed;
    } finally {
      await tunnel.close();
    }
  });

  test('an accept error on the loopback server is a tlsError, not a crash', async () => {
    // The server is private: catch it as createTlsTunnel binds it.
    let server: NetServer | undefined;
    const listen = NetServer.prototype.listen;
    NetServer.prototype.listen = function (this: NetServer, ...args: unknown[]) {
      server = this;
      return (listen as (...a: unknown[]) => NetServer).apply(this, args);
    } as typeof listen;
    let tunnel: TlsTunnel;
    try {
      tunnel = await createTlsTunnel({ host: '127.0.0.1', port: 1 });
    } finally {
      NetServer.prototype.listen = listen;
    }
    try {
      const errors = tlsErrors(tunnel);
      const emfile = Object.assign(new Error('accept EMFILE'), { code: 'EMFILE' });
      assert.ok(server);
      server.emit('error', emfile);
      assert.deepEqual(errors, [emfile]);
    } finally {
      await tunnel.close();
    }
  });

  test('await using closes the tunnel', async () => {
    let port: number;
    {
      await using tunnel = await createTlsTunnel({ host: '127.0.0.1', port: 1 });
      port = tunnel.port;
    }
    const refused = netConnect(port, '127.0.0.1');
    await assert.rejects(
      new Promise((resolve, reject) => refused.once('connect', resolve).once('error', reject)),
      { code: 'ECONNREFUSED' },
    );
    refused.destroy();
  });

  test('a tunnel with a live TLS connection does not keep the process alive', { timeout: 15000 }, async () => {
    // A plain sink behind the TLS server, so the connection stays open.
    const held = new Set<Socket>();
    const sink = createNetServer((s) => held.add(s.on('error', () => {})));
    await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
    const sinkAddr = sink.address();
    const server = await startTlsServer(typeof sinkAddr === 'object' && sinkAddr ? sinkAddr.port : 0);
    try {
      const entry = new URL('../dist/esm/index.js', import.meta.url).href;
      // A timer holds the loop until the TLS connection is up, then lets go:
      // the child must exit with the connection still open. Its own raw socket
      // is unref'd too, so only the tunnel's handles (listener, loopback
      // socket, TLS socket) are under test.
      const script = `
        import { connect } from 'node:net';
        const { createTlsTunnel } = await import(${JSON.stringify(entry)});
        const [port, ca] = process.argv.slice(1);
        const hold = setInterval(() => {}, 1000);
        const tunnel = await createTlsTunnel({ host: '127.0.0.1', port: Number(port), tls: { ca } });
        tunnel.once('secureConnect', (info) => {
          console.log('secure', info.authorized);
          clearInterval(hold);
        });
        connect(tunnel.port, '127.0.0.1').on('error', () => {}).unref();
      `;
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          process.execPath,
          ['--input-type=module', '-e', script, String(server.port), CA.toString()],
          { timeout: 10000 },
          (err, out) => (err ? reject(err) : resolve(out)),
        );
      });
      assert.match(stdout, /^secure true$/m);
    } finally {
      await server.close();
      for (const s of held) s.destroy();
      await new Promise((resolve) => sink.close(resolve));
    }
  });

  test('invalid options reject with a TypeError', async () => {
    for (const options of [
      { host: '', port: 443 },
      { host: 'fix.example.com', port: 0 },
      { host: 'fix.example.com', port: 65536 },
      { host: 'fix.example.com', port: 4.5 },
      { host: 'fix.example.com', port: 443, localPort: -1 },
    ]) {
      await assert.rejects(createTlsTunnel(options), TypeError, JSON.stringify(options));
    }
  });
});
