/**
 * In-memory session table for the Web login gate: issue, verify, and expire
 * the opaque identifiers handed out after a successful password check.
 *
 * Sessions are deliberately process-local. They carry no identity beyond
 * "someone knew the password", so there is nothing worth persisting, and a
 * restart invalidating every session is the desired property for a credential
 * an operator may rotate by editing configuration.
 * @module @deepseek-ai/dsh-host-web-auth/sessions
 */

import { randomBytes } from 'node:crypto'

/** Bytes of entropy per session identifier. */
const SESSION_ID_BYTES = 32

/** Issued sessions keyed by identifier, each holding its absolute expiry. */
export class SessionTable {
  private readonly sessions = new Map<string, number>()

  /**
   * @param ttlMs - lifetime granted to each newly issued session.
   * @param now - clock reading milliseconds since the epoch.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Issue one session.
   * @returns the opaque identifier to place in the client's cookie.
   */
  issue(): string {
    const id = randomBytes(SESSION_ID_BYTES).toString('base64url')
    this.sessions.set(id, this.now() + this.ttlMs)
    return id
  }

  /**
   * Whether one identifier names a live session, dropping it when expired.
   * @param id - the identifier presented by the client.
   * @returns true while the session exists and has not expired.
   */
  verify(id: string | undefined): boolean {
    if (id === undefined) return false
    const expiresAt = this.sessions.get(id)
    if (expiresAt === undefined) return false
    if (expiresAt <= this.now()) {
      this.sessions.delete(id)
      return false
    }
    return true
  }

  /**
   * Revoke one session, so a logout takes effect before its expiry.
   * @param id - the identifier to drop; an unknown one is ignored.
   */
  revoke(id: string | undefined): void {
    if (id !== undefined) this.sessions.delete(id)
  }

  /**
   * Drop every expired entry. Verification already expires lazily, so this
   * only bounds the memory held by sessions nobody returns for.
   */
  sweep(): void {
    const now = this.now()
    for (const [id, expiresAt] of this.sessions) {
      if (expiresAt <= now) this.sessions.delete(id)
    }
  }

  /** Live and expired-but-unswept entries, for tests and diagnostics. */
  get size(): number {
    return this.sessions.size
  }
}
