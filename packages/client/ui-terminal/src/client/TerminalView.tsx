/**
 * One interactive terminal view: an xterm.js instance bound to one Host PTY
 * session. It restores the session's retained scrollback on attach, streams
 * live `terminal/output` chunks into the emulator, and forwards keystrokes to
 * the session's stdin. The instance stays mounted while its tab is inactive so
 * emulator state survives tab switches.
 */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  TerminalInjected,
  TerminalOutputPayload,
} from './contract/slots.ts'
import css from './TerminalDock.module.css'

export interface TerminalViewProps {
  /** The owning workspace session (agent scope for the Remote calls). */
  agentSessionId: SessionId
  /** The Host PTY session id this view renders. */
  terminalId: string
  /** Whether this tab is the focused one. */
  active: boolean
  /** Injected terminal actions (spawn/write/read/subscribe faces). */
  writeTerminal: TerminalInjected['writeTerminal']
  readTerminal: TerminalInjected['readTerminal']
  resizeTerminal: TerminalInjected['resizeTerminal']
  onTerminalOutput: TerminalInjected['onTerminalOutput']
  /** Reports the height delta to snap the window so the terminal leaves a 3px bottom gutter. */
  onFitDelta?: (delta: number) => void
}

/**
 * Render one terminal emulator for one PTY session.
 * @param props - the session identity, focus flag, and injected actions.
 * @returns the emulator container element.
 */
export function TerminalView({
  agentSessionId, terminalId, active, writeTerminal, readTerminal, resizeTerminal, onTerminalOutput, onFitDelta,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onFitDeltaRef = useRef(onFitDelta)
  onFitDeltaRef.current = onFitDelta

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 2000,
      theme: { background: '#00000000' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    // Keep the PTY's dimensions in sync with the emulator so full-screen
    // programs (vim/top/htop) render at the right size.
    const syncSize = (): void => {
      void resizeTerminal(agentSessionId, { sessionId: terminalId, cols: term.cols, rows: term.rows })
    }
    syncSize()

    // Snap the window height to whole rows plus a 3px bottom gutter. Debounced:
    // a resize drag produces a stream of fit events, and the snap only fires
    // after the drag settles.
    let snapTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleSnap = (): void => {
      const onFitDelta = onFitDeltaRef.current
      if (onFitDelta === undefined) return
      if (snapTimer !== undefined) clearTimeout(snapTimer)
      snapTimer = setTimeout(() => {
        const rows = container.querySelector('.xterm-rows')
        const body = container.parentElement
        if (rows === null || body === null) return
        const delta = rows.getBoundingClientRect().height + 6 - body.getBoundingClientRect().height
        onFitDelta(delta)
      }, 200)
    }
    scheduleSnap()

    // Buffer live chunks until the scrollback cursor is known, then apply only
    // chunks newer than the restored cursor so nothing renders twice.
    let lastSeq = -1
    let ready = false
    const pending: TerminalOutputPayload[] = []
    const offOutput = onTerminalOutput((payload) => {
      if (payload.sessionId !== terminalId) return
      if (!ready) {
        pending.push(payload)
        return
      }
      if (payload.seq <= lastSeq) return
      lastSeq = payload.seq
      term.write(payload.data)
    })
    void readTerminal(agentSessionId, { sessionId: terminalId }).then((result) => {
      if (result.ok) {
        lastSeq = result.value.seq
        if (result.value.text.length > 0) term.write(result.value.text)
      }
      ready = true
      for (const payload of pending) {
        if (payload.seq > lastSeq) {
          lastSeq = payload.seq
          term.write(payload.data)
        }
      }
      pending.length = 0
    })

    const dataSub = term.onData((data) => {
      void writeTerminal(agentSessionId, { sessionId: terminalId, data })
    })
    // Debounce the resize RPC: a panel drag produces a stream of resize events.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      fit.fit()
      if (resizeTimer !== undefined) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(syncSize, 150)
      scheduleSnap()
    })
    observer.observe(container)

    return () => {
      if (resizeTimer !== undefined) clearTimeout(resizeTimer)
      if (snapTimer !== undefined) clearTimeout(snapTimer)
      observer.disconnect()
      offOutput()
      dataSub.dispose()
      term.dispose()
    }
  }, [agentSessionId, terminalId, writeTerminal, readTerminal, resizeTerminal, onTerminalOutput])

  return <div ref={containerRef} className={active ? css.term : `${css.term} ${css.termHidden}`} />
}
