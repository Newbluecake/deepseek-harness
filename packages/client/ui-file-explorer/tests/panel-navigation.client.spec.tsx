// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { FileExplorerProps, GitModalProps } from '../src/client/contract/slots.ts'
import { FileExplorer } from '../src/client/FileExplorer.tsx'
import { GitModal } from '../src/client/GitModal.tsx'
import { GitTreeModal } from '../src/client/GitTreeModal.tsx'
import { createFileExplorerStore } from '../src/client/store.ts'

afterEach(cleanup)

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(instance: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(selector: (state: T) => S): S {
    return selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  }
}

function mountExplorer() {
  const instance = createFileExplorerStore().create()
  const sessionId = 'session-test' as SessionId
  const listDir: FileExplorerProps['listDir'] = vi.fn(async (_sessionId: SessionId, path: string | null) => {
    if (path === null) {
      return {
        ok: true as const,
        value: { path: '/workspace', type: 'directory' as const, entries: [{ name: 'src', path: '/workspace/src', type: 'directory' as const, size: null }] },
      }
    }
    return {
      ok: true as const,
      value: { path: '/workspace/src', type: 'directory' as const, entries: [{ name: 'main.ts', path: '/workspace/src/main.ts', type: 'file' as const, size: 42 }] },
    }
  })
  const gitStatus: FileExplorerProps['gitStatus'] = vi.fn(async () => ({
    ok: true as const,
    value: {
      workdir: '/workspace',
      branch: 'feat/git-details',
      staged: [],
      unstaged: [{ path: 'src/main.ts', code: 'M' }],
    },
  }))
  const fileDiff: FileExplorerProps['fileDiff'] = vi.fn(async () => ({
    ok: true as const,
    value: { path: 'src/main.ts', scope: 'unstaged' as const, oldText: 'const value = 1', newText: 'const value = 2' },
  }))
  const gitLog: FileExplorerProps['gitLog'] = vi.fn(async () => ({
    ok: true as const,
    value: {
      workdir: '/workspace',
      branch: 'feat/git-details',
      truncated: false,
      commits: [{ hash: '1234567890', parents: [], subject: 'Initial commit', author: 'Dev', date: 'today', refs: [{ kind: 'head' as const, name: 'feat/git-details' }] }],
    },
  }))
  const searchFiles: FileExplorerProps['searchFiles'] = vi.fn(async () => ({
    ok: true as const,
    value: { matches: [{ path: 'src/main.ts', name: 'main.ts' }], truncated: false },
  }))
  const common = {
    sessionId,
    useStore: hookOf(instance),
    actions: instance.actions,
    useSession: vi.fn(),
    useSessions: vi.fn(),
    useWorkspaces: vi.fn(),
    listDir,
    readFile: vi.fn(),
    gitStatus,
    fileDiff,
    gitLog,
    searchFiles,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    setPanelPinned: vi.fn(),
    isPanelPinned: vi.fn(() => true),
    attachController: vi.fn(),
  }
  render(
    <>
      <FileExplorer {...common as FileExplorerProps} renderSlot={() => null} />
      <GitModal {...common as GitModalProps} />
      <GitTreeModal {...common as GitModalProps} />
    </>,
  )
  return { fileDiff, gitLog, listDir, searchFiles }
}

describe('file explorer git navigation', () => {
  it('stores Git Tree as a details-panel mode', () => {
    const instance = createFileExplorerStore().create()

    instance.actions.setPanel('tree')
    expect(instance.getSnapshot().panel).toBe('tree')
    expect(instance.getSnapshot().gitTreeOpen).toBe(false)
  })

  it('keeps the changes list in details and opens only a selected file diff as a modal', async () => {
    const { fileDiff } = mountExplorer()

    expect(await screen.findByText('Git Diff', { selector: 'span' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /src\/main\.ts/u })).toBeTruthy()
    const branch = screen.getByText('feat/git-details')
    const changedFile = screen.getByRole('button', { name: /src\/main\.ts/u })
    expect(branch.compareDocumentPosition(changedFile) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.queryByText('/workspace')).toBeNull()
    const search = screen.getByPlaceholderText('搜索变更文件…')
    fireEvent.change(search, { target: { value: 'missing' } })
    expect(screen.getByText('没有匹配的变更')).toBeTruthy()
    fireEvent.click(screen.getByTitle('清除'))
    expect(screen.getByRole('button', { name: /src\/main\.ts/u })).toBeTruthy()
    expect(screen.queryByTitle('关闭')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /src\/main\.ts/u }))
    expect(await screen.findByTitle('关闭')).toBeTruthy()
    await waitFor(() => { expect(fileDiff).toHaveBeenCalledWith(expect.any(String), { path: 'src/main.ts', scope: 'unstaged' }) })

    fireEvent.click(screen.getByTitle('关闭'))
    expect(screen.queryByTitle('关闭')).toBeNull()
    expect(screen.getByText('Git Diff', { selector: 'span' })).toBeTruthy()

    const toolbar = screen.getByRole('toolbar', { name: '文件工具栏' })
    const toolbarButtons = [...toolbar.querySelectorAll('button[title]')]
    const toolbarTitles = (): string[] => toolbarButtons.map(button => button.getAttribute('title') ?? '')
    expect(toolbarTitles()).toEqual(['收起Git Diff', '文件列表', 'Git Diff', 'Git Tree', '全部收起', '刷新', '收起面板'])

    fireEvent.click(screen.getByRole('button', { name: '文件列表' }))
    expect(screen.getByText('文件目录')).toBeTruthy()
    expect(screen.getByText('/workspace')).toBeTruthy()
    expect(screen.queryByText('feat/git-details')).toBeNull()
    expect(screen.queryByText('src/main.ts')).toBeNull()
    expect([...toolbar.querySelectorAll('button[title]')]).toEqual(toolbarButtons)
    expect(toolbarTitles()[0]).toBe('收起文件目录')

    fireEvent.click(screen.getByRole('button', { name: 'Git Diff' }))
    expect(await screen.findByRole('button', { name: /src\/main\.ts/u })).toBeTruthy()
    expect(screen.getByText('Git Diff', { selector: 'span' })).toBeTruthy()
    expect([...toolbar.querySelectorAll('button[title]')]).toEqual(toolbarButtons)
    expect(toolbarTitles()[0]).toBe('收起Git Diff')
  })

  it('locates a changed file in the file list from its row context menu', async () => {
    const { listDir } = mountExplorer()

    const changedFile = await screen.findByRole('button', { name: /src\/main\.ts/u })
    fireEvent.contextMenu(changedFile)
    fireEvent.click(await screen.findByRole('menuitem', { name: '在文件列表中定位' }))

    expect(screen.getByText('文件目录')).toBeTruthy()
    expect(screen.getByPlaceholderText<HTMLInputElement>('搜索文件名…').value).toBe('')
    await waitFor(() => { expect(listDir).toHaveBeenCalledWith(expect.any(String), 'src') })

    const dir = await screen.findByTitle('/workspace/src')
    const file = await screen.findByTitle('/workspace/src/main.ts')
    expect(dir.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(file.getAttribute('aria-current')).toBe('location')
  })

  it('searches the whole workspace through the Host index', async () => {
    const { searchFiles } = mountExplorer()

    fireEvent.click(screen.getByRole('button', { name: '文件列表' }))
    fireEvent.change(screen.getByPlaceholderText<HTMLInputElement>('搜索文件名…'), { target: { value: 'main' } })

    await waitFor(() => { expect(searchFiles).toHaveBeenCalledWith(expect.any(String), { query: 'main' }) })
    expect(await screen.findByTitle('src/main.ts')).toBeTruthy()
    expect(screen.getByText('src/main.ts')).toBeTruthy()
  })

  it('shows current-branch commits in details before expanding the complete Git Tree', async () => {
    const { gitLog } = mountExplorer()

    expect(await screen.findByRole('button', { name: /src\/main\.ts/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Git Tree' }))
    expect(await screen.findByText('Git Tree', { selector: 'span' })).toBeTruthy()
    expect(await screen.findByText('Initial commit')).toBeTruthy()
    expect(screen.queryByTitle('关闭 Git Tree')).toBeNull()

    fireEvent.click(screen.getByTitle('展开 Git Tree'))
    expect(await screen.findByTitle('关闭 Git Tree')).toBeTruthy()
    expect(await screen.findByText('当前 · feat/git-details')).toBeTruthy()
    await waitFor(() => { expect(gitLog).toHaveBeenCalledTimes(2) })
  })
})
