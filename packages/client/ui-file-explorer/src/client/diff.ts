/**
 * Line-level side-by-side diff for the git diff viewer. It computes a longest
 * common subsequence alignment between the two text sides, then pairs removed
 * and added runs into per-row "old / new" cells so changed lines align like a
 * VSCode split diff. No character-level highlighting.
 */

/** One aligned diff row. */
export interface DiffRow {
  /** Whether the row is unchanged. */
  changed: boolean
  /** Old-side line text, or null when the row is right-only. */
  left: string | null
  /** New-side line text, or null when the row is left-only. */
  right: string | null
  /** One-based old-side line number, or null when right-only. */
  leftNo: number | null
  /** One-based new-side line number, or null when left-only. */
  rightNo: number | null
}

/** Maximum lines compared per side. */
const MAX_LINES = 1500

type Op =
  | { type: 'same'; left: number; right: number }
  | { type: 'del'; left: number }
  | { type: 'add'; right: number }

function at<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index]
  if (value === undefined) throw new Error(`diff index ${index} is out of bounds`)
  return value
}

/** Split text into display lines, dropping one trailing newline artifact. */
function toLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Longest-common-subsequence diff between two line arrays. */
function lineOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    const current = at(table, i)
    const below = at(table, i + 1)
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) current[j] = at(below, j + 1) + 1
      else current[j] = at(below, j) >= at(current, j + 1) ? at(below, j) : at(current, j + 1)
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'same', left: i, right: j }); i++; j++ }
    else if (at(at(table, i + 1), j) >= at(at(table, i), j + 1)) { ops.push({ type: 'del', left: i }); i++ }
    else { ops.push({ type: 'add', right: j }); j++ }
  }
  while (i < n) { ops.push({ type: 'del', left: i }); i++ }
  while (j < m) { ops.push({ type: 'add', right: j }); j++ }
  return ops
}

/** Fold op runs into aligned rows, pairing each removed run with the following added run. */
function foldOps(a: string[], b: string[], ops: Op[]): DiffRow[] {
  const rows: DiffRow[] = []
  let i = 0
  while (i < ops.length) {
    const op = at(ops, i)
    if (op.type === 'same') {
      rows.push({ changed: false, left: a[op.left] ?? null, right: b[op.right] ?? null, leftNo: op.left + 1, rightNo: op.right + 1 })
      i++
      continue
    }
    const deleted: number[] = []
    while (i < ops.length) {
      const current = at(ops, i)
      if (current.type !== 'del') break
      deleted.push(current.left)
      i++
    }
    const added: number[] = []
    while (i < ops.length) {
      const current = at(ops, i)
      if (current.type !== 'add') break
      added.push(current.right)
      i++
    }
    const count = Math.max(deleted.length, added.length)
    for (let k = 0; k < count; k++) {
      rows.push({
        changed: true,
        left: k < deleted.length ? a[at(deleted, k)] ?? null : null,
        right: k < added.length ? b[at(added, k)] ?? null : null,
        leftNo: k < deleted.length ? at(deleted, k) + 1 : null,
        rightNo: k < added.length ? at(added, k) + 1 : null,
      })
    }
  }
  return rows
}

/**
 * Compute the aligned side-by-side rows for two text sides.
 * @param oldText - pre-change text.
 * @param newText - post-change text.
 * @returns aligned rows plus whether a per-side line cap truncated the input.
 */
export function diffRows(oldText: string, newText: string): { rows: DiffRow[]; truncated: boolean } {
  let a = toLines(oldText)
  let b = toLines(newText)
  let truncated = false
  if (a.length > MAX_LINES) { a = a.slice(0, MAX_LINES); truncated = true }
  if (b.length > MAX_LINES) { b = b.slice(0, MAX_LINES); truncated = true }
  return { rows: foldOps(a, b, lineOps(a, b)), truncated }
}
