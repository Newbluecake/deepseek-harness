# @deepseek-ai/dsh-terminal-web

English | [中文](README.zh.md)

Host service for browser-facing interactive PTY sessions. `TerminalWebService` exposes typed Remote methods for spawning, writing, resizing, signalling, renaming, reading scrollback, listing, and closing terminal sessions. Each session is owned by the calling Agent and is cleaned up when that Agent is disposed.

The service injects `subprocess` and `sandboxPolicy`. The subprocess provider owns PTY allocation and process-tree termination; this service owns browser-oriented scrollback, event forwarding, and Agent authorization. The generated `./remote` and `./types` exports are consumed by the application Remote assembly and browser UI.

This service intentionally does not consume `ctx.terminals`. That registry's `TerminalBackendSession` contract is prompt-aware and line-oriented for model tools, while this service must preserve raw ANSI output, arbitrary input sequences, resize, and output cursors for a browser terminal. Both consumers share the neutral `ctx.subprocess.spawnTerminal` primitive; a future raw-PTY registry can be adapted by each consumer without adding browser methods to the model terminal seam.

## Model Experience

### Host service

#### What the model sees

None. `TerminalWebService` is a browser transport capability and contributes no model-visible context.

#### Token effect

None; terminal I/O does not add tokens to any provider request.

#### KV Cache effect

None; terminal I/O is not automatically added to provider context.

## Known Limitations and Deferred Work

- **Shell startup is currently deployment-local** — the service starts the process user's login shell with interactive flags. Shell and dialect selection remain owned by this service until a neutral raw-PTY registry contract exists; the model-facing `dsh-terminal` backend registry is intentionally separate.
- **Process-local sessions** — PTYs and scrollback disappear when the Harness process exits.
- **Bounded scrollback** — retained output is capped and may be truncated for long-running sessions.
