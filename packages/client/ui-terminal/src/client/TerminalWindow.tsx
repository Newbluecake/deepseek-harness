/**
 * One draggable floating terminal window: a title bar (name, running dot,
 * minimize / maximize / close) plus the bound xterm.js emulator. Dragging the
 * title bar moves the window, and any of the four edges or four corners
 * resizes it — a north/west drag pins the opposite edge by moving the origin
 * as the size changes. Both clamp so the window stays reachable inside the
 * viewport. A minimized window stays mounted (visibility-hidden) so the
 * emulator keeps its dimensions and state.
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

/**
 * One resize direction, named by the edges it drags: `n`/`s`/`e`/`w` for the
 * four edges and the two-letter pairs for the four corners.
 */
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * The eight resize handles. Corners follow the edges so that, as later
 * siblings in the same stacking context, they win the overlapping hit area.
 */
const RESIZE_HANDLES: readonly { dir: ResizeDir; className: string | undefined }[] = [
  { dir: 'n', className: css.resizeN },
  { dir: 's', className: css.resizeS },
  { dir: 'w', className: css.resizeW },
  { dir: 'e', className: css.resizeE },
  { dir: 'nw', className: css.resizeNW },
  { dir: 'ne', className: css.resizeNE },
  { dir: 'sw', className: css.resizeSW },
  { dir: 'se', className: css.resizeSE },
]

/**
 * Clamp one window dimension into its allowed span.
 * @param value - the candidate size in px.
 * @param min - the floor the window may never shrink past.
 * @param max - the ceiling; a max below `min` yields `min`, so a window pinned
 * against the viewport edge shrinks to its floor instead of inverting.
 * @returns the clamped size in px.
 */
function clampSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

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
  const resize = useRef<
    { pointerId: number; dir: ResizeDir; startX: number; startY: number; x: number; y: number; width: number; height: number } | null
  >(null)
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

  const onResizePointerDown = (dir: ResizeDir) => (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || win.maximized) return
    // The window's own `onPointerDown` raises the window, so the handle only
    // has to record the drag origin. Both the size and the origin are captured:
    // a north/west drag derives the new x/y from them to pin the far edge.
    event.preventDefault()
    resize.current = {
      pointerId: event.pointerId, dir,
      startX: event.clientX, startY: event.clientY,
      x: win.x, y: win.y, width: win.width, height: win.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const origin = resize.current
    if (origin === null || origin.pointerId !== event.pointerId) return
    const dx = event.clientX - origin.startX
    const dy = event.clientY - origin.startY
    let { x, y, width, height } = origin
    if (origin.dir.includes('e')) width = clampSize(origin.width + dx, MIN_WIDTH, window.innerWidth)
    if (origin.dir.includes('s')) height = clampSize(origin.height + dy, MIN_HEIGHT, window.innerHeight)
    // Growing west/north moves the origin by exactly what the size gained, so
    // the east/south edge stays put; the ceiling stops the origin at 0.
    if (origin.dir.includes('w')) {
      width = clampSize(origin.width - dx, MIN_WIDTH, origin.width + origin.x)
      x = origin.x + origin.width - width
    }
    if (origin.dir.includes('n')) {
      height = clampSize(origin.height - dy, MIN_HEIGHT, origin.height + origin.y)
      y = origin.y + origin.height - height
    }
    if (x !== win.x || y !== win.y) onMove(win.terminalId, x, y)
    if (width !== win.width || height !== win.height) onResize(win.terminalId, width, height)
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
            // A live edge drag owns the geometry: snapping the height here
            // would drift the very edge a north drag is holding in place.
            if (resize.current !== null) return
            const current = winRef.current
            if (current.maximized) return
            onResize(current.terminalId, current.width, current.height + delta)
          }}
        />
      </div>
      {/* Pointer-only affordances: keyboard users resize through maximize, so
          these stay out of the accessibility tree rather than posing as eight
          operable controls. */}
      {!win.maximized && RESIZE_HANDLES.map(({ dir, className }) => (
        <div
          key={dir}
          className={clsx(css.resizeHandle, className)}
          data-resize={dir}
          aria-hidden="true"
          onPointerDown={onResizePointerDown(dir)}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />
      ))}
    </section>
  )
}
