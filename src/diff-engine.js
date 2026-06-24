// turns before/after text, a unified patch string, or structured hunks into a
// single normalized row model the Diff component renders. each row carries
// line numbers, a type, and optional intra-line change ranges (word-level)

const LCS_CELL_LIMIT = 4_000_000

function splitLines(text) {
  if (text == null || text === '') return []
  const lines = String(text).split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// classic LCS edit script over arrays, with common prefix/suffix trimming so a
// small edit inside a large file stays cheap. returns ops in sequence order
function diffSequences(a, b, eq = (x, y) => x === y) {
  const ops = []
  let lo = 0
  let aHi = a.length
  let bHi = b.length

  while (lo < aHi && lo < bHi && eq(a[lo], b[lo])) {
    ops.push({ type: 'equal', a: lo, b: lo })
    lo++
  }

  const tail = []
  while (aHi > lo && bHi > lo && eq(a[aHi - 1], b[bHi - 1])) {
    aHi--
    bHi--
    tail.push({ type: 'equal', a: aHi, b: bHi })
  }
  tail.reverse()

  const n = aHi - lo
  const m = bHi - lo

  if (n === 0 || m === 0 || (n + 1) * (m + 1) > LCS_CELL_LIMIT) {
    for (let i = lo; i < aHi; i++) ops.push({ type: 'del', a: i })
    for (let j = lo; j < bHi; j++) ops.push({ type: 'add', b: j })
    return ops.concat(tail)
  }

  const W = m + 1
  const dp = new Int32Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = eq(a[lo + i], b[lo + j])
        ? dp[(i + 1) * W + (j + 1)] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)])
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (eq(a[lo + i], b[lo + j])) {
      ops.push({ type: 'equal', a: lo + i, b: lo + j })
      i++
      j++
    } else if (dp[(i + 1) * W + j] >= dp[i * W + (j + 1)]) {
      ops.push({ type: 'del', a: lo + i })
      i++
    } else {
      ops.push({ type: 'add', b: lo + j })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', a: lo + i++ })
  while (j < m) ops.push({ type: 'add', b: lo + j++ })

  return ops.concat(tail)
}

// codepoint-aware tokenizer so intra ranges line up with the renderer's
// visible-character slicing. runs of word chars stay whole, everything else
// splits per character
function tokenize(line) {
  const chars = Array.from(line)
  const tokens = []
  let i = 0
  while (i < chars.length) {
    if (/\w/.test(chars[i])) {
      const start = i
      while (i < chars.length && /\w/.test(chars[i])) i++
      tokens.push({ text: chars.slice(start, i).join(''), start, end: i })
    } else {
      tokens.push({ text: chars[i], start: i, end: i + 1 })
      i++
    }
  }
  return tokens
}

function mergeRanges(ranges) {
  if (ranges.length === 0) return null
  ranges.sort((x, y) => x[0] - y[0])
  const merged = [ranges[0].slice()]
  for (let k = 1; k < ranges.length; k++) {
    const last = merged[merged.length - 1]
    if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1])
    else merged.push(ranges[k].slice())
  }
  return merged
}

// word-level diff of two lines. returns the changed codepoint ranges on each
// side, or null when the lines are too dissimilar for sub-line highlighting to
// read as anything but noise
function diffWords(oldLine, newLine, { minSimilarity = 0.25 } = {}) {
  const aTok = tokenize(oldLine)
  const bTok = tokenize(newLine)
  const ops = diffSequences(aTok.map(t => t.text), bTok.map(t => t.text))

  let common = 0
  for (const op of ops) if (op.type === 'equal') common += aTok[op.a].text.length
  const total = Array.from(oldLine).length + Array.from(newLine).length
  if (total > 0 && (2 * common) / total < minSimilarity) return { old: null, new: null }

  const oldRanges = []
  const newRanges = []
  for (const op of ops) {
    if (op.type === 'del') oldRanges.push([aTok[op.a].start, aTok[op.a].end])
    else if (op.type === 'add') newRanges.push([bTok[op.b].start, bTok[op.b].end])
  }

  return { old: mergeRanges(oldRanges), new: mergeRanges(newRanges) }
}

// for every block of deletions immediately followed by additions, pair the
// lines index-wise and compute their intra ranges
function annotateIntra(rows, wordDiff) {
  if (!wordDiff) return rows
  let k = 0
  while (k < rows.length) {
    if (rows[k].type !== 'del') { k++; continue }
    let delEnd = k
    while (delEnd < rows.length && rows[delEnd].type === 'del') delEnd++
    let addEnd = delEnd
    while (addEnd < rows.length && rows[addEnd].type === 'add') addEnd++

    const dels = delEnd - k
    const adds = addEnd - delEnd
    const pairs = Math.min(dels, adds)
    for (let p = 0; p < pairs; p++) {
      const delRow = rows[k + p]
      const addRow = rows[delEnd + p]
      const { old, new: nw } = diffWords(delRow.text, addRow.text)
      delRow.intra = old
      addRow.intra = nw
    }
    k = addEnd > k ? addEnd : k + 1
  }
  return rows
}

function rowsFromOps(ops, aLines, bLines) {
  const rows = []
  for (const op of ops) {
    if (op.type === 'equal') {
      rows.push({ type: 'context', oldNo: op.a + 1, newNo: op.b + 1, text: aLines[op.a], intra: null })
    } else if (op.type === 'del') {
      rows.push({ type: 'del', oldNo: op.a + 1, newNo: null, text: aLines[op.a], intra: null })
    } else {
      rows.push({ type: 'add', oldNo: null, newNo: op.b + 1, text: bLines[op.b], intra: null })
    }
  }
  return rows
}

function rowsFromBeforeAfter(before, after, wordDiff) {
  const aLines = splitLines(before)
  const bLines = splitLines(after)
  const ops = diffSequences(aLines, bLines)
  return annotateIntra(rowsFromOps(ops, aLines, bLines), wordDiff)
}

const HUNK_RE = /^@@+ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@@*(.*)$/

function rowsFromPatch(patch, wordDiff) {
  const rows = []
  let oldNo = 0
  let newNo = 0
  let inHunk = false

  for (const raw of String(patch).split('\n')) {
    const hunk = HUNK_RE.exec(raw)
    if (hunk) {
      oldNo = parseInt(hunk[1], 10)
      newNo = parseInt(hunk[3], 10)
      inHunk = true
      rows.push({ type: 'hunk', oldNo: null, newNo: null, text: raw, intra: null })
      continue
    }

    if (!inHunk) {
      if (raw === '' || raw.startsWith('diff ') || raw.startsWith('index ') ||
          raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('old mode') ||
          raw.startsWith('new mode') || raw.startsWith('similarity ') ||
          raw.startsWith('rename ') || raw.startsWith('new file') ||
          raw.startsWith('deleted file') || raw.startsWith('Binary ')) {
        if (raw !== '') rows.push({ type: 'meta', oldNo: null, newNo: null, text: raw, intra: null })
      }
      continue
    }

    if (raw.startsWith('\\')) {
      const prev = rows[rows.length - 1]
      if (prev) prev.noNewline = true
      continue
    }

    const marker = raw[0]
    const text = raw.slice(1)
    if (marker === '+') {
      rows.push({ type: 'add', oldNo: null, newNo: newNo++, text, intra: null })
    } else if (marker === '-') {
      rows.push({ type: 'del', oldNo: oldNo++, newNo: null, text, intra: null })
    } else if (marker === ' ' || raw === '') {
      rows.push({ type: 'context', oldNo: oldNo++, newNo: newNo++, text, intra: null })
    }
  }

  return annotateIntra(rows, wordDiff)
}

function rowsFromHunks(hunks, wordDiff) {
  const rows = []
  for (const hunk of hunks) {
    let oldNo = hunk.oldStart ?? 1
    let newNo = hunk.newStart ?? 1
    if (hunk.header !== false) {
      rows.push({ type: 'hunk', oldNo: null, newNo: null, text: hunk.header ?? hunkHeader(hunk), intra: null })
    }
    for (const line of hunk.lines ?? []) {
      const type = line.type ?? 'context'
      const text = line.content ?? line.text ?? ''
      if (type === 'add') rows.push({ type: 'add', oldNo: null, newNo: newNo++, text, intra: null })
      else if (type === 'del') rows.push({ type: 'del', oldNo: oldNo++, newNo: null, text, intra: null })
      else rows.push({ type: 'context', oldNo: oldNo++, newNo: newNo++, text, intra: null })
    }
  }
  return annotateIntra(rows, wordDiff)
}

function hunkHeader(hunk) {
  let oldCount = 0
  let newCount = 0
  for (const line of hunk.lines ?? []) {
    const type = line.type ?? 'context'
    if (type !== 'add') oldCount++
    if (type !== 'del') newCount++
  }
  return `@@ -${hunk.oldStart ?? 1},${oldCount} +${hunk.newStart ?? 1},${newCount} @@`
}

// collapses runs of unchanged context longer than 2*context into a fold row, so
// a small edit in a large file shows just the neighborhood of each change
function foldContext(rows, context) {
  if (!Number.isFinite(context)) return rows
  const keep = new Array(rows.length).fill(false)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === 'context') continue
    for (let d = -context; d <= context; d++) {
      const j = i + d
      if (j >= 0 && j < rows.length) keep[j] = true
    }
  }

  const out = []
  let i = 0
  while (i < rows.length) {
    if (keep[i] || rows[i].type !== 'context') {
      out.push(rows[i])
      i++
      continue
    }
    let j = i
    while (j < rows.length && !keep[j] && rows[j].type === 'context') j++
    const count = j - i
    if (count > 0) out.push({ type: 'fold', oldNo: null, newNo: null, text: `${count} unchanged ${count === 1 ? 'line' : 'lines'}`, count, intra: null })
    i = j
  }
  return out
}

function countStats(rows) {
  let additions = 0
  let deletions = 0
  for (const row of rows) {
    if (row.type === 'add') additions++
    else if (row.type === 'del') deletions++
  }
  return { additions, deletions }
}

export function computeDiff({ before, after, patch, hunks, wordDiff = true, context = Infinity } = {}) {
  let rows
  if (hunks != null) rows = rowsFromHunks(hunks, wordDiff)
  else if (patch != null) rows = rowsFromPatch(patch, wordDiff)
  else rows = rowsFromBeforeAfter(before ?? '', after ?? '', wordDiff)

  const stats = countStats(rows)
  rows = foldContext(rows, context)
  return { rows, stats }
}

export { diffSequences, diffWords, tokenize, splitLines }
