import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme, useLayout, useMouse, useHitTest } from './hooks.js'
import { createSignal } from './signal.js'
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

const LINK_OPEN = url => `\x1b]8;;${url}\x1b\\`
const LINK_CLOSE = '\x1b]8;;\x1b\\'
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g
const TRAILING_URL_PUNCTUATION = /[.,;:!?]+$/

function renderLinks(text) {
  return text.replace(LINK_RE, (match, label, markdownUrl, plainUrl) => {
    let url = markdownUrl || plainUrl
    let trailing = ''
    if (plainUrl) {
      const punctuation = url.match(TRAILING_URL_PUNCTUATION)?.[0] || ''
      url = url.slice(0, url.length - punctuation.length)
      trailing = punctuation
      while (url.endsWith(')') && (url.match(/\(/g)?.length || 0) < (url.match(/\)/g)?.length || 0)) {
        trailing = ')' + trailing
        url = url.slice(0, -1)
      }
    }
    return `${LINK_OPEN(url)}${UNDERLINE_ON}${label || url}${UNDERLINE_OFF}${LINK_CLOSE}${trailing}`
  })
}

export function renderInline(s, { accent = 'cyan' } = {}) {
  const codeOn = fgSgr(accent)
  let out = ''
  for (const part of s.split(/(`[^`]+`)/)) {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      out += codeOn + part.slice(1, -1) + FG_RESET
    } else {
      out += renderLinks(part)
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

function renderTableRows(block, width, colors = {}, borderColor) {
  const columns = block.header.length
  if (!columns) return { top: '', header: [], rule: '', rows: [], bottom: '' }
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

  const border = value => borderColor == null ? value : fgSgr(borderColor) + value + FG_RESET
  const renderRow = (cells, header = false) => {
    const wrapped = cells.map((cell, col) => wordWrap(renderInline(cell, colors), widths[col]))
    const height = Math.max(1, ...wrapped.map(lines => lines.length))
    return Array.from({ length: height }, (_, row) => border('│') + wrapped.map((lines, col) => {
      let value = lines[row] || ''
      if (header) value = BOLD_ON + value + BOLD_OFF
      return padCell(value, widths[col], block.align[col])
    }).join(border('│')) + border('│'))
  }

  return {
    top: border('┌' + widths.map(w => '─'.repeat(w)).join('┬') + '┐'),
    header: renderRow(block.header, true),
    rule: border('├' + widths.map(w => '─'.repeat(w)).join('┼') + '┤'),
    rows: block.rows.map(row => renderRow(row)),
    bottom: border('└' + widths.map(w => '─'.repeat(w)).join('┴') + '┘'),
  }
}

export function renderTableLines(block, width, colors = {}, borderColor) {
  const table = renderTableRows(block, width, colors, borderColor)
  return [table.top, ...table.header, table.rule, ...table.rows.flat(), table.bottom].filter(Boolean)
}

function MarkdownTableRow({ lines, hoverBg }) {
  const [hovered, setHovered] = createSignal(false)
  const hitTest = useHitTest()

  useMouse(event => {
    if (event.action !== 'move') return
    const inside = hitTest(event.x, event.y)
    if (inside !== hovered()) setHovered(inside)
  })

  return jsx('box', {
    style: { flexDirection: 'column', bg: hovered() ? hoverBg : null },
    children: lines.map((line, key) => jsx('text', {
      key,
      style: { overflow: 'truncate' },
      children: line,
    })),
  })
}

function MarkdownTable({ block, width, colors, borderColor, rowHoverBg }) {
  const table = renderTableRows(block, width, colors, borderColor)
  const text = (line, key) => jsx('text', { key, style: { overflow: 'truncate' }, children: line })
  const children = [text(table.top, 'top'), ...table.header.map((line, key) => text(line, `header-${key}`)), text(table.rule, 'rule')]

  table.rows.forEach((lines, key) => {
    children.push(rowHoverBg == null
      ? jsx('box', {
          key: `row-${key}`,
          style: { flexDirection: 'column' },
          children: lines.map((line, lineKey) => text(line, lineKey)),
        })
      : jsx(MarkdownTableRow, { key: `row-${key}`, lines, hoverBg: rowHoverBg }))
  })
  children.push(text(table.bottom, 'bottom'))

  return jsx('box', {
    style: { flexDirection: 'column', color: colors.muted },
    children,
  })
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

export function Markdown({
  text,
  children,
  highlight,
  codeBg = '#1e1e22',
  codeBlock: CodeBlockComponent = CodeBlock,
  tableBorderColor,
  tableRowHoverBg,
  style: userStyle,
}) {
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
      return jsx(MarkdownTable, {
        key,
        block,
        width: layout.width || 40,
        colors,
        borderColor: tableBorderColor,
        rowHoverBg: tableRowHoverBg,
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
        jsxs('box', {
          key: k,
          style: { flexDirection: 'row' },
          children: [
            jsx('text', { selection: 'outer', style: { color: muted }, children: '▎ ' }),
            jsx('text', { style: { color: muted, italic: true }, children: renderInline(line, colors) }),
          ],
        }))
      return jsx('box', {
        key,
        selection: 'contain',
        style: { flexDirection: 'column' },
        children: rows,
      })
    }

    return null
  })

  return jsx('box', {
    style: { flexDirection: 'column', gap: 1, ...userStyle },
    children: els,
  })
}
