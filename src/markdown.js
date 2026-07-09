import { jsx, jsxs } from '../jsx-runtime.js'
import { useTheme, useLayout } from './hooks.js'
import { fgSgr } from './ansi.js'

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

export function Markdown({ text, children, highlight, codeBg = '#1e1e22', style: userStyle }) {
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

    if (block.type === 'code') {
      const raw = block.lines.join('\n')
      const shown = highlight ? highlight(raw, block.lang) : raw
      const rows = shown.split('\n').map((line, k) => jsx('text', { key: k, style: { overflow: 'truncate' }, children: line || ' ' }))
      return jsx('box', {
        key,
        style: { flexDirection: 'column', bg: codeBg, paddingX: 1 },
        children: rows,
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
