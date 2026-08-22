/**
 * Unit coverage for the login gate's owned pieces: the session table, the
 * attempt limiter, cookie encoding, and the login page's escaping.
 */

import { describe, expect, it } from 'vitest'
import { isSecureRequest, readCookie, serializeSessionCookie, SESSION_COOKIE } from '../src/cookie.ts'
import { renderLoginPage } from '../src/login-page.ts'
import { AttemptLimiter } from '../src/rate-limit.ts'
import { SessionTable } from '../src/sessions.ts'

/** A clock the test advances by hand. */
function clock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let value = start
  return { now: () => value, advance: (ms) => { value += ms } }
}

describe('SessionTable', () => {
  it('issues unguessable, distinct identifiers that verify until they expire', () => {
    const time = clock()
    const sessions = new SessionTable(1_000, time.now)
    const first = sessions.issue()
    const second = sessions.issue()

    expect(first).not.toBe(second)
    // 32 bytes of entropy; base64url of 32 bytes is 43 characters.
    expect(first).toMatch(/^[\w-]{43}$/u)
    expect(sessions.verify(first)).toBe(true)
    expect(sessions.verify(second)).toBe(true)

    // An unknown or absent identifier never verifies.
    expect(sessions.verify('not-a-session')).toBe(false)
    expect(sessions.verify(undefined)).toBe(false)

    // Expiry is exclusive at the boundary and drops the entry as it reads it,
    // so an abandoned session cannot accumulate.
    time.advance(1_000)
    expect(sessions.verify(first)).toBe(false)
    expect(sessions.size).toBe(1)
  })

  it('revokes one session immediately and sweeps only expired entries', () => {
    const time = clock()
    const sessions = new SessionTable(1_000, time.now)
    const live = sessions.issue()
    const doomed = sessions.issue()

    sessions.revoke(doomed)
    expect(sessions.verify(doomed)).toBe(false)
    expect(sessions.verify(live)).toBe(true)
    // Revoking an unknown id is a no-op, so a logout with a stale cookie is safe.
    expect(() => { sessions.revoke('unknown') }).not.toThrow()
    expect(() => { sessions.revoke(undefined) }).not.toThrow()

    const survivor = sessions.issue()
    time.advance(500)
    const younger = sessions.issue()
    time.advance(600) // survivor and live expired; younger has not
    sessions.sweep()
    expect(sessions.size).toBe(1)
    expect(sessions.verify(younger)).toBe(true)
    expect(sessions.verify(survivor)).toBe(false)
  })
})

describe('AttemptLimiter', () => {
  it('refuses a client after its window fills, then admits it again in the next window', () => {
    const time = clock()
    const limiter = new AttemptLimiter(3, 1_000, time.now)

    expect(limiter.allows('a')).toBe(true)
    limiter.fail('a')
    limiter.fail('a')
    expect(limiter.allows('a')).toBe(true)
    limiter.fail('a')
    expect(limiter.allows('a')).toBe(false)

    // One attacker must not lock out the whole deployment.
    expect(limiter.allows('b')).toBe(true)

    time.advance(1_000)
    expect(limiter.allows('a')).toBe(true)
  })

  it('clears a client window on success and sweeps elapsed windows', () => {
    const time = clock()
    const limiter = new AttemptLimiter(2, 1_000, time.now)
    limiter.fail('a')
    limiter.fail('a')
    expect(limiter.allows('a')).toBe(false)
    limiter.succeed('a')
    expect(limiter.allows('a')).toBe(true)

    limiter.fail('b')
    time.advance(1_500)
    // A failure landing in an elapsed window starts a fresh one rather than
    // accumulating across windows.
    limiter.fail('c')
    limiter.sweep()
    expect(limiter.allows('b')).toBe(true)
    expect(limiter.allows('c')).toBe(true)
  })
})

describe('session cookie', () => {
  it('reads its own value out of a shared Cookie header, in either HTTP representation', () => {
    const header = `other=1; ${SESSION_COOKIE}=abc123; trailing=2`
    expect(readCookie({ headers: { cookie: header } }, SESSION_COOKIE)).toBe('abc123')
    expect(readCookie({ headers: new Headers({ cookie: header }) }, SESSION_COOKIE)).toBe('abc123')
    expect(readCookie({ headers: new Headers() }, SESSION_COOKIE)).toBeUndefined()
    expect(readCookie({ headers: {} }, SESSION_COOKIE)).toBeUndefined()
    expect(readCookie({ headers: { cookie: 'other=1' } }, SESSION_COOKIE)).toBeUndefined()
    // A valueless segment must not be read as a match.
    expect(readCookie({ headers: { cookie: SESSION_COOKIE } }, SESSION_COOKIE)).toBeUndefined()
    // A name that merely shares a prefix is a different cookie.
    expect(readCookie({ headers: { cookie: `${SESSION_COOKIE}_other=x` } }, SESSION_COOKIE)).toBeUndefined()
  })

  it('always marks the cookie HttpOnly and SameSite=Strict, and Secure only over TLS', () => {
    const insecure = serializeSessionCookie('abc', false, 60)
    expect(insecure).toBe(`${SESSION_COOKIE}=abc; Path=/; HttpOnly; SameSite=Strict; Max-Age=60`)
    expect(serializeSessionCookie('abc', true, 60)).toContain('; Secure')

    // Expiring the cookie keeps every attribute, which is what makes a
    // browser overwrite the existing one rather than keep it beside a new one.
    const cleared = serializeSessionCookie(undefined, true, 0)
    expect(cleared).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`)
  })

  it('reads the original scheme from the proxy header, falling back to the socket', () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'https' }, socket: {} } as never)).toBe(true)
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'http' }, socket: {} } as never)).toBe(false)
    // A proxy chain appends, so the client-facing hop is the first value.
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'https, http' }, socket: {} } as never)).toBe(true)
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': ['https'] }, socket: {} } as never)).toBe(true)
    // Without the header, a TLS socket is the only evidence.
    expect(isSecureRequest({ headers: {}, socket: {} } as never)).toBe(false)
    expect(isSecureRequest({ headers: {}, socket: { encrypted: true } } as never)).toBe(true)
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': '' }, socket: { encrypted: true } } as never)).toBe(true)
  })
})

describe('login page', () => {
  it('escapes the redirect target so it cannot break out of its attribute', () => {
    const html = renderLoginPage({ next: '/a"><script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('value="/a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"')
  })

  it('escapes the error message and omits the alert entirely when there is none', () => {
    expect(renderLoginPage({ next: '/' })).not.toContain('role="alert"')
    const html = renderLoginPage({ next: '/', error: '<b>&bad</b>' })
    expect(html).toContain('&lt;b&gt;&amp;bad&lt;/b&gt;')
    expect(html).not.toContain('<b>&bad</b>')
  })

  it('posts to the login endpoint and asks browsers not to index it', () => {
    const html = renderLoginPage({ next: '/next' })
    expect(html).toContain('action="/__auth/login"')
    expect(html).toContain('name="robots" content="noindex, nofollow"')
    expect(html).toContain('type="password"')
  })
})
