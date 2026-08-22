# Agent Note: Cross-session terminal Dock — global discovery, owner-scoped access

Status: implemented

English | [中文](2026-08-22-cross-session-terminal-dock.zh.md)

## Problem

Interactive browser terminals were session-scoped end to end. The Host `TerminalWebService` keyed every PTY by its owning `Agent`, its `list` Remote returned only the calling session's terminals, and the Web client docked a single bottom panel whose tab bar listed only the active session's terminals. With several sessions open, a user had to remember which session had created a terminal, switch to that session, and open its panel before they could find and reattach the terminal.

## Decision

The Web client now renders a global Terminal Dock: a fixed bottom-right macOS-style icon with a live-count badge, a popup list of every live terminal across all sessions (name, working directory, running state, and owning-session label), and one draggable, resizable, minimize/maximize floating window per open terminal.

The Host `TerminalWebService` gains a root-scoped `listAll` Remote — no wire identity, so the Dock can list without a current session — returning every live session in global spawn order, and `TerminalWebSessionInfo` gains an `ownerSessionId` field carrying the owning Agent's `SessionId`. Read/write/signal/kill/rename stay agent-scoped and are addressed by the terminal's owning session, so a user can open and drive another session's terminal without switching sessions; the Host's `expectOwned` check is unchanged and still enforces owner-scoped access.

Window geometry and stacking are entry-local presentation state, deliberately not persisted: a refresh keeps the Host PTYs alive but does not auto-restore floating windows. The Dock renders windows in ascending stacking order without a z-index, so DOM order paints the most-recently-focused window on top; the Dock icon, backdrop, and popup use a fixed z-index ladder above the windows.

## Alternatives considered

**A full-page Terminal Hub (management view) instead of a Dock.** Rejected in favor of the Dock: the common interaction is fast reattach, and the popup list carries exactly the high-frequency actions (open, spawn, rename, remove); a management page can be added later if batch operations justify it.

**Detach terminals from their owner session entirely (a standalone workspace resource).** Rejected: it would force premature decisions about permission, shutdown, and deletion semantics. Keeping owner-session ownership while adding global discovery is the smaller, reversible step, and it preserves the existing Agent-disposal cleanup.

**Persist window positions and auto-restore them on refresh.** Rejected: auto-restoring floating windows would cover the page on entry. Terminals persist; windows are re-opened on demand from the Dock.

## Consequences

Discovery is global while attachment is per-session: the Dock lists everything, but every operation still resolves the owner identity, so cross-session reuse works without relaxing the Host's owner check. Listing requires no current session; only spawning needs one (the Dock spawns into the current session). Two entry points toggle the Dock — the Dock icon and the existing file-explorer rail Terminal button — both driving the same `TerminalPanelController`.
