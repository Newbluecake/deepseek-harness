/**
 * Terminal slot contracts. One registration fills the root `shell.overlay`
 * floating layer with the global Terminal Dock: a bottom macOS-style icon that
 * pops up a list of every live terminal across all sessions, and one draggable
 * floating window per open terminal. The Dock reads the active session through
 * the global `useSessions` hook for spawning, and drives the Host terminal
 * service through one inject face wrapping `ctx.remote.terminalWeb` plus the
 * forwarded `terminal/output` / `terminal/exit` event subscriptions.
 */
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  TerminalWebKillRequest,
  TerminalWebListResult,
  TerminalWebReadRequest,
  TerminalWebReadResult,
  TerminalWebResizeRequest,
  TerminalWebRenameRequest,
  TerminalWebSignalRequest,
  TerminalWebSpawnRequest,
  TerminalWebSpawnResult,
  TerminalWebWriteRequest,
} from '@deepseek-ai/dsh-terminal-web/types'
import type { createTerminalStore } from '../store.ts'
import type { TerminalPanelController } from '../service.ts'

/** Public terminal Dock popup state consumed by the unified right Dock. */
export interface TerminalPanelSnapshot {
  open: boolean
}

/** Cross-plugin control face for the global terminal Dock. */
export interface ITerminalPanel {
  getSnapshot(): TerminalPanelSnapshot
  subscribe(listener: () => void): () => void
  open(): void
  close(): void
  toggle(): void
}

/** One forwarded terminal output chunk. */
export interface TerminalOutputPayload {
  sessionId: string
  data: string
  seq: number
}

/** One forwarded terminal exit notice. */
export interface TerminalExitPayload {
  sessionId: string
  exitCode: number | null
}

/** Injected Host terminal actions the Dock drives. */
export interface TerminalInjected {
  /** Spawn one interactive terminal in the session workspace. */
  spawnTerminal: (sessionId: SessionId, request: TerminalWebSpawnRequest) => Promise<RemoteResult<TerminalWebSpawnResult>>
  /** Write raw input to one terminal's stdin. */
  writeTerminal: (sessionId: SessionId, request: TerminalWebWriteRequest) => Promise<RemoteResult<void>>
  /** Signal one terminal's foreground process group. */
  signalTerminal: (sessionId: SessionId, request: TerminalWebSignalRequest) => Promise<RemoteResult<void>>
  /** Resize one terminal's PTY to match the emulator. */
  resizeTerminal: (sessionId: SessionId, request: TerminalWebResizeRequest) => Promise<RemoteResult<void>>
  /** Rename one terminal's display name (shown on its window title). */
  renameTerminal: (sessionId: SessionId, request: TerminalWebRenameRequest) => Promise<RemoteResult<void>>
  /** Close one terminal session. */
  killTerminal: (sessionId: SessionId, request: TerminalWebKillRequest) => Promise<RemoteResult<void>>
  /** List the session's live terminals. */
  listTerminals: (sessionId: SessionId) => Promise<RemoteResult<TerminalWebListResult>>
  /** List every live terminal across all sessions. */
  listAllTerminals: () => Promise<RemoteResult<TerminalWebListResult>>
  /** Read one terminal's retained scrollback and output cursor. */
  readTerminal: (sessionId: SessionId, request: TerminalWebReadRequest) => Promise<RemoteResult<TerminalWebReadResult>>
  /** Subscribe to forwarded terminal output chunks; returns the unsubscribe. */
  onTerminalOutput: (listener: (payload: TerminalOutputPayload) => void) => () => void
  /** Subscribe to forwarded terminal exit notices; returns the unsubscribe. */
  onTerminalExit: (listener: (payload: TerminalExitPayload) => void) => () => void
  /** Terminal-owned cross-plugin Dock controller. */
  terminalPanel: TerminalPanelController
}

/** Full Dock props: the `shell.overlay` runtime share, the Dock store, and the injected actions. */
export type TerminalPanelProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createTerminalStore>>
  & TerminalInjected
