/** Side-by-side diff for one selected git change. */
import { useEffect, useRef, useState } from 'react'
import type { FileDiffRequest } from '@deepseek-ai/dsh-file-explorer/types'
import type { DiffContentProps } from './contract/slots.ts'
import { diffRows, type DiffRow } from './diff.ts'
import { tokenize, usesHashComments, type HighlightToken } from './highlight.ts'
import css from './DiffViewer.module.css'

/** One contiguous changed run in the side-by-side diff, for the overview ruler. */
interface DiffRegion {
  startRow: number
  rowCount: number
  kind: 'add' | 'del' | 'mod'
}

/** Loaded file diff plus its loading/error frame. */
interface FileData {
  loading: boolean
  oldText: string
  newText: string
  error: string | null
}

/** Group the changed rows into contiguous regions, each tagged add/del/mod. */
function computeDiffRegions(rows: DiffRow[]): DiffRegion[] {
  const regions: DiffRegion[] = []
  let start = -1
  let hasAdd = false
  let hasDel = false
  const flush = (end: number): void => {
    if (start === -1) return
    regions.push({ startRow: start, rowCount: end - start, kind: hasAdd && hasDel ? 'mod' : hasAdd ? 'add' : 'del' })
    start = -1
    hasAdd = false
    hasDel = false
  }
  rows.forEach((row, index) => {
    if (row.changed) {
      if (start === -1) start = index
      if (row.right !== null) hasAdd = true
      if (row.left !== null) hasDel = true
    } else {
      flush(index)
    }
  })
  flush(rows.length)
  return regions
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

function renderLine(text: string, hashComment: boolean): (string | JSX.Element)[] {
  return tokenize(text, hashComment).map((token, index) => {
    const className = tokenClass(token.type)
    return className === undefined ? token.text : <span key={index} className={className}>{token.text}</span>
  })
}

/**
 * Render one selected file diff.
 * @param props - the session id, selected change, and file-diff Remote method.
 * @returns the diff body and footer.
 */
export function DiffViewer({ sessionId, request, fileDiff }: DiffContentProps) {
  const [data, setData] = useState<FileData>({ loading: true, oldText: '', newText: '', error: null })
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setData({ loading: true, oldText: '', newText: '', error: null })
    const selected: FileDiffRequest = request
    fileDiff(sessionId, selected).then((result) => {
      if (result.ok) setData({ loading: false, oldText: result.value.oldText, newText: result.value.newText, error: null })
      else setData({ loading: false, oldText: '', newText: '', error: result.error.message })
    })
  }, [sessionId, request.path, request.scope])

  const scrollToRow = (rowIndex: number): void => {
    const element = bodyRef.current?.querySelector(`[data-diff-row="${rowIndex}"]`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  let body: JSX.Element
  let ruler: JSX.Element | null = null
  if (data.loading) {
    body = <div className={css.empty}><Spinner /><span className={css.muted}>计算 diff 中…</span></div>
  } else if (data.error !== null) {
    body = <div className={`${css.empty} ${css.error}`}>{data.error}</div>
  } else {
    const { rows, truncated } = diffRows(data.oldText, data.newText)
    const hashComment = usesHashComments(request.path)
    const regions = computeDiffRegions(rows)
    if (rows.length > 0) {
      ruler = (
        <div className={css.ruler}>
          {regions.map((region, index) => (
            <button
              type="button"
              key={index}
              className={`${css.rulerMark} ${region.kind === 'add' ? css.rulerAdd : region.kind === 'del' ? css.rulerDel : css.rulerMod}`}
              title="跳转到此差异"
              onClick={() => { scrollToRow(region.startRow) }}
              style={{ top: `${(region.startRow / rows.length) * 100}%`, height: `${(region.rowCount / rows.length) * 100}%` }}
            />
          ))}
        </div>
      )
    }
    body = (
      <div>
        {truncated && <div className={css.truncNote}>文件过大，仅对比前 1500 行</div>}
        <div className={css.sdWrap}>
          <div className={`${css.sdRow} ${css.sdHead}`}>
            <div className={`${css.sdCell} ${css.sdLeft}`}>旧</div>
            <div className={css.sdCell}>新</div>
          </div>
          {rows.map((row, index) => (
            <div key={index} className={css.sdRow} data-diff-row={index}>
              <div className={row.changed ? (row.left === null ? `${css.sdCell} ${css.sdLeft} ${css.sdBlank}` : `${css.sdCell} ${css.sdLeft} ${css.sdDel}`) : `${css.sdCell} ${css.sdLeft}`}>
                <span className={css.sdNo}>{row.leftNo ?? ''}</span>
                <span className={css.sdText}>{row.left === null ? null : renderLine(row.left, hashComment)}</span>
              </div>
              <div className={row.changed ? (row.right === null ? `${css.sdCell} ${css.sdBlank}` : `${css.sdCell} ${css.sdAdd}`) : css.sdCell}>
                <span className={css.sdNo}>{row.rightNo ?? ''}</span>
                <span className={css.sdText}>{row.right === null ? null : renderLine(row.right, hashComment)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={css.diffArea}>
        <div className={css.body} ref={bodyRef}>{body}</div>
        {ruler}
      </div>
      <div className={css.foot}>{request.scope === 'staged' ? '已暂存' : '未暂存'} · {request.path}</div>
    </>
  )
}
