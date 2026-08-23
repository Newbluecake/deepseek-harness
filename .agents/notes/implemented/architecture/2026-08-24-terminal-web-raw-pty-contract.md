# Agent Note: Keep browser PTY sessions separate from the model terminal registry

Status: implemented

English | [中文](2026-08-24-terminal-web-raw-pty-contract.zh.md)

## Problem

The browser terminal and the model-facing terminal use different session contracts over the same PTY substrate. The model-facing registry exposes prompt-aware sends, bounded line-oriented reads, foreground signal results, and backend-owned readiness. The browser requires raw ANSI output, arbitrary input sequences, resize, output sequence cursors, and live event forwarding.

## Decision

`terminal-web` keeps its own Agent-scoped session registry and consumes `ctx.subprocess.spawnTerminal` directly. The subprocess terminal primitive remains the shared provider seam for terminal allocation, foreground process-group signalling, resize, and awaited process-tree termination.

`ctx.terminals` remains the owner-scoped registry for the model-facing `TerminalBackendSession` contract. `terminal-web` does not register browser sessions there, and `terminal-bash` is not used as a browser provider. The model backend installs a controlled prompt and sanitizes model-visible output; applying that session to xterm.js would alter the browser's raw terminal protocol.

## Alternatives considered

**Register browser sessions in `ctx.terminals`.** The existing registry cannot expose raw output, arbitrary writes, resize, or event cursors without weakening the model-facing backend contract or adding browser-specific methods to it.

**Add raw browser methods to `TerminalBackendSession`.** This would make a model execution seam depend on browser transport requirements and force every model backend to account for raw event delivery, even when it only supports prompt-aware interaction.

**Duplicate terminal allocation in a new browser-specific substrate.** The browser service already uses the neutral `ctx.subprocess.spawnTerminal` primitive, so a second PTY provider would duplicate process-tree, signalling, and platform cleanup behavior without removing the contract difference.

## Consequences

Model and browser terminal sessions have independent identities, registries, and owner cleanup. A deployment can replace the model terminal backend without changing browser terminal behavior, and can replace the subprocess terminal provider without changing either consumer's session protocol. Shell and dialect selection for browser terminals remains owned by the browser service until a separate raw-PTY registry contract exists.

Reconsider sharing only when a neutral raw-PTY session contract specifies byte delivery, arbitrary writes, resize, foreground signalling, output cursors, and awaited teardown independently of model prompt/readiness semantics; the model-facing registry can then adapt that contract rather than acquire browser responsibilities.
