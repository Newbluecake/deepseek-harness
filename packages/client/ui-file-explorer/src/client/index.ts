/**
 * File explorer plugin, browser half: the workspace tree registered into the
 * root `details` column, plus the text-preview, git-diff, and commit-graph
 * modals registered into the session-scoped `file-explorer.overlay` child
 * seat the tree entry declares (fixed positioning lifts them above the
 * frame; a root `shell.overlay` seat could not share the tree's store
 * handle — one handle, one scope). All four share one viewing store and one
 * inject face wrapping `ctx.remote.fileExplorer`. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the
// Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { FileExplorerInjected } from './contract/slots.ts'
import { createFileExplorerStore } from './store.ts'
import { FileExplorer } from './FileExplorer.tsx'
import { CodeViewer } from './CodeViewer.tsx'
import { GitModal } from './GitModal.tsx'
import { FileExplorerRail } from './FileExplorerRail.tsx'

export type {
  CodeViewerProps, DiffContentProps, FileExplorerInjected, FileExplorerProps,
  FileExplorerRailProps, GitModalProps, GraphContentProps,
} from './contract/slots.ts'

/** Required services: the slot registry and the file-explorer Remote namespace. */
export const inject = ['slots', 'remote', 'remote.fileExplorer']

/**
 * Register the tree and the two modal entries once their slot declarations
 * are on the ledger. The inject factory returns plain callbacks over the
 * Remote namespace; the components reach them through the inject face.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const remote = ctx.remote.fileExplorer
  const layout = ctx.get('layout') as { openDetails: () => void; closeDetails: () => void } | undefined
  // Shared across the root-scoped rail and the session-scoped tree via the
  // inject-face closures: manual expand pins, hover expand floats.
  let panelPinned = true
  const injected = (): FileExplorerInjected => ({
    listDir: (sessionId, path) => remote.listDir(sessionId, path),
    readFile: (sessionId, path) => remote.readFile(sessionId, path),
    gitStatus: sessionId => remote.gitStatus(sessionId),
    fileDiff: (sessionId, request) => remote.fileDiff(sessionId, request),
    gitLog: sessionId => remote.gitLog(sessionId),
    openPanel: () => { layout?.openDetails() },
    closePanel: () => { layout?.closeDetails() },
    setPanelPinned: (pinned: boolean) => { panelPinned = pinned },
    isPanelPinned: () => panelPinned,
  })
  const store = createFileExplorerStore()

  // Priority -1 shadows ui-conversation's DetailsPanel (the priority-0
  // occupant): `details` is a single slot, so the lowest priority renders
  // and the shadowed entry returns when this plugin unloads.
  ctx.slots.inject('details', () => ctx.slots.register({
    name: 'details',
    priority: -1,
    children: {
      'file-explorer.overlay': { kind: 'list', scope: 'session' },
    },
    store,
    inject: injected,
  }, FileExplorer))
  ctx.slots.inject('file-explorer.overlay', () => ctx.slots.register(
    { name: 'file-explorer.overlay', id: 'file-explorer-viewer', order: 0, store, inject: injected },
    CodeViewer,
  ))
  // The unified git modal (diff / graph tabs) is a single overlay entry.
  ctx.slots.inject('file-explorer.overlay', () => ctx.slots.register(
    { name: 'file-explorer.overlay', id: 'file-explorer-git', order: 1, store, inject: injected },
    GitModal,
  ))
  // Right-edge hover rail (root scope, no store): hovering reveals the
  // collapsed details column; the panel's own collapse button hides it again.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'file-explorer-rail', order: 0, inject: () => ({ openPanel: () => { layout?.openDetails() }, setPanelPinned: (pinned: boolean) => { panelPinned = pinned } }) },
    FileExplorerRail,
  ))
}
