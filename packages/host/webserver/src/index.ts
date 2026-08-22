/**
 * @deepseek-ai/dsh-host-webserver — Web route-registration plugin: a node:http
 * server plus the `webServer` service (HTTP and upgrade route registries, the
 * single admission seat in front of both, the structured index injection table
 * with raw transform taps behind it, and the
 * single fallback seat for everything no route claims). Knows no harness concepts and serves no files; the composing
 * application's frontend plugin owns dist serving through the fallback hook.
 * Web shape only — Electron loads dist over file:// and carries fetch over an
 * IPC bridge. This package never prints: the URL line belongs to the shell.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { renderIndexInjections, type IndexInjection } from './injections.ts'

export { renderIndexInjections } from './injections.ts'
export type { IndexInjection, IndexInjectionPlacement } from './injections.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServer
  }
  interface Events {
    /**
     * Collect the structured index injection table. Emitted on every index
     * render and every worker boot-payload request; listeners push their
     * current rows, so a row's data is read fresh at emit time.
     * @param table - Mutable row table; listeners append in activation order.
     * @mode emit
     */
    'webserver/index-inject'(table: IndexInjection[]): void
  }
}

/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
export type WebRouteKind = 'exact' | 'prefix'

/** One named route registration. */
export interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** One exact-path HTTP upgrade registration. */
export interface WebUpgradeRoute {
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns protocol negotiation and the upgraded socket after dispatch. */
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

/**
 * The single admission owner in front of every route, fallback, and upgrade.
 *
 * A gate is the one place that sees all three dispatch paths, so a deployment
 * policy expressed here cannot be bypassed by a route registered later or by
 * an upgrade that no HTTP route covers. `http` answers the request itself when
 * it refuses (a redirect, a login page, a 401); returning `false` after
 * answering means dispatch stops. `upgrade` only decides — the carrier
 * destroys a refused socket, because an upgrade has no response to render.
 */
export interface WebGate {
  /**
   * Admit or answer one HTTP request before route matching.
   * @param req - the incoming request.
   * @param res - the response, which a refusal owns and must end.
   * @returns true to dispatch normally; false when this gate answered.
   */
  http: (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>
  /**
   * Admit one HTTP upgrade before upgrade-route matching.
   * @param req - the upgrade request.
   * @returns true to dispatch normally; false to destroy the socket.
   */
  upgrade: (req: IncomingMessage) => boolean | Promise<boolean>
}

/** Gateway config: the listen address. */
export interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
}

/**
 * The browser HTTP carrier service. Activation listens immediately. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and the fallback handler answers anything not yet claimed
 * during startup with 404 until its owner registers. A listen failure rejects
 * initialization, and the boot process reports the failed fiber.
 *
 * A non-loopback bind refuses every request and destroys every upgrade while
 * the {@link WebGate} seat is empty, so publishing this server to the network
 * without an authentication row serves nothing.
 */
export class WebServer extends Service {
  static Config: z<Config> = z.object({
    host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
    port: z.natural().max(65535).required(),
  })

  private readonly exact = new Map<string, WebRoute>()
  private readonly prefixes = new Map<string, WebRoute>()
  private readonly upgrades = new Map<string, WebUpgradeRoute>()
  private readonly upgradedSockets = new Set<Duplex>()
  private readonly indexTaps: ((html: string) => string)[] = []
  private fallback: WebRoute['handler'] | undefined
  private gate: WebGate | undefined
  private server!: Server
  private listenedPort!: number

  constructor(ctx: Context, private config: Config) {
    super(ctx, 'webServer')
  }

  /** The listening port (the OS-assigned value when config.port is 0). */
  get port(): number {
    return this.listenedPort
  }

  /** The configured bind host (the loopback or all-interfaces literal). */
  get host(): Config['host'] {
    return this.config.host
  }

  /**
   * Register a named route. Duplicate (kind, path) throws — route patterns are
   * a composition-level contract, so a collision is a misconfiguration.
   * @param route - kind, path, and the owning handler.
   * @returns the disposer removing the route.
   */
  register(route: WebRoute): () => void {
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(route.path)) {
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    }
    table.set(route.path, route)
    return () => { table.delete(route.path) }
  }

  /**
   * Register an exact-path HTTP upgrade route. Duplicate paths throw because
   * one socket can have only one protocol owner.
   * @param route - pathname and handler owning negotiation plus socket use.
   * @returns the disposer removing the route.
   */
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  /**
   * Claim the fallback seat: the handler answering every request no named
   * route matches (the SPA dist server in the shipped Web composition). One
   * owner only — a second registration throws, because two fallbacks cannot
   * compose.
   * @param handler - owns the full response lifecycle of unmatched requests.
   * @returns the disposer releasing the seat.
   */
  registerFallback(handler: WebRoute['handler']): () => void {
    if (this.fallback !== undefined) {
      throw new Error('webserver: fallback already registered')
    }
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  /**
   * Register a raw-HTML index transform, the escape hatch for markup no
   * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
   * registration order after rendering the structured rows.
   * @param transform - pure html-to-html function.
   * @returns the disposer removing the transform.
   */
  tapIndex(transform: (html: string) => string): () => void {
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  /**
   * Claim the admission seat: the {@link WebGate} consulted before every named
   * route, the fallback, and every upgrade. One owner only — a second
   * registration throws, because two admission policies cannot compose into a
   * single decision.
   *
   * An ungated server dispatches every request it accepts, so this seat is
   * what a composition must fill before widening the bind: the shipped Web
   * composition serves loopback ungated, where the operator at the console is
   * already the trust boundary, and refuses a non-loopback bind until an
   * authentication row claims this seat.
   * @param gate - the admission policy owning refusal responses.
   * @returns the disposer releasing the seat.
   */
  registerGate(gate: WebGate): () => void {
    if (this.gate !== undefined) {
      throw new Error('webserver: gate already registered')
    }
    this.gate = gate
    return () => { this.gate = undefined }
  }

  /**
   * Whether this server must refuse every request for lack of an admission owner.
   *
   * A loopback bind is reachable only by someone already on the machine, so an
   * ungated loopback server stays open. A non-loopback bind publishes the same
   * dispatch to the network, where "no gate" means "no authentication" — so it
   * is refused here rather than served. Because the seat can be claimed and
   * released at runtime, this is read per request: registering a gate opens
   * the server and disposing that registration closes it again.
   */
  private get closedForMissingGate(): boolean {
    return this.gate === undefined && this.config.host !== '127.0.0.1'
  }

  /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
  async [Service.init](): Promise<void> {
    const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (this.closedForMissingGate) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('web server unavailable: a non-loopback bind requires an authentication row')
        return
      }
      // Admission precedes matching so a gate covers routes registered after
      // it, and the static fallback, without either knowing a gate exists.
      if (this.gate !== undefined && !await this.gate.http(req, res)) return
      /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server
      requests; the field is only optional on the client-side IncomingMessage type */
      const rawPath = new URL(req.url ?? '/', 'http://x').pathname
      const route = this.match(rawPath)
      if (route !== undefined) {
        await route.handler(req, res)
        return
      }
      const fallback = this.fallback
      if (fallback === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      await fallback(req, res)
    }
    // Last-resort guard: handle() rejecting would otherwise be an unhandled
    // rejection killing the process on one malformed request (bad %-escape,
    // client dropping mid-body). Per-request failures log and answer 400 —
    // never a process exit.
    this.server = createServer((req, res) => {
      handle(req, res).catch((err: unknown) => {
        this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)))
        if (res.headersSent) {
          res.destroy()
          return
        }
        res.writeHead(400)
        res.end()
      })
    })
    this.server.on('upgrade', (req, socket, head) => {
      const onError = (error: Error): void => {
        this.ctx.logger.warn(error)
        socket.destroy()
      }
      socket.on('error', onError)
      socket.once('close', () => {
        socket.off('error', onError)
        this.upgradedSockets.delete(socket)
      })
      const dispatch = async (): Promise<void> => {
        // A refused upgrade has no response to render, so the gate only
        // decides and the carrier destroys the socket.
        if (this.closedForMissingGate) {
          socket.destroy()
          return
        }
        if (this.gate !== undefined && !await this.gate.upgrade(req)) {
          socket.destroy()
          return
        }
        /* v8 ignore next -- node:http always sets url on server requests. */
        const route = this.upgrades.get(new URL(req.url ?? '/', 'http://x').pathname)
        if (route === undefined) {
          socket.destroy()
          return
        }
        this.upgradedSockets.add(socket)
        await route.handler(req, socket, head)
      }
      dispatch().catch((error: unknown) => {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject)
        this.server.on('error', (err) => { this.ctx.logger.error(err) })
        this.listenedPort = (this.server.address() as AddressInfo).port
        resolve()
      })
    })

    // Node does not include upgraded sockets in closeAllConnections(). The service
    // owns them with the other connections, so it tracks and destroys them explicitly.
    this.ctx.effect(() => async () => {
      const serverClosed = new Promise<void>((resolve) => {
        this.server.close(() => { resolve() })
      })
      this.server.closeAllConnections()
      const upgradedClosed = [...this.upgradedSockets].map(socket => new Promise<void>((resolve) => {
        socket.once('close', () => { resolve() })
        socket.destroy()
      }))
      await Promise.all([serverClosed, ...upgradedClosed])
    }, 'webServer.listen')
  }

  /** Longest-prefix-wins over the prefix table after an exact-table miss. */
  private match(pathname: string): WebRoute | undefined {
    const exact = this.exact.get(pathname)
    if (exact !== undefined) return exact
    let best: WebRoute | undefined
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
      if (best === undefined || prefix.length > best.path.length) best = route
    }
    return best
  }

  /**
   * Run an index.html body through the registered taps in registration order
   * — called by the fallback owner on every index response it renders.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  applyIndexTaps(html: string): string {
    let out = html
    for (const transform of this.indexTaps) out = transform(out)
    return out
  }

  /**
   * Gather the structured injection table: one `webserver/index-inject` emit,
   * every subscriber pushes its current rows. Fresh per call, so subscribers
   * read live state (module graph, theme preference) at emit time.
   * @returns rows in subscriber activation order.
   */
  collectIndexInjections(): IndexInjection[] {
    const table: IndexInjection[] = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  /**
   * Render one index.html body: the structured injection table first, then
   * the raw `tapIndex` transforms over the result.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  renderIndex(html: string): string {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }
}

export default WebServer
