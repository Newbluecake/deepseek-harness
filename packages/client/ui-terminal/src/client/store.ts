/**
 * Terminal panel store: entry-local presentation state for the right-docked
 * panel (open/closed, focused tab, width, fullscreen). The PTY sessions
 * themselves live on the Host; this store only tracks which panel is open,
 * which tab is focused, and the panel geometry.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Presentation state shared by the panel and its tab bar. */
type TerminalViewState = {
  /** Whether the terminal panel is open. */
  panelOpen: boolean
  /** The focused terminal tab's session id, or none. */
  activeTerminalId: string | null
  /** Panel width in px, or `null` for the default half-viewport width. */
  panelWidth: number | null
  /** Whether the panel fills the viewport width (fullscreen). */
  fullscreen: boolean
}

/** Mutation API for the panel presentation state (the declared store actions). */
type TerminalViewActions = {
  setPanelOpen: (draft: TerminalViewState, open: boolean) => void
  setActiveTerminal: (draft: TerminalViewState, id: string | null) => void
  setPanelWidth: (draft: TerminalViewState, width: number | null) => void
  setFullscreen: (draft: TerminalViewState, fullscreen: boolean) => void
}

/**
 * Create the terminal panel store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createTerminalStore(): EngineStoreHandle<TerminalViewState, TerminalViewActions> {
  return defineStore({
    init: (): TerminalViewState => ({ panelOpen: false, activeTerminalId: null, panelWidth: null, fullscreen: false }),
    actions: {
      setPanelOpen: (d, open) => { d.panelOpen = open },
      setActiveTerminal: (d, id) => { d.activeTerminalId = id },
      setPanelWidth: (d, width) => { d.panelWidth = width },
      setFullscreen: (d, fullscreen) => { d.fullscreen = fullscreen },
    },
  })
}
