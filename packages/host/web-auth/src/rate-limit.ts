/**
 * Fixed-window attempt limiter for the login endpoint.
 *
 * A password endpoint reachable from a network needs brute-force resistance
 * that does not depend on the password's own strength: without it, a shared
 * secret an operator picked by hand falls to an unattended script.
 *
 * The window is keyed by the client address the transport reports, which
 * separates attackers only while those addresses are distinct. Behind a
 * reverse proxy every visitor arrives from the proxy's own address and shares
 * one window, so a single attacker's failures lock out the whole deployment
 * until the window elapses. Reading a forwarded-address header instead is not
 * an option: that value is attacker-controlled, and trusting it would let one
 * client mint unlimited windows and remove the limit entirely. A deployment
 * that needs per-visitor limiting must give the harness distinct source
 * addresses.
 * @module @deepseek-ai/dsh-host-web-auth/rate-limit
 */

/** Failed-attempt counters keyed by client address. */
export class AttemptLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>()

  /**
   * @param maxAttempts - failures tolerated per window before refusal.
   * @param windowMs - length of the fixed window.
   * @param now - clock reading milliseconds since the epoch.
   */
  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Whether this client may attempt a login right now.
   * @param key - client address.
   * @returns true while the client's window has attempts left.
   */
  allows(key: string): boolean {
    const window = this.windows.get(key)
    if (window === undefined) return true
    if (window.resetAt <= this.now()) {
      this.windows.delete(key)
      return true
    }
    return window.count < this.maxAttempts
  }

  /**
   * Count one failed attempt against this client's window.
   * @param key - client address.
   */
  fail(key: string): void {
    const now = this.now()
    const window = this.windows.get(key)
    if (window === undefined || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs })
      return
    }
    window.count += 1
  }

  /**
   * Clear this client's window after a success, so a correct password
   * immediately restores a client that had been fumbling its way in.
   * @param key - client address.
   */
  succeed(key: string): void {
    this.windows.delete(key)
  }

  /** Drop every window whose reset time has passed. */
  sweep(): void {
    const now = this.now()
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}
