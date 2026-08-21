/**
 * File-explorer slot contracts. Four registrations share this package's
 * store handle and inject face:
 *
 * - FileExplorer fills the root `details` column with the workspace tree and
 *   declares the session-scoped `file-explorer.overlay` child seat.
 * - CodeViewer fills a `file-explorer.overlay` entry with the text-preview
 *   modal.
 * - DiffViewer fills a second `file-explorer.overlay` entry with the
 *   git-changes list and per-file side-by-side diff.
 * - GitTreeViewer fills a third `file-explorer.overlay` entry with the
 *   commit-history graph.
 *
 * The modals render from inside the `details` entry with fixed positioning,
 * so the whole composition stays in the `session` scope: one shared store
 * handle, one scope (the framework pins a handle to its first mount's scope,
 * so a `shell.overlay` seat — root scope — could never share it).
 *
 * All four read the Host data service through one inject face wrapping
 * `ctx.remote.fileExplorer`, and share the viewing store so opening a file or
 * the diff modal from the tree is visible to the matching modal entry.
 */
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pull the owner SlotMap merges into programs that resolve the
// runtime shares below.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  FileDiffRequest,
  FileDiffResult,
  GitLogResult,
  GitStatusResult,
  ListDirResult,
  ReadFileResult,
} from '@deepseek-ai/dsh-file-explorer/types'
import type { createFileExplorerStore } from '../store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The file-explorer modal layer: text preview, git diff, and commit
     * graph entries, rendered from inside the `details` tree entry (fixed
     * positioning lifts them above the frame). Session scope so the modals
     * share the tree's viewing-store handle.
     */
    'file-explorer.overlay': { kind: 'list'; scope: 'session' }
  }
}

/** Injected Host actions each entry drives. */
export interface FileExplorerInjected {
  /** List one directory; `null` lists the session workspace root. */
  listDir: (sessionId: SessionId, path: string | null) => Promise<RemoteResult<ListDirResult>>
  /** Read one UTF-8 text file for preview. */
  readFile: (sessionId: SessionId, path: string) => Promise<RemoteResult<ReadFileResult>>
  /** Discover staged and unstaged changes. */
  gitStatus: (sessionId: SessionId) => Promise<RemoteResult<GitStatusResult>>
  /** Resolve the old/new text pair for one changed file. */
  fileDiff: (sessionId: SessionId, request: FileDiffRequest) => Promise<RemoteResult<FileDiffResult>>
  /** Resolve the commit-history graph across all refs. */
  gitLog: (sessionId: SessionId) => Promise<RemoteResult<GitLogResult>>
  /** Open the session details column. */
  openPanel: () => void
  /** Close the session details column. */
  closePanel: () => void
  /** Pin the panel open (manual expand) so hover-auto-collapse is disabled. */
  setPanelPinned: (pinned: boolean) => void
  /** Whether the panel is pinned (manual) rather than hover-floating. */
  isPanelPinned: () => boolean
}

/** Full tree props: the `details` runtime share, the modal-layer render seat, the viewing store, and the injected actions. */
export type FileExplorerProps =
  PropsRuntime<'details'>
  & PropsRenderSlots<'file-explorer.overlay'>
  & PropsStore<ReturnType<typeof createFileExplorerStore>>
  & FileExplorerInjected

/** Full code-viewer props: the `file-explorer.overlay` runtime share, the viewing store, and the injected actions. */
export type CodeViewerProps =
  PropsRuntime<'file-explorer.overlay'>
  & PropsStore<ReturnType<typeof createFileExplorerStore>>
  & FileExplorerInjected

/** Full git-modal props: the unified diff/graph modal's share. */
export type GitModalProps =
  PropsRuntime<'file-explorer.overlay'>
  & PropsStore<ReturnType<typeof createFileExplorerStore>>
  & FileExplorerInjected

/** Diff tab content props: the session id plus the git Remote methods it drives. */
export interface DiffContentProps {
  sessionId: SessionId
  gitStatus: FileExplorerInjected['gitStatus']
  fileDiff: FileExplorerInjected['fileDiff']
}

/** Graph tab content props: the session id plus the git Remote method it drives. */
export interface GraphContentProps {
  sessionId: SessionId
  gitLog: FileExplorerInjected['gitLog']
}

/** Full right-edge rail props: the root `shell.overlay` share plus the open/pin actions. */
export type FileExplorerRailProps =
  PropsRuntime<'shell.overlay'>
  & { openPanel: () => void; setPanelPinned: (pinned: boolean) => void }
