// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileExplorerRail } from '../src/client/FileExplorerRail.tsx'
import type { FileExplorerRailProps } from '../src/client/contract/slots.ts'

afterEach(cleanup)

describe('unified right Dock', () => {
  it('routes four fixed entries and stays reachable beside an open Terminal', () => {
    const actions = {
      openPanel: vi.fn(),
      setPanelPinned: vi.fn(),
      showFiles: vi.fn(),
      showDiff: vi.fn(),
      showGitTree: vi.fn(),
      closeGitTree: vi.fn(),
      closeTerminal: vi.fn(),
      toggleTerminal: vi.fn(),
    }
    render(
      <FileExplorerRail
        {...actions as FileExplorerRailProps}
        useSessions={vi.fn()}
        useWorkspaces={vi.fn()}
      />,
    )

    const dock = screen.getByRole('navigation', { name: '右侧导航' })
    expect(dock.style.right).toBe('')
    expect([...dock.querySelectorAll('button')].map(button => button.getAttribute('aria-label')))
      .toEqual(['文件列表', 'Git Diff', 'Git Tree', 'Terminal'])

    fireEvent.click(screen.getByRole('button', { name: '文件列表' }))
    fireEvent.click(screen.getByRole('button', { name: 'Git Diff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Git Tree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Git Tree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))

    expect(actions.closeTerminal).toHaveBeenCalledTimes(4)
    expect(actions.setPanelPinned).toHaveBeenCalledTimes(4)
    expect(actions.openPanel).toHaveBeenCalledTimes(4)
    expect(actions.showFiles).toHaveBeenCalledOnce()
    expect(actions.showDiff).toHaveBeenCalledOnce()
    expect(actions.showGitTree).toHaveBeenCalledTimes(2)
    expect(actions.closeGitTree).toHaveBeenCalledOnce()
    expect(actions.toggleTerminal).toHaveBeenCalledOnce()
  })
})
