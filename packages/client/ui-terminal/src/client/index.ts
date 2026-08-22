/**
 * Terminal plugin, browser half: the global terminal Dock registered into the
 * root `shell.overlay` floating layer. The Dock lists every live terminal
 * across all sessions (root-scoped `listAll` Remote), spawns into the active
 * session, and opens each terminal as a draggable floating window whose
 * read/write calls address the terminal's owning session. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the
// Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { TerminalInjected } from './contract/slots.ts'
import { createTerminalStore } from './store.ts'
import { TerminalDock } from './TerminalDock.tsx'
import { SurfaceCollapseService, TerminalPanelController } from './service.ts'
// The xterm.js base stylesheet, inlined into the bundle (the build's CSS asset
// pipeline cannot resolve bare package CSS specifiers, so it ships as a string).
import xtermCss from './xterm.css?inline'

export type { ITerminalPanel, TerminalInjected, TerminalPanelProps, TerminalPanelSnapshot } from './contract/slots.ts'

/** Required services: the slot registry, the terminal Remote namespace, and the session list. */
export const inject = ['slots', 'remote', 'remote.terminalWeb', 'sessions']

/**
 * Register the terminal Dock once its slot declaration is on the ledger. The
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
  const surfaceCollapse = new SurfaceCollapseService()
  ctx.reflect.provide('surfaceCollapse', surfaceCollapse)
  const injected = (): TerminalInjected => ({
    spawnTerminal: (sessionId, request) => remote.spawn(sessionId, request),
    writeTerminal: (sessionId, request) => remote.write(sessionId, request),
    signalTerminal: (sessionId, request) => remote.signal(sessionId, request),
    resizeTerminal: (sessionId, request) => remote.resize(sessionId, request),
    renameTerminal: (sessionId, request) => remote.rename(sessionId, request),
    killTerminal: (sessionId, request) => remote.kill(sessionId, request),
    listTerminals: sessionId => remote.list(sessionId),
    listAllTerminals: () => remote.listAll(),
    readTerminal: (sessionId, request) => remote.read(sessionId, request),
    onTerminalOutput: listener => ctx.remote.$on('terminal/output', listener),
    onTerminalExit: listener => ctx.remote.$on('terminal/exit', listener),
    collapseAllSurfaces: () => { surfaceCollapse.collapseAll() },
    expandAllSurfaces: () => { surfaceCollapse.expandAll() },
    terminalPanel,
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'terminal-panel', order: 0, store, inject: injected },
    TerminalDock,
  ))
}
