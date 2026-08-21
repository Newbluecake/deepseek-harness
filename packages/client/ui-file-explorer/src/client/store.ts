/**
 * File-explorer viewing store shared across the registrations: the session
 * `details` tree and the modal entries. Module level exports the factory only
 * (a module-level handle would pin the store identity across plugin reloads);
 * `apply` passes one handle to every register and the components derive their
 * PropsStore share from the return type.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { FileExplorerEntry } from '@deepseek-ai/dsh-file-explorer/types'

/** Which tab the unified git modal shows. */
export type GitModalTab = 'diff' | 'graph'

/** Viewing state shared across the tree and the modal entries. */
type FileExplorerViewState = {
  /** File whose content the code viewer shows, or none. */
  openFile: FileExplorerEntry | null
  /** Whether the unified git modal (diff / graph) is open. */
  gitModalOpen: boolean
  /** The git modal's active tab. */
  gitModalTab: GitModalTab
}

/** Mutation API for the viewing state (the declared store actions). */
type FileExplorerViewActions = {
  setOpenFile: (draft: FileExplorerViewState, file: FileExplorerEntry | null) => void
  openGitModal: (draft: FileExplorerViewState, tab: GitModalTab) => void
  closeGitModal: (draft: FileExplorerViewState) => void
  setGitModalTab: (draft: FileExplorerViewState, tab: GitModalTab) => void
}

/**
 * Create the file-explorer viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createFileExplorerStore(): EngineStoreHandle<FileExplorerViewState, FileExplorerViewActions> {
  return defineStore({
    init: (): FileExplorerViewState => ({ openFile: null, gitModalOpen: false, gitModalTab: 'diff' }),
    actions: {
      setOpenFile: (d, file) => { d.openFile = file; if (file !== null) d.gitModalOpen = false },
      openGitModal: (d, tab) => { d.gitModalOpen = true; d.gitModalTab = tab; d.openFile = null },
      closeGitModal: (d) => { d.gitModalOpen = false },
      setGitModalTab: (d, tab) => { d.gitModalTab = tab },
    },
  })
}
