# Persistent PTY Sessions

English | [中文](terminal.zh.md)

Types shared by PTY backends, `ctx.terminals`, and the model-facing consumer. The [persistent PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md) owns the rationale; this page records the cross-package vocabulary from [`packages/terminal/terminal/src/types.ts`](../../packages/terminal/terminal/src/types.ts).

## Identity and readiness

`TerminalSessionId` is a service-minted branded id. Optional names are owner-local display metadata; authorization compares the exact owning `Agent`, not a name or guessed id.

`TerminalWaitReason` says why one send returned. It is independent from `TerminalSessionStatus`: silence or timeout may return while the top-level shell remains alive, while `session_exit` means that shell exited rather than an arbitrary foreground child.

```ts type-equiv
/** Why one interactive send returned control to its caller. */
type TerminalWaitReason = 'stdin_read' | 'inferred_idle' | 'timeout' | 'session_exit'
```

```ts type-equiv
/** Top-level PTY process status, independent of a send's wait reason. */
type TerminalSessionStatus =
  | { kind: 'running' }
  | { kind: 'exited'; exitCode: number | null; signal: NodeJS.Signals | null }
```

## Backend and live session

A backend owns how one registered type starts and detects readiness. `TerminalSessionService` publishes the returned session only after setup succeeds, then owns id authorization and cleanup. A backend that cannot clean partial startup resources rejects with `TerminalBackendCleanupError`, allowing disposal to retain the cleanup failure without replacing the caller's cancellation reason. A backend session owns terminal state and captured-resource quiescence.

```ts type-equiv
/** Replaceable provider for one PTY session type. */
interface TerminalBackend {
  /** Stable type selected by {@link TerminalSpawnRequest.type}. */
  readonly type: string
  /** Create an unpublished session or reject after cleaning partial resources; cleanup failure uses {@link TerminalBackendCleanupError}. */
  spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>
}
```

```ts type-equiv
/** Backend-owned live session retained by {@link TerminalSessionService}. */
interface TerminalBackendSession {
  /** Initial bounded terminal output returned from `terminal_open`. */
  readonly motd: string
  /** Top-level process id when one exists. */
  readonly pid?: number
  /** Start one exclusive send operation. */
  startSend(request: TerminalSendRequest): TerminalSendOperation
  /** Read one bounded page from retained scrollback. */
  read(request: TerminalReadRequest): TerminalReadResult
  /** Signal the verified foreground process group. */
  signal(signal: TerminalSignal): Promise<TerminalSignalResult>
  /** Observe top-level process status. */
  status(): TerminalSessionStatus
  /** Idempotently close the captured owned process tree and await quiescence. */
  close(reason: string): Promise<void>
}
```

## Send and retained output

One live session accepts one active send. Its operation exposes a consuming output cursor for generic background jobs and one terminal result for a foreground caller. `TerminalReadResult` separately pages the bounded session scrollback.

```ts type-equiv
/** Live backend-owned send; exactly one may be active per PTY session. */
interface TerminalSendOperation {
  /** Resolves after readiness, timeout, cancellation, or top-level process exit. */
  done: Promise<TerminalSendResult>
  /** Consume output produced since the prior call. */
  readOutput(): TerminalSendRead
  /** Request `SIGINT`; returns false after the operation settled. */
  cancel(): boolean
}
```

```ts type-equiv
/** Settled result for one foreground or background send. */
interface TerminalSendResult {
  /** Bounded rendered terminal delta remaining at settlement. */
  viewport: string
  /** Why the wait returned; this does not imply arbitrary child-process exit. */
  waitReason: TerminalWaitReason
  /** Top-level session status observed at settlement. */
  sessionStatus: TerminalSessionStatus
  /** Whether output was dropped from the operation or retained scrollback. */
  truncated: boolean
}
```

## Ownership and durability

`TerminalSessionService` attaches one awaited cleanup to the exact owner scope, rejects foreign operations, and keeps sessions alive across backend or tool-plugin reload. PTY state and raw bytes remain process-local. Model input and bounded returned output are durable through the existing `tool/call`, `tool/result`, and task-result paths rather than duplicate PTY session events.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxterminals--terminalsessionservice"></a>

### `ctx.terminals` — `TerminalSessionService`

In-process registry for replaceable PTY backends and exact-Agent sessions.

```ts cordis-catalog
/**
 * Register one backend type for this effect scope.
 * @param backend - provider with a non-empty unique type.
 * @returns disposer that removes exactly this contribution.
 */
registerBackend(backend: TerminalBackend): () => void

/**
 * List registered backend types in registration order.
 * @returns fresh backend type names.
 */
listBackends(): string[]

/**
 * Create and publish one owner-scoped session after backend setup succeeds.
 * @param owner - exact registered Agent that owns access and cleanup.
 * @param request - backend type plus optional owner-local name and cwd.
 * @param signal - cancellation of unpublished setup.
 * @returns published identity, metadata, status, and MOTD.
 */
async spawn(owner: Agent, request: TerminalSpawnRequest, signal?: AbortSignal): Promise<TerminalSpawnResult>

/**
 * Test whether an exact owner has a published session or unpublished spawn.
 * @param owner - exact live owner to inspect.
 * @returns true across the entire spawn-to-close interval, with no publication gap.
 */
hasOwnerActivity(owner: Agent): boolean

/**
 * Start one exclusive interactive send.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param request - explicit text, submit behavior, and cancellation.
 * @returns live operation handle for foreground await or task registration.
 */
startSend(owner: Agent, id: TerminalSessionId, request: TerminalSendRequest): TerminalSendOperation

/**
 * Read one bounded scrollback page from an owned session.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param request - optional newest-relative offset and line count.
 * @returns bounded retained text and pagination metadata.
 */
read(owner: Agent, id: TerminalSessionId, request: TerminalReadRequest = {}): TerminalReadResult

/**
 * Deliver an allowed signal through an owned backend session.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param signal - allowed POSIX signal name.
 * @returns delivered foreground process-group identity.
 */
signal(owner: Agent, id: TerminalSessionId, signal: TerminalSignal): Promise<TerminalSignalResult>

/**
 * Close one owned session and remove it only after quiescent backend cleanup.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param reason - diagnostic cleanup reason.
 * @returns true for a newly closed session, false when the same close is already in flight.
 */
async kill(owner: Agent, id: TerminalSessionId, reason: string = 'model request'): Promise<boolean>

/**
 * List fresh snapshots for exactly one owner.
 * @param owner - exact owner whose sessions are visible.
 * @returns owner-visible snapshots in publication order.
 */
list(owner: Agent): TerminalSessionSnapshot[]
```

Types: [Agent](core.md)

Source: [`packages/terminal/terminal/src/index.ts`](../../packages/terminal/terminal/src/index.ts)

<a id="ctxterminalweb--terminalwebservice"></a>

### `ctx.terminalWeb` — `TerminalWebService`

Read/write face for interactive browser terminals. It spawns one bash PTY per spawn call in the calling session's workspace, taps the PTY's raw output into forwarded events, and retains a bounded scrollback so a client can re-attach to a still-running session.

```ts cordis-catalog
/**
 * Spawn one interactive bash terminal in the calling session's workspace.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - optional display name and initial dimensions.
 * @returns the new session's identity, pid, and working directory.
 */
@Remote('spawn') async spawn(agent: Agent, request: TerminalWebSpawnRequest): Promise<TerminalWebSpawnResult>

/**
 * Write raw input (keystrokes, escape sequences) to one session's stdin.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session and raw text.
 */
@Remote('write') async write(agent: Agent, request: TerminalWebWriteRequest): Promise<void>

/**
 * Signal one session's foreground process group.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session and signal.
 */
@Remote('signal') async signal(agent: Agent, request: TerminalWebSignalRequest): Promise<void>

/**
 * Resize one session's terminal; full-screen programs see the new size via SIGWINCH.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session and the new dimensions.
 */
@Remote('resize') resize(agent: Agent, request: TerminalWebResizeRequest): Promise<void>

/**
 * Close one session and remove it from the registry.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session.
 */
@Remote('kill') async kill(agent: Agent, request: TerminalWebKillRequest): Promise<void>

/**
 * Rename one session's display name (shown on its tab).
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session and the new name.
 */
@Remote('rename') rename(agent: Agent, request: TerminalWebRenameRequest): Promise<void>

/**
 * List the calling session's live terminals.
 * @param agent - exact live Agent resolved from the wire identity.
 * @returns the owned sessions in spawn order.
 */
@Remote('list') list(agent: Agent): Promise<TerminalWebListResult>

/**
 * List every live terminal across all owning sessions. Root-scoped (no
 * wire identity): the global Dock reads this to discover terminals from any
 * session. Read/write/signal/kill stay agent-scoped, so opening another
 * session's terminal still resolves its owner identity for those calls.
 * @returns all live sessions in global spawn order, each carrying its owner.
 */
@Remote('listAll') listAll(): Promise<TerminalWebListResult>

/**
 * Read one session's retained scrollback and the current output cursor.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - target session.
 * @returns the bounded scrollback and the sequence to resume from.
 */
@Remote('read') read(agent: Agent, request: TerminalWebReadRequest): Promise<TerminalWebReadResult>
```

Types: [Agent](core.md)

Source: [`packages/terminal/terminal-web/src/index.ts`](../../packages/terminal/terminal-web/src/index.ts)

<a id="terminal-events"></a>

### `terminal/*` events

<a id="terminalexit--emit"></a>

#### `terminal/exit` — emit

A terminal session's process exited.

```ts cordis-catalog
/**
 * A terminal session's process exited.
 * @param payload.sessionId - terminal session that exited.
 * @param payload.exitCode - process exit code, or `null` when killed by signal.
 * @mode emit
 */
'terminal/exit'(payload: { sessionId: string; exitCode: number | null }): void
```

Source: [`packages/terminal/terminal-web/src/types.ts`](../../packages/terminal/terminal-web/src/types.ts)

<a id="terminaloutput--emit"></a>

#### `terminal/output` — emit

One raw output chunk from a live terminal PTY. Forwarded to consumers verbatim; `data` carries ANSI escape sequences for xterm.js to render.

```ts cordis-catalog
/**
 * One raw output chunk from a live terminal PTY. Forwarded to consumers
 * verbatim; `data` carries ANSI escape sequences for xterm.js to render.
 * @param payload.sessionId - terminal session the chunk came from.
 * @param payload.data - raw UTF-8 output text.
 * @param payload.seq - per-session monotonic output sequence number.
 * @mode emit
 */
'terminal/output'(payload: { sessionId: string; data: string; seq: number }): void
```

Source: [`packages/terminal/terminal-web/src/types.ts`](../../packages/terminal/terminal-web/src/types.ts)
<!-- END GENERATED cordis-surface -->
