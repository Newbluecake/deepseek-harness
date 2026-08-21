/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-file-explorer`.
 * @module @deepseek-ai/dsh-client-ui-file-explorer/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-file-explorer'

/** Cordis companion plugin name. */
export const name = 'client-ui-file-explorer-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin registering presentational
 * components into the root `details` slot and its session-scoped
 * `file-explorer.overlay` child seat plus its locale dictionaries — it emits
 * no cordis events and owns no cross-plugin mutable state (its store is
 * entry-local presentation state).
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
