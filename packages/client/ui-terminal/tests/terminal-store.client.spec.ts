// @vitest-environment jsdom
/** Terminal Dock store: window geometry, stacking, dock-popup state, and persistence. */
import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { createTerminalStore } from '../src/client/store.ts'

const DEFAULTS = { x: 100, y: 120, width: 640, height: 480 }
const SESSION_A = 'sess-a' as SessionId
const SESSION_B = 'sess-b' as SessionId

beforeEach(() => {
  localStorage.clear()
})

describe('createTerminalStore', () => {
  it('init shape: empty dock and no windows', () => {
    const store = createTerminalStore().create()
    expect(store.store.getSnapshot()).toEqual({ dockOpen: false, windows: {}, zTop: 0 })
  })

  it('openWindow creates a window and assigns a rising z', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.openWindow('tw-2', SESSION_B, DEFAULTS)

    const { windows } = store.store.getSnapshot()
    expect(Object.keys(windows)).toEqual(['tw-1', 'tw-2'])
    expect(windows['tw-1']).toMatchObject({ terminalId: 'tw-1', ownerSessionId: SESSION_A, ...DEFAULTS, minimized: false, maximized: false, z: 1 })
    expect(windows['tw-2']).toMatchObject({ z: 2 })
  })

  it('openWindow restores and raises an existing window instead of duplicating', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.minimizeWindow('tw-1')
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)

    const snapshot = store.store.getSnapshot()
    expect(Object.keys(snapshot.windows)).toEqual(['tw-1'])
    expect(snapshot.windows['tw-1']).toMatchObject({ minimized: false, z: 2 })
  })

  it('focus, minimize, restore, and toggleMaximize mutate the matching window', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)

    store.actions.minimizeWindow('tw-1')
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ minimized: true })

    store.actions.restoreWindow('tw-1')
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ minimized: false })

    store.actions.toggleMaximizeWindow('tw-1')
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ maximized: true })
    store.actions.toggleMaximizeWindow('tw-1')
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ maximized: false })

    store.actions.focusWindow('tw-1')
    expect(store.store.getSnapshot().windows['tw-1']?.z).toBeGreaterThan(1)
  })

  it('moveWindow and resizeWindow update geometry', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.moveWindow('tw-1', 220, 240)
    store.actions.resizeWindow('tw-1', 800, 600)

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ x: 220, y: 240, width: 800, height: 600 })
  })

  it('closeWindow removes the window and setDockOpen toggles the popup', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.closeWindow('tw-1')
    expect(store.store.getSnapshot().windows).toEqual({})

    store.actions.setDockOpen(true)
    expect(store.store.getSnapshot().dockOpen).toBe(true)
  })

  it('collapseAllWindows and expandAllWindows minimize and restore every window', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.openWindow('tw-2', SESSION_B, DEFAULTS)

    store.actions.collapseAllWindows()
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ minimized: true })
    expect(store.store.getSnapshot().windows['tw-2']).toMatchObject({ minimized: true })

    store.actions.expandAllWindows()
    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({ minimized: false })
    expect(store.store.getSnapshot().windows['tw-2']).toMatchObject({ minimized: false })
  })

  it('snaps a window while remembering its pre-snap geometry', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)

    store.actions.snapWindow('tw-1', 'left', { x: 8, y: 8, width: 500, height: 752 })

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      snapped: 'left',
      x: 8,
      y: 8,
      width: 500,
      height: 752,
      restoreGeometry: DEFAULTS,
    })
  })

  it('keeps the original restore point when snapping from one edge to the other', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.snapWindow('tw-1', 'left', { x: 8, y: 8, width: 500, height: 752 })

    store.actions.snapWindow('tw-1', 'right', { x: 516, y: 8, width: 500, height: 752 })

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      snapped: 'right',
      x: 516,
      restoreGeometry: DEFAULTS,
    })
  })

  it('unsnaps to the remembered geometry and clearWindowSnap keeps the current geometry', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.snapWindow('tw-1', 'left', { x: 8, y: 8, width: 500, height: 752 })
    store.actions.unsnapWindow('tw-1')

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      ...DEFAULTS,
      snapped: null,
      restoreGeometry: null,
    })

    store.actions.snapWindow('tw-1', 'right', { x: 516, y: 8, width: 500, height: 752 })
    store.actions.clearWindowSnap('tw-1')

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      x: 516,
      y: 8,
      width: 500,
      height: 752,
      snapped: null,
      restoreGeometry: null,
    })
  })

  it('unsnaps to a drag-continuing geometry when one is provided', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.snapWindow('tw-1', 'left', { x: 8, y: 8, width: 500, height: 752 })

    store.actions.unsnapWindow('tw-1', { x: 180, y: 70, width: 640, height: 480 })

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      x: 180,
      y: 70,
      width: 640,
      height: 480,
      snapped: null,
      restoreGeometry: null,
    })
  })

  it('manual resize leaves snap mode without restoring the old geometry', () => {
    const store = createTerminalStore().create()
    store.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    store.actions.snapWindow('tw-1', 'left', { x: 8, y: 8, width: 500, height: 752 })

    store.actions.resizeWindow('tw-1', 420, 500)

    expect(store.store.getSnapshot().windows['tw-1']).toMatchObject({
      x: 8,
      y: 8,
      width: 420,
      height: 500,
      snapped: null,
      restoreGeometry: null,
    })
  })

  it('persists window geometry and snap state across instances', () => {
    const first = createTerminalStore().create()
    first.actions.openWindow('tw-1', SESSION_A, DEFAULTS)
    first.actions.moveWindow('tw-1', 300, 400)
    first.actions.toggleMaximizeWindow('tw-1')
    first.actions.openWindow('tw-2', SESSION_B, DEFAULTS)
    first.actions.snapWindow('tw-2', 'right', { x: 516, y: 8, width: 500, height: 752 })

    const second = createTerminalStore().create()
    expect(second.store.getSnapshot().windows['tw-1']).toMatchObject({
      terminalId: 'tw-1',
      ownerSessionId: SESSION_A,
      x: 300,
      y: 400,
      maximized: true,
    })
    expect(second.store.getSnapshot().windows['tw-2']).toMatchObject({
      snapped: 'right',
      x: 516,
      restoreGeometry: DEFAULTS,
    })
  })

  it('accepts persisted windows from before snap state existed', () => {
    localStorage.setItem('dsh.terminal.dock', JSON.stringify({
      dockOpen: false,
      zTop: 1,
      windows: {
        'tw-legacy': {
          terminalId: 'tw-legacy',
          ownerSessionId: SESSION_A,
          ...DEFAULTS,
          minimized: false,
          maximized: false,
          z: 1,
        },
      },
    }))

    const store = createTerminalStore().create()
    expect(store.store.getSnapshot().windows['tw-legacy']?.snapped).toBeUndefined()

    store.actions.snapWindow('tw-legacy', 'left', { x: 8, y: 8, width: 500, height: 752 })

    expect(store.store.getSnapshot().windows['tw-legacy']).toMatchObject({
      snapped: 'left',
      restoreGeometry: DEFAULTS,
    })
  })
})
