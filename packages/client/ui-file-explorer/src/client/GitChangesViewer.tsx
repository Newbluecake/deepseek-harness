/** Git changes list embedded in the session details column. */
import { useCallback, useEffect, useState } from 'react'
import type { GitChange } from '@deepseek-ai/dsh-file-explorer/types'
import type { FileExplorerProps } from './contract/slots.ts'
import css from './DiffViewer.module.css'
import explorerCss from './FileExplorer.module.css'

/** Poll interval for auto-detecting workspace changes while the diff view is open. */
const POLL_INTERVAL_MS = 2000

interface GitChangesViewerProps {
  sessionId: FileExplorerProps['sessionId']
  gitStatus: FileExplorerProps['gitStatus']
  openFileDiff: (path: string, scope: 'staged' | 'unstaged') => void
  /** Jump to the file list and search for the given change path's basename. */
  locateFile: (path: string) => void
}

interface ListData {
  loading: boolean
  branch: string
  staged: GitChange[]
  unstaged: GitChange[]
  error: string | null
}

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function SearchIcon(): JSX.Element {
  return <svg {...svgProps}><circle cx={11} cy={11} r={8} /><line x1={21} y1={21} x2={16.65} y2={16.65} /></svg>
}

function ClearIcon(): JSX.Element {
  return <svg {...svgProps}><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></svg>
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

/**
 * Render staged and unstaged file changes in the right details column.
 * @param props - session data access and the file selection callback.
 * @returns the changes list.
 */
export function GitChangesViewer({ sessionId, gitStatus, openFileDiff, locateFile }: GitChangesViewerProps) {
  const [data, setData] = useState<ListData>({ loading: true, branch: '', staged: [], unstaged: [], error: null })
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  const refresh = useCallback((): void => {
    void gitStatus(sessionId).then((result) => {
      if (result.ok) {
        setData({
          loading: false,
          branch: result.value.branch,
          staged: result.value.staged,
          unstaged: result.value.unstaged,
          error: null,
        })
      }
      else setData({ loading: false, branch: '', staged: [], unstaged: [], error: result.error.message })
    })
  }, [sessionId, gitStatus])

  useEffect(() => {
    setQuery('')
    setData({ loading: true, branch: '', staged: [], unstaged: [], error: null })
    refresh()
    // Auto-detect workspace changes: poll git status while the diff view is
    // open so agent edits appear without a manual refresh.
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [sessionId, refresh])

  const renderRow = (change: GitChange, scope: 'staged' | 'unstaged'): JSX.Element => (
    <button
      type="button"
      key={`${scope}:${change.path}`}
      className={css.chRow}
      title={change.path}
      onClick={() => { openFileDiff(change.path, scope) }}
      onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, path: change.path }) }}
    >
      <span className={`${css.chCode} ${codeClass(change.code)}`}>{change.code}</span>
      <span className={css.chPath}>{change.path}</span>
    </button>
  )

  const normalizedQuery = query.trim().toLowerCase()
  const staged = normalizedQuery === '' ? data.staged : data.staged.filter(change => change.path.toLowerCase().includes(normalizedQuery))
  const unstaged = normalizedQuery === '' ? data.unstaged : data.unstaged.filter(change => change.path.toLowerCase().includes(normalizedQuery))

  let body: JSX.Element
  if (data.loading) {
    body = <div className={css.empty}><Spinner /><span className={css.muted}>获取变更中…</span></div>
  } else if (data.error !== null) {
    body = <div className={`${css.empty} ${css.error}`}>{data.error}</div>
  } else if (data.staged.length === 0 && data.unstaged.length === 0) {
    body = <div className={css.empty}>工作区无改动</div>
  } else if (staged.length === 0 && unstaged.length === 0) {
    body = <div className={css.empty}>没有匹配的变更</div>
  } else {
    body = (
      <div>
        {staged.length > 0 && <div><div className={css.chTitle}>已暂存（{staged.length}）</div>{staged.map(change => renderRow(change, 'staged'))}</div>}
        {unstaged.length > 0 && <div><div className={css.chTitle}>未暂存（{unstaged.length}）</div>{unstaged.map(change => renderRow(change, 'unstaged'))}</div>}
      </div>
    )
  }

  return (
    <>
      <div className={css.panel}>
        <div className={explorerCss.search}>
          <span className={explorerCss.searchIcon}><SearchIcon /></span>
          <input className={explorerCss.searchInput} type="text" placeholder="搜索变更文件…" value={query} onChange={(event) => { setQuery(event.target.value) }} />
          {query !== '' && <button type="button" className={explorerCss.searchClear} title="清除" onClick={() => { setQuery('') }}><ClearIcon /></button>}
        </div>
        {!data.loading && data.error === null && <div className={explorerCss.rootPath}>{data.branch === '' ? '分离 HEAD' : data.branch}</div>}
        <div className={css.panelBody}>{body}</div>
      </div>
      {menu !== null && (
        <>
          <div
            className={css.ctxBackdrop}
            onClick={() => { setMenu(null) }}
            onContextMenu={(event) => { event.preventDefault(); setMenu(null) }}
          />
          <div className={css.ctxMenu} style={{ left: menu.x, top: menu.y }} role="menu" aria-label="文件操作">
            <button type="button" role="menuitem" className={css.ctxItem} onClick={() => { locateFile(menu.path); setMenu(null) }}>在文件列表中定位</button>
          </div>
        </>
      )}
    </>
  )
}
