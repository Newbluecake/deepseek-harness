import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/xterm.css', import.meta.url)), 'utf8')

describe('xterm stylesheet', () => {
  it('keeps terminal scrolling available while hiding the native viewport scrollbar', () => {
    expect(css).toContain('.xterm .xterm-viewport {')
    expect(css).toContain('overflow-y: scroll;')
    expect(css).toContain('scrollbar-width: none;')
    expect(css).toContain('.xterm .xterm-viewport::-webkit-scrollbar {')
    expect(css).toContain('display: none;')
  })
})
