/**
 * Browser-facing file-explorer data service: directory listing, text preview,
 * and git change discovery/diff over the calling session's workspace. Each
 * Remote method is agent-scoped so it reads the current session's cwd rather
 * than the process-wide workspace root; it returns its business result
 * directly and throws on failure, so the carrier folds the failure into the
 * Remote response envelope.
 * @module @deepseek-ai/dsh-file-explorer
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {
  FileDiffRequest,
  FileDiffResult,
  FileExplorerEntry,
  GitChange,
  GitLogCommit,
  GitLogRef,
  GitLogResult,
  GitStatusResult,
  ListDirResult,
  ReadFileResult,
  SearchFileMatch,
  SearchFilesRequest,
  SearchFilesResult,
} from './types.ts'

export type {
  FileDiffRequest,
  FileDiffResult,
  FileExplorerEntry,
  GitChange,
  GitLogCommit,
  GitLogRef,
  GitLogResult,
  GitStatusResult,
  ListDirResult,
  ReadFileResult,
  SearchFileMatch,
  SearchFilesRequest,
  SearchFilesResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    fileExplorer: FileExplorerService
  }
}

/** Maximum UTF-8 characters returned by one file preview. */
const MAX_FILE_CHARS = 200000
/** Maximum captured bytes for one git blob read. */
const MAX_GIT_BYTES = 200000
/** Maximum captured bytes for one git command's stdout. */
const MAX_GIT_STDOUT_BYTES = 400000
/** Maximum commits returned by one history graph. */
const MAX_GIT_LOG_COMMITS = 300
/** Maximum files returned by one filename search. */
const MAX_SEARCH_MATCHES = 200

/**
 * Read-only data face for the file-explorer UI. It reads the calling
 * session's filesystem and runs read-only git commands against that session's
 * workspace root; it never writes files or mutates git state.
 */
export class FileExplorerService extends TypertRemoteService {
  static inject = ['fs', 'shell', 'sandboxPolicy']

  constructor(ctx: Context) {
    super(ctx, 'fileExplorer')
  }

  /**
   * List one directory's direct children. A `null` path lists the session
   * workspace root; relative paths resolve against it.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param path - absolute or workspace-relative path, or `null` for the root.
   * @returns the projected listing.
   */
  @Remote('listDir')
  async listDir(agent: Agent, path: string | null): Promise<ListDirResult> {
    const root = this.workspaceRoot(agent)
    const target = await this.ctx.fs.resolve(path ?? root, {})
    const info = await this.ctx.fs.stat(target)
    const entries = (await this.ctx.fs.listDir(target)).filter(entry => entry.name !== '.git')
    return {
      path: target.displayPath,
      type: info?.type ?? 'directory',
      entries: entries.map((entry): FileExplorerEntry => ({
        name: entry.name,
        type: entry.type,
        path: entry.target.displayPath,
        size: typeof entry.size === 'number' ? entry.size : null,
      })),
    }
  }

  /**
   * Read one regular UTF-8 text file for preview.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param path - absolute or workspace-relative path.
   * @returns the decoded text.
   */
  @Remote('readFile')
  async readFile(agent: Agent, path: string): Promise<ReadFileResult> {
    const target = await this.ctx.fs.resolve(path, { cwd: this.workspaceRoot(agent) })
    const info = await this.ctx.fs.stat(target)
    if (info === undefined) throw new Error('文件不存在')
    if (info.type !== 'file') throw new Error('不是普通文件')
    const text = await this.ctx.fs.readText(target)
    const truncated = text.length > MAX_FILE_CHARS
    return { content: truncated ? text.slice(0, MAX_FILE_CHARS) : text, truncated }
  }

  /**
   * Discover staged and unstaged changes in the session workspace repository.
   * @param agent - exact live Agent resolved from the wire identity.
   * @returns the two change groups.
   */
  @Remote('gitStatus')
  async gitStatus(agent: Agent): Promise<GitStatusResult> {
    const root = this.workspaceRoot(agent)
    const [run, branchRun] = await Promise.all([
      this.runGit('git --no-optional-locks -c status.renames=false status --short --untracked-files=all', 30000, root),
      this.runGit('git --no-optional-locks branch --show-current', 30000, root),
    ])
    const staged: GitChange[] = []
    const unstaged: GitChange[] = []
    for (const line of run.text.split('\n')) {
      if (line.length < 3) continue
      const index = line.charAt(0)
      const worktree = line.charAt(1)
      let path = line.slice(3)
      if (path.length >= 2 && path.charAt(0) === '"' && path.charAt(path.length - 1) === '"') path = path.slice(1, -1)
      if (index !== ' ' && index !== '?') staged.push({ code: index, path })
      if (worktree !== ' ') unstaged.push({ code: worktree, path })
    }
    return { workdir: root, branch: branchRun.text.trim(), staged, unstaged }
  }

  /**
   * Resolve the old/new text pair for one changed file.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - path and which change segment to diff.
   * @returns the two text sides.
   */
  @Remote('fileDiff')
  async fileDiff(agent: Agent, request: FileDiffRequest): Promise<FileDiffResult> {
    if (request.path === '') throw new Error('缺少文件路径')
    const root = this.workspaceRoot(agent)
    let oldText = ''
    let newText = ''
    if (request.scope === 'staged') {
      oldText = await this.gitShow(`HEAD:${request.path}`, root)
      newText = await this.gitShow(`:${request.path}`, root)
    } else {
      oldText = await this.gitShow(`:${request.path}`, root)
      newText = await this.readWorktree(request.path, root)
    }
    return { path: request.path, scope: request.scope, oldText, newText }
  }

  /**
   * Resolve the commit-history graph across all refs.
   * @param agent - exact live Agent resolved from the wire identity.
   * @returns the ASCII `git log --graph` output.
   */
  @Remote('gitLog')
  async gitLog(agent: Agent): Promise<GitLogResult> {
    const root = this.workspaceRoot(agent)
    const [run, branchRun] = await Promise.all([
      this.runGit(
        `git --no-optional-locks log --all --topo-order --decorate=full --date=short --pretty=format:%x1e%H%x1f%P%x1f%D%x1f%an%x1f%ad%x1f%s --max-count=${MAX_GIT_LOG_COMMITS}`,
        30000,
        root,
      ).catch((error: unknown) => {
        // A repository with no commits fails `git log`; project an empty history.
        if (String(error).includes('does not have any commits')) return { text: '', truncated: false }
        throw error
      }),
      this.runGit('git --no-optional-locks branch --show-current', 30000, root),
    ])
    return { workdir: root, branch: branchRun.text.trim(), commits: parseGitLog(run.text), truncated: run.truncated }
  }

  /**
   * Search the whole workspace for files whose repository-relative path
   * matches a query. Lists the git index plus untracked files, so results
   * cover unexpanded directories and skip `.git` and ignored build output.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - the trimmed, lowercased query.
   * @returns matching files in path order, capped at the service bound.
   */
  @Remote('searchFiles')
  async searchFiles(agent: Agent, request: SearchFilesRequest): Promise<SearchFilesResult> {
    const root = this.workspaceRoot(agent)
    const query = request.query.trim().toLowerCase()
    if (query === '') return { matches: [], truncated: false }
    const empty = (): { text: string; truncated: boolean } => ({ text: '', truncated: false })
    const [tracked, untracked] = await Promise.all([
      this.runGit('git --no-optional-locks ls-files', 30000, root).catch(empty),
      this.runGit('git --no-optional-locks ls-files --others --exclude-standard', 30000, root).catch(empty),
    ])
    const seen = new Set<string>()
    const matches: SearchFileMatch[] = []
    for (const run of [tracked, untracked]) {
      for (const raw of run.text.split('\n')) {
        const path = raw.trim()
        if (path === '' || seen.has(path) || !path.toLowerCase().includes(query)) continue
        seen.add(path)
        matches.push({ path, name: basename(path) })
        if (matches.length >= MAX_SEARCH_MATCHES) return { matches, truncated: true }
      }
    }
    return { matches, truncated: false }
  }

  /** Resolve one session's workspace root, falling back to the process-wide root. */
  private workspaceRoot(agent: Agent): string {
    return agent.session.header.cwd ?? this.ctx.sandboxPolicy.workspaceRoot
  }

  /** Run one read-only git command against a workspace root. */
  private async runGit(command: string, timeoutMs: number, root: string): Promise<{ text: string; truncated: boolean }> {
    const spec = this.ctx.shell.resolve({
      command,
      workdir: root,
      timeoutMs,
      stdoutMaxBytes: MAX_GIT_STDOUT_BYTES,
    })
    const result = await this.ctx.shell.run(spec)
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.text.trim() || `git 命令退出码 ${String(result.exitCode)}`)
    }
    return { text: result.stdout.text, truncated: result.stdout.truncated }
  }

  /** Read one git blob's text; empty when the object is absent. */
  private async gitShow(revPath: string, root: string): Promise<string> {
    const spec = this.ctx.shell.resolve({
      command: `git --no-optional-locks cat-file -p '${revPath}'`,
      workdir: root,
      timeoutMs: 30000,
      stdoutMaxBytes: MAX_GIT_BYTES,
    })
    const result = await this.ctx.shell.run(spec)
    if (result.exitCode !== 0) return ''
    return result.stdout.text
  }

  /** Read the working-tree copy of one file; empty when absent. */
  private async readWorktree(path: string, root: string): Promise<string> {
    const target = await this.ctx.fs.resolve(path, { cwd: root })
    const info = await this.ctx.fs.stat(target)
    if (info === undefined || info.type !== 'file') return ''
    const text = await this.ctx.fs.readText(target)
    return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text
  }
}

/** Parse the decorated `git log` record stream into commits. */
function parseGitLog(text: string): GitLogCommit[] {
  const commits: GitLogCommit[] = []
  for (const record of text.split('\x1e')) {
    if (record.trim() === '') continue
    const [hash, parents, refs, author, date, subject] = record.split('\x1f')
    if (hash === undefined || subject === undefined) continue
    commits.push({
      hash,
      parents: parents === undefined || parents === '' ? [] : parents.split(' '),
      refs: parseGitRefs(refs ?? ''),
      author: author ?? '',
      date: date ?? '',
      subject: subject.trim(),
    })
  }
  return commits
}

/** Parse one `%D` decoration field into ref records. */
function parseGitRefs(refs: string): GitLogRef[] {
  const out: GitLogRef[] = []
  for (const raw of refs.split(',')) {
    const trimmed = raw.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('HEAD -> ')) {
      out.push({ kind: 'head', name: refName(trimmed.slice('HEAD -> '.length)) })
    } else if (trimmed === 'HEAD') {
      out.push({ kind: 'head', name: 'HEAD' })
    } else if (trimmed.startsWith('tag: ')) {
      out.push({ kind: 'tag', name: refName(trimmed.slice('tag: '.length)) })
    } else if (trimmed.startsWith('refs/tags/')) {
      out.push({ kind: 'tag', name: trimmed.slice('refs/tags/'.length) })
    } else if (trimmed.startsWith('refs/remotes/')) {
      out.push({ kind: 'remote', name: trimmed.slice('refs/remotes/'.length) })
    } else if (trimmed.startsWith('refs/heads/')) {
      out.push({ kind: 'branch', name: trimmed.slice('refs/heads/'.length) })
    }
  }
  return out
}

/** Strip a `refs/…` prefix from one full ref name. */
function refName(name: string): string {
  if (name.startsWith('refs/heads/')) return name.slice('refs/heads/'.length)
  if (name.startsWith('refs/remotes/')) return name.slice('refs/remotes/'.length)
  if (name.startsWith('refs/tags/')) return name.slice('refs/tags/'.length)
  return name
}

/** Last path segment of a repository-relative `git ls-files` path. */
function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? path : path.slice(idx + 1)
}

export default FileExplorerService
