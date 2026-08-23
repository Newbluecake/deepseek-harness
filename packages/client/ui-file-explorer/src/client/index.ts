/**
 * File explorer plugin, browser half: the workspace tree registered into the
 * root `details` column, plus the text-preview and per-file git-diff modals
 * registered into the session-scoped `file-explorer.overlay` child seat the
 * panel entry declares. The file list and git changes list switch within the
 * details column; Git Tree uses its own modal. All entries share one viewing store and one
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
import { GitTreeModal } from './GitTreeModal.tsx'
import { FileExplorerRail } from './FileExplorerRail.tsx'
import { FileExplorerController } from './controller.ts'

export type {
  CodeViewerProps, DiffContentProps, FileExplorerInjected, FileExplorerProps,
  FileExplorerRailProps, GitModalProps, GraphContentProps,
} from './contract/slots.ts'

/** Required services: the slot registry and the file-explorer Remote namespace. */
export const inject = ['slots', 'remote', 'remote.fileExplorer', 'surfaceCoordinator']

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
    searchFiles: (sessionId, request) => remote.searchFiles(sessionId, request),
    openPanel: () => { layout?.openDetails() },
    closePanel: () => { layout?.closeDetails() },
    setPanelPinned: (pinned: boolean) => { panelPinned = pinned },
    isPanelPinned: () => panelPinned,
    attachController: (actions) => { controller.attach(actions) },
  })
  const store = createFileExplorerStore()
  const controller = new FileExplorerController()
  // Expose the open-file control face so the conversation can open paths in
  // the in-app preview when the browser and the Host are not the same machine.
  ctx.reflect.provide('fileExplorer', controller)
  const surfaceCoordinator = ctx.get('surfaceCoordinator') as {
    subscribe(listener: (action: 'collapse' | 'expand') => void): () => void
  }
  // Collapse/expand the modals together with the other floating surfaces.
  ctx.effect(() => surfaceCoordinator.subscribe((action) => {
    if (action === 'collapse') controller.collapseModals()
    else controller.expandModals()
  }), 'file-explorer: surface collapse subscription')

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
  // Only a selected changed file opens the git diff overlay.
  ctx.slots.inject('file-explorer.overlay', () => ctx.slots.register(
    { name: 'file-explorer.overlay', id: 'file-explorer-git', order: 1, store, inject: injected },
    GitModal,
  ))
  ctx.slots.inject('file-explorer.overlay', () => ctx.slots.register(
    { name: 'file-explorer.overlay', id: 'file-explorer-git-tree', order: 2, store, inject: injected },
    GitTreeModal,
  ))
  // Right-edge hover rail (root scope, no store): hovering reveals the
  // collapsed details column; the panel's own collapse button hides it again.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'file-explorer-rail', order: 0, inject: () => ({
      openPanel: () => { layout?.openDetails() },
      setPanelPinned: (pinned: boolean) => { panelPinned = pinned },
      showFiles: () => { controller.showFiles() },
      showDiff: () => { controller.showDiff() },
      showGitTree: () => { controller.showGitTree() },
    }) },
    FileExplorerRail,
  ))
}
