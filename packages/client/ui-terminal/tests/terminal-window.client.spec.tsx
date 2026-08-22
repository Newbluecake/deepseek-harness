// @vitest-environment jsdom
/**
 * Floating terminal window geometry: the eight resize handles (four edges,
 * four corners), the origin-pinning a north/west drag performs, the minimum
 * and viewport clamps, and the maximized window's suppressed handles.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TerminalWindowState } from '../src/client/store.ts'
import { TerminalWindow, type TerminalWindowProps } from '../src/client/TerminalWindow.tsx'

// The emulator owns a real xterm instance and a canvas; the geometry contract
// under test is the window frame's, so the view is stubbed out.
vi.mock('../src/client/TerminalView.tsx', () => ({
  TerminalView: () => <div data-testid="terminal-view" />,
}))

afterEach(cleanup)

beforeEach(() => {
  // jsdom defaults to 1024x768; pin it so the viewport ceilings are explicit.
  window.innerWidth = 1024
  window.innerHeight = 768
})

const WIN: TerminalWindowState = {
  terminalId: 'tw-1',
  ownerSessionId: 'sess-a' as SessionId,
  x: 200,
  y: 150,
  width: 640,
  height: 480,
  minimized: false,
  maximized: false,
  z: 1,
}

/**
 * Render one window and return the handle lookup plus the geometry spies.
 * @param over - window-state fields overriding the shared fixture.
 * @returns the container, the `onMove`/`onResize` spies, and a handle getter.
 */
function renderWindow(over: Partial<TerminalWindowState> = {}) {
  const onMove = vi.fn()
  const onResize = vi.fn()
  const props = {
    win: { ...WIN, ...over },
    info: undefined,
    writeTerminal: vi.fn(),
    readTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    onTerminalOutput: vi.fn(),
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onFocus: vi.fn(),
    onMove,
    onResize,
  } as unknown as TerminalWindowProps
  const { container } = render(<TerminalWindow {...props} />)
  const handle = (dir: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(`[data-resize="${dir}"]`)
    if (found === null) throw new Error(`no resize handle: ${dir}`)
    // jsdom implements neither method; the component calls both on drag.
    found.setPointerCapture = vi.fn()
    found.hasPointerCapture = vi.fn(() => false)
    return found
  }
  return { container, onMove, onResize, handle }
}

/**
 * Drive one full pointer drag over a resize handle.
 * @param el - the handle element.
 * @param dx - horizontal travel in px.
 * @param dy - vertical travel in px.
 */
function drag(el: HTMLElement, dx: number, dy: number): void {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 500, clientY: 400 })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 500 + dx, clientY: 400 + dy })
  fireEvent.pointerUp(el, { pointerId: 1 })
}

describe('TerminalWindow resize handles', () => {
  it('exposes all four edges and all four corners', () => {
    const { container } = renderWindow()
    expect([...container.querySelectorAll('[data-resize]')].map(el => el.getAttribute('data-resize')))
      .toEqual(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'])
  })

  it('south-east drag grows both dimensions and never moves the origin', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('se'), 60, 40)

    expect(onResize).toHaveBeenCalledWith('tw-1', 700, 520)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('east and south edges each resize one axis only', () => {
    const east = renderWindow()
    drag(east.handle('e'), 60, 40)
    expect(east.onResize).toHaveBeenCalledWith('tw-1', 700, 480)

    cleanup()

    const south = renderWindow()
    drag(south.handle('s'), 60, 40)
    expect(south.onResize).toHaveBeenCalledWith('tw-1', 640, 520)
  })

  it('west drag moves the origin by what the width gained, pinning the east edge', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('w'), -50, 0)

    expect(onResize).toHaveBeenCalledWith('tw-1', 690, 480)
    expect(onMove).toHaveBeenCalledWith('tw-1', 150, 150)
    // Right edge before: 200 + 640 = 840. After: 150 + 690 = 840.
  })

  it('north drag moves the origin by what the height gained, pinning the south edge', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('n'), 0, -50)

    expect(onResize).toHaveBeenCalledWith('tw-1', 640, 530)
    expect(onMove).toHaveBeenCalledWith('tw-1', 200, 100)
    // Bottom edge before: 150 + 480 = 630. After: 100 + 530 = 630.
  })

  it('north-west corner drags both axes at once', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('nw'), -50, -30)

    expect(onResize).toHaveBeenCalledWith('tw-1', 690, 510)
    expect(onMove).toHaveBeenCalledWith('tw-1', 150, 120)
  })

  it('clamps to the minimum size and stops the origin at the pinned far edge', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('nw'), 9999, 9999)

    // MIN_WIDTH 320, MIN_HEIGHT 180; the far edges stay at 840 and 630.
    expect(onResize).toHaveBeenCalledWith('tw-1', 320, 180)
    expect(onMove).toHaveBeenCalledWith('tw-1', 520, 450)
  })

  it('stops a west drag at the viewport left edge instead of going negative', () => {
    const { onMove, onResize, handle } = renderWindow()
    drag(handle('w'), -9999, 0)

    // Width may grow only by the 200px of origin to give back.
    expect(onResize).toHaveBeenCalledWith('tw-1', 840, 480)
    expect(onMove).toHaveBeenCalledWith('tw-1', 0, 150)
  })

  it('caps an east/south drag at the viewport', () => {
    const { onResize, handle } = renderWindow()
    drag(handle('se'), 9999, 9999)

    expect(onResize).toHaveBeenCalledWith('tw-1', 1024, 768)
  })

  it('ignores a non-primary button and a foreign pointer id', () => {
    const { onMove, onResize, handle } = renderWindow()
    const se = handle('se')

    fireEvent.pointerDown(se, { button: 2, pointerId: 1, clientX: 500, clientY: 400 })
    fireEvent.pointerMove(se, { pointerId: 1, clientX: 560, clientY: 440 })
    expect(onResize).not.toHaveBeenCalled()

    fireEvent.pointerDown(se, { button: 0, pointerId: 1, clientX: 500, clientY: 400 })
    fireEvent.pointerMove(se, { pointerId: 2, clientX: 560, clientY: 440 })
    expect(onResize).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
  })

  it('drops the drag on pointer up so a later move is inert', () => {
    const { onResize, handle } = renderWindow()
    const se = handle('se')
    drag(se, 60, 40)
    onResize.mockClear()

    fireEvent.pointerMove(se, { pointerId: 1, clientX: 900, clientY: 700 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('renders no handles while maximized', () => {
    const { container } = renderWindow({ maximized: true })
    expect(container.querySelectorAll('[data-resize]')).toHaveLength(0)
  })
})
