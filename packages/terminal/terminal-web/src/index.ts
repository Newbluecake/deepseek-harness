/**
 * Browser-facing terminal service: spawns real shell PTYs over the subprocess
 * terminal primitive, streams their raw output to the browser as forwarded
 * `terminal/output` events, and keeps each Agent's sessions alive until closed
 * or the Agent is disposed. Read/write/signal/kill operations are agent-scoped
 * so a terminal always runs in the calling session's workspace.
 * @module @deepseek-ai/dsh-terminal-web
 */

import { Buffer } from 'node:buffer'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {
  TerminalWebKillRequest,
  TerminalWebListResult,
  TerminalWebReadRequest,
  TerminalWebReadResult,
  TerminalWebSessionInfo,
  TerminalWebSignalRequest,
  TerminalWebSpawnRequest,
  TerminalWebSpawnResult,
  TerminalWebResizeRequest,
  TerminalWebRenameRequest,
  TerminalWebWriteRequest,
} from './types.ts'

export type {
  TerminalWebKillRequest,
  TerminalWebListResult,
  TerminalWebReadRequest,
  TerminalWebReadResult,
  TerminalWebSessionInfo,
  TerminalWebSignal,
  TerminalWebSignalRequest,
  TerminalWebSpawnRequest,
  TerminalWebSpawnResult,
  TerminalWebResizeRequest,
  TerminalWebRenameRequest,
  TerminalWebWriteRequest,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    terminalWeb: TerminalWebService
  }
}

/** Maximum raw output bytes retained per session for scrollback restore. */
const MAX_SCROLLBACK_BYTES = 200000
/** Default initial terminal dimensions. */
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30
/** TERM-to-KILL cleanup grace for one session's process tree. Interactive
 *  shells ignore SIGTERM, so a long grace only delays tab teardown before the
 *  SIGKILL escalation; keep it short so closing a tab feels immediate. */
const DISPOSE_GRACE_MS = 400

interface PtySession {
  readonly id: string
  readonly owner: Agent
  /** Display name shown on the session tab; defaults to the creation-order name and can be renamed. */
  name: string
  readonly cwd: string
  readonly handle: SubprocessTerminalHandle
  readonly decoder: TextDecoder
  running: boolean
  exitCode: number | null
  scrollback: string
  scrollbackTruncated: boolean
  seq: number
}

/** The current user's default (login) shell; falls back to bash. */
function defaultShell(): string {
  return process.env.SHELL ?? '/bin/bash'
}

/**
 * Read/write face for interactive browser terminals. It spawns one bash PTY
 * per spawn call in the calling session's workspace, taps the PTY's raw output
 * into forwarded events, and retains a bounded scrollback so a client can
 * re-attach to a still-running session.
 */
export class TerminalWebService extends TypertRemoteService {
  static inject = ['subprocess', 'sandboxPolicy']

  private readonly sessions = new Map<string, PtySession>()
  private readonly ownerSessions = new Map<Agent, Set<string>>()
  private readonly ownerCleanups = new Map<Agent, () => void>()
  /** Per-agent creation-order counter for default terminal names (终端 1, 终端 2, …). */
  private readonly ownerCounters = new Map<Agent, number>()
  private nextId = 0

  constructor(ctx: Context) {
    super(ctx, 'terminalWeb')
  }

  /**
   * Spawn one interactive bash terminal in the calling session's workspace.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - optional display name and initial dimensions.
   * @returns the new session's identity, pid, and working directory.
   */
  @Remote('spawn')
  async spawn(agent: Agent, request: TerminalWebSpawnRequest): Promise<TerminalWebSpawnResult> {
    this.ensureOwnerCleanup(agent)
    const cwd = this.workspaceRoot(agent)
    const policy = this.ctx.sandboxPolicy.resolve({ session: agent.session })
    const argv = this.spawnArgv(policy)
    const handle = await this.ctx.subprocess.spawnTerminal({
      argv,
      cwd,
      env: this.childEnv(agent),
      rows: request.rows ?? DEFAULT_ROWS,
      cols: request.cols ?? DEFAULT_COLS,
      graceMs: DISPOSE_GRACE_MS,
    })
    const session: PtySession = {
      id: `tw-${++this.nextId}`,
      owner: agent,
      name: request.name ?? this.nextTerminalName(agent),
      cwd,
      handle,
      decoder: new TextDecoder(),
      running: true,
      exitCode: null,
      scrollback: '',
      scrollbackTruncated: false,
      seq: 0,
    }
    this.register(agent, session)
    this.tapOutput(session)
    return { sessionId: session.id, pid: handle.pid, cwd }
  }

  /**
   * Write raw input (keystrokes, escape sequences) to one session's stdin.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session and raw text.
   */
  @Remote('write')
  async write(agent: Agent, request: TerminalWebWriteRequest): Promise<void> {
    const session = this.expectOwned(agent, request.sessionId)
    if (!session.running) throw new Error('终端进程已退出')
    await session.handle.write(request.data)
  }

  /**
   * Signal one session's foreground process group.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session and signal.
   */
  @Remote('signal')
  async signal(agent: Agent, request: TerminalWebSignalRequest): Promise<void> {
    const session = this.expectOwned(agent, request.sessionId)
    if (!session.running) throw new Error('终端进程已退出')
    await session.handle.signalForeground(request.signal)
  }

  /**
   * Resize one session's terminal; full-screen programs see the new size via SIGWINCH.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session and the new dimensions.
   */
  @Remote('resize')
  async resize(agent: Agent, request: TerminalWebResizeRequest): Promise<void> {
    const session = this.expectOwned(agent, request.sessionId)
    if (!session.running) return
    session.handle.resize(request.cols, request.rows)
  }

  /**
   * Close one session and remove it from the registry.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session.
   */
  @Remote('kill')
  async kill(agent: Agent, request: TerminalWebKillRequest): Promise<void> {
    const session = this.expectOwned(agent, request.sessionId)
    await this.closeSession(agent, session)
  }

  /**
   * Rename one session's display name (shown on its tab).
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session and the new name.
   */
  @Remote('rename')
  async rename(agent: Agent, request: TerminalWebRenameRequest): Promise<void> {
    const session = this.expectOwned(agent, request.sessionId)
    session.name = request.name
  }

  /**
   * List the calling session's live terminals.
   * @param agent - exact live Agent resolved from the wire identity.
   * @returns the owned sessions in spawn order.
   */
  @Remote('list')
  async list(agent: Agent): Promise<TerminalWebListResult> {
    const ids = this.ownerSessions.get(agent)
    if (ids === undefined) return { sessions: [] }
    const sessions: TerminalWebSessionInfo[] = []
    for (const id of ids) {
      const session = this.sessions.get(id)
      if (session !== undefined) sessions.push(this.info(session))
    }
    return { sessions }
  }

  /**
   * List every live terminal across all owning sessions. Root-scoped (no
   * wire identity): the global Dock reads this to discover terminals from any
   * session. Read/write/signal/kill stay agent-scoped, so opening another
   * session's terminal still resolves its owner identity for those calls.
   * @returns all live sessions in global spawn order, each carrying its owner.
   */
  @Remote('listAll')
  async listAll(): Promise<TerminalWebListResult> {
    const sessions: TerminalWebSessionInfo[] = []
    for (const session of this.sessions.values()) sessions.push(this.info(session))
    return { sessions }
  }

  /**
   * Read one session's retained scrollback and the current output cursor.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - target session.
   * @returns the bounded scrollback and the sequence to resume from.
   */
  @Remote('read')
  async read(agent: Agent, request: TerminalWebReadRequest): Promise<TerminalWebReadResult> {
    const session = this.expectOwned(agent, request.sessionId)
    return { text: session.scrollback, seq: session.seq, truncated: session.scrollbackTruncated }
  }

  private workspaceRoot(agent: Agent): string {
    return agent.session.header.cwd ?? this.ctx.sandboxPolicy.workspaceRoot
  }

  private childEnv(agent: Agent): Record<string, string> {
    return {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      DSH_SESSION_ID: agent.id,
    }
  }

  private spawnArgv(policy: SandboxExecutionPolicy): string[] {
    const argv = [defaultShell(), '-l', '-i']
    if (policy.mode === 'danger-full-access') return argv
    const sandbox = this.ctx.get('sandbox')
    if (sandbox === undefined) {
      throw new Error(`terminal-web: sandbox mode "${policy.mode}" requires a ctx.sandbox provider in the execution world`)
    }
    return sandbox.confine(argv, { ...policy, mode: policy.mode }).argv
  }

  private register(agent: Agent, session: PtySession): void {
    this.sessions.set(session.id, session)
    const owned = this.ownerSessions.get(agent) ?? new Set<string>()
    owned.add(session.id)
    this.ownerSessions.set(agent, owned)
  }

  private unregister(agent: Agent, sessionId: string): void {
    this.sessions.delete(sessionId)
    const owned = this.ownerSessions.get(agent)
    if (owned === undefined) return
    owned.delete(sessionId)
    if (owned.size === 0) this.ownerSessions.delete(agent)
  }

  private expectOwned(agent: Agent, sessionId: string): PtySession {
    const session = this.sessions.get(sessionId)
    if (session === undefined) throw new Error('终端会话不存在')
    if (session.owner !== agent) throw new Error('终端会话属于其他会话')
    return session
  }

  private tapOutput(session: PtySession): void {
    const { handle } = session
    handle.output.on('data', (chunk: Buffer | Uint8Array | string) => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      const text = session.decoder.decode(bytes, { stream: true })
      this.appendOutput(session, text)
    })
    handle.output.once('end', () => {
      this.appendOutput(session, session.decoder.decode())
    })
    handle.done.then(
      (outcome) => {
        session.running = false
        session.exitCode = outcome.exitCode
        this.ctx.emit('terminal/exit', { sessionId: session.id, exitCode: outcome.exitCode })
      },
      () => {
        session.running = false
        session.exitCode = null
        this.ctx.emit('terminal/exit', { sessionId: session.id, exitCode: null })
      },
    )
  }

  private appendOutput(session: PtySession, text: string): void {
    if (text.length === 0) return
    session.seq += 1
    session.scrollback += text
    if (Buffer.byteLength(session.scrollback) > MAX_SCROLLBACK_BYTES) {
      const over = Buffer.byteLength(session.scrollback) - MAX_SCROLLBACK_BYTES
      session.scrollback = session.scrollback.slice(over)
      session.scrollbackTruncated = true
    }
    this.ctx.emit('terminal/output', { sessionId: session.id, data: text, seq: session.seq })
  }

  private async closeSession(agent: Agent, session: PtySession): Promise<void> {
    // Remove the session before terminating its PTY. The PTY exit event fires
    // during terminate(); unregistering first prevents its client refresh from
    // observing and re-adding a dead tab while kill is still settling.
    this.unregister(agent, session.id)
    if (session.running) {
      session.running = false
      await session.handle.terminate()
    }
  }

  private info(session: PtySession): TerminalWebSessionInfo {
    return {
      sessionId: session.id,
      ownerSessionId: session.owner.id,
      name: session.name,
      pid: session.handle.pid,
      cwd: session.cwd,
      running: session.running,
    }
  }

  /** Next creation-order default name for one agent's terminals (终端 1, 终端 2, …). */
  private nextTerminalName(agent: Agent): string {
    const num = (this.ownerCounters.get(agent) ?? 0) + 1
    this.ownerCounters.set(agent, num)
    return `终端 ${num}`
  }

  private ensureOwnerCleanup(agent: Agent): void {
    if (this.ownerCleanups.has(agent)) return
    const detach = agent.ctx.effect(() => async () => {
      this.ownerCleanups.delete(agent)
      this.ownerCounters.delete(agent)
      const owned = this.ownerSessions.get(agent)
      if (owned === undefined) return
      for (const id of [...owned]) {
        const session = this.sessions.get(id)
        if (session !== undefined) await this.closeSession(agent, session)
      }
    }, 'terminal-web.ownerCleanup()')
    this.ownerCleanups.set(agent, detach)
  }
}

export default TerminalWebService
