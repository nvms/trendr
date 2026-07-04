import { computeDiff, diffSequences, diffWords, tokenize, splitLines } from '../src/diff-engine.js'
import { sliceVisibleRange, stripAnsi } from '../src/wrap.js'
import { parseSgr } from '../src/ansi.js'

let passed = 0
let failed = 0
let currentSuite = ''

function suite(name) {
  currentSuite = name
}

function assert(cond, msg) {
  if (cond) passed++
  else {
    failed++
    console.log(`  FAIL [${currentSuite}]: ${msg}`)
  }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
}

function assertDeep(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`)
}

const types = rows => rows.map(r => r.type)
const texts = rows => rows.map(r => r.text)

// =========================================================================
// SPLIT LINES
// =========================================================================
suite('splitLines')
{
  assertDeep(splitLines('a\nb\nc'), ['a', 'b', 'c'], 'no trailing newline')
  assertDeep(splitLines('a\nb\n'), ['a', 'b'], 'drops single trailing newline')
  assertDeep(splitLines('a\nb\n\n'), ['a', 'b', ''], 'keeps blank line before trailing newline')
  assertDeep(splitLines(''), [], 'empty string is no lines')
  assertDeep(splitLines('solo'), ['solo'], 'single line')
}

// =========================================================================
// LINE DIFF
// =========================================================================
suite('diffSequences - line level')
{
  const ops = diffSequences(['a', 'b', 'c'], ['a', 'b', 'c'])
  assert(ops.every(o => o.type === 'equal'), 'identical sequences are all equal')

  const add = diffSequences(['a', 'c'], ['a', 'b', 'c'])
  assertDeep(types(add), ['equal', 'add', 'equal'], 'single insertion in the middle')

  const del = diffSequences(['a', 'b', 'c'], ['a', 'c'])
  assertDeep(types(del), ['equal', 'del', 'equal'], 'single deletion in the middle')

  const repl = diffSequences(['a', 'b', 'c'], ['a', 'x', 'c'])
  assertDeep(types(repl), ['equal', 'del', 'add', 'equal'], 'replacement is del then add')

  const empty = diffSequences([], ['a', 'b'])
  assertDeep(types(empty), ['add', 'add'], 'from empty is all adds')
}

suite('computeDiff - before/after')
{
  const { rows, stats } = computeDiff({
    before: 'one\ntwo\nthree',
    after: 'one\nTWO\nthree',
  })
  assertDeep(types(rows), ['context', 'del', 'add', 'context'], 'one changed line yields del+add surrounded by context')
  assertEq(stats.additions, 1, 'one addition')
  assertEq(stats.deletions, 1, 'one deletion')

  const ctx = rows.find(r => r.type === 'context')
  assertEq(ctx.oldNo, 1, 'context keeps old line number')
  assertEq(ctx.newNo, 1, 'context keeps new line number')

  const del = rows.find(r => r.type === 'del')
  assertEq(del.oldNo, 2, 'del has old line number')
  assertEq(del.newNo, null, 'del has no new line number')

  const add = rows.find(r => r.type === 'add')
  assertEq(add.newNo, 2, 'add has new line number')
  assertEq(add.oldNo, null, 'add has no old line number')
}

// =========================================================================
// WORD DIFF
// =========================================================================
suite('tokenize')
{
  const toks = tokenize('a = b')
  assertDeep(toks.map(t => t.text), ['a', ' ', '=', ' ', 'b'], 'splits words from punctuation')
  assertEq(toks[0].start, 0, 'first token start')
  assertEq(toks[0].end, 1, 'first token end')
  assertEq(toks[4].start, 4, 'last token start')
}

suite('diffWords')
{
  const r = diffWords('const x = 1', 'const x = 2')
  assertEq(r.old.length, 1, 'one changed range on old side')
  assertEq(r.new.length, 1, 'one changed range on new side')
  // the only changed token is the trailing digit at index 10
  assertDeep(r.old[0], [10, 11], 'old range covers the 1')
  assertDeep(r.new[0], [10, 11], 'new range covers the 2')

  const same = diffWords('hello world', 'hello world')
  assertEq(same.old, null, 'identical lines have no old range')
  assertEq(same.new, null, 'identical lines have no new range')

  const unrelated = diffWords('aaaaaaaaaa', 'zzzzzzzzzz')
  assertEq(unrelated.old, null, 'dissimilar lines skip word highlighting')
}

suite('computeDiff - intra ranges on paired lines')
{
  const { rows } = computeDiff({
    before: 'MATCH: oldValue, COUNT: 100',
    after: 'MATCH: newValue, COUNT: 100',
  })
  const del = rows.find(r => r.type === 'del')
  const add = rows.find(r => r.type === 'add')
  assert(del.intra && del.intra.length >= 1, 'del row has intra ranges')
  assert(add.intra && add.intra.length >= 1, 'add row has intra ranges')
  // the unchanged "MATCH: " prefix and ", COUNT: 100" suffix stay outside ranges
  assert(del.intra[0][0] >= 7, 'del intra starts after the MATCH prefix')
}

// =========================================================================
// PATCH PARSING
// =========================================================================
suite('computeDiff - unified patch')
{
  const patch = [
    'diff --git a/file.js b/file.js',
    'index 1234567..89abcde 100644',
    '--- a/file.js',
    '+++ b/file.js',
    '@@ -1,4 +1,4 @@',
    ' const a = 1',
    '-const b = 2',
    '+const b = 3',
    ' const c = 4',
    ' const d = 5',
  ].join('\n')

  const { rows, stats } = computeDiff({ patch })
  assert(rows.some(r => r.type === 'hunk'), 'patch produces a hunk row')
  assert(rows.some(r => r.type === 'meta'), 'patch keeps meta header rows')
  assertEq(stats.additions, 1, 'patch addition count')
  assertEq(stats.deletions, 1, 'patch deletion count')

  const ctxRows = rows.filter(r => r.type === 'context')
  assertEq(ctxRows[0].oldNo, 1, 'first context old number from hunk start')
  assertEq(ctxRows[0].newNo, 1, 'first context new number from hunk start')

  const add = rows.find(r => r.type === 'add')
  assertEq(add.newNo, 2, 'added line numbered within hunk')
  assert(add.intra && add.intra.length >= 1, 'patch add gets word highlighting from pairing')
}

suite('computeDiff - patch no-newline marker')
{
  const patch = [
    '@@ -1 +1 @@',
    '-old',
    '+new',
    '\\ No newline at end of file',
  ].join('\n')
  const { rows } = computeDiff({ patch })
  const add = rows.find(r => r.type === 'add')
  assertEq(add.noNewline, true, 'no-newline marker attaches to previous row')
}

// =========================================================================
// STRUCTURED HUNKS
// =========================================================================
suite('computeDiff - structured hunks')
{
  const { rows, stats } = computeDiff({
    hunks: [{
      oldStart: 10,
      newStart: 10,
      lines: [
        { type: 'context', content: 'keep' },
        { type: 'del', content: 'remove me' },
        { type: 'add', content: 'add me' },
      ],
    }],
  })
  assertDeep(types(rows), ['hunk', 'context', 'del', 'add'], 'hunk header then body rows')
  const ctx = rows.find(r => r.type === 'context')
  assertEq(ctx.oldNo, 10, 'context numbered from oldStart')
  assertEq(stats.additions, 1, 'hunk addition count')
}

// =========================================================================
// CONTEXT FOLDING
// =========================================================================
suite('computeDiff - context folding')
{
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
  const afterLines = before.split('\n')
  afterLines[10] = 'CHANGED'
  const after = afterLines.join('\n')

  const unfolded = computeDiff({ before, after })
  assert(!unfolded.rows.some(r => r.type === 'fold'), 'no fold rows with default infinite context')

  const folded = computeDiff({ before, after, context: 2 })
  const foldRows = folded.rows.filter(r => r.type === 'fold')
  assert(foldRows.length >= 1, 'folding collapses distant context')
  assert(foldRows[0].count > 0, 'fold row reports collapsed line count')
  // change plus 2 lines of context on each side must survive
  assert(folded.rows.some(r => r.type === 'add' && r.text === 'CHANGED'), 'changed line survives folding')
}

// =========================================================================
// ANSI RANGE SLICER
// =========================================================================
suite('sliceVisibleRange')
{
  assertEq(sliceVisibleRange('hello world', 0, 5), 'hello', 'plain slice from start')
  assertEq(sliceVisibleRange('hello world', 6, 11), 'world', 'plain slice from middle')
  assertEq(stripAnsi(sliceVisibleRange('hello world', 6, 11)), 'world', 'plain slice has no stray ansi')

  // the carry prefix is a minimal re-serialized sgr, so assert on parsed
  // state rather than exact bytes
  const sgrStateAt = (s) => {
    const state = { fg: null, bg: null, attrs: 0 }
    const re = /\x1b\[([0-9;]*)m/g
    let m
    while ((m = re.exec(s)) !== null) parseSgr(m[1], state)
    return state
  }

  const ansi = '\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m'
  const mid = sliceVisibleRange(ansi, 4, 9)
  assertEq(stripAnsi(mid), 'green', 'visible slice of ansi string ignores escapes for indexing')
  assertEq(sgrStateAt(mid.slice(0, mid.indexOf('green'))).fg, 'green', 'slice carries the active color into the cut')

  // slicing inside a colored run must re-open the color at the cut
  const inside = sliceVisibleRange('\x1b[31mhello\x1b[0m', 2, 4)
  assertEq(stripAnsi(inside), 'll', 'mid-color slice keeps visible chars')
  assertEq(sgrStateAt(inside.slice(0, inside.indexOf('ll'))).fg, 'red', 'mid-color slice re-opens the active color')
}

// =========================================================================
// MULTI-FILE PATCHES AND HUNK BOUNDARIES
// =========================================================================
suite('computeDiff - multi-file patch')
{
  const patch = [
    'diff --git a/a.js b/a.js',
    'index 1111111..2222222 100644',
    '--- a/a.js',
    '+++ b/a.js',
    '@@ -1,2 +1,2 @@',
    ' one',
    '-two',
    '+TWO',
    'diff --git a/b.js b/b.js',
    'index 3333333..4444444 100644',
    '--- a/b.js',
    '+++ b/b.js',
    '@@ -5,2 +5,2 @@',
    ' five',
    '-six',
    '+SIX',
    '',
  ].join('\n')

  const { rows, stats } = computeDiff({ patch })
  assertDeep(types(rows), [
    'meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add',
    'meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add',
  ], 'second file headers stay meta, no phantom rows')
  assertEq(stats.additions, 2, 'additions counted across files')
  assertEq(stats.deletions, 2, 'deletions counted across files')

  const secondCtx = rows.filter(r => r.type === 'context')[1]
  assertEq(secondCtx.oldNo, 5, 'second hunk renumbers from its own start')
  assertEq(secondCtx.newNo, 5, 'second hunk new number from its own start')

  const dels = rows.filter(r => r.type === 'del')
  assert(!texts(dels).some(t => t.includes('a/b.js')), 'file headers never become del rows')
}

suite('computeDiff - trailing newline produces no phantom row')
{
  const patch = '@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n'
  const { rows } = computeDiff({ patch })
  assertDeep(types(rows), ['hunk', 'context', 'del', 'add'], 'no blank context row past EOF')
  assertEq(rows[rows.length - 1].newNo, 2, 'last row keeps in-range line number')
}

suite('computeDiff - hunk with zero old count')
{
  const patch = '@@ -0,0 +1,2 @@\n+alpha\n+beta\n'
  const { rows, stats } = computeDiff({ patch })
  assertDeep(types(rows), ['hunk', 'add', 'add'], 'new-file hunk parses')
  assertEq(stats.additions, 2, 'both additions counted')
  assertEq(rows[1].newNo, 1, 'first added line numbered from newStart')
}

suite('computeDiff - no-newline marker mid-patch')
{
  const patch = [
    '@@ -1 +1 @@',
    '-old',
    '\\ No newline at end of file',
    '+new',
  ].join('\n')
  const { rows } = computeDiff({ patch })
  const del = rows.find(r => r.type === 'del')
  assertEq(del.noNewline, true, 'marker attaches to the del row it follows')
  const add = rows.find(r => r.type === 'add')
  assertEq(add.newNo, 1, 'add row unaffected by the marker')
}

// =========================================================================
// SIMILARITY METRIC
// =========================================================================
suite('diffWords - similarity counts codepoints')
{
  // one common astral token; utf-16 counting doubles its weight and
  // wrongly crosses the similarity threshold
  const r = diffWords('\u{1F600}abcdefg', '\u{1F600}hijklmn')
  assertEq(r.old, null, 'astral common char does not inflate similarity')
  assertEq(r.new, null, 'both sides skipped')
}

// =========================================================================
// SLICE RANGE - NON-SGR ESCAPES
// =========================================================================
suite('sliceVisibleRange - skips OSC and non-SGR CSI')
{
  const link = '\x1b]8;;https://x\x1b\\hi\x1b]8;;\x1b\\ there'
  assertEq(sliceVisibleRange(link, 0, 2), 'hi', 'OSC neither counts as visible nor leaks into the slice')
  assertEq(sliceVisibleRange(link, 3, 8), 'there', 'indexing stays codepoint-based past OSC')
  assertEq(sliceVisibleRange('\x1b[2Jab', 0, 2), 'ab', 'non-m CSI dropped, not visible')
}

// =========================================================================
// DIFF COMPONENT - ZERO-HEIGHT LAYOUT
// =========================================================================
import { EventEmitter } from 'events'
import { mount } from '../index.js'
import { Diff } from '../src/diff-view.js'

class FakeStream extends EventEmitter {
  constructor(cols, rows) {
    super()
    this.columns = cols
    this.rows = rows
    this.isTTY = false
  }
  write() { return true }
}

class FakeInput extends EventEmitter {
  constructor() {
    super()
    this.isTTY = false
  }
  setRawMode() {}
  pause() {}
  resume() {}
}

suite('Diff - zero-height layout renders no rows')
{
  const before = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
  const after = before.replace('line 250', 'CHANGED')
  const captured = []

  function Probe() {
    const tree = Diff({ before, after, scrollbar: false })
    captured.push(tree)
    return tree
  }

  const { unmount } = mount(Probe, { stream: new FakeStream(40, 10), stdin: new FakeInput() })
  await new Promise(r => setTimeout(r, 100))
  unmount()

  const rowCounts = captured.map(t => t.props.children.length)
  assertEq(rowCounts[0], 0, 'first resolve with zero layout renders no rows')
  const settled = rowCounts[rowCounts.length - 1]
  assert(settled > 0 && settled <= 10, `settled resolve renders at most viewport rows, got ${settled}`)
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
