/**
 * Global Terminal Dock: a fixed bottom icon (macOS-style) that pops up a list
 * of every live terminal across all sessions, plus one draggable floating
 * window per open terminal. The Dock discovers terminals through the root
 * `listAll` Remote (no session scope), spawns new terminals into the current
 * session, and opens another session's terminal by addressing its owner
 * session for every read/write call.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TerminalWebSessionInfo } from '@deepseek-ai/dsh-terminal-web/types'
import type { TerminalPanelProps } from './contract/slots.ts'
import { TerminalWindow } from './TerminalWindow.tsx'
import css from './TerminalDock.module.css'

const svgProps = {
  viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function TerminalIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <polyline points="4 17 10 11 4 5" />
      <line x1={12} y1={19} x2={20} y2={19} />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg {...svgProps} width={14} height={14}>
      <line x1={12} y1={5} x2={12} y2={19} />
      <line x1={5} y1={12} x2={19} y2={12} />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...svgProps} width={12} height={12}>
      <line x1={18} y1={6} x2={6} y2={18} />
      <line x1={6} y1={6} x2={18} y2={18} />
    </svg>
  )
}

/** Default floating-window dimensions. */
const DEFAULT_WIDTH = 760
const DEFAULT_HEIGHT = 480

/**
 * Render the global terminal Dock, its popup list, and every open window.
 * @param props - the `shell.overlay` runtime share, the Dock store, and injected actions.
 * @returns the Dock icon, the popup list, and the floating windows.
 */
export function TerminalDock({
  useSessions, useStore, actions,
  spawnTerminal, writeTerminal, resizeTerminal, renameTerminal, killTerminal,
  listAllTerminals, readTerminal, onTerminalOutput, onTerminalExit, terminalPanel,
  collapseAllSurfaces, expandAllSurfaces,
}: TerminalPanelProps) {
  const dockOpen = useStore(state => state.dockOpen)
  const windows = useStore(state => state.windows)
  const sessionId = useSessions(state => state.current)
  const sessionsById = useSessions(state => state.byId)

  const [terminals, setTerminals] = useState<TerminalWebSessionInfo[]>([])
  const [spawning, setSpawning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const windowsRef = useRef(windows)
  windowsRef.current = windows

  const refresh = useCallback(async (): Promise<TerminalWebSessionInfo[]> => {
    const result = await listAllTerminals()
    const list = result.ok ? result.value.sessions : []
    setTerminals(list)
    return list
  }, [listAllTerminals])

  // Restore persisted windows on mount: close the popup (its open state is
  // never restored), then prune any window whose Host PTY no longer exists so
  // a dead terminal's stale entry does not linger after a refresh.
  useEffect(() => {
    actions.setDockOpen(false)
    void refresh().then((list) => {
      const live = new Set(list.map(info => info.sessionId))
      for (const terminalId of Object.keys(windows)) {
        if (!live.has(terminalId)) actions.closeWindow(terminalId)
      }
    })
    // Mount-only: `windows` is the rehydrated snapshot; `refresh`/`actions` are stable.
  }, [])
  useEffect(() => onTerminalExit(() => { void refresh() }), [onTerminalExit, refresh])

  // Global keyboard shortcuts: Cmd/Ctrl+Shift+M minimizes the topmost open
  // window, Cmd/Ctrl+Shift+F toggles its maximize, Cmd/Ctrl+Shift+[ collapses
  // all, Cmd/Ctrl+Shift+] expands all. Capture phase so the shortcut wins over
  // the focused terminal's own keystrokes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.code === 'BracketLeft') {
        event.preventDefault()
        event.stopPropagation()
        actions.collapseAllWindows()
        collapseAllSurfaces()
        return
      }
      if (event.code === 'BracketRight') {
        event.preventDefault()
        event.stopPropagation()
        actions.expandAllWindows()
        expandAllSurfaces()
        return
      }
      const open = Object.values(windowsRef.current).filter(window => !window.minimized)
      if (open.length === 0) return
      const top = open.reduce((a, b) => (a.z > b.z ? a : b))
      const key = event.key.toLowerCase()
      if (key === 'm') {
        event.preventDefault()
        event.stopPropagation()
        actions.minimizeWindow(top.terminalId)
      } else if (key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        actions.toggleMaximizeWindow(top.terminalId)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, [actions])

  useEffect(() => {
    terminalPanel.attach({
      open: () => { actions.setDockOpen(true); void refresh() },
      close: () => { actions.setDockOpen(false) },
    }, { open: dockOpen })
  }, [terminalPanel, actions, refresh, dockOpen])

  const openWindowFor = useCallback((terminalId: string, ownerSessionId: SessionId): void => {
    const count = Object.keys(windows).length
    const width = Math.min(DEFAULT_WIDTH, window.innerWidth - 40)
    const height = Math.min(DEFAULT_HEIGHT, window.innerHeight - 120)
    const x = Math.min(window.innerWidth - 80, Math.max(80 - width, 64 + (count % 8) * 28))
    const y = Math.min(window.innerHeight - 80, 40 + (count % 8) * 28)
    actions.openWindow(terminalId, ownerSessionId, { x, y, width, height })
  }, [windows, actions])

  const spawn = useCallback(async (): Promise<void> => {
    if (sessionId === undefined || spawning) return
    setSpawning(true)
    try {
      const result = await spawnTerminal(sessionId, {})
      if (result.ok) {
        await refresh()
        openWindowFor(result.value.sessionId, sessionId)
        actions.setDockOpen(false)
      }
    } finally {
      setSpawning(false)
    }
  }, [sessionId, spawning, spawnTerminal, refresh, openWindowFor, actions])

  const closeWindow = useCallback(async (terminalId: string): Promise<void> => {
    const win = windows[terminalId]
    if (win === undefined) return
    await killTerminal(win.ownerSessionId, { sessionId: terminalId })
    actions.closeWindow(terminalId)
    await refresh()
  }, [windows, killTerminal, actions, refresh])

  const openTerminal = useCallback((info: TerminalWebSessionInfo): void => {
    openWindowFor(info.sessionId, info.ownerSessionId)
    actions.setDockOpen(false)
  }, [openWindowFor, actions])

  const startRename = (info: TerminalWebSessionInfo): void => {
    setEditingId(info.sessionId)
    setEditingValue(info.name ?? '')
  }
  const submitRename = useCallback(async (): Promise<void> => {
    if (editingId === null) return
    const name = editingValue.trim()
    const target = editingId
    const owner = terminals.find(t => t.sessionId === target)?.ownerSessionId
    setEditingId(null)
    if (name !== '' && owner !== undefined) await renameTerminal(owner, { sessionId: target, name })
    await refresh()
  }, [editingId, editingValue, terminals, renameTerminal, refresh])

  const ownerLabel = (ownerSessionId: SessionId): string => {
    const summary = sessionsById[ownerSessionId]
    return summary?.displayTitle ?? ownerSessionId
  }

  const openWindows = Object.values(windows).sort((a, b) => a.z - b.z)
  const hasOpenWindows = openWindows.some(window => !window.minimized)

  return (
    <>
      <div className={css.dock} role="button" tabIndex={0} aria-label="终端" onClick={() => { actions.setDockOpen(!dockOpen) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actions.setDockOpen(!dockOpen) } }}>
        <TerminalIcon />
        {terminals.length > 0 && <span className={css.dockBadge}>{terminals.length > 99 ? '99+' : terminals.length}</span>}
      </div>

      {dockOpen && (
        <>
          <div className={css.dockBackdrop} onClick={() => { actions.setDockOpen(false) }} />
          <div className={css.dockMenu} role="menu" aria-label="终端列表">
            <div className={css.dockMenuHeader}>
              <span className={css.dockMenuTitle}>终端</span>
              <div className={css.dockMenuActions}>
                {openWindows.length > 0 && (
                  <button
                    type="button"
                    className={css.dockToggleBtn}
                    title={hasOpenWindows ? '收起所有终端' : '展开所有终端'}
                    onClick={() => {
                      if (hasOpenWindows) { actions.collapseAllWindows(); collapseAllSurfaces() }
                      else { actions.expandAllWindows(); expandAllSurfaces() }
                    }}
                  >
                    {hasOpenWindows ? '收起全部' : '展开全部'}
                  </button>
                )}
                <button type="button" className={css.dockNewBtn} disabled={spawning || sessionId === undefined} onClick={() => { void spawn() }}>
                  <PlusIcon />
                  <span>{spawning ? '正在创建…' : '新建终端'}</span>
                </button>
              </div>
            </div>
            <div className={css.dockList}>
              {terminals.length === 0 ? (
                <div className={css.dockEmpty}>暂无终端，点击上方“新建终端”开始</div>
              ) : (
                terminals.map(info => (
                  <div
                    key={info.sessionId}
                    className={css.dockItem}
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => { openTerminal(info) }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTerminal(info) } }}
                  >
                    <span className={clsx(css.dockItemDot, !info.running && css.dockItemDotExited)} />
                    <div className={css.dockItemMain}>
                      {editingId === info.sessionId ? (
                        <input
                          className={css.dockItemEdit}
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
                          className={css.dockItemName}
                          title="双击重命名"
                          onDoubleClick={(event) => { event.stopPropagation(); startRename(info) }}
                        >
                          {info.name ?? '未命名终端'}
                        </span>
                      )}
                      <span className={css.dockItemMeta}>{info.cwd} · {ownerLabel(info.ownerSessionId)}</span>
                    </div>
                    {!info.running && (
                      <button
                        type="button"
                        className={css.dockItemClose}
                        title="移除"
                        onClick={(event) => {
                          event.stopPropagation()
                          void killTerminal(info.ownerSessionId, { sessionId: info.sessionId }).then(() => {
                            actions.closeWindow(info.sessionId)
                            void refresh()
                          })
                        }}
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {openWindows.map(win => (
        <TerminalWindow
          key={win.terminalId}
          win={win}
          info={terminals.find(t => t.sessionId === win.terminalId)}
          writeTerminal={writeTerminal}
          readTerminal={readTerminal}
          resizeTerminal={resizeTerminal}
          onTerminalOutput={onTerminalOutput}
          onClose={(id) => { void closeWindow(id) }}
          onMinimize={(id) => { actions.minimizeWindow(id) }}
          onToggleMaximize={(id) => { actions.toggleMaximizeWindow(id) }}
          onFocus={(id) => { actions.focusWindow(id) }}
          onMove={(id, x, y) => { actions.moveWindow(id, x, y) }}
          onResize={(id, width, height) => { actions.resizeWindow(id, width, height) }}
        />
      ))}
    </>
  )
}
