/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-web-auth`.
 * @module @deepseek-ai/dsh-host-web-auth/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-web-auth'

/** Cordis companion plugin name. */
export const name = 'host-web-auth-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the owned relation is the single admission seat, and
 * like the frontend-static fallback seat it cannot be probed from the teardown
 * stream — `internal/plugin` fires before the disposing fiber's effects run,
 * so the legitimate owner still holds the seat at notification time and a
 * claim probe would false-positive on every correct disposal. Seat
 * register/release symmetry and the fail-closed refusal path are covered by
 * the package's real-composition tests instead.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
