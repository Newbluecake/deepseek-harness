/**
 * Terminal plugin, browser half: the bottom terminal panel registered into the
 * root `shell.overlay` floating layer. The panel reads the active session
 * through the global `useSessions` hook and drives the Host terminal service
 * through one inject face wrapping `ctx.remote.terminalWeb` plus the forwarded
 * `terminal/output` / `terminal/exit` event subscriptions. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the
// Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { TerminalInjected } from './contract/slots.ts'
import { createTerminalStore } from './store.ts'
import { TerminalPanel } from './TerminalPanel.tsx'
import { TerminalPanelController } from './service.ts'
// The xterm.js base stylesheet, inlined into the bundle (the build's CSS asset
// pipeline cannot resolve bare package CSS specifiers, so it ships as a string).
import xtermCss from './xterm.css?inline'

export type { ITerminalPanel, TerminalInjected, TerminalPanelProps, TerminalPanelSnapshot } from './contract/slots.ts'

/** Required services: the slot registry, the terminal Remote namespace, and the session list. */
export const inject = ['slots', 'remote', 'remote.terminalWeb', 'sessions']

/**
 * Register the terminal panel once its slot declaration is on the ledger. The
 * inject factory returns plain callbacks over the Remote namespace and the
 * forwarded-event subscriptions; the components reach them through the face.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Inject the xterm.js base stylesheet once for the plugin's lifetime.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-dsh-xterm', '')
    style.textContent = xtermCss
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'terminal: xterm base stylesheet')
  const remote = ctx.remote.terminalWeb
  const store = createTerminalStore()
  const terminalPanel = new TerminalPanelController()
  ctx.reflect.provide('terminalPanel', terminalPanel)
  const injected = (): TerminalInjected => ({
    spawnTerminal: (sessionId, request) => remote.spawn(sessionId, request),
    writeTerminal: (sessionId, request) => remote.write(sessionId, request),
    signalTerminal: (sessionId, request) => remote.signal(sessionId, request),
    resizeTerminal: (sessionId, request) => remote.resize(sessionId, request),
    renameTerminal: (sessionId, request) => remote.rename(sessionId, request),
    killTerminal: (sessionId, request) => remote.kill(sessionId, request),
    listTerminals: sessionId => remote.list(sessionId),
    readTerminal: (sessionId, request) => remote.read(sessionId, request),
    onTerminalOutput: listener => ctx.remote.$on('terminal/output', listener),
    onTerminalExit: listener => ctx.remote.$on('terminal/exit', listener),
    terminalPanel,
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'terminal-panel', order: 0, store, inject: injected },
    TerminalPanel,
  ))
}
