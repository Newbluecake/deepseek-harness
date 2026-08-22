/**
 * @deepseek-ai/dsh-host-web-auth — password login for the Web surface.
 *
 * Claims the webserver's admission seat, so an unauthenticated request reaches
 * neither the SPA dist, nor `/api`, nor a WebSocket upgrade: a browser gets the
 * login page, anything else gets 401. A correct password mints a process-local
 * session and returns it as an `HttpOnly` cookie.
 *
 * The password is a {@link CredentialRef}, so it lives wherever this
 * deployment keeps its other secrets (`.credentials.yaml`, `.env`, the
 * environment) and rotates without a code change. It is compared in constant
 * time, and failures are rate limited per client address.
 *
 * This package provides `webAuth`, which is how `/api` learns that a request
 * carries a session it issued. Reachability remains the webserver binding's
 * policy: mounting this row is what makes a non-loopback binding defensible,
 * but it does not itself widen the bind.
 * @module @deepseek-ai/dsh-host-web-auth
 */

import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { isSecureRequest, readCookie, serializeSessionCookie, SESSION_COOKIE, type CookieBearingRequest } from './cookie.ts'
import { renderLoginPage } from './login-page.ts'
import { AttemptLimiter } from './rate-limit.ts'
import { SessionTable } from './sessions.ts'

export { SESSION_COOKIE } from './cookie.ts'

/** Stable Cordis plugin name. */
export const name = 'web-auth'

/** Services required before the admission seat can be claimed. */
export const inject = ['webServer', 'credentials']

/** Paths this package owns; the gate answers them instead of dispatching. */
const LOGIN_PATH = '/__auth/login'
const LOGOUT_PATH = '/__auth/logout'

/** Expired-entry sweep interval for the session and attempt tables. */
const SWEEP_INTERVAL_MS = 60_000

/** Largest login form body accepted, ample for one password field. */
const MAX_LOGIN_BODY_BYTES = 8192

/**
 * Private base for resolving request targets and post-login redirects.
 *
 * The authority is deliberately unroutable and never leaves the process: only
 * the path and query of a resolved URL are used, so the base exists to make
 * the parser agree with a browser about which references are same-origin.
 */
const NEXT_BASE = 'http://gate.invalid'

/** Origin of {@link NEXT_BASE}, compared against every resolved target. */
const NEXT_ORIGIN = new URL(NEXT_BASE).origin

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Whether a given request carries a session this deployment issued. */
    webAuth: WebAuthHandle
  }
}

/** The one question other host rows ask this package. */
export interface WebAuthHandle {
  /**
   * Whether one request carries a live session issued by this deployment.
   * @param req - the request to classify, in either HTTP representation.
   * @returns true when its session cookie names a live session.
   */
  isAuthenticated: (req: CookieBearingRequest) => boolean
}

/** Plugin config: the credential reference and session lifetime. */
export interface Config {
  /**
   * Environment-variable name holding the shared access password. The gate
   * refuses every request while this resolves to nothing, so a misconfigured
   * deployment fails closed rather than serving unauthenticated.
   */
  passwordRef: string
  /** Session lifetime in seconds. Default: 7 days. */
  sessionTtlSeconds: number
  /** Failed attempts tolerated per client address per window. Default: 10. */
  maxAttempts: number
  /** Length of the attempt-limiting window in seconds. Default: 300. */
  attemptWindowSeconds: number
}

export const Config: z<Config> = z.object({
  passwordRef: z.string().default('DSH_WEB_PASSWORD'),
  sessionTtlSeconds: z.natural().min(60).default(604_800),
  maxAttempts: z.natural().min(1).default(10),
  attemptWindowSeconds: z.natural().min(1).default(300),
})

/** Compare two secrets without leaking their common prefix length through timing. */
function secretsMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  // timingSafeEqual demands equal lengths; comparing a digest-free pair means
  // length alone is observable, which reveals nothing useful about the value.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Client address used to key the attempt limiter. */
function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

/** Whether this request looks like a browser navigation that should see the login page. */
function wantsHtml(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const accept = req.headers.accept
  return accept !== undefined && accept.includes('text/html')
}

/**
 * Read a bounded request body.
 * @param req - the request to drain.
 * @returns the body text, or undefined when it exceeded the cap.
 */
async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_LOGIN_BODY_BYTES) {
    // Drain rather than destroy so the caller can receive the 413 response.
    req.resume()
    return undefined
  }
  let size = 0
  let oversized = false
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (!oversized && size > MAX_LOGIN_BODY_BYTES) {
      // Keep draining a chunked body, but retain no more attacker-controlled data.
      oversized = true
      chunks.length = 0
      continue
    }
    if (!oversized) chunks.push(buffer)
  }
  return oversized ? undefined : Buffer.concat(chunks).toString('utf8')
}

/**
 * Same-origin relative path to return to after login.
 *
 * Resolution is delegated to the WHATWG URL parser against a fixed private
 * base, because prefix inspection does not agree with what a browser does:
 * `/\evil.com` and `/<tab>/evil.com` both start with a single `/` yet a
 * browser resolves them off-site, which would turn the login form into an
 * open redirect. Anything that lands on another origin — including an opaque
 * one such as `javascript:` — is replaced by the site root.
 *
 * The re-emitted value is checked separately: `/..//evil.com` resolves to this
 * origin but normalizes to the path `//evil.com`, which is protocol-relative
 * again once it is placed in the form and followed.
 * @param raw - the caller-supplied target.
 * @returns a safe same-origin path, defaulting to the site root.
 */
function safeNext(raw: string | undefined): string {
  if (raw === undefined) return '/'
  let resolved: URL
  try {
    resolved = new URL(raw, NEXT_BASE)
  } catch {
    // An unparsable authority such as `//[` is a target, never a crash.
    return '/'
  }
  if (resolved.origin !== NEXT_ORIGIN) return '/'
  // A same-origin URL on a special scheme always yields a `/`-prefixed
  // pathname, so only the protocol-relative form has to be excluded.
  const target = resolved.pathname + resolved.search
  return target.startsWith('//') ? '/' : target
}

/**
 * Mount the login gate.
 * @param ctx - plugin context carrying the webServer and credentials services.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const sessions = new SessionTable(config.sessionTtlSeconds * 1000)
  const attempts = new AttemptLimiter(config.maxAttempts, config.attemptWindowSeconds * 1000)
  // A malformed reference name is a misconfiguration, and throwing here fails
  // the load rather than resolving to nothing and refusing every request later.
  const passwordRef = credentialRef(config.passwordRef)

  ctx.provide('webAuth', {
    isAuthenticated: req => sessions.verify(readCookie(req, SESSION_COOKIE)),
  } satisfies WebAuthHandle)

  const sweep = setInterval(() => {
    sessions.sweep()
    attempts.sweep()
  }, SWEEP_INTERVAL_MS)
  sweep.unref()
  ctx.effect(() => () => { clearInterval(sweep) }, 'web-auth: expiry sweep')

  /** The configured password, or undefined while unconfigured. */
  const password = async (): Promise<string | undefined> =>
    (await ctx.credentials.resolve(passwordRef))?.value

  /**
   * Render the login page.
   *
   * The status is explicit rather than inferred from the presence of an error:
   * an intercepted navigation carries no error message yet is still an
   * unauthorized request, and answering it 200 would let a cache or a
   * scripted client mistake the login page for the resource it asked for.
   */
  const answerLogin = (res: ServerResponse, status: number, next: string, error?: string): void => {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      // A login page is per-request state; a shared cache must never replay it.
      'cache-control': 'no-store',
      // A password field must never render inside another origin's frame,
      // where an overlay could collect the keystrokes. Both headers are sent
      // because the older one still governs browsers that ignore CSP.
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
    })
    res.end(renderLoginPage({ next, ...error !== undefined && { error } }))
  }

  const handleLogin = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    if (req.method === 'GET') {
      answerLogin(res, 200, safeNext(url.searchParams.get('next') ?? undefined))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const body = await readBody(req)
    if (body === undefined) {
      res.writeHead(413)
      res.end()
      return
    }
    const form = new URLSearchParams(body)
    const next = safeNext(form.get('next') ?? undefined)
    const key = clientKey(req)
    if (!attempts.allows(key)) {
      answerLogin(res, 429, next, '尝试次数过多，请稍后再试。')
      return
    }
    const expected = await password()
    if (expected === undefined) {
      // Failing closed on an unconfigured password is the whole reason this
      // row can be mounted safely: no password means no way in, never open.
      ctx.logger.error(`web-auth: ${config.passwordRef} is not configured; every request is refused`)
      answerLogin(res, 503, next, '此实例尚未配置访问口令，请联系管理员。')
      return
    }
    const supplied = form.get('password')
    if (supplied === null || !secretsMatch(supplied, expected)) {
      attempts.fail(key)
      answerLogin(res, 401, next, '口令不正确。')
      return
    }
    attempts.succeed(key)
    res.writeHead(303, {
      location: next,
      'set-cookie': serializeSessionCookie(sessions.issue(), isSecureRequest(req), config.sessionTtlSeconds),
    })
    res.end()
  }

  const handleLogout = (req: IncomingMessage, res: ServerResponse): void => {
    sessions.revoke(readCookie(req, SESSION_COOKIE))
    res.writeHead(303, {
      location: LOGIN_PATH,
      'set-cookie': serializeSessionCookie(undefined, isSecureRequest(req), 0),
    })
    res.end()
  }

  ctx.effect(() => ctx.webServer.registerGate({
    http: async (req, res) => {
      const url = new URL(req.url ?? '/', NEXT_BASE)
      if (url.pathname === LOGIN_PATH) {
        await handleLogin(req, res, url)
        return false
      }
      if (url.pathname === LOGOUT_PATH) {
        handleLogout(req, res)
        return false
      }
      if (sessions.verify(readCookie(req, SESSION_COOKIE))) return true
      // A navigation gets the login page; anything else gets a status its
      // caller can act on, because rendering HTML into a fetch or an <img>
      // would only corrupt whatever the client expected.
      if (wantsHtml(req)) {
        answerLogin(res, 401, safeNext(url.pathname + url.search))
        return false
      }
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('authentication required')
      return false
    },
    upgrade: req => sessions.verify(readCookie(req, SESSION_COOKIE)),
  }), 'web-auth: admission gate')
}
