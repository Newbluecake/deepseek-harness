/**
 * File-explorer viewing store shared across the registrations: the session
 * `details` panel and the overlay entries. Module level exports the factory
 * only (a module-level handle would pin the store identity across plugin
 * reloads); `apply` passes one handle to every register and the components
 * derive their PropsStore share from the return type.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { FileDiffRequest, FileExplorerEntry } from '@deepseek-ai/dsh-file-explorer/types'

/** Content shown in the session details column. */
export type FileExplorerPanel = 'files' | 'diff' | 'tree'

/** One selected git change whose file diff is open. */
export interface OpenFileDiff extends FileDiffRequest {}

/** Viewing state shared across the panel and overlay entries. */
type FileExplorerViewState = {
  /** Content shown in the session details column. */
  panel: FileExplorerPanel
  /** File whose content the code viewer shows, or none. */
  openFile: FileExplorerEntry | null
  /** Git change whose side-by-side diff is open, or none. */
  openFileDiff: OpenFileDiff | null
  /** Whether the Git Tree modal is open. */
  gitTreeOpen: boolean
  /** Whether the modals are collapsed by a global collapse-all; their open state is preserved. */
  modalsMinimized: boolean
}

/** Mutation API for the viewing state (the declared store actions). */
type FileExplorerViewActions = {
  setPanel: (draft: FileExplorerViewState, panel: FileExplorerPanel) => void
  setOpenFile: (draft: FileExplorerViewState, file: FileExplorerEntry | null) => void
  setOpenFileDiff: (draft: FileExplorerViewState, file: OpenFileDiff | null) => void
  setGitTreeOpen: (draft: FileExplorerViewState, open: boolean) => void
  setModalsMinimized: (draft: FileExplorerViewState, minimized: boolean) => void
}

/**
 * Create the file-explorer viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createFileExplorerStore(): EngineStoreHandle<FileExplorerViewState, FileExplorerViewActions> {
  return defineStore({
    init: (): FileExplorerViewState => ({ panel: 'diff', openFile: null, openFileDiff: null, gitTreeOpen: false, modalsMinimized: false }),
    actions: {
      setPanel: (d, panel) => { d.panel = panel; d.openFile = null; d.openFileDiff = null },
      setOpenFile: (d, file) => { d.openFile = file; if (file !== null) { d.openFileDiff = null; d.gitTreeOpen = false } },
      setOpenFileDiff: (d, file) => { d.openFileDiff = file; if (file !== null) { d.openFile = null; d.gitTreeOpen = false } },
      setGitTreeOpen: (d, open) => { d.gitTreeOpen = open; if (open) { d.openFile = null; d.openFileDiff = null } },
      setModalsMinimized: (d, minimized) => { d.modalsMinimized = minimized },
    },
  })
}
