/**
 * Right-edge reveal rail: click expands and pins the details column open. The
 * rail is click-driven only — hovering near the edge never opens the panel, so
 * the tree's expanded/collapsed state only changes on an explicit click.
 * Registered into the root `shell.overlay` seat (no store — the rail only
 * needs the layout open action and the pin signal, and the tree's store is
 * session-scoped).
 */
import type { FileExplorerRailProps } from './contract/slots.ts'
import css from './FileExplorerRail.module.css'

function FolderIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="currentColor" stroke="none">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

/**
 * Render the right-edge reveal rail.
 * @param props - composed slot props (root runtime share + open/pin actions).
 * @returns the thin vertical rail.
 */
export function FileExplorerRail({ openPanel, setPanelPinned }: FileExplorerRailProps) {
  return (
    <div
      className={css.rail}
      title="文件目录（点击展开）"
      onClick={() => { setPanelPinned(true); openPanel() }}
    >
      <FolderIcon />
    </div>
  )
}
