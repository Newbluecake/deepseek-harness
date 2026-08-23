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

  /**
   * Attach the current session's viewing actions.
   * @param actions - store actions for the currently rendered session entry.
   */
  attach(actions: FileExplorerActions): void { this.#actions = actions }

  /** Show the file list panel. */
  showFiles(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('files') }

  /** Show the changed-file diff panel. */
  showDiff(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('diff') }

  /** Show the Git history panel. */
  showGitTree(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('tree') }

  /** Close the Git history modal. */
  closeGitTree(): void { this.#require().setGitTreeOpen(false) }

  /** Minimize the file preview modals. */
  collapseModals(): void { this.#require().setModalsMinimized(true) }

  /** Restore the file preview modals. */
  expandModals(): void { this.#require().setModalsMinimized(false) }

  /** Open one file in the in-app preview, showing the files panel.
   * @param path - absolute or workspace-relative file path.
   */
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
