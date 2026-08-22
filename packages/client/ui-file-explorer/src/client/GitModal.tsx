/**
 * Per-file git diff modal. The changes list stays in the session details
 * column; selecting one changed file opens this overlay.
 */
import type { GitModalProps } from './contract/slots.ts'
import { DiffViewer } from './DiffViewer.tsx'
import css from './GitModal.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function FileIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
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
 * Render the selected file's git diff modal.
 * @param props - composed slot props (runtime share + store + injected actions).
 * @returns the modal, or null while no file diff is selected.
 */
export function GitModal({ sessionId, useStore, actions, fileDiff }: GitModalProps) {
  const file = useStore(state => state.openFileDiff)
  if (file === null) return null

  const close = (): void => { actions.setOpenFileDiff(null) }

  return (
    <div className={css.backdrop} onClick={close}>
      <div className={css.card} onClick={(event) => { event.stopPropagation() }}>
        <div className={css.head}>
          <span className={css.title}><FileIcon /> {file.path}</span>
          <button type="button" className={css.close} title="关闭" onClick={close}><CloseIcon /></button>
        </div>
        <DiffViewer sessionId={sessionId} request={file} fileDiff={fileDiff} />
      </div>
    </div>
  )
}
