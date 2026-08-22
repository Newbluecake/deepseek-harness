/**
 * Workspace tree filling the root `details` column: header (title, count,
 * git-diff, collapse-all, refresh), file search, the current path, and the
 * lazily-loaded expandable directory tree. Clicking a file opens the code
 * viewer through the shared store; clicking a directory toggles its children.
 */
import { useEffect, useState } from 'react'
import type { FileExplorerEntry } from '@deepseek-ai/dsh-file-explorer/types'
import type { FileExplorerProps } from './contract/slots.ts'
import { GitBranchViewer } from './GitBranchViewer.tsx'
import { GitChangesViewer } from './GitChangesViewer.tsx'
import css from './FileExplorer.module.css'

interface TreeNode {
  entries: FileExplorerEntry[]
  expanded: boolean
  loaded: boolean
  loading: boolean
  error: string | null
}

interface RootState {
  loading: boolean
  path: string | null
  error: string | null
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function FolderIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg {...svgProps} width={size} height={size} fill="currentColor" stroke="none">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FileIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  )
}

/** One file-language kind: its CSS-module badge color key and short label. */
interface FileKind {
  id: string
  label: string
}

/** Extension → language badge. Keys are lower-case extensions without the dot. */
const EXTENSION_KINDS: Record<string, FileKind> = {
  js: { id: 'js', label: 'JS' },
  mjs: { id: 'js', label: 'JS' },
  cjs: { id: 'js', label: 'JS' },
  jsx: { id: 'js', label: 'JS' },
  ts: { id: 'ts', label: 'TS' },
  tsx: { id: 'ts', label: 'TS' },
  java: { id: 'java', label: 'J' },
  py: { id: 'py', label: 'PY' },
  rb: { id: 'rb', label: 'RB' },
  php: { id: 'php', label: 'PHP' },
  go: { id: 'go', label: 'GO' },
  rs: { id: 'rs', label: 'RS' },
  c: { id: 'c', label: 'C' },
  h: { id: 'c', label: 'C' },
  cpp: { id: 'cpp', label: 'C++' },
  cc: { id: 'cpp', label: 'C++' },
  hpp: { id: 'cpp', label: 'C++' },
  hxx: { id: 'cpp', label: 'C++' },
  cs: { id: 'cs', label: 'C#' },
  swift: { id: 'swift', label: 'SW' },
  kt: { id: 'kt', label: 'KT' },
  html: { id: 'html', label: '<>' },
  htm: { id: 'html', label: '<>' },
  css: { id: 'css', label: '#' },
  scss: { id: 'css', label: '#' },
  less: { id: 'css', label: '#' },
  json: { id: 'json', label: '{}' },
  jsonc: { id: 'json', label: '{}' },
  md: { id: 'md', label: 'MD' },
  markdown: { id: 'md', label: 'MD' },
  yaml: { id: 'yaml', label: 'YM' },
  yml: { id: 'yaml', label: 'YM' },
  sh: { id: 'sh', label: '$' },
  bash: { id: 'sh', label: '$' },
  zsh: { id: 'sh', label: '$' },
  sql: { id: 'sql', label: 'SQL' },
  toml: { id: 'toml', label: 'TO' },
}

/** Well-known extensionless file names → language badge. */
const SPECIAL_NAME_KINDS: Record<string, FileKind> = {
  dockerfile: { id: 'docker', label: 'DK' },
}

/** Badge color class per kind id (see FileExplorer.module.css). */
const FILE_KIND_CLASS: Record<string, string | undefined> = {
  js: css.fileJs,
  ts: css.fileTs,
  java: css.fileJava,
  py: css.filePy,
  rb: css.fileRb,
  php: css.filePhp,
  go: css.fileGo,
  rs: css.fileRs,
  c: css.fileC,
  cpp: css.fileCpp,
  cs: css.fileCs,
  swift: css.fileSwift,
  kt: css.fileKt,
  html: css.fileHtml,
  css: css.fileCss,
  json: css.fileJson,
  md: css.fileMd,
  yaml: css.fileYaml,
  sh: css.fileSh,
  sql: css.fileSql,
  toml: css.fileToml,
  docker: css.fileDocker,
}

/**
 * Resolve one file name to its language badge, or `undefined` for unknown types.
 * @param name - file name (or path; only the basename matters).
 * @returns the language kind, or `undefined` to fall back to the generic file icon.
 */
function fileKind(name: string): FileKind | undefined {
  const base = name.toLowerCase()
  const special = SPECIAL_NAME_KINDS[base]
  if (special !== undefined) return special
  const dot = base.lastIndexOf('.')
  if (dot < 0) return undefined
  return EXTENSION_KINDS[base.slice(dot + 1)]
}

/** File glyph whose lower body carries the language abbreviation in its kind color. */
function FileTypeIcon({ name }: { name: string }): JSX.Element {
  const kind = fileKind(name)
  if (kind === undefined) return <FileIcon />
  return (
    <svg {...svgProps}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
      <g className={FILE_KIND_CLASS[kind.id] ?? ''}>
        <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">{kind.label}</text>
      </g>
    </svg>
  )
}

function RefreshIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function CollapseIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <polyline points="17 11 12 6 7 11" />
      <polyline points="17 18 12 13 7 18" />
    </svg>
  )
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

function CollapsePanelIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <circle cx={11} cy={11} r={8} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  )
}

function ClearIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1={18} y1={6} x2={6} y2={18} />
      <line x1={6} y1={6} x2={18} y2={18} />
    </svg>
  )
}

function Spinner(): JSX.Element {
  return <span className={css.spinner} />
}

/**
 * Render the file explorer tree.
 * @param props - composed slot props (runtime share + store + injected actions).
 * @returns the tree element.
 */
export function FileExplorer({
  sessionId,
  useStore,
  actions,
  listDir,
  gitStatus,
  gitLog,
  openPanel,
  closePanel,
  setPanelPinned,
  attachController,
  renderSlot,
}: FileExplorerProps) {
  const panel = useStore(state => state.panel)
  const openFile = useStore(state => state.openFile)
  const [rootState, setRootState] = useState<RootState>({ loading: true, path: null, error: null })
  const [tree, setTree] = useState<Record<string, TreeNode>>({})
  const [query, setQuery] = useState('')

  const loadRoot = (): void => {
    setRootState({ loading: true, path: null, error: null })
    setTree({})
    listDir(sessionId, null).then((result) => {
      if (result.ok) {
        setTree({ [result.value.path]: { entries: result.value.entries, expanded: true, loaded: true, loading: false, error: null } })
        setRootState({ loading: false, path: result.value.path, error: null })
      } else {
        setRootState({ loading: false, path: null, error: result.error.message })
      }
    })
  }

  useEffect(() => { attachController(actions); loadRoot(); openPanel(); setPanelPinned(true) }, [])

  const toggleDir = (path: string): void => {
    const node = tree[path]
    if (node !== undefined && node.expanded) {
      setTree((prev) => {
        const current = prev[path]
        if (current === undefined) return prev
        return { ...prev, [path]: { ...current, expanded: false } }
      })
      return
    }
    const needLoad = node === undefined || !node.loaded
    setTree((prev) => {
      const current = prev[path]
      const base: TreeNode = current ?? { entries: [], expanded: false, loaded: false, loading: false, error: null }
      return { ...prev, [path]: { ...base, expanded: true, loading: needLoad, error: null } }
    })
    if (needLoad) {
      listDir(sessionId, path).then((result) => {
        setTree((prev) => {
          const current = prev[path]
          if (current === undefined) return prev
          if (result.ok) return { ...prev, [path]: { ...current, loading: false, loaded: true, entries: result.value.entries } }
          return { ...prev, [path]: { ...current, loading: false, loaded: true, error: result.error.message } }
        })
      })
    }
  }

  const collapseAll = (): void => {
    setTree((prev) => {
      const next: Record<string, TreeNode> = {}
      for (const key of Object.keys(prev)) {
        const node = prev[key]
        if (node === undefined) continue
        next[key] = key === rootState.path ? node : { ...node, expanded: false }
      }
      return next
    })
  }

  const q = query.trim().toLowerCase()
  const rows: JSX.Element[] = []

  const renderNodes = (path: string, depth: number): void => {
    const node = tree[path]
    if (node === undefined) return
    for (const entry of node.entries) {
      const child = tree[entry.path]
      const expanded = entry.type === 'directory' && child?.expanded === true
      const matches = q === '' || entry.name.toLowerCase().includes(q)
      if (!matches) {
        if (expanded) renderNodes(entry.path, depth + 1)
        continue
      }
      const indent = `${depth * 14 + 6}px`
      const selected = openFile?.path === entry.path
      if (entry.type === 'directory') {
        rows.push(
          <div key={entry.path} className={selected ? `${css.row} ${css.rowDir} ${css.rowSelected}` : `${css.row} ${css.rowDir}`} style={{ paddingLeft: indent }} title={entry.path} onClick={() => { toggleDir(entry.path) }}>
            <span className={css.twist}>{expanded ? '▾' : '▸'}</span>
            <span className={`${css.icon} ${css.iconDir}`}><FolderIcon /></span>
            <span className={css.name}>{entry.name}</span>
          </div>,
        )
        if (expanded) {
          const childIndent = `${(depth + 1) * 14 + 6}px`
          if (child?.loading === true) {
            rows.push(<div key={`${entry.path}:loading`} className={css.emptyInline} style={{ paddingLeft: childIndent }}><Spinner /><span className={css.muted}>加载中…</span></div>)
          } else if (child?.error != null) {
            rows.push(<div key={`${entry.path}:error`} className={`${css.emptyInline} ${css.error}`} style={{ paddingLeft: childIndent }}>{child.error}</div>)
          } else if (child?.loaded === true && child.entries.length === 0) {
            rows.push(<div key={`${entry.path}:empty`} className={css.emptyInline} style={{ paddingLeft: childIndent }}>（空）</div>)
          } else {
            renderNodes(entry.path, depth + 1)
          }
        }
      } else {
        rows.push(
          <div key={entry.path} className={selected ? `${css.row} ${css.rowSelected}` : css.row} style={{ paddingLeft: indent }} title={entry.path} onClick={() => { actions.setOpenFile(entry) }}>
            <span className={css.twistSpacer} />
            <span className={css.icon}><FileTypeIcon name={entry.name} /></span>
            <span className={css.name}>{entry.name}</span>
            <span className={css.size}>{entry.size === null ? '' : humanSize(entry.size)}</span>
          </div>,
        )
      }
    }
  }

  if (rootState.loading) {
    rows.push(<div key="loading" className={css.empty}><Spinner /><span className={css.muted}>加载中…</span></div>)
  } else if (rootState.error !== null) {
    rows.push(<div key="error" className={`${css.empty} ${css.error}`}>{rootState.error}</div>)
  } else if (rootState.path !== null) {
    renderNodes(rootState.path, 0)
    if (rows.length === 0) {
      rows.push(q === '' ? <div key="empty" className={css.empty}><span className={css.icon}><FolderIcon size={20} /></span><span className={css.muted}>空目录</span></div> : <div key="nomatch" className={css.empty}><span className={css.icon}><SearchIcon /></span><span className={css.muted}>无匹配结果</span></div>)
    }
  }

  const title = panel === 'files' ? '文件目录' : panel === 'diff' ? 'Git Diff' : 'Git Tree'

  return (
    <div className={css.root}>
      <div className={css.head} role="toolbar" aria-label="文件工具栏">
        <button type="button" className={css.headIcon} title={`收起${title}`} onClick={closePanel}><FolderIcon size={15} /></button>
        <span className={css.title}>{title}</span>
        <div className={css.toolbarActions}>
          <button type="button" className={panel === 'files' ? `${css.iconBtn} ${css.iconBtnActive}` : css.iconBtn} title="文件列表" aria-label="文件列表" onClick={() => { actions.setPanel('files') }}><FolderIcon size={14} /></button>
          <button type="button" className={panel === 'diff' ? `${css.iconBtn} ${css.iconBtnActive}` : css.iconBtn} title="Git Diff" aria-label="Git Diff" onClick={() => { actions.setPanel('diff') }}><GitBranchIcon /></button>
          <button type="button" className={panel === 'tree' ? `${css.iconBtn} ${css.iconBtnActive}` : css.iconBtn} title="Git Tree" aria-label="Git Tree" onClick={() => { actions.setGitTreeOpen(false); actions.setPanel('tree') }}><GitCommitIcon /></button>
          <button type="button" className={css.iconBtn} title="全部收起" disabled={panel !== 'files' || rootState.loading} onClick={collapseAll}><CollapseIcon /></button>
          <button type="button" className={css.iconBtn} title="刷新" disabled={panel !== 'files' || rootState.loading} onClick={loadRoot}><RefreshIcon /></button>
          <button type="button" className={css.iconBtn} title="收起面板" onClick={closePanel}><CollapsePanelIcon /></button>
        </div>
      </div>
      {panel === 'files' && (
        <>
          <div className={css.search}>
            <span className={css.searchIcon}><SearchIcon /></span>
            <input className={css.searchInput} type="text" placeholder="搜索文件名…" value={query} onChange={(event) => { setQuery(event.target.value) }} />
            {query !== '' && <button type="button" className={css.searchClear} title="清除" onClick={() => { setQuery('') }}><ClearIcon /></button>}
          </div>
          {rootState.path !== null && <div className={css.rootPath} title={rootState.path}>{rootState.path}</div>}
          <div className={css.list}>{rows}</div>
        </>
      )}
      {panel === 'diff' && <GitChangesViewer sessionId={sessionId} gitStatus={gitStatus} openFileDiff={(path, scope) => { actions.setOpenFileDiff({ path, scope }) }} />}
      {panel === 'tree' && <GitBranchViewer sessionId={sessionId} gitLog={gitLog} expand={() => { actions.setGitTreeOpen(true) }} />}
      {renderSlot('file-explorer.overlay', {})}
    </div>
  )
}
