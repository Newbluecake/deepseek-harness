# Agent Note: Terminal window resize preserves user geometry

Status: implemented

English | [中文](2026-08-23-terminal-window-resize-geometry.zh.md)

## Problem

The browser terminal window resizes through pointer geometry in `TerminalWindow`, while `TerminalView` fits xterm to the new container and synchronizes the PTY dimensions. A debounced row-height adjustment also changed the floating window height after the pointer drag settled. That delayed adjustment could overwrite a south resize and return the window toward its earlier height. xterm's native viewport scrollbar also occupied the right edge of the terminal surface without matching the terminal's visual treatment.

## Decision

`TerminalWindow` owns the complete floating-window geometry supplied by pointer drags and the persistent terminal store. `TerminalView` uses `FitAddon` and its resize observer only to fit the emulator and debounce `cols`/`rows` synchronization to the PTY; it does not write window geometry after layout changes. The window therefore retains the exact user-selected height, including heights between terminal row boundaries.

The xterm viewport keeps `overflow-y: scroll` so scrollback remains available. Its scrollbar is zero-width and transparent by default, expands to 8px on hover, and also expands while the viewport is actively scrolling. The thumb uses the existing elevated scrollbar tokens, and the active-scrolling class is removed 800ms after the last scroll event.

## Alternatives considered

**Keep row snapping and cancel it only during the pointer gesture.** Rejected because a delayed callback can still race the end of the gesture and because the snap is presentation policy owned by the floating window, not terminal transport sizing.

**Hide the scrollbar by disabling viewport overflow.** Rejected because it removes access to terminal scrollback instead of changing only its visual treatment.

**Use the global scrollbar at its normal width.** Rejected because the full-width native treatment is visually prominent against the terminal's black surface.

**Hide the scrollbar permanently.** Rejected because users lose a reliable visual affordance for scrollback position and pointer scrolling.

## Consequences

Users control the floating window dimensions directly, and the PTY continues to receive the xterm dimensions that fit inside those dimensions. Terminal heights are not normalized to whole rows, so a small unused area can remain below the final row. Scrollback remains mouse-wheel and keyboard accessible. The scrollbar stays visually quiet until the pointer reaches the viewport or scrolling begins, then expands to an 8px token-colored thumb for pointer interaction.

The terminal window's geometry behavior is covered by the existing edge and corner resize tests. The xterm stylesheet test pins retained scrolling, quiet default styling, hover expansion, and active-scrolling styling.
