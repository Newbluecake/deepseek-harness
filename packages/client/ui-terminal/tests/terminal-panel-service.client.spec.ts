import { describe, expect, it, vi } from 'vitest'
import { TerminalPanelController } from '../src/client/service.ts'

describe('TerminalPanelController', () => {
  it('publishes geometry and forwards open, close, and toggle', () => {
    const controller = new TerminalPanelController()
    const open = vi.fn()
    const close = vi.fn()
    const listener = vi.fn()
    controller.subscribe(listener)
    controller.attach({ open, close }, { open: false, width: 0 })

    controller.open()
    controller.close()
    controller.toggle()
    controller.attach({ open, close }, { open: true, width: 640 })
    controller.toggle()

    expect(open).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toEqual({ open: true, width: 640 })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('fails loud before panel operations are attached', () => {
    expect(() => { new TerminalPanelController().toggle() }).toThrow('terminalPanel: panel operations not wired')
  })
})
