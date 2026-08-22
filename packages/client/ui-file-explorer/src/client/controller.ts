import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createFileExplorerStore } from './store.ts'

/** Bound file-explorer viewing actions. */
type FileExplorerActions = BoundActions<ReturnType<typeof createFileExplorerStore>>

/** Root Dock control face wired to the current session's file explorer. */
export class FileExplorerController {
  #actions: FileExplorerActions | undefined

  /** Attach the current session's viewing actions. */
  attach(actions: FileExplorerActions): void { this.#actions = actions }
  showFiles(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('files') }
  showDiff(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('diff') }
  showGitTree(): void { const actions = this.#require(); actions.setGitTreeOpen(false); actions.setPanel('tree') }
  closeGitTree(): void { this.#require().setGitTreeOpen(false) }

  #require(): FileExplorerActions {
    if (this.#actions === undefined) throw new Error('fileExplorerController: viewing actions not wired')
    return this.#actions
  }
}
