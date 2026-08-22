/**
 * One draggable floating terminal window: a title bar (name, running dot,
 * minimize / maximize / close) plus the bound xterm.js emulator. Dragging
 * moves the window, the bottom-right corner resizes it, and both clamp so the
 * window stays reachable inside the viewport. A minimized window stays mounted
 * (visibility-hidden) so the emulator keeps its dimensions and state.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import clsx from 'clsx'
import type { TerminalWebSessionInfo } from '@deepseek-ai/dsh-terminal-web/types'
import type { TerminalInjected } from './contract/slots.ts'
import type { TerminalWindowState } from './store.ts'
import { TerminalView } from './TerminalView.tsx'
import css from './TerminalDock.module.css'

const glyphProps = {
  viewBox: '0 0 8 8', width: 8, height: 8, fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function CloseGlyph() {
  return (
    <svg {...glyphProps} aria-hidden="true">
      <line x1={1.5} y1={1.5} x2={6.5} y2={6.5} />
      <line x1={6.5} y1={1.5} x2={1.5} y2={6.5} />
    </svg>
  )
}

function MinimizeGlyph() {
  return (
    <svg {...glyphProps} aria-hidden="true">
      <line x1={1.5} y1={4} x2={6.5} y2={4} />
    </svg>
  )
}

function MaximizeGlyph() {
  return (
    <svg {...glyphProps} aria-hidden="true">
      <path d="M3 1.5H1.5V3" />
      <path d="M5 1.5h1.5V3" />
      <path d="M1.5 5v1.5H3" />
      <path d="M6.5 5v1.5H5" />
    </svg>
  )
}

function RestoreGlyph() {
  return (
    <svg {...glyphProps} aria-hidden="true">
      <rect x={2.25} y={2.25} width={3.5} height={3.5} />
    </svg>
  )
}

/** Minimum floating window dimensions and the visible edge kept on screen. */
const MIN_WIDTH = 320
const MIN_HEIGHT = 180
const EDGE = 80

/** One floating terminal window's props: its state, the host info, and the injected actions. */
export interface TerminalWindowProps {
  win: TerminalWindowState
  info: TerminalWebSessionInfo | undefined
  writeTerminal: TerminalInjected['writeTerminal']
  readTerminal: TerminalInjected['readTerminal']
  resizeTerminal: TerminalInjected['resizeTerminal']
  onTerminalOutput: TerminalInjected['onTerminalOutput']
  onClose: (terminalId: string) => void
  onMinimize: (terminalId: string) => void
  onToggleMaximize: (terminalId: string) => void
  onFocus: (terminalId: string) => void
  onMove: (terminalId: string, x: number, y: number) => void
  onResize: (terminalId: string, width: number, height: number) => void
}

/**
 * Render one draggable floating terminal window.
 * @param props - the window state, host info, and injected actions.
 * @returns the floating window element, hidden when minimized.
 */
export function TerminalWindow({
  win, info, writeTerminal, readTerminal, resizeTerminal, onTerminalOutput,
  onClose, onMinimize, onToggleMaximize, onFocus, onMove, onResize,
}: TerminalWindowProps) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null)
  const resize = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(null)
  const winRef = useRef(win)
  winRef.current = win

  const clampX = (x: number): number => Math.min(window.innerWidth - EDGE, Math.max(EDGE - win.width, x))
  const clampY = (y: number): number => Math.min(window.innerHeight - EDGE, Math.max(0, y))

  const onTitlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || win.maximized) return
    // The title bar hosts the window-control buttons; skip the drag on them,
    // or `setPointerCapture` below retargets the pointer and swallows their
    // click (so close/maximize/minimize would never fire on a real click).
    if (event.target instanceof Element && event.target.closest('button') !== null) return
    event.preventDefault()
    onFocus(win.terminalId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: win.x, top: win.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onTitlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const origin = drag.current
    if (origin === null || origin.pointerId !== event.pointerId) return
    onMove(win.terminalId, clampX(origin.left + (event.clientX - origin.startX)), clampY(origin.top + (event.clientY - origin.startY)))
  }
  const onTitlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || win.maximized) return
    event.preventDefault()
    resize.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: win.width, height: win.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const origin = resize.current
    if (origin === null || origin.pointerId !== event.pointerId) return
    const width = Math.max(MIN_WIDTH, Math.min(window.innerWidth, origin.width + (event.clientX - origin.startX)))
    const height = Math.max(MIN_HEIGHT, Math.min(window.innerHeight, origin.height + (event.clientY - origin.startY)))
    onResize(win.terminalId, width, height)
  }
  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (resize.current?.pointerId !== event.pointerId) return
    resize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // No z-index: the Dock renders windows in z-ascending order, so DOM order
  // paints the most-recently-focused window on top.
  const style = win.maximized
    ? { top: 8, left: 8, width: 'calc(100vw - 16px)', height: 'calc(100vh - 16px)' }
    : { left: win.x, top: win.y, width: win.width, height: win.height }

  return (
    <section
      className={clsx(css.window, win.minimized && css.windowHidden)}
      style={style}
      onPointerDown={() => { onFocus(win.terminalId) }}
    >
      <div className={css.windowBar} onPointerDown={onTitlePointerDown} onPointerMove={onTitlePointerMove} onPointerUp={onTitlePointerUp}>
        <div className={css.windowLights}>
          <button type="button" className={clsx(css.light, css.lightClose)} title="关闭" aria-label="关闭" onClick={() => { onClose(win.terminalId) }}><CloseGlyph /></button>
          <button type="button" className={clsx(css.light, css.lightMin)} title="最小化" aria-label="最小化" onClick={() => { onMinimize(win.terminalId) }}><MinimizeGlyph /></button>
          <button type="button" className={clsx(css.light, css.lightMax)} title={win.maximized ? '还原' : '最大化'} aria-label={win.maximized ? '还原' : '最大化'} onClick={() => { onToggleMaximize(win.terminalId) }}>{win.maximized ? <RestoreGlyph /> : <MaximizeGlyph />}</button>
        </div>
        <span className={css.windowTitle} title={info?.cwd}>{info?.name ?? `终端 ${win.terminalId}`}</span>
        <span className={clsx(css.windowDot, info?.running === false && css.windowDotExited)} title={info?.running === false ? '已退出' : '运行中'} />
      </div>
      <div className={css.windowBody}>
        <TerminalView
          agentSessionId={win.ownerSessionId}
          terminalId={win.terminalId}
          active
          writeTerminal={writeTerminal}
          readTerminal={readTerminal}
          resizeTerminal={resizeTerminal}
          onTerminalOutput={onTerminalOutput}
          onFitDelta={(delta) => {
            if (Math.abs(delta) < 1) return
            const current = winRef.current
            if (current.maximized) return
            onResize(current.terminalId, current.width, current.height + delta)
          }}
        />
      </div>
      {!win.maximized && (
        <div
          className={css.windowResize}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      )}
    </section>
  )
}
