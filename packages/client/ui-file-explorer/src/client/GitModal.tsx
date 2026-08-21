/**
 * Unified git modal: one shared frame hosting the git diff and git graph views
 * behind a top tab switcher, so the user can flip between them without closing
 * and reopening. Both tab contents stay mounted (hidden when inactive) so
 * switching preserves each view's state; the modal opens from the tree header
 * buttons and its open/tab state rides the shared viewing store.
 */
import type { GitModalProps } from './contract/slots.ts'
import { DiffViewer } from './DiffViewer.tsx'
import { GitTreeViewer } from './GitTreeViewer.tsx'
import css from './GitModal.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function GitBranchIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1={6} y1={3} x2={6} y2={15} />
      <circle cx={18} cy={6} r={3} />
      <circle cx={6} cy={18} r={3} />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
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

function CloseIcon(): JSX.Element {
  return (
    <svg {...svgProps} width={16} height={16}>
      <line x1={18} y1={6} x2={6} y2={18} />
      <line x1={6} y1={6} x2={18} y2={18} />
    </svg>
  )
}

/**
 * Render the unified git modal.
 * @param props - composed slot props (runtime share + store + injected actions).
 * @returns the modal, or null while closed.
 */
export function GitModal({ sessionId, useStore, actions, gitStatus, fileDiff, gitLog }: GitModalProps) {
  const open = useStore(state => state.gitModalOpen)
  const tab = useStore(state => state.gitModalTab)

  if (!open) return null

  const close = (): void => { actions.closeGitModal() }

  return (
    <div className={css.backdrop} onClick={close}>
      <div className={css.card} onClick={(event) => { event.stopPropagation() }}>
        <div className={css.head}>
          <div className={css.tabs}>
            <button
              type="button"
              className={tab === 'diff' ? `${css.tab} ${css.tabActive}` : css.tab}
              onClick={() => { actions.setGitModalTab('diff') }}
            >
              <GitBranchIcon /> Git Diff
            </button>
            <button
              type="button"
              className={tab === 'graph' ? `${css.tab} ${css.tabActive}` : css.tab}
              onClick={() => { actions.setGitModalTab('graph') }}
            >
              <GitCommitIcon /> Git Graph
            </button>
          </div>
          <button type="button" className={css.close} title="关闭" onClick={close}><CloseIcon /></button>
        </div>
        <div className={css.panes}>
          <div className={tab === 'diff' ? css.pane : `${css.pane} ${css.paneHidden}`}>
            <DiffViewer sessionId={sessionId} gitStatus={gitStatus} fileDiff={fileDiff} />
          </div>
          <div className={tab === 'graph' ? css.pane : `${css.pane} ${css.paneHidden}`}>
            <GitTreeViewer sessionId={sessionId} gitLog={gitLog} />
          </div>
        </div>
      </div>
    </div>
  )
}
