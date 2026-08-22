/**
 * Cookie parsing and serialization for the Web login gate.
 *
 * The session cookie is `HttpOnly` (script must never read it), `SameSite=Strict`
 * (a cross-site navigation must not carry it, which is the second half of the
 * cross-site defense the `/api` fence performs on headers), `Path=/` (the gate
 * covers the whole site), and `Secure` whenever the request arrived over TLS.
 * @module @deepseek-ai/dsh-host-web-auth/cookie
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

/** Name of the session cookie this package issues. */
export const SESSION_COOKIE = 'dsh_session'

/** The header facts cookie reading needs, from either HTTP representation. */
export interface CookieBearingRequest {
  headers: IncomingHttpHeaders | Headers
}

/**
 * Read one cookie value from a request's `Cookie` header.
 * @param req - the incoming request, in either HTTP representation.
 * @param name - the cookie name to read.
 * @returns the raw value, or undefined when the header omits it.
 */
export function readCookie(req: CookieBearingRequest, name: string): string | undefined {
  const header = req.headers instanceof Headers
    ? req.headers.get('cookie') ?? undefined
    : req.headers.cookie
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    return part.slice(eq + 1).trim()
  }
  return undefined
}

/**
 * Whether this request reached the harness over TLS.
 *
 * The supported remote deployment terminates TLS at a reverse proxy, so the
 * scheme is only knowable from `X-Forwarded-Proto`. Trusting that header is
 * safe for this decision in the one direction it is used: a forged value can
 * only add the `Secure` attribute, which a spoofing client harms only itself
 * by triggering.
 * @param req - the incoming request.
 * @returns true when the original request scheme was https.
 */
export function isSecureRequest(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  if (first !== undefined && first !== '') return first === 'https'
  return 'encrypted' in req.socket
}

/**
 * Serialize the session cookie.
 * @param id - the session identifier, or undefined to expire the cookie.
 * @param secure - whether to set the `Secure` attribute.
 * @param maxAgeSeconds - lifetime matching the session's own TTL.
 * @returns one `Set-Cookie` value.
 */
export function serializeSessionCookie(
  id: string | undefined,
  secure: boolean,
  maxAgeSeconds: number,
): string {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Strict']
  if (secure) attributes.push('Secure')
  if (id === undefined) return `${SESSION_COOKIE}=; ${attributes.join('; ')}; Max-Age=0`
  return `${SESSION_COOKIE}=${id}; ${attributes.join('; ')}; Max-Age=${String(maxAgeSeconds)}`
}
