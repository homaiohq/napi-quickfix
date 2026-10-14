/**
 * In-process TLS tunnel for initiators: the stunnel client model.
 *
 * QuickFIX is built without its OpenSSL-based `SSLSocketInitiator` (see
 * CMakeLists.txt), so TLS is terminated in Node instead: the tunnel listens on
 * a loopback port, the plain `FIX::SocketInitiator` connects to it (point
 * `SocketConnectHost`/`SocketConnectPort` at {@link TlsTunnel.host} /
 * {@link TlsTunnel.port}), and every accepted connection is carried to the real
 * counterparty over `tls.connect`.
 */
import { EventEmitter } from 'node:events';
import { createServer, isIP, type Server, type Socket } from 'node:net';
import {
  connect as tlsConnect,
  type CipherNameAndProtocol,
  type ConnectionOptions,
  type PeerCertificate,
  type TLSSocket,
} from 'node:tls';

const LOOPBACK = '127.0.0.1';

/** Options for {@link createTlsTunnel}. */
export interface TlsTunnelOptions {
  /** Host name or IP of the counterparty's TLS endpoint. */
  host: string;
  /** Port of the counterparty's TLS endpoint. */
  port: number;
  /**
   * Passed to `tls.connect()` for every connection (CA, client certificate for
   * mTLS, `minVersion`, ciphers, ...). `servername` (SNI, and the name the
   * server certificate is checked against) defaults to `host` unless `host` is
   * an IP address.
   */
  tls?: Omit<ConnectionOptions, 'host' | 'port' | 'socket' | 'path'>;
  /**
   * Loopback port to listen on. Defaults to `0`, an ephemeral port read back
   * from {@link TlsTunnel.port}. Set it to point a static `.cfg` file at the
   * tunnel, like stunnel's `accept = 127.0.0.1:<port>`.
   */
  localPort?: number;
}

/** Details of an established TLS connection, emitted as `'secureConnect'`. */
export interface TlsTunnelSecureConnectInfo {
  /** Whether the server certificate was verified against the trusted CAs. */
  authorized: boolean;
  /**
   * Why verification failed. Only reachable with `rejectUnauthorized: false`;
   * otherwise a failed verification is a `'tlsError'` instead.
   */
  authorizationError?: Error;
  /** Negotiated protocol, e.g. `'TLSv1.3'`. */
  protocol: string | null;
  /** Negotiated cipher. */
  cipher: CipherNameAndProtocol;
  /** The server's certificate (an empty object if it sent none). */
  peerCertificate: PeerCertificate;
}

/**
 * Events emitted by a {@link TlsTunnel}. There is deliberately no `'error'`
 * event: connection failures are reported as `'tlsError'`, so a tunnel without
 * listeners never crashes the process.
 */
export interface TlsTunnelEvents {
  /** A connection to the counterparty completed its TLS handshake. */
  secureConnect: [info: TlsTunnelSecureConnectInfo];
  /**
   * A connection to the counterparty failed (DNS, TCP, handshake, certificate
   * verification) or broke. The initiator's loopback connection is closed with
   * it, so QuickFIX reconnects after its `ReconnectInterval`.
   */
  tlsError: [error: Error];
}

/**
 * A running TLS tunnel, created by {@link createTlsTunnel}.
 *
 * Its handles are unref'd: the tunnel alone never keeps the process alive (a
 * started engine does). Close it after the engine has stopped, so a graceful
 * Logout still reaches the counterparty.
 */
export class TlsTunnel extends EventEmitter {
  /** Loopback address the tunnel listens on (`SocketConnectHost`). */
  readonly host = LOOPBACK;
  /** Loopback port the tunnel listens on (`SocketConnectPort`). */
  readonly port: number;
  /** The counterparty's TLS endpoint. */
  readonly remote: { readonly host: string; readonly port: number };

  readonly #server: Server;
  readonly #tls: ConnectionOptions;
  readonly #pairs = new Set<{ local: Socket; remote: TLSSocket }>();
  #closing: Promise<void> | undefined;

  /** @internal Use {@link createTlsTunnel}. */
  constructor(server: Server, port: number, options: TlsTunnelOptions) {
    super();
    this.#server = server;
    this.port = port;
    this.remote = Object.freeze({ host: options.host, port: options.port });
    const servername = isIP(options.host) === 0 ? options.host : undefined;
    this.#tls = {
      ...(servername === undefined ? {} : { servername }),
      ...options.tls,
      host: options.host,
      port: options.port,
    };
    server.on('connection', (local) => this.#onConnection(local));
  }

  #onConnection(local: Socket): void {
    if (this.#closing) {
      local.destroy();
      return;
    }
    local.unref();
    // QuickFIX writes its Logon as soon as it connects: keep it in the socket
    // until the handshake is done and the pipe below picks it up.
    local.pause();

    const remote = tlsConnect(this.#tls);
    remote.unref();
    const pair = { local, remote };
    this.#pairs.add(pair);

    // Any error or close on either side tears the pair down: QuickFIX sees the
    // loopback connection drop and reconnects on its own schedule.
    const teardown = () => {
      this.#pairs.delete(pair);
      local.destroy();
      remote.destroy();
    };
    local.on('error', () => {
      // ECONNRESET and the like from the engine's side: nothing to report.
    });
    remote.on('error', (err) => {
      if (!this.#closing) this.emit('tlsError', err);
    });
    local.once('close', teardown);
    remote.once('close', teardown);

    remote.once('secureConnect', () => {
      local.setNoDelay(true);
      remote.setNoDelay(true);
      local.pipe(remote);
      remote.pipe(local);
      local.resume();
      this.emit('secureConnect', {
        authorized: remote.authorized,
        // Typed as Error, but null once the certificate verified.
        ...(remote.authorizationError ? { authorizationError: remote.authorizationError } : {}),
        protocol: remote.getProtocol(),
        cipher: remote.getCipher(),
        peerCertificate: remote.getPeerCertificate(),
      });
    });
  }

  /**
   * Stop listening and destroy every live connection. Idempotent: later calls
   * return the same Promise.
   */
  close(): Promise<void> {
    this.#closing ??= new Promise((resolve) => {
      for (const { local, remote } of this.#pairs) {
        local.destroy();
        remote.destroy();
      }
      this.#pairs.clear();
      // The only possible error is "not running", which still means closed.
      this.#server.close(() => resolve());
    });
    return this.#closing;
  }

  /** Same as {@link TlsTunnel.close}; enables `await using tunnel = ...`. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Open a TLS tunnel to `options.host`:`options.port` and resolve once it
 * listens on a loopback port.
 *
 * @example
 * ```ts
 * const tunnel = await createTlsTunnel({
 *   host: 'fix.broker.com',
 *   port: 9443,
 *   tls: { ca: readFileSync('broker-ca.pem') },
 * });
 * tunnel.on('tlsError', (err) => console.error('TLS:', err.message));
 * const settings = SessionSettings.fromString(`
 * [DEFAULT]
 * ConnectionType=initiator
 * SocketConnectHost=${tunnel.host}
 * SocketConnectPort=${tunnel.port}
 * ...`);
 * const initiator = new Initiator({ settings, handlers });
 * await initiator.start();
 * // ... later: engine first, so the Logout still crosses the tunnel
 * await initiator.stop();
 * await tunnel.close();
 * ```
 *
 * @returns A Promise that rejects with a `TypeError` if `host`, `port` or
 *   `localPort` is invalid, and with the listen error (e.g. `EADDRINUSE` for a
 *   fixed `localPort` already in use) if the loopback port cannot be bound.
 */
export async function createTlsTunnel(options: TlsTunnelOptions): Promise<TlsTunnel> {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('createTlsTunnel({ host, port, tls?, localPort? })');
  }
  if (typeof options.host !== 'string' || options.host === '') {
    throw new TypeError('host must be a non-empty string');
  }
  if (!isPort(options.port, 1)) {
    throw new TypeError('port must be an integer from 1 to 65535');
  }
  const localPort = options.localPort ?? 0;
  if (!isPort(localPort, 0)) {
    throw new TypeError('localPort must be an integer from 0 to 65535');
  }

  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(localPort, LOOPBACK);
  });
  server.unref();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : localPort;
  return new TlsTunnel(server, port, options);
}

function isPort(value: unknown, min: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= 65535;
}

/* ------------------------------------------------------------------------- *
 * Typed events, merged into the class the same way as Engine's (engine.ts).
 * ------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TlsTunnel {
  /** Register a listener for a tunnel event (typed per {@link TlsTunnelEvents}). */
  on<E extends keyof TlsTunnelEvents>(
    event: E,
    listener: (...args: TlsTunnelEvents[E]) => void,
  ): this;
  /** Register a one-shot listener for a tunnel event. */
  once<E extends keyof TlsTunnelEvents>(
    event: E,
    listener: (...args: TlsTunnelEvents[E]) => void,
  ): this;
  /** Alias of {@link TlsTunnel.on}. */
  addListener<E extends keyof TlsTunnelEvents>(
    event: E,
    listener: (...args: TlsTunnelEvents[E]) => void,
  ): this;
  /** Remove a previously registered listener. */
  off<E extends keyof TlsTunnelEvents>(
    event: E,
    listener: (...args: TlsTunnelEvents[E]) => void,
  ): this;
  /** Alias of {@link TlsTunnel.off}. */
  removeListener<E extends keyof TlsTunnelEvents>(
    event: E,
    listener: (...args: TlsTunnelEvents[E]) => void,
  ): this;
  /** Remove all listeners (optionally for a single event). */
  removeAllListeners<E extends keyof TlsTunnelEvents>(event?: E): this;
  /** Emit a tunnel event with its typed arguments. */
  emit<E extends keyof TlsTunnelEvents>(event: E, ...args: TlsTunnelEvents[E]): boolean;
  /** List the listeners registered for an event. */
  listeners<E extends keyof TlsTunnelEvents>(
    event: E,
  ): Array<(...args: TlsTunnelEvents[E]) => void>;
}
