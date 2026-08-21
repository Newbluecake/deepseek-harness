/**
 * Bottom terminal panel: a tab bar of the session's PTY terminals plus the
 * focused terminal's emulator. Registered into the root `shell.overlay`
 * floating layer and docked to the bottom edge; it reads the active session
 * through the global `useSessions` standard hook and drives the Host terminal
 * service through the injected Remote face.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import clsx from 'clsx'
import type { TerminalWebSessionInfo } from '@deepseek-ai/dsh-terminal-web/types'
import type { TerminalPanelProps } from './contract/slots.ts'
import { TerminalView } from './TerminalView.tsx'
import css from './TerminalPanel.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function TerminalIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg {...svgProps} width={size} height={size}>
      <polyline points="4 17 10 11 4 5" />
      <line x1={12} y1={19} x2={20} y2={19} />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1={12} y1={5} x2={12} y2={19} />
      <line x1={5} y1={12} x2={19} y2={12} />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg {...svgProps} width={12} height={12}>
      <line x1={18} y1={6} x2={6} y2={18} />
      <line x1={6} y1={6} x2={18} y2={18} />
    </svg>
  )
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function MinimizeIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function ChevronRightIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg {...svgProps} width={size} height={size}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/**
 * Render the bottom terminal panel and its collapsed floating button.
 * @param props - composed slot props (runtime share + store + injected actions).
 * @returns the panel element, the floating button, or null without a session.
 */
export function TerminalPanel({
  useSessions,
  useStore,
  actions,
  spawnTerminal,
  writeTerminal,
  killTerminal,
  listTerminals,
  readTerminal,
  resizeTerminal,
  renameTerminal,
  onTerminalOutput,
  onTerminalExit,
}: TerminalPanelProps) {
  const panelOpen = useStore(state => state.panelOpen)
  const activeTerminalId = useStore(state => state.activeTerminalId)
  const panelWidth = useStore(state => state.panelWidth)
  const fullscreen = useStore(state => state.fullscreen)
  const sessionId = useSessions(state => state.current)
  const [terminals, setTerminals] = useState<TerminalWebSessionInfo[]>([])
  const [spawning, setSpawning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeTerminalId

  const MIN_WIDTH = 320
  const width = fullscreen ? window.innerWidth : (panelWidth ?? Math.round(window.innerWidth / 2))

  const onResizeStart = useCallback((event: ReactMouseEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = fullscreen ? window.innerWidth : (panelWidth ?? Math.round(window.innerWidth / 2))
    const onMove = (ev: MouseEvent): void => {
      const next = Math.min(window.innerWidth, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)))
      actions.setPanelWidth(next)
      if (fullscreen) actions.setFullscreen(false)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [fullscreen, panelWidth, actions])

  const refresh = useCallback(async (): Promise<TerminalWebSessionInfo[]> => {
    if (sessionId === undefined) return []
    const result = await listTerminals(sessionId)
    const list = result.ok ? result.value.sessions : []
    setTerminals(list)
    return list
  }, [sessionId, listTerminals])

  useEffect(() => {
    if (sessionId === undefined || !panelOpen) {
      setTerminals([])
      return
    }
    void refresh()
  }, [sessionId, panelOpen, refresh])

  useEffect(() => onTerminalExit(() => { void refresh() }), [onTerminalExit, refresh])

  const spawn = useCallback(async (): Promise<void> => {
    if (sessionId === undefined || spawning) return
    setSpawning(true)
    try {
      const result = await spawnTerminal(sessionId, {})
      if (result.ok) {
        await refresh()
        actions.setActiveTerminal(result.value.sessionId)
        actions.setPanelOpen(true)
      }
    } finally {
      setSpawning(false)
    }
  }, [sessionId, spawning, spawnTerminal, refresh, actions])

  const kill = useCallback(async (terminalId: string): Promise<void> => {
    if (sessionId === undefined) return
    await killTerminal(sessionId, { sessionId: terminalId })
    if (activeIdRef.current === terminalId) actions.setActiveTerminal(null)
    await refresh()
  }, [sessionId, killTerminal, refresh, actions])

  // Open the panel without spawning a duplicate: only spawn when the host has
  // no live terminal for this session; otherwise the previously active tab
  // (kept in the store) stays focused.
  const openPanel = useCallback(async (): Promise<void> => {
    if (sessionId === undefined) return
    actions.setPanelOpen(true)
    const list = await refresh()
    if (list.length === 0) await spawn()
  }, [sessionId, actions, refresh, spawn])

  // Inline tab rename: double-click the tab label to edit, Enter/blur commits,
  // Escape cancels. The name persists on the Host session.
  const startRename = (terminal: TerminalWebSessionInfo): void => {
    setEditingId(terminal.sessionId)
    setEditingValue(terminal.name ?? '')
  }
  const submitRename = useCallback(async (): Promise<void> => {
    if (sessionId === undefined || editingId === null) return
    const name = editingValue.trim()
    const target = editingId
    setEditingId(null)
    if (name !== '') await renameTerminal(sessionId, { sessionId: target, name })
    await refresh()
  }, [sessionId, editingId, editingValue, renameTerminal, refresh])

  if (sessionId === undefined) return null

  // The reveal/collapse handle stays visible in both states: at the right edge
  // when the panel is closed, and attached to the panel's left edge when open
  // (so the user can click it to collapse).
  const fab = (
    <button
      type="button"
      className={css.fab}
      style={{ right: panelOpen ? `${width}px` : 0 }}
      title={panelOpen ? '收起终端' : '打开终端'}
      onClick={() => {
        if (panelOpen) {
          actions.setPanelOpen(false)
        } else {
          void openPanel()
        }
      }}
    >
      {panelOpen ? <ChevronRightIcon size={24} /> : <TerminalIcon size={24} />}
    </button>
  )

  if (!panelOpen) return fab

  const active = terminals.find(t => t.sessionId === activeTerminalId) ?? terminals[0]

  return (
    <>
      {fab}
      <div className={css.panel} style={{ width: `${width}px` }}>
        <div className={css.resizeHandle} title="拖拽调整宽度" onMouseDown={onResizeStart} />
        <div className={css.panelInner}>
          <div className={css.tabbar}>
            <span className={css.tabbarIcon}><TerminalIcon /></span>
            <div className={css.tabs}>
              {terminals.map((terminal, index) => (
                <div
                  key={terminal.sessionId}
                  className={clsx(css.tab, terminal.sessionId === (active?.sessionId ?? activeTerminalId) && css.tabActive)}
                  onClick={() => { actions.setActiveTerminal(terminal.sessionId) }}
                >
                  <span className={clsx(css.tabDot, !terminal.running && css.tabDotExited)} />
                  {editingId === terminal.sessionId ? (
                    <input
                      className={css.tabEdit}
                      value={editingValue}
                      autoFocus
                      onChange={(event) => { setEditingValue(event.target.value) }}
                      onClick={(event) => { event.stopPropagation() }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); void submitRename() }
                        else if (event.key === 'Escape') { event.preventDefault(); setEditingId(null) }
                      }}
                      onBlur={() => { void submitRename() }}
                    />
                  ) : (
                    <span
                      className={css.tabLabel}
                      title="双击重命名"
                      onDoubleClick={(event) => { event.stopPropagation(); startRename(terminal) }}
                    >
                      {terminal.name ?? `终端 ${index + 1}`}
                    </span>
                  )}
                  <button
                    type="button"
                    className={css.tabClose}
                    title="关闭终端"
                    onClick={(event) => { event.stopPropagation(); void kill(terminal.sessionId) }}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className={css.iconBtn} title="新建终端" disabled={spawning} onClick={() => { void spawn() }}><PlusIcon /></button>
            <button
              type="button"
              className={css.iconBtn}
              title={fullscreen ? '退出全屏' : '全屏'}
              onClick={() => { actions.setFullscreen(!fullscreen) }}
            >
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
            <button type="button" className={css.iconBtn} title="收起面板" onClick={() => { actions.setPanelOpen(false) }}><ChevronRightIcon /></button>
          </div>
          <div className={css.termArea}>
            {terminals.length === 0 ? (
              <div className={css.empty}>
                <span className={css.emptyIcon}><TerminalIcon /></span>
                <button type="button" className={css.emptyBtn} disabled={spawning} onClick={() => { void spawn() }}>
                  {spawning ? '正在创建…' : '新建终端'}
                </button>
              </div>
            ) : (
              terminals.map(terminal => (
                <TerminalView
                  key={terminal.sessionId}
                  agentSessionId={sessionId}
                  terminalId={terminal.sessionId}
                  active={terminal.sessionId === (active?.sessionId ?? activeTerminalId)}
                  writeTerminal={writeTerminal}
                  readTerminal={readTerminal}
                  resizeTerminal={resizeTerminal}
                  onTerminalOutput={onTerminalOutput}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
