/**
 * Terminal store: entry-local presentation state for the global Terminal Dock
 * and its draggable floating windows. The PTY sessions themselves live on the
 * Host; this store tracks whether the Dock popup is open and, per open
 * terminal, the floating window's geometry and stacking order. Window geometry
 * persists to localStorage so a refresh keeps the Host PTYs alive and restores
 * the open windows at their saved positions (the Dock prunes any whose PTY is
 * gone on mount).
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** One screen edge a floating terminal can snap to. */
export type TerminalSnapSide = 'left' | 'right'

/** Floating-window geometry, in px. */
export interface TerminalWindowGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** Geometry and stacking for one floating terminal window. */
export interface TerminalWindowState {
  /** The Host PTY terminal id this window renders. */
  terminalId: string
  /** The owning Agent session id; all read/write Remote calls address it. */
  ownerSessionId: SessionId
  /** Window left edge, in px. */
  x: number
  /** Window top edge, in px. */
  y: number
  /** Window width, in px. */
  width: number
  /** Window height, in px. */
  height: number
  /** Whether the window is hidden back to the Dock. */
  minimized: boolean
  /** Whether the window fills the viewport. */
  maximized: boolean
  /** The screen edge the window is snapped to, if any. */
  snapped?: TerminalSnapSide | null
  /** Geometry to restore when the user drags a snapped window away. */
  restoreGeometry?: TerminalWindowGeometry | null
  /** Stacking order; higher renders on top. */
  z: number
}

/** Presentation state shared by the Dock, its popup list, and the windows. */
type TerminalViewState = {
  /** Whether the global Dock popup list is open. */
  dockOpen: boolean
  /** Open windows keyed by terminal id, in first-open insertion order. */
  windows: Record<string, TerminalWindowState>
  /** Monotonic stacking counter for focus/raise. */
  zTop: number
}

/** Default geometry for a newly opened window, resolved by the component from the viewport. */
export type TerminalWindowDefaults = TerminalWindowGeometry

/** Mutation API for the Dock presentation state (the declared store actions). */
type TerminalViewActions = {
  setDockOpen: (draft: TerminalViewState, open: boolean) => void
  /** Open a window, or restore and raise it when it already exists. */
  openWindow: (draft: TerminalViewState, terminalId: string, ownerSessionId: SessionId, defaults: TerminalWindowDefaults) => void
  /** Remove a closed window (the caller has already killed its PTY). */
  closeWindow: (draft: TerminalViewState, terminalId: string) => void
  minimizeWindow: (draft: TerminalViewState, terminalId: string) => void
  restoreWindow: (draft: TerminalViewState, terminalId: string) => void
  focusWindow: (draft: TerminalViewState, terminalId: string) => void
  moveWindow: (draft: TerminalViewState, terminalId: string, x: number, y: number) => void
  resizeWindow: (draft: TerminalViewState, terminalId: string, width: number, height: number) => void
  /** Snap one window to a screen edge, remembering its pre-snap geometry. */
  snapWindow: (draft: TerminalViewState, terminalId: string, side: TerminalSnapSide, geometry: TerminalWindowGeometry) => void
  /** Restore one snapped window, optionally to a drag-continuing geometry. */
  unsnapWindow: (draft: TerminalViewState, terminalId: string, geometry?: TerminalWindowGeometry) => void
  /** Leave snap mode at the current geometry, discarding the pre-snap restore point. */
  clearWindowSnap: (draft: TerminalViewState, terminalId: string) => void
  toggleMaximizeWindow: (draft: TerminalViewState, terminalId: string) => void
  /** Minimize every open window back to the Dock. */
  collapseAllWindows: (draft: TerminalViewState) => void
  /** Restore every minimized window. */
  expandAllWindows: (draft: TerminalViewState) => void
}

/**
 * Create the terminal Dock store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createTerminalStore(): EngineStoreHandle<TerminalViewState, TerminalViewActions> {
  return defineStore({
    init: (): TerminalViewState => ({ dockOpen: false, windows: {}, zTop: 0 }),
    // Persist window geometry and stacking across page refreshes; the Dock
    // rehydrates it on mount and prunes windows whose Host PTY no longer exists.
    persist: 'dsh.terminal.dock',
    actions: {
      setDockOpen: (d, open) => { d.dockOpen = open },
      openWindow: (d, terminalId, ownerSessionId, defaults) => {
        const existing = d.windows[terminalId]
        d.zTop += 1
        if (existing !== undefined) {
          existing.z = d.zTop
          existing.minimized = false
          return
        }
        d.windows[terminalId] = {
          terminalId,
          ownerSessionId,
          x: defaults.x,
          y: defaults.y,
          width: defaults.width,
          height: defaults.height,
          minimized: false,
          maximized: false,
          snapped: null,
          restoreGeometry: null,
          z: d.zTop,
        }
      },
      closeWindow: (d, terminalId) => {
        // oxlint-disable-next-line typescript/no-dynamic-delete -- immer drafts remove a keyed window with `delete`
        delete d.windows[terminalId]
      },
      minimizeWindow: (d, terminalId) => {
        const window = d.windows[terminalId]
        if (window !== undefined) window.minimized = true
      },
      restoreWindow: (d, terminalId) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        window.minimized = false
        d.zTop += 1
        window.z = d.zTop
      },
      focusWindow: (d, terminalId) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        d.zTop += 1
        window.z = d.zTop
      },
      moveWindow: (d, terminalId, x, y) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        window.x = x
        window.y = y
      },
      resizeWindow: (d, terminalId, width, height) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        window.width = width
        window.height = height
        // A manual resize turns the current geometry into a custom window.
        window.snapped = null
        window.restoreGeometry = null
      },
      snapWindow: (d, terminalId, side, geometry) => {
        const window = d.windows[terminalId]
        if (window === undefined || window.maximized) return
        if (window.snapped == null) {
          window.restoreGeometry = {
            x: window.x,
            y: window.y,
            width: window.width,
            height: window.height,
          }
        }
        window.snapped = side
        window.x = geometry.x
        window.y = geometry.y
        window.width = geometry.width
        window.height = geometry.height
      },
      unsnapWindow: (d, terminalId, geometry) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        const next = geometry ?? window.restoreGeometry
        if (next != null) {
          window.x = next.x
          window.y = next.y
          window.width = next.width
          window.height = next.height
        }
        window.snapped = null
        window.restoreGeometry = null
      },
      clearWindowSnap: (d, terminalId) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        window.snapped = null
        window.restoreGeometry = null
      },
      toggleMaximizeWindow: (d, terminalId) => {
        const window = d.windows[terminalId]
        if (window === undefined) return
        window.maximized = !window.maximized
      },
      collapseAllWindows: (d) => {
        for (const window of Object.values(d.windows)) window.minimized = true
      },
      expandAllWindows: (d) => {
        for (const window of Object.values(d.windows)) window.minimized = false
      },
    },
  })
}
