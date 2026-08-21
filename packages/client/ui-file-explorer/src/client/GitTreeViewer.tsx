/**
 * Git Graph tab content: renders the commit history as a visual branch graph
 * (colored lanes, commit nodes, ref badges) inside the unified git modal. It
 * reloads the history each time it mounts.
 */
import { useEffect, useMemo, useState } from 'react'
import type { GitLogCommit, GitLogRef } from '@deepseek-ai/dsh-file-explorer/types'
import type { GraphContentProps } from './contract/slots.ts'
import { BRANCH_COLORS, buildGitGraph, type GraphEdge } from './gitGraph.ts'
import css from './GitTreeViewer.module.css'

/** Grid spacing: one column per lane, one row per commit. */
const LANE_WIDTH = 16
const ROW_HEIGHT = 44
const NODE_R = 5
/** Corner radius for the elbow curves. */
const BEND_R = 6

function Spinner(): JSX.Element {
  return <span className={css.spinner} />
}

/** Horizontal center of one lane column. */
function xOf(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2
}

/** Vertical center of one commit row. */
function midYOf(row: number): number {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2
}

/** The branch palette CSS variable for one color index (cycles the palette). */
function branchColor(color: number): string {
  return `var(--dfe-branch-${color % BRANCH_COLORS})`
}

/** Rounded path from a child node down to one parent node. */
function edgePath(edge: GraphEdge): string {
  const x1 = xOf(edge.fromLane)
  const x2 = xOf(edge.toLane)
  const y1 = midYOf(edge.fromRow)
  const y2 = midYOf(edge.toRow)
  if (edge.fromLane === edge.toLane) {
    // Straight continuation down one lane.
    return `M ${x1} ${y1 + NODE_R} L ${x1} ${y2 - NODE_R}`
  }
  const sx = x2 >= x1 ? 1 : -1
  if (edge.isFirstParent) {
    // join: the sub-branch tip flows down its lane, then rounds the corner back
    // into the parent's lane at the parent's row.
    const bend = Math.min(BEND_R, Math.max(2, (y2 - y1 - NODE_R * 2) / 2))
    return `M ${x1} ${y1 + NODE_R} L ${x1} ${y2 - bend} Q ${x1} ${y2} ${x1 + sx * bend} ${y2} L ${x2} ${y2}`
  }
  // merge out: the merge commit branches off to a side lane with a smooth hook.
  const cy = Math.max(NODE_R, (y2 - y1) / 2)
  return `M ${x1} ${y1 + NODE_R} C ${x1} ${y1 + NODE_R + cy} ${x2} ${y2 - NODE_R - cy} ${x2} ${y2 - NODE_R}`
}

/** Badge color class per ref kind. */
function refClass(kind: GitLogRef['kind']): string {
  if (kind === 'head') return css.refHead ?? ''
  if (kind === 'branch') return css.refBranch ?? ''
  if (kind === 'remote') return css.refRemote ?? ''
  return css.refTag ?? ''
}

/** Loaded history plus its loading/error frame. */
interface GitTreeData {
  loading: boolean
  workdir: string
  commits: GitLogCommit[]
  truncated: boolean
  error: string | null
}

/**
 * Render the git graph tab content (body + foot for the unified modal).
 * @param props - the session id plus the git Remote method it drives.
 * @returns the graph content.
 */
export function GitTreeViewer({ sessionId, gitLog }: GraphContentProps) {
  const [data, setData] = useState<GitTreeData>({ loading: true, workdir: '', commits: [], truncated: false, error: null })

  useEffect(() => {
    setData({ loading: true, workdir: '', commits: [], truncated: false, error: null })
    gitLog(sessionId).then((result) => {
      if (result.ok) {
        setData({ loading: false, workdir: result.value.workdir, commits: result.value.commits, truncated: result.value.truncated, error: null })
      } else {
        setData({ loading: false, workdir: '', commits: [], truncated: false, error: result.error.message })
      }
    })
  }, [sessionId])

  const layout = useMemo(() => buildGitGraph(data.commits), [data.commits])

  let body: JSX.Element
  if (data.loading) {
    body = <div className={css.empty}><Spinner /><span className={css.muted}>获取提交历史中…</span></div>
  } else if (data.error !== null) {
    body = <div className={`${css.empty} ${css.error}`}>{data.error}</div>
  } else if (layout.commits.length === 0) {
    body = <div className={css.empty}>暂无提交历史</div>
  } else {
    const width = Math.max(layout.laneCount, 1) * LANE_WIDTH
    const height = layout.commits.length * ROW_HEIGHT
    body = (
      <div className={css.scroll}>
        <svg className={css.graph} width={width} height={height} aria-hidden="true">
          {layout.edges.map((edge, index) => (
            <path key={`e-${index}`} d={edgePath(edge)} className={css.edge} style={{ stroke: branchColor(edge.color) }} />
          ))}
          {layout.commits.map(commit => (
            <circle
              key={commit.hash}
              cx={xOf(commit.lane)}
              cy={midYOf(commit.row)}
              r={commit.parents.length > 1 ? NODE_R + 1 : NODE_R}
              className={css.node}
              style={{ fill: branchColor(commit.color) }}
            />
          ))}
        </svg>
        <div className={css.commits}>
          {layout.commits.map(commit => (
            <div key={commit.hash} className={css.commitRow} style={{ height: ROW_HEIGHT }}>
              <div className={css.commitTop}>
                {commit.refs.map(ref => (
                  <span key={`${ref.kind}:${ref.name}`} className={`${css.ref} ${refClass(ref.kind)}`}>{ref.name}</span>
                ))}
                <span className={css.subject}>{commit.subject}</span>
              </div>
              <div className={css.commitMeta}>
                <span className={css.author}>{commit.author}</span>
                <span className={css.date}>{commit.date}</span>
                <span className={css.hash}>{commit.hash.slice(0, 7)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={css.body}>
        {data.truncated && <div className={css.truncNote}>提交历史过长，已截断显示</div>}
        {body}
      </div>
      {data.workdir !== '' && <div className={css.foot}>{data.workdir}</div>}
    </>
  )
}
