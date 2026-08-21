/**
 * Git diff content for the unified git modal's diff tab: a staged/unstaged
 * changes list, then a per-file side-by-side diff reached by clicking one
 * change. It renders the modal's body + foot content (the shared frame and the
 * tab switcher live in GitModal), and reloads the changes list each time it
 * mounts.
 */
import { useEffect, useRef, useState } from 'react'
import type { FileDiffRequest, GitChange } from '@deepseek-ai/dsh-file-explorer/types'
import type { DiffContentProps } from './contract/slots.ts'
import { diffRows, type DiffRow } from './diff.ts'
import { tokenize, usesHashComments, type HighlightToken } from './highlight.ts'

/** One contiguous changed run in the side-by-side diff, for the overview ruler. */
interface DiffRegion {
  /** Zero-based index of the region's first changed row. */
  startRow: number
  /** Number of changed rows in the region. */
  rowCount: number
  /** Whether the run adds lines (new side), removes lines (old side), or modifies both. */
  kind: 'add' | 'del' | 'mod'
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
import css from './DiffViewer.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

interface ListData {
  loading: boolean
  workdir: string
  staged: GitChange[]
  unstaged: GitChange[]
  error: string | null
}

interface FileData {
  loading: boolean
  path: string
  scope: 'staged' | 'unstaged'
  oldText: string
  newText: string
  error: string | null
}

function FileIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  )
}

function BackIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1={19} y1={12} x2={5} y2={12} />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function Spinner(): JSX.Element {
  return <span className={css.spinner} />
}

function codeClass(code: string): string {
  if (code === 'A') return css.chCodeA ?? ''
  if (code === 'D') return css.chCodeD ?? ''
  if (code === '?') return css.chCodeU ?? ''
  return css.chCodeM ?? ''
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
 * Render the git diff tab content.
 * @param props - the session id plus the git Remote methods it drives.
 * @returns the modal body + foot content.
 */
export function DiffViewer({ sessionId, gitStatus, fileDiff }: DiffContentProps) {
  const [mode, setMode] = useState<'list' | 'file'>('list')
  const [listData, setListData] = useState<ListData>({ loading: true, workdir: '', staged: [], unstaged: [], error: null })
  const [fileData, setFileData] = useState<FileData | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  /** Scroll the diff body so the given row is centered (overview-ruler click). */
  const scrollToRow = (rowIndex: number): void => {
    const el = bodyRef.current?.querySelector(`[data-diff-row="${rowIndex}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  useEffect(() => {
    setMode('list')
    setListData({ loading: true, workdir: '', staged: [], unstaged: [], error: null })
    setFileData(null)
    gitStatus(sessionId).then((result) => {
      if (result.ok) setListData({ loading: false, workdir: result.value.workdir, staged: result.value.staged, unstaged: result.value.unstaged, error: null })
      else setListData({ loading: false, workdir: '', staged: [], unstaged: [], error: result.error.message })
    })
  }, [sessionId])

  const openFileDiff = (path: string, scope: 'staged' | 'unstaged'): void => {
    setMode('file')
    setFileData({ loading: true, path, scope, oldText: '', newText: '', error: null })
    const request: FileDiffRequest = { path, scope }
    fileDiff(sessionId, request).then((result) => {
      if (result.ok) setFileData({ loading: false, path, scope, oldText: result.value.oldText, newText: result.value.newText, error: null })
      else setFileData({ loading: false, path, scope, oldText: '', newText: '', error: result.error.message })
    })
  }

  const renderRow = (change: GitChange, scope: 'staged' | 'unstaged'): JSX.Element => (
    <div key={`${scope}:${change.path}`} className={css.chRow} onClick={() => { openFileDiff(change.path, scope) }}>
      <span className={`${css.chCode} ${codeClass(change.code)}`}>{change.code}</span>
      <span className={css.chPath}>{change.path}</span>
    </div>
  )

  if (mode === 'file' && fileData !== null) {
    let body: JSX.Element
    let ruler: JSX.Element | null = null
    if (fileData.loading) {
      body = <div className={css.empty}><Spinner /><span className={css.muted}>计算 diff 中…</span></div>
    } else if (fileData.error !== null) {
      body = <div className={`${css.empty} ${css.error}`}>{fileData.error}</div>
    } else {
      const { rows, truncated } = diffRows(fileData.oldText, fileData.newText)
      const hashComment = usesHashComments(fileData.path)
      const regions = computeDiffRegions(rows)
      if (rows.length > 0) {
        ruler = (
          <div className={css.ruler}>
            {regions.map((region, index) => (
              <div
                key={index}
                className={`${css.rulerMark} ${region.kind === 'add' ? css.rulerAdd : region.kind === 'del' ? css.rulerDel : css.rulerMod}`}
                title="点击跳转到此差异"
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
        <div className={css.subHead}>
          <button type="button" className={css.subBack} title="返回" onClick={() => { setMode('list') }}><BackIcon /></button>
          <span className={css.subTitle}><FileIcon /> {fileData.path}</span>
        </div>
        <div className={css.diffArea}>
          <div className={css.body} ref={bodyRef}>{body}</div>
          {ruler}
        </div>
        <div className={css.foot}>{fileData.scope === 'staged' ? '已暂存' : '未暂存'} · {fileData.path}</div>
      </>
    )
  }

  let listBody: JSX.Element
  if (listData.loading) {
    listBody = <div className={css.empty}><Spinner /><span className={css.muted}>获取变更中…</span></div>
  } else if (listData.error !== null) {
    listBody = <div className={`${css.empty} ${css.error}`}>{listData.error}</div>
  } else if (listData.staged.length === 0 && listData.unstaged.length === 0) {
    listBody = <div className={css.empty}>工作区无改动</div>
  } else {
    listBody = (
      <div>
        {listData.staged.length > 0 && (
          <div>
            <div className={css.chTitle}>已暂存（{listData.staged.length}）</div>
            {listData.staged.map(change => renderRow(change, 'staged'))}
          </div>
        )}
        {listData.unstaged.length > 0 && (
          <div>
            <div className={css.chTitle}>未暂存（{listData.unstaged.length}）</div>
            {listData.unstaged.map(change => renderRow(change, 'unstaged'))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={css.body}>{listBody}</div>
      {listData.workdir !== '' && <div className={css.foot}>{listData.workdir}</div>}
    </>
  )
}
