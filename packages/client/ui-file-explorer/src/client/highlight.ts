/**
 * Minimal zero-dependency syntax highlighter for the text preview. It tokenizes
 * comments, strings, numbers, and a fixed cross-language keyword set, then the
 * component maps tokens onto theme-aware CSS classes. The comment style is
 * chosen per file extension: `#` for shell/Python/YAML-like languages, `//`
 * plus block comments everywhere else.
 */

/** One token of the source, ready for a class mapping. */
export interface HighlightToken {
  type: 'plain' | 'comment' | 'string' | 'number' | 'keyword'
  text: string
}

const KEYWORDS: Record<string, true> = {}
'const let var function return if else for while do new class extends implements interface import export from default async await try catch finally throw switch case break continue typeof instanceof in of null undefined true false this super void delete yield static get set abstract public private protected readonly def elif lambda pass raise not and or is None True False fn mut struct enum impl trait match where loop use mod pub unsafe package func type go defer chan select range final int float double bool char byte long short signed unsigned namespace template typename virtual override volatile constexpr'.split(' ').forEach((word) => { KEYWORDS[word] = true })

/** `#`-comment file extensions. */
const HASH_COMMENT_EXTENSIONS: Record<string, true> = {
  py: true, sh: true, bash: true, zsh: true, yaml: true, yml: true,
  rb: true, toml: true, pl: true, sql: true, fish: true, r: true,
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function isHexDigit(char: string): boolean {
  return isDigit(char) || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')
}

function isWordStart(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === '$'
}

function isWordChar(char: string): boolean {
  return isWordStart(char) || isDigit(char)
}

function isNumberChar(char: string): boolean {
  return isDigit(char) || isHexDigit(char) || char === '.' || char === 'x' || char === 'X'
    || char === '_' || char === '+' || char === '-'
}

/**
 * Tokenize one source text into typed runs.
 * @param src - source text.
 * @param hashComment - whether `#` starts a line comment.
 * @returns ordered tokens; `plain` runs carry the untyped gaps.
 */
export function tokenize(src: string, hashComment: boolean): HighlightToken[] {
  const out: HighlightToken[] = []
  let i = 0
  let plain = ''
  const flush = (): void => {
    if (plain.length > 0) { out.push({ type: 'plain', text: plain }); plain = '' }
  }
  const push = (type: HighlightToken['type'], text: string): void => { flush(); out.push({ type, text }) }
  while (i < src.length) {
    const char = src.charAt(i)
    const next = src.charAt(i + 1)
    if (char === '/' && next === '*') {
      let end = src.indexOf('*/', i + 2)
      if (end === -1) end = src.length
      else end += 2
      push('comment', src.slice(i, end)); i = end; continue
    }
    if (char === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      push('comment', src.slice(i, end === -1 ? src.length : end)); i = end === -1 ? src.length : end; continue
    }
    if (hashComment && char === '#') {
      const end = src.indexOf('\n', i)
      push('comment', src.slice(i, end === -1 ? src.length : end)); i = end === -1 ? src.length : end; continue
    }
    const code = char.charCodeAt(0)
    if (code === 34 || code === 39 || code === 96) {
      const quote = char
      let end = i + 1
      while (end < src.length) {
        if (src.charCodeAt(end) === 92) { end += 2; continue }
        if (src.charAt(end) === quote) { end += 1; break }
        end += 1
      }
      push('string', src.slice(i, end)); i = end; continue
    }
    if (isDigit(char) || (char === '.' && isDigit(next))) {
      let end = i + 1
      while (end < src.length && isNumberChar(src.charAt(end))) end += 1
      push('number', src.slice(i, end)); i = end; continue
    }
    if (isWordStart(char)) {
      let end = i + 1
      while (end < src.length && isWordChar(src.charAt(end))) end += 1
      const word = src.slice(i, end)
      if (KEYWORDS[word]) push('keyword', word)
      else plain += word
      i = end; continue
    }
    plain += char
    i += 1
  }
  flush()
  return out
}

/**
 * Resolve the comment style for one file name.
 * @param name - file name or path.
 * @returns true when `#` starts a line comment.
 */
export function usesHashComments(name: string): boolean {
  const dot = name.lastIndexOf('.')
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  return HASH_COMMENT_EXTENSIONS[extension] === true
}
