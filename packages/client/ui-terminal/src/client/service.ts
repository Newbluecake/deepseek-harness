import type { ITerminalPanel, TerminalPanelSnapshot } from './contract/slots.ts'

/** Collapse/expand action broadcast to other floating-surface packages. */
export type SurfaceCollapseAction = 'collapse' | 'expand'

/** Cross-plugin "collapse/expand all surfaces" broadcast. */
export class SurfaceCollapseService {
  #listeners = new Set<(action: SurfaceCollapseAction) => void>()

  subscribe(listener: (action: SurfaceCollapseAction) => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  collapseAll(): void { for (const listener of this.#listeners) listener('collapse') }
  expandAll(): void { for (const listener of this.#listeners) listener('expand') }
}

/** Terminal-owned Dock controller wired by the mounted Dock component. */
export class TerminalPanelController implements ITerminalPanel {
  #open: (() => void) | undefined
  #close: (() => void) | undefined
  #snapshot: TerminalPanelSnapshot = { open: false }
  #listeners = new Set<() => void>()

  getSnapshot(): TerminalPanelSnapshot { return this.#snapshot }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }

  /** Attach current operations and publish current Dock popup state. */
  attach(operations: { open: () => void; close: () => void }, snapshot: TerminalPanelSnapshot): void {
    this.#open = operations.open
    this.#close = operations.close
    if (this.#snapshot.open === snapshot.open) return
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }

  open(): void { this.#require(this.#open)() }
  close(): void { this.#require(this.#close)() }
  toggle(): void {
    if (this.#snapshot.open) this.close()
    else this.open()
  }

  #require<T>(operation: T | undefined): T {
    if (operation === undefined) throw new Error('terminalPanel: panel operations not wired')
    return operation
  }
}
