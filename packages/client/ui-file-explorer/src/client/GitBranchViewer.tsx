/** Compact first-parent history for the current branch in the details column. */
import { useEffect, useState } from 'react'
import type { GitLogCommit } from '@deepseek-ai/dsh-file-explorer/types'
import type { GraphContentProps } from './contract/slots.ts'
import css from './GitBranchViewer.module.css'

interface GitBranchViewerProps extends GraphContentProps {
  expand: () => void
}

interface BranchData {
  loading: boolean
  branch: string
  commits: GitLogCommit[]
  error: string | null
}

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function ExpandIcon(): JSX.Element {
  return <svg {...svgProps}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
}

function currentBranchCommits(commits: GitLogCommit[]): GitLogCommit[] {
  const byHash = new Map(commits.map(commit => [commit.hash, commit]))
  let current = commits.find(commit => commit.refs.some(ref => ref.kind === 'head'))
  const branch: GitLogCommit[] = []
  while (current !== undefined) {
    branch.push(current)
    const parent = current.parents[0]
    current = parent === undefined ? undefined : byHash.get(parent)
  }
  return branch
}

/** Render current-branch commits and open the complete graph on demand. */
export function GitBranchViewer({ sessionId, gitLog, expand }: GitBranchViewerProps) {
  const [data, setData] = useState<BranchData>({ loading: true, branch: '', commits: [], error: null })

  useEffect(() => {
    setData({ loading: true, branch: '', commits: [], error: null })
    void gitLog(sessionId).then((result) => {
      if (result.ok) {
        setData({
          loading: false,
          branch: result.value.branch,
          commits: currentBranchCommits(result.value.commits),
          error: null,
        })
      }
      else setData({ loading: false, branch: '', commits: [], error: result.error.message })
    })
  }, [sessionId])

  return (
    <div className={css.panel}>
      <div className={css.branch}>
        <span>{data.branch === '' ? '分离 HEAD' : data.branch}</span>
        <button type="button" className={css.expand} title="展开 Git Tree" onClick={expand}><ExpandIcon /></button>
      </div>
      <div className={css.list}>
        {data.loading && <div className={css.empty}>获取提交历史中…</div>}
        {data.error !== null && <div className={`${css.empty} ${css.error}`}>{data.error}</div>}
        {!data.loading && data.error === null && data.commits.length === 0 && (
          <div className={css.empty}>暂无当前分支提交</div>
        )}
        {data.commits.map((commit, index) => (
          <div key={commit.hash} className={css.commit}>
            <span className={css.rail}>
              <span className={css.node} />
              {index < data.commits.length - 1 && <span className={css.line} />}
            </span>
            <span className={css.content}>
              <span className={css.subject}>{commit.subject}</span>
              <span className={css.meta}>
                <span>{commit.author}</span>
                <span>{commit.date}</span>
                <span className={css.hash}>{commit.hash.slice(0, 7)}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
