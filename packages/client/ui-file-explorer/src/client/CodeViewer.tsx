/**
 * Text-preview modal: shows one file's highlighted content with a close
 * control and the full path in the footer. The open file rides the shared
 * viewing store, so the tree's click drives this entry.
 */
import { useEffect, useState } from 'react'
import type { CodeViewerProps } from './contract/slots.ts'
import { tokenize, usesHashComments, type HighlightToken } from './highlight.ts'
import { useModalFocus } from './useModalFocus.ts'
import css from './CodeViewer.module.css'

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

function Spinner(): JSX.Element {
  return <span className={css.spinner} />
}

function tokenClass(type: HighlightToken['type']): string | undefined {
  switch (type) {
    case 'comment': return css.tokCom
    case 'string': return css.tokStr
    case 'number': return css.tokNum
    case 'keyword': return css.tokKw
    default: return undefined
  }
}

/**
 * Render the code-viewer modal.
 * @param props - composed slot props (runtime share + store + injected actions).
 * @returns the modal, or null while no file is open.
 */
export function CodeViewer({ sessionId, useStore, actions, readFile }: CodeViewerProps) {
  const file = useStore(state => state.openFile)
  const modalsMinimized = useStore(state => state.modalsMinimized)
  const { ref, zIndex } = useModalFocus(file?.path)
  const [content, setContent] = useState({ loading: false, text: '', truncated: false, error: null as string | null })

  useEffect(() => {
    if (file === null) { setContent({ loading: false, text: '', truncated: false, error: null }); return }
    setContent({ loading: true, text: '', truncated: false, error: null })
    readFile(sessionId, file.path).then((result) => {
      if (result.ok) setContent({ loading: false, text: result.value.content, truncated: result.value.truncated, error: null })
      else setContent({ loading: false, text: '', truncated: false, error: result.error.message })
    })
  }, [file?.path])

  if (file === null || modalsMinimized) return null

  const tokens = tokenize(content.text, usesHashComments(file.name))

  let body: JSX.Element
  if (content.loading) {
    body = <div className={css.empty}><Spinner /><span className={css.muted}>读取中…</span></div>
  } else if (content.error !== null) {
    body = <div className={`${css.empty} ${css.error}`}>{content.error}</div>
  } else {
    body = (
      <pre className={css.pre}>
        {tokens.map((token, index) => {
          const className = tokenClass(token.type)
          return className === undefined ? token.text : <span key={index} className={className}>{token.text}</span>
        })}
      </pre>
    )
  }

  return (
    <div className={css.backdrop} style={{ zIndex }}>
      <div ref={ref} className={css.card}>
        <div className={css.head}>
          <span className={css.title}><FileIcon /> {file.name}</span>
          <button type="button" className={css.close} title="关闭" onClick={() => { actions.setOpenFile(null) }}><CloseIcon /></button>
        </div>
        <div className={css.body}>
          {content.truncated && <div className={css.truncNote}>内容过长，已截断显示</div>}
          {body}
        </div>
        <div className={css.foot}>{file.path}</div>
      </div>
    </div>
  )
}
