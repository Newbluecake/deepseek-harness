# Agent Note: Terminal window resize preserves user geometry

Status: implemented

English | [中文](2026-08-23-terminal-window-resize-geometry.zh.md)

## Problem

The browser terminal window resizes through pointer geometry in `TerminalWindow`, while `TerminalView` fits xterm to the new container and synchronizes the PTY dimensions. A debounced row-height adjustment also changed the floating window height after the pointer drag settled. That delayed adjustment could overwrite a south resize and return the window toward its earlier height. xterm's native viewport scrollbar also occupied the right edge of the terminal surface.

## Decision

`TerminalWindow` owns the complete floating-window geometry supplied by pointer drags and the persistent terminal store. `TerminalView` uses `FitAddon` and its resize observer only to fit the emulator and debounce `cols`/`rows` synchronization to the PTY; it does not write window geometry after layout changes. The window therefore retains the exact user-selected height, including heights between terminal row boundaries.

The xterm viewport keeps `overflow-y: scroll` so scrollback remains available, while `scrollbar-width: none` and the WebKit scrollbar rule hide the native scrollbar in supported browser engines.

## Alternatives considered

**Keep row snapping and cancel it only during the pointer gesture.** Rejected because a delayed callback can still race the end of the gesture and because the snap is presentation policy owned by the floating window, not terminal transport sizing.

**Hide the scrollbar by disabling viewport overflow.** Rejected because it removes access to terminal scrollback instead of changing only its visual treatment.

**Style the scrollbar with a smaller or transparent thumb.** Rejected because the requested terminal surface has no visible right-hand scrollbar and platform-specific scrollbar styling would still reserve or expose native chrome.

## Consequences

Users control the floating window dimensions directly, and the PTY continues to receive the xterm dimensions that fit inside those dimensions. Terminal heights are not normalized to whole rows, so a small unused area can remain below the final row. Scrollback remains mouse-wheel and keyboard accessible without a visible native scrollbar.

The terminal window's geometry behavior is covered by the existing edge and corner resize tests. The xterm stylesheet test pins both retained scrolling and hidden native scrollbar declarations.
