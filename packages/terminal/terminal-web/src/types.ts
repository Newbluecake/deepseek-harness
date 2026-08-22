/**
 * Wire vocabulary for the browser-facing terminal Remote service.
 * @module @deepseek-ai/dsh-terminal-web/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One raw output chunk from a live terminal PTY. Forwarded to consumers
     * verbatim; `data` carries ANSI escape sequences for xterm.js to render.
     * @param payload.sessionId - terminal session the chunk came from.
     * @param payload.data - raw UTF-8 output text.
     * @param payload.seq - per-session monotonic output sequence number.
     * @mode emit
     */
    'terminal/output'(payload: { sessionId: string; data: string; seq: number }): void
    /**
     * A terminal session's process exited.
     * @param payload.sessionId - terminal session that exited.
     * @param payload.exitCode - process exit code, or `null` when killed by signal.
     * @mode emit
     */
    'terminal/exit'(payload: { sessionId: string; exitCode: number | null }): void
  }
}

/** Signals the terminal foreground process group accepts. */
export type TerminalWebSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL' | 'SIGTSTP' | 'SIGHUP'

/** Public info for one live terminal session. */
export interface TerminalWebSessionInfo {
  /** Registry-minted terminal identity (the PTY session). */
  sessionId: string
  /** The owning Agent session id; later read/write calls address this session. */
  ownerSessionId: SessionId
  /** Optional display name, or `null` when unset. */
  name: string | null
  /** Top-level terminal process id. */
  pid: number
  /** Session working directory. */
  cwd: string
  /** Whether the process is still running. */
  running: boolean
}

/** Request to spawn one terminal session. */
export interface TerminalWebSpawnRequest {
  /** Optional display name shown on the session tab. */
  name?: string
  /** Initial column count; defaults to the service value. */
  cols?: number
  /** Initial row count; defaults to the service value. */
  rows?: number
}

/** Successful spawn result. */
export interface TerminalWebSpawnResult {
  /** Session identity for every later operation. */
  sessionId: string
  /** Top-level terminal process id. */
  pid: number
  /** Session working directory. */
  cwd: string
}

/** Request to write raw input to one session's stdin. */
export interface TerminalWebWriteRequest {
  /** Target session. */
  sessionId: string
  /** Raw UTF-8 text to write (may carry ANSI escape sequences). */
  data: string
}

/** Request to signal one session's foreground process group. */
export interface TerminalWebSignalRequest {
  /** Target session. */
  sessionId: string
  /** Permitted signal. */
  signal: TerminalWebSignal
}

/** Request to close one session. */
export interface TerminalWebKillRequest {
  /** Target session. */
  sessionId: string
}

/** Request to resize one session's terminal. */
export interface TerminalWebResizeRequest {
  /** Target session. */
  sessionId: string
  /** New column count. */
  cols: number
  /** New row count. */
  rows: number
}

/** Request to rename one session's display name. */
export interface TerminalWebRenameRequest {
  /** Target session. */
  sessionId: string
  /** New display name shown on the session tab. */
  name: string
}

/** Successful list result. */
export interface TerminalWebListResult {
  /** Sessions in spawn order; `list` scopes to the caller, `listAll` returns every live session. */
  sessions: TerminalWebSessionInfo[]
}

/** Request for one session's retained scrollback and output cursor. */
export interface TerminalWebReadRequest {
  /** Target session. */
  sessionId: string
}

/**
 * Retained scrollback plus the output sequence cursor. A client writes
 * `text` on attach, records `seq`, then applies only live `terminal/output`
 * events whose `seq` is greater, avoiding double-render.
 */
export interface TerminalWebReadResult {
  /** Bounded retained raw output (with ANSI), oldest-first. */
  text: string
  /** Current output sequence number; live events carry higher values. */
  seq: number
  /** Whether retained output was dropped by the service bound. */
  truncated: boolean
}
