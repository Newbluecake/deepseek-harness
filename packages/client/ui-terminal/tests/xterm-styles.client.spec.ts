import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/xterm.css', import.meta.url)), 'utf8')

describe('xterm stylesheet', () => {
  it('keeps the scrollbar quiet until hover or active scrolling, then expands it for pointer use', () => {
    expect(css).toContain('.xterm .xterm-viewport {')
    expect(css).toContain('overflow-y: scroll;')
    expect(css).toContain('scrollbar-width: none;')
    expect(css).toContain('.xterm .xterm-viewport:hover,')
    expect(css).toContain('.xterm .xterm-viewport.dsh-scroll-active')
    expect(css).toContain('.xterm .xterm-viewport::-webkit-scrollbar {')
    expect(css).toContain('width: 0;')
    expect(css).toContain('width: 8px;')
    expect(css).toContain('background: var(--dsw-alias-scrollbar-bg-l2);')
  })
})
