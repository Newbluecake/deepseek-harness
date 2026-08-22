/**
 * The web app's command-line provider: it parses the `dsh --profile web` flag
 * family (`--host`, `--port`, `--trusted-host`, `--no-open`) and its `--help`
 * text, then provides the immutable values as {@link WEB_STARTUP_SERVICE}.
 * Ordinary rows inject that service before reading it from lazy config.
 * @module @deepseek-ai/dsh-web-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'web-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** Plugin config: what this composition permits the command line to ask for. */
export interface StartupConfig {
  /**
   * Whether `--host 0.0.0.0` is accepted.
   *
   * The default refusal is not about the bind itself but about what the bind
   * exposes: the Web surface drives an agent that runs shell commands, so an
   * unauthenticated all-interfaces bind hands remote code execution to the
   * network. A composition that mounts an authentication row in front of the
   * server has closed that hole and sets this, which is why the permission
   * lives in the composition rather than in a flag a caller could pass without
   * having mounted anything.
   */
  allowNonLoopbackHost: boolean
}

export const Config: z<StartupConfig> = z.object({
  allowNonLoopbackHost: z.boolean().default(false),
})

/** What the web rows read from {@link WEB_STARTUP_SERVICE}. */
export interface WebStartupValues {
  /** Whether this invocation opens the default browser after startup. */
  openBrowser: boolean
  /** `--host`, absent when the invocation did not name one. */
  host?: string
  /** `--port`, absent when the invocation did not name one. */
  port?: number
  /** Explicit `--trusted-host` authorities, in argument order. */
  trustedHosts: string[]
}

/** The web flag family, as commander parsed it. */
interface WebOptions {
  host?: string
  open: boolean
  port?: string
  trustedHost?: string[]
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
`)
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; a non-numeric
 * `--port` is a usage error, as is `--host 0.0.0.0` unless the composition
 * permits it, so on rejection (and on `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 * @param config - validated {@link StartupConfig}.
 */
export function apply(ctx: Context, config?: StartupConfig): void {
  const allowNonLoopbackHost = config?.allowNonLoopbackHost ?? false
  const program = webCommand()
  program.action(() => {
    const options = program.opts<WebOptions>()
    if (options.host === '0.0.0.0' && !allowNonLoopbackHost) {
      program.error('error: --host 0.0.0.0 is refused because this composition has no authentication row: it would expose remote code execution to the network. Mount @deepseek-ai/dsh-host-web-auth and set allowNonLoopbackHost on the web-startup row, or use 127.0.0.1.')
    }
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
