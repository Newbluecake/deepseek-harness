/**
 * Wire vocabulary for the browser-facing file-explorer data service.
 * @module @deepseek-ai/dsh-file-explorer/types
 */

/** One directory entry projected for browser display. */
export interface FileExplorerEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Backend display path used as the follow-up navigation key. */
  path: string
  /** Byte size of a regular file, or `null` when unavailable. */
  size: number | null
}

/** Successful directory listing. */
export interface ListDirResult {
  /** Backend display path of the listed directory. */
  path: string
  /** Whether the listed target is a file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Direct children in stable name order. */
  entries: FileExplorerEntry[]
}

/** Successful text preview. */
export interface ReadFileResult {
  /** Decoded UTF-8 text, truncated to the service bound when oversized. */
  content: string
  /** Whether {@link ReadFileResult.content} was truncated. */
  truncated: boolean
}

/** One changed path from `git status --short`. */
export interface GitChange {
  /** Single-character status code (`M`/`A`/`D`/`?`/…). */
  code: string
  /** Repository-relative path. */
  path: string
}

/** Successful git change discovery. */
export interface GitStatusResult {
  /** Workspace root the status ran against. */
  workdir: string
  /** Current local branch, or an empty string for a detached HEAD. */
  branch: string
  /** Paths with an index (staged) change. */
  staged: GitChange[]
  /** Paths with a worktree (unstaged) change, including untracked. */
  unstaged: GitChange[]
}

/** Request for one per-file diff. */
export interface FileDiffRequest {
  /** Repository-relative path. */
  path: string
  /** Which change segment the diff covers. */
  scope: 'staged' | 'unstaged'
}

/** Successful per-file diff content. */
export interface FileDiffResult {
  /** Repository-relative path. */
  path: string
  /** Which change segment the diff covers. */
  scope: 'staged' | 'unstaged'
  /** Pre-change text (empty when absent). */
  oldText: string
  /** Post-change text (empty when absent). */
  newText: string
}

/** One ref (branch/tag/HEAD) decorating a commit. */
export interface GitLogRef {
  /** Ref kind: current branch, local branch, remote-tracking branch, or tag. */
  kind: 'head' | 'branch' | 'remote' | 'tag'
  /** Short ref name (e.g. `main`, `origin/main`, `v1.0`). */
  name: string
}

/** One commit in the history graph. */
export interface GitLogCommit {
  /** Full object hash. */
  hash: string
  /** Full parent hashes in order; empty for a root commit. */
  parents: string[]
  /** Refs decorating this commit. */
  refs: GitLogRef[]
  /** Author display name. */
  author: string
  /** Author date, `YYYY-MM-DD`. */
  date: string
  /** Commit subject line. */
  subject: string
}

/** Successful commit-graph history. */
export interface GitLogResult {
  /** Workspace root the log ran against. */
  workdir: string
  /** Current local branch, or an empty string for a detached HEAD. */
  branch: string
  /** Commits in topological order (children before parents). */
  commits: GitLogCommit[]
  /** Whether the history was truncated. */
  truncated: boolean
}

/** One file matching a workspace-wide filename search. */
export interface SearchFileMatch {
  /** Repository-relative path. */
  path: string
  /** Basename of the matched file. */
  name: string
}

/** Request for a workspace-wide filename search. */
export interface SearchFilesRequest {
  /** Trimmed, lowercased query matched against the repository-relative path. */
  query: string
}

/** Successful workspace-wide filename search. */
export interface SearchFilesResult {
  /** Matching files in stable path order, capped at the service bound. */
  matches: SearchFileMatch[]
  /** Whether {@link SearchFilesResult.matches} was truncated at the cap. */
  truncated: boolean
}
