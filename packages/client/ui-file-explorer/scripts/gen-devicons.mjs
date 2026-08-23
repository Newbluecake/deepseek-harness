// Generates src/client/devicons.tsx from the official `devicon` npm package.
// Usage (from the package root, with the tarball already unpacked next to it):
//   npm pack devicon@<version> --silent
//   tar xzf devicon-<version>.tgz
//   node scripts/gen-devicons.mjs package/icons
//
// The output renders each glyph's upstream brand colors and is not hand-edited;
// re-run this script to pick up a newer Devicon release.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const iconsRoot = resolve(process.argv[2] ?? 'package/icons')
const outFile = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client/devicons.tsx')

/** Folder names to emit, in the order they appear in the generated module. */
const ICONS = [
  'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cplusplus',
  'csharp', 'ruby', 'php', 'swift', 'kotlin', 'html5', 'css3', 'json', 'markdown',
  'yaml', 'bash', 'postgresql', 'docker',
]

const ATTR_MAP = {
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'xlink:href': 'xlinkHref',
  'font-weight': 'fontWeight',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
}

function convertAttrName(name) {
  if (ATTR_MAP[name]) return ATTR_MAP[name]
  if (name.includes('-')) return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  return name
}

function toComponentName(name) {
  return `Devicon${name[0].toUpperCase()}${name.slice(1)}Original`
}

function convertInner(inner, icon) {
  // React rejects string `style`; only markdown carries a text/font style block
  // irrelevant to path rendering. `data-*` is devicon build metadata.
  inner = inner.replace(/\s+style="[^"]*"/g, '')
  inner = inner.replace(/\s+data-[a-zA-Z0-9-]+="[^"]*"/g, '')
  // Drop real `color` / `font-weight` / `font-family` presentation hints
  // (markdown's black text-hint only); paths without an explicit fill then
  // inherit the outer `fill="currentColor"` so they stay legible on dark.
  inner = inner.replace(/\s+color="[^"]*"/g, '')
  inner = inner.replace(/\s+font-weight="[^"]*"/g, '')
  inner = inner.replace(/\s+font-family="[^"]*"/g, '')
  // Upstream reuses `id="a"` across php/kotlin/json, which collides when the
  // glyphs are inlined together; prefix every def id and reference.
  inner = inner.replace(/\bid="([^"]+)"/g, `id="${icon}-$1"`)
  inner = inner.replace(/\burl\(#([^)]+)\)/g, `url(#${icon}-$1)`)
  inner = inner.replace(/\bxlink:href="#([^"]+)"/g, `xlink:href="#${icon}-$1"`)
  return inner.replace(/([\s<])([a-zA-Z][\w:.@-]*)=/g, (m, lead, name) => lead + convertAttrName(name) + '=')
}

const header = `/**
 * Vendored Devicon "original" brand glyphs, generated from the official
 * \`devicon\` npm package (MIT, Copyright (c) 2015 konpa) by
 * scripts/gen-devicons.mjs. Do not hand-edit the path data. Each glyph renders
 * its upstream brand colors and takes a {size} prop; fill-less glyphs
 * (markdown, rust) inherit the surrounding \`color\` via \`fill="currentColor"\`.
 */
export interface DeviconProps {
  /** Rendered square size in pixels (both width and height). */
  size?: number
}

`

const body = []
for (const name of ICONS) {
  const raw = readFileSync(join(iconsRoot, name, `${name}-original.svg`), 'utf8')
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 128 128'
  const inner = convertInner(raw.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim(), name)
  const compName = toComponentName(name)
  body.push(
`export function ${compName}({ size = 16 }: DeviconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="${viewBox}" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${inner}
    </svg>
  )
}
`)
}

writeFileSync(outFile, header + body.join('\n'))
console.log(`Wrote ${body.length} components to ${outFile}`)
