import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme, useLayout } from './hooks.js'
import { fgSgr } from './ansi.js'
import { measureText, wordWrap } from './wrap.js'

const BOLD_ON = '\x1b[1m'
const BOLD_OFF = '\x1b[22m'
const ITALIC_ON = '\x1b[3m'
const ITALIC_OFF = '\x1b[23m'
const UNDERLINE_ON = '\x1b[4m'
const UNDERLINE_OFF = '\x1b[24m'
const FG_RESET = '\x1b[39m'

const FENCE = /^```(\S*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const HR = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const BLANK = /^\s*$/

// A pipe is structural unless escaped by an odd number of backslashes. Inline
// code spans are deliberately not special here, matching GFM table parsing.
export function splitTableRow(line) {
  let source = String(line).trim()
  if (source.startsWith('|')) source = source.slice(1)
  if (source.endsWith('|') && !/(^|[^\\])(?:\\\\)*\\\|$/.test(source)) source = source.slice(0, -1)
  const cells = []
  let cell = ''
  let slashes = 0
  for (const ch of source) {
    if (ch === '|') {
      if (slashes % 2) {
        cell = cell.slice(0, -1) + '|'
        slashes = 0
        continue
      }
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
    slashes = ch === '\\' ? slashes + 1 : 0
  }
  cells.push(cell.trim())
  return cells
}

function tableDelimiter(line) {
  const cells = splitTableRow(line)
  if (!cells.length || cells.some(cell => !/^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))) return null
  return cells.map(cell => {
    const compact = cell.replace(/\s/g, '')
    return compact.startsWith(':') && compact.endsWith(':') ? 'center' : compact.endsWith(':') ? 'right' : 'left'
  })
}

function tableAt(lines, i) {
  if (i + 1 >= lines.length || !lines[i].includes('|')) return null
  const align = tableDelimiter(lines[i + 1])
  if (!align) return null
  const header = splitTableRow(lines[i])
  if (header.length !== align.length) return null
  return { header, align }
}

export function parseBlocks(text) {
  const lines = String(text).split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (BLANK.test(line)) { i++; continue }

    const fence = line.match(FENCE)
    if (fence) {
      const code = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) i++
      blocks.push({ type: 'code', lang: fence[1], lines: code })
      continue
    }

    if (HR.test(line)) { blocks.push({ type: 'hr' }); i++; continue }

    const table = tableAt(lines, i)
    if (table) {
      i += 2
      const rows = []
      while (i < lines.length && !BLANK.test(lines[i]) && lines[i].includes('|')) {
        const row = splitTableRow(lines[i++])
        // GFM pads short rows and ignores cells beyond the header.
        rows.push(table.header.map((_, col) => row[col] ?? ''))
      }
      blocks.push({ type: 'table', header: table.header, align: table.align, rows })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }

    if (LIST_ITEM.test(line)) {
      const items = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM)
        if (!m) break
        items.push({ indent: m[1].length, marker: m[2], text: m[3] })
        i++
      }
      blocks.push({ type: 'list', items })
      continue
    }

    if (QUOTE.test(line)) {
      const quoted = []
      while (i < lines.length) {
        const m = lines[i].match(QUOTE)
        if (!m) break
        quoted.push(m[1])
        i++
      }
      blocks.push({ type: 'quote', lines: quoted })
      continue
    }

    const para = []
    while (
      i < lines.length &&
      !BLANK.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !QUOTE.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'para', text: para.join(' ') })
  }

  return blocks
}

export function renderInline(s, { accent = 'cyan' } = {}) {
  const codeOn = fgSgr(accent)
  let out = ''
  for (const part of s.split(/(`[^`]+`)/)) {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      out += codeOn + part.slice(1, -1) + FG_RESET
    } else {
      out += part
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${UNDERLINE_ON}$1${UNDERLINE_OFF}`)
        .replace(/\*\*([^*]+)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`)
        .replace(/\*([^*\s][^*]*?)\*/g, `${ITALIC_ON}$1${ITALIC_OFF}`)
        .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, `$1${ITALIC_ON}$2${ITALIC_OFF}`)
    }
  }
  return out
}

function padCell(text, width, align) {
  const used = measureText(text)
  const spare = Math.max(0, width - used)
  const left = align === 'right' ? spare : align === 'center' ? Math.floor(spare / 2) : 0
  return ' '.repeat(left) + text + ' '.repeat(spare - left)
}

export function renderTableLines(block, width, colors = {}) {
  const columns = block.header.length
  if (!columns) return []
  const borderWidth = columns + 1
  const available = Math.max(columns, Math.max(1, width || 40) - borderWidth)
  const desired = block.header.map((cell, col) => Math.max(1, ...[cell, ...block.rows.map(row => row[col])].map(measureText)))
  const widths = desired.map(() => 1)
  let remaining = available - columns
  // Give space to the columns that need it most, without letting one long cell
  // starve all its neighbours. This also responds cleanly to terminal resizes.
  let col = 0
  while (remaining-- > 0) {
    let attempts = 0
    while (attempts++ < columns && widths[col] >= desired[col]) col = (col + 1) % columns
    widths[col]++
    col = (col + 1) % columns
  }

  const rule = '├' + widths.map(w => '─'.repeat(w)).join('┼') + '┤'
  const renderRow = (cells, header = false) => {
    const wrapped = cells.map((cell, col) => wordWrap(renderInline(cell, colors), widths[col]))
    const height = Math.max(1, ...wrapped.map(lines => lines.length))
    return Array.from({ length: height }, (_, row) => '│' + wrapped.map((lines, col) => {
      let value = lines[row] || ''
      if (header) value = BOLD_ON + value + BOLD_OFF
      return padCell(value, widths[col], block.align[col])
    }).join('│') + '│')
  }
  return [
    '┌' + widths.map(w => '─'.repeat(w)).join('┬') + '┐',
    ...renderRow(block.header, true),
    rule,
    ...block.rows.flatMap(row => renderRow(row)),
    '└' + widths.map(w => '─'.repeat(w)).join('┴') + '┘',
  ]
}

export function CodeBlock({ value, language, highlight, codeBg = '#1e1e22' }) {
  const shown = highlight ? highlight(value, language) : value
  const rows = shown.split('\n').map((line, key) => jsx('text', {
    key,
    style: { overflow: 'truncate' },
    children: line || ' ',
  }))

  return jsx('box', {
    style: { flexDirection: 'column', bg: codeBg, paddingX: 1 },
    children: rows,
  })
}

export function Markdown({ text, children, highlight, codeBg = '#1e1e22', codeBlock: CodeBlockComponent = CodeBlock, style: userStyle }) {
  const { accent = 'cyan', muted = 'gray' } = useTheme()
  const layout = useLayout()
  const src = text ?? (Array.isArray(children) ? children.join('') : (children ?? ''))
  const colors = { accent, muted }

  const els = parseBlocks(src).map((block, key) => {
    if (block.type === 'heading') {
      return jsx('text', { key, style: { bold: true, color: accent }, children: renderInline(block.text, colors) })
    }

    if (block.type === 'para') {
      return jsx('text', { key, children: renderInline(block.text, colors) })
    }

    if (block.type === 'hr') {
      return jsx('text', { key, style: { color: muted, dim: true }, children: '─'.repeat(Math.max(1, layout.width || 40)) })
    }

    if (block.type === 'table') {
      const lines = renderTableLines(block, layout.width || 40, colors)
      return jsx('box', {
        key,
        style: { flexDirection: 'column', color: muted },
        children: lines.map((line, row) => jsx('text', { key: row, style: { overflow: 'truncate' }, children: line })),
      })
    }

    if (block.type === 'code') {
      return jsx(CodeBlockComponent, {
        key,
        value: block.lines.join('\n'),
        language: block.lang,
        highlight,
        codeBg,
      })
    }

    if (block.type === 'list') {
      const rows = block.items.map((item, k) => {
        const marker = /\d/.test(item.marker[0]) ? `${item.marker} ` : '• '
        return jsxs('box', {
          key: k,
          style: { flexDirection: 'row', paddingLeft: item.indent },
          children: [
            jsx('text', { style: { color: muted }, children: marker }),
            jsx('box', {
              style: { flexDirection: 'column', flexGrow: 1 },
              children: jsx('text', { children: renderInline(item.text, colors) }),
            }),
          ],
        })
      })
      return jsx('box', { key, style: { flexDirection: 'column' }, children: rows })
    }

    if (block.type === 'quote') {
      const rows = block.lines.map((line, k) =>
        jsx('text', { key: k, style: { color: muted, italic: true }, children: renderInline(line, colors) }))
      return jsxs('box', {
        key,
        style: { flexDirection: 'row' },
        children: [
          jsx('text', { style: { color: muted }, children: '▎ ' }),
          jsx('box', { style: { flexDirection: 'column', flexGrow: 1 }, children: rows }),
        ],
      })
    }

    return null
  })

  return jsx('box', {
    style: { flexDirection: 'column', gap: 1, ...userStyle },
    children: els,
  })
}
