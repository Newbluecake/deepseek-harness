/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver, a stub credential provider, and the
 * web-auth row, and every assertion observes the user-visible HTTP surface of
 * the running server — what an unauthenticated visitor receives, what a login
 * exchanges, and what an authenticated session then reaches.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import HttpServer from '@deepseek-ai/dsh-host-webserver'
import * as WebAuth from '../src/index.ts'
import { SESSION_COOKIE } from '../src/cookie.ts'

const PASSWORD = 'correct horse battery staple'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Minimal credential provider: the seam's `resolve` is all this package uses,
 * and the value is what the composition under test is parameterized by.
 */
class StubCredentials extends Service {
  static Config = null
  constructor(ctx: Context, private readonly value: string | undefined) {
    super(ctx, 'credentials')
  }

  resolve(): Promise<{ value: string; source: string } | undefined> {
    return Promise.resolve(this.value === undefined ? undefined : { value: this.value, source: 'test' })
  }
}

/** Boot webserver + credentials + web-auth through the real Loader. */
async function loadComposition(options: { password?: string | undefined } = {}): Promise<Context> {
  // Distinguishes "no argument" from an explicit unconfigured password, which
  // a defaulted positional parameter would collapse into the same call.
  const password = 'password' in options ? options.password : PASSWORD
  root = await mkdtemp(join(tmpdir(), 'dsh-web-auth-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: 'test:credentials'",
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-web-auth'",
    '  config:',
    '    passwordRef: DSH_WEB_PASSWORD',
    '    maxAttempts: 3',
    '    attemptWindowSeconds: 300',
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', HttpServer],
    ['@deepseek-ai/dsh-host-web-auth', WebAuth],
    ['test:credentials', class extends StubCredentials {
      constructor(ctx: Context) { super(ctx, password) }
    }],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

/** One request against the running server, following no redirects. */
async function call(port: number, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${String(port)}${path}`, { redirect: 'manual', ...init })
}

/** Post the login form and return the raw response. */
async function login(port: number, password: string, next = '/'): Promise<Response> {
  return call(port, '/__auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, next }).toString(),
  })
}

/** Extract the session cookie value from a Set-Cookie response. */
function sessionCookieOf(response: Response): string {
  const raw = response.headers.get('set-cookie')
  expect(raw).toBeTruthy()
  const value = /dsh_session=([^;]*)/u.exec(raw ?? '')?.[1]
  expect(value).toBeTruthy()
  return value as string
}

describe('real Loader composition', () => {
  it('gates the whole site, exchanges a password for a session, and then admits it', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const server = loaded.webServer
    const port = server.port
    // Stand in for the rows a real composition protects: the SPA fallback and
    // an /api route. Neither knows a gate exists.
    server.registerFallback((_req, res) => { res.writeHead(200); res.end('SPA') })
    server.register({ kind: 'prefix', path: '/api', handler: (_req, res) => { res.writeHead(200); res.end('API') } })

    // A navigation gets the login page in place of the SPA — the dist is never
    // served to an unauthenticated visitor.
    const navigation = await call(port, '/', { headers: { accept: 'text/html' } })
    expect(navigation.status).toBe(401)
    expect(await navigation.text()).toContain('action="/__auth/login"')

    // The password field must not be framable by another origin.
    expect(navigation.headers.get('x-frame-options')).toBe('DENY')
    expect(navigation.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")

    // A non-navigation gets a status its caller can act on, not HTML.
    const api = await call(port, '/api/session.list')
    expect(api.status).toBe(401)
    expect(api.headers.get('content-type')).toContain('text/plain')
    expect(await api.text()).toBe('authentication required')

    // A wrong password re-renders the form with an error and no cookie.
    const wrong = await login(port, 'wrong')
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()
    expect(await wrong.text()).toContain('口令不正确')

    // The correct password redirects to the requested target and sets a
    // hardened cookie.
    const accepted = await login(port, PASSWORD, '/workspace')
    expect(accepted.status).toBe(303)
    expect(accepted.headers.get('location')).toBe('/workspace')
    const cookie = `${SESSION_COOKIE}=${sessionCookieOf(accepted)}`
    expect(accepted.headers.get('set-cookie')).toContain('HttpOnly')
    expect(accepted.headers.get('set-cookie')).toContain('SameSite=Strict')
    // Plain HTTP: no Secure attribute, or the browser would drop the cookie.
    expect(accepted.headers.get('set-cookie')).not.toContain('Secure')

    // With the session, both protected rows answer normally.
    expect(await (await call(port, '/', { headers: { cookie, accept: 'text/html' } })).text()).toBe('SPA')
    expect(await (await call(port, '/api/session.list', { headers: { cookie } })).text()).toBe('API')

    // A forged session is refused; the cookie value is the whole credential.
    expect((await call(port, '/api/x', { headers: { cookie: `${SESSION_COOKIE}=forged` } })).status).toBe(401)

    // Logout revokes the session server-side, so replaying the same cookie fails.
    const loggedOut = await call(port, '/__auth/logout', { headers: { cookie } })
    expect(loggedOut.status).toBe(303)
    expect(loggedOut.headers.get('location')).toBe('/__auth/login')
    expect(loggedOut.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await call(port, '/api/x', { headers: { cookie } })).status).toBe(401)
  })

  it('gates WebSocket upgrades, which no HTTP route covers', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const server = loaded.webServer
    const port = server.port
    server.registerUpgrade({
      path: '/api/events',
      handler: (_req, socket) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
      },
    })

    /** Attempt one upgrade; resolve with the first bytes, or '' when destroyed. */
    const attempt = async (cookie?: string): Promise<string> => {
      const socket = connect(port, '127.0.0.1')
      socket.on('error', () => { /* server-side reset is the fixture outcome */ })
      await once(socket, 'connect')
      const settled = Promise.race([
        once(socket, 'data').then(chunks => String(chunks[0])),
        once(socket, 'close').then(() => ''),
      ])
      socket.write([
        'GET /api/events HTTP/1.1', `Host: 127.0.0.1:${String(port)}`,
        ...cookie === undefined ? [] : [`Cookie: ${cookie}`],
        'Connection: Upgrade', 'Upgrade: websocket', '', '',
      ].join('\r\n'))
      const result = await settled
      socket.destroy()
      return result
    }

    expect(await attempt()).toBe('')
    expect(await attempt(`${SESSION_COOKIE}=forged`)).toBe('')
    const cookie = `${SESSION_COOKIE}=${sessionCookieOf(await login(port, PASSWORD))}`
    expect(await attempt(cookie)).toContain('101 Switching Protocols')
  })

  it('refuses every login once the attempt window fills, without locking out other clients', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await (await login(port, 'wrong')).text()).toContain('口令不正确')
    }
    // The window is full: even the correct password is refused, which is what
    // makes an unattended guessing script unprofitable.
    const throttled = await login(port, PASSWORD)
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('set-cookie')).toBeNull()
    expect(await throttled.text()).toContain('尝试次数过多')
  })

  it('fails closed when the password is unconfigured, rather than serving open', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition({ password: undefined })
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('SPA') })

    expect((await call(port, '/api/x')).status).toBe(401)
    // No password can be correct, so no login can succeed and the SPA stays
    // unreachable — a misconfigured deployment is shut, never open.
    const attempt = await login(port, 'anything')
    expect(attempt.status).toBe(503)
    expect(attempt.headers.get('set-cookie')).toBeNull()
    expect(await attempt.text()).toContain('尚未配置访问口令')
  })

  it('keeps the post-login redirect on this origin', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    // An absolute or protocol-relative target would make the login form an
    // open redirect; both collapse to the site root.
    for (const next of ['https://evil.example/', '//evil.example/', 'javascript:alert(1)']) {
      const response = await login(port, PASSWORD, next)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/')
    }
    // A same-origin path is preserved, including its query.
    expect((await login(port, PASSWORD, '/w?tab=1')).headers.get('location')).toBe('/w?tab=1')
  })

  it('serves the login page on GET and refuses other methods on the login route', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    const page = await call(port, '/__auth/login?next=%2Fdeep')
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('x-frame-options')).toBe('DENY')
    expect(page.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(await page.text()).toContain('value="/deep"')
    expect((await call(port, '/__auth/login', { method: 'DELETE' })).status).toBe(405)
  })

  it('keeps every off-site redirect target out of the login form and the Location header', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    // Each raw value resolves off-site in a browser even though a prefix check
    // reads it as a same-origin path.
    const hostile = [
      '//evil.com',
      '/\\evil.com',
      '/..//evil.com',
      '/./\\evil.com',
      '/a/../..//evil.com',
      '/\t/evil.com',
      '/\r\n//evil.com',
      'https://evil.com/',
      'javascript:alert(1)',
      '//[',
    ]
    for (const raw of hostile) {
      const page = await call(port, `/__auth/login?next=${encodeURIComponent(raw)}`)
      expect(page.status).toBe(200)
      // The form must carry the site root, never the supplied target.
      expect(await page.text()).toContain('name="next" value="/"')

      // The same value posted through the form must not become a Location.
      const accepted = await login(port, PASSWORD, raw)
      expect(accepted.status).toBe(303)
      expect(accepted.headers.get('location')).toBe('/')
    }

    // Percent-encoded separators are ordinary path characters, not authority
    // delimiters, so they survive rather than being discarded.
    const encoded = await call(port, `/__auth/login?next=${encodeURIComponent('/%5Cevil.com')}`)
    expect(await encoded.text()).toContain('value="/%5Cevil.com"')
    const deep = await login(port, PASSWORD, '/deep/page?tab=1')
    expect(deep.headers.get('location')).toBe('/deep/page?tab=1')
  })

  it('refuses a protocol-relative request target when it intercepts the navigation', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port
    loaded.webServer.registerFallback((_req, res) => { res.writeHead(200); res.end('SPA') })

    // fetch would normalize this away, so the traversal target is written onto
    // the wire directly: `/..//evil.com` normalizes to the path `//evil.com`.
    const socket = connect(port, '127.0.0.1')
    await once(socket, 'connect')
    const response = once(socket, 'data')
    socket.write([
      'GET /..//evil.com HTTP/1.1', `Host: 127.0.0.1:${String(port)}`,
      'Accept: text/html', 'Connection: close', '', '',
    ].join('\r\n'))
    const [data] = await response as [Buffer]
    const text = String(data)
    socket.destroy()

    expect(text).toContain('401')
    expect(text).toContain('name="next" value="/"')
    expect(text).not.toContain('value="//evil.com"')
  })

  it('distinguishes navigations from non-HTML and non-read requests', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    // HEAD is a navigation-class read even though fetch exposes no body.
    const head = await call(port, '/deep?tab=1', { method: 'HEAD', headers: { accept: 'text/html' } })
    expect(head.status).toBe(401)
    expect(head.headers.get('content-type')).toContain('text/html')
    // Missing Accept, and write methods even with an HTML Accept, receive the
    // machine-readable refusal rather than the form.
    expect((await call(port, '/deep')).headers.get('content-type')).toContain('text/plain')
    expect((await call(port, '/deep', { method: 'POST', headers: { accept: 'text/html' } })).headers.get('content-type')).toContain('text/plain')
  })

  it('handles missing, equal-length wrong, and oversized login bodies', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port

    // Missing password exercises the absent field, while an equal-length wrong
    // value reaches timingSafeEqual rather than the length shortcut.
    const missing = await call(port, '/__auth/login', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'next=%2F',
    })
    expect(missing.status).toBe(401)
    expect(await missing.text()).toContain('口令不正确')
    const equalLength = await login(port, 'x'.repeat(PASSWORD.length))
    expect(equalLength.status).toBe(401)

    // The cap applies to the complete body and refuses before parsing.
    const oversized = await call(port, '/__auth/login', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x'.repeat(8_193),
    })
    expect(oversized.status).toBe(413)
  })

  it('marks a session Secure when TLS terminated at a proxy', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const port = loaded.webServer.port
    const accepted = await call(port, '/__auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
      },
      body: new URLSearchParams({ password: PASSWORD }).toString(),
    })
    expect(accepted.status).toBe(303)
    expect(accepted.headers.get('set-cookie')).toContain('; Secure')
  })

  it('releases the admission seat on disposal, leaving the server open again', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const server = loaded.webServer
    const port = server.port
    server.registerFallback((_req, res) => { res.writeHead(200); res.end('SPA') })
    expect((await call(port, '/')).status).toBe(401)

    // Disposing only the web-auth row must restore an ungated server and free
    // the seat for a later registration (the HMR-safety relation).
    const entry = [...loaded.loader.entries()]
      .find(candidate => candidate.options.name === '@deepseek-ai/dsh-host-web-auth')
    await entry?.fiber?.dispose()
    expect(await (await call(port, '/')).text()).toBe('SPA')
    expect(() => server.registerGate({ http: () => true, upgrade: () => true })).not.toThrow()
  })
})
