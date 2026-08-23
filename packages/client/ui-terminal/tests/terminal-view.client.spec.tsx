// @vitest-environment jsdom
/** TerminalView focus behavior: raising a window transfers keyboard focus once. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { TerminalView } from '../src/client/TerminalView.tsx'

const { fakeTerminals } = vi.hoisted(() => ({
  fakeTerminals: [] as Array<{
    focus: ReturnType<typeof vi.fn>
    loadAddon: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    cols: number
    rows: number
  }>,
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    focus = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))

    constructor() {
      fakeTerminals.push(this)
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
  },
}))

beforeEach(() => {
  fakeTerminals.length = 0
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const props = {
  agentSessionId: 'agent-1' as SessionId,
  terminalId: 'terminal-1',
  active: true,
  focusToken: 1,
  writeTerminal: vi.fn(),
  readTerminal: vi.fn(async () => ({ ok: true as const, value: { text: '', seq: 0, truncated: false } })),
  resizeTerminal: vi.fn(),
  onTerminalOutput: vi.fn(() => vi.fn()),
}

describe('TerminalView focus', () => {
  it('focuses xterm on mount and when the focus token changes without recreating it', () => {
    const view = render(<TerminalView {...props} />)
    const terminal = fakeTerminals[0]
    expect(terminal).toBeDefined()
    expect(terminal?.focus).toHaveBeenCalledOnce()

    view.rerender(<TerminalView {...props} focusToken={2} />)

    expect(fakeTerminals).toHaveLength(1)
    expect(terminal?.focus).toHaveBeenCalledTimes(2)
  })

  it('focuses xterm synchronously when the terminal surface receives a pointer down', () => {
    const { container } = render(<TerminalView {...props} />)
    const terminal = fakeTerminals[0]
    expect(terminal).toBeDefined()
    expect(container.firstElementChild).not.toBeNull()

    fireEvent.pointerDown(container.firstElementChild as Element)

    expect(terminal?.focus).toHaveBeenCalledTimes(2)
  })
})
