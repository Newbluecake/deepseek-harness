/** Git Tree modal hosting the commit graph outside the details column. */
import type { GitModalProps } from './contract/slots.ts'
import { GitTreeViewer } from './GitTreeViewer.tsx'
import { useModalFocus } from './useModalFocus.ts'
import css from './GitModal.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
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
 * Render the Git Tree modal.
 * @param props - composed slot props with shared store and git-log access.
 * @returns the modal, or null while closed.
 */
export function GitTreeModal({ sessionId, useStore, actions, gitLog }: GitModalProps) {
  const open = useStore(state => state.gitTreeOpen)
  const modalsMinimized = useStore(state => state.modalsMinimized)
  const { ref, zIndex } = useModalFocus(open)
  if (!open || modalsMinimized) return null
  const close = (): void => { actions.setGitTreeOpen(false) }

  return (
    <div className={css.backdrop} style={{ zIndex }}>
      <div ref={ref} className={css.card}>
        <div className={css.head}>
          <span className={css.title}><GitCommitIcon /> Git Tree</span>
          <button type="button" className={css.close} title="关闭 Git Tree" onClick={close}><CloseIcon /></button>
        </div>
        <GitTreeViewer sessionId={sessionId} gitLog={gitLog} />
      </div>
    </div>
  )
}
