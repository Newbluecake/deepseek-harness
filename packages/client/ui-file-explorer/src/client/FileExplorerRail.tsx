/** Unified right-edge Dock for files, git views, and Terminal. */
import type { FileExplorerRailProps } from './contract/slots.ts'
import css from './FileExplorerRail.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function FolderIcon(): JSX.Element {
  return <svg {...svgProps} fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
}

function GitBranchIcon(): JSX.Element {
  return <svg {...svgProps}><line x1={6} y1={3} x2={6} y2={15} /><circle cx={18} cy={6} r={3} /><circle cx={6} cy={18} r={3} /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
}

function GitCommitIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <circle cx={12} cy={12} r={4} />
      <line x1={1.05} y1={12} x2={7} y2={12} />
      <line x1={17.01} y1={12} x2={22.96} y2={12} />
    </svg>
  )
}

function TerminalIcon(): JSX.Element {
  return <svg {...svgProps}><polyline points="4 17 10 11 4 5" /><line x1={12} y1={19} x2={20} y2={19} /></svg>
}

/** Render the unified right-edge navigation Dock. */
export function FileExplorerRail({
  openPanel, setPanelPinned, showFiles, showDiff, showGitTree,
  closeGitTree, closeTerminal, toggleTerminal,
}: FileExplorerRailProps) {
  const open = (action: () => void): void => { closeTerminal(); setPanelPinned(true); openPanel(); action() }
  return (
    <nav className={css.dock} aria-label="右侧导航">
      <button type="button" className={css.item} title="文件列表" aria-label="文件列表" onClick={() => { open(showFiles) }}><FolderIcon /></button>
      <button type="button" className={css.item} title="Git Diff" aria-label="Git Diff" onClick={() => { open(showDiff) }}><GitBranchIcon /></button>
      <button type="button" className={css.item} title="Git Tree" aria-label="Git Tree" onClick={() => { open(showGitTree) }}><GitCommitIcon /></button>
      <button type="button" className={css.item} title="Terminal" aria-label="Terminal" onClick={() => { closeGitTree(); toggleTerminal() }}><TerminalIcon /></button>
    </nav>
  )
}
