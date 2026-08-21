/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-terminal-web`.
 * @module @deepseek-ai/dsh-terminal-web/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-terminal-web'

/** Cordis companion plugin name. */
export const name = 'terminal-web-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: an agent-scoped PTY facade whose owned sessions are
 * torn down by the Agent-disposal cleanup it registers, with no cross-plugin
 * mutable state to assert.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
