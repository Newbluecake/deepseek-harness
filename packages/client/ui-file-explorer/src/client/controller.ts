import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createFileExplorerStore } from './store.ts'

/** Bound file-explorer viewing actions. */
type FileExplorerActions = BoundActions<ReturnType<typeof createFileExplorerStore>>

/** Last path segment of an absolute or workspace-relative path. */
function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx < 0 ? path : path.slice(idx + 1)
}

/** Root Dock control face wired to the current session's file explorer. */
export class FileExplorerController {
  #actions: FileExplorerActions | undefined

  /** Attach the current session's viewing actions. */
  attach(actions: FileExplorerActions): void { this.#actions = actions }
  showFiles(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('files') }
  showDiff(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('diff') }
  showGitTree(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('tree') }
  closeGitTree(): void { this.#require().setGitTreeOpen(false) }
  collapseModals(): void { this.#require().setModalsMinimized(true) }
  expandModals(): void { this.#require().setModalsMinimized(false) }

  /** Open one file in the in-app preview, showing the files panel. */
  openFile(path: string): void {
    const actions = this.#require()
    actions.setPanel('files')
    actions.setOpenFile({ name: basename(path), type: 'file', path, size: null })
  }

  #require(): FileExplorerActions {
    if (this.#actions === undefined) throw new Error('fileExplorerController: viewing actions not wired')
    return this.#actions
  }
}
