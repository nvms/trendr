// matches any ANSI escape sequence (CSI + OSC)
const ANSI_RE = /\x1b\[[0-9;]*m/g

export function stripAnsi(text) {
  return text.indexOf('\x1b') === -1 ? text : text.replace(ANSI_RE, '')
}

export function measureText(text) {
  const clean = stripAnsi(text)
  let width = 0
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    if (code >= 0x1100 && isWide(code)) width += 2
    else width += 1
  }
  return width
}

// iterates visible characters of a string, bundling any preceding
// ANSI sequences with the character they precede
function* visibleChars(str) {
  let i = 0
  let pending = ''
  while (i < str.length) {
    if (str[i] === '\x1b' && str[i + 1] === '[') {
      const end = str.indexOf('m', i + 2)
      if (end !== -1) {
        pending += str.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    yield { chunk: pending + str[i], width: charWidth(str.charCodeAt(i)) }
    pending = ''
    i++
  }
}

function charWidth(code) {
  return (code >= 0x1100 && isWide(code)) ? 2 : 1
}

export function sliceVisible(text, maxWidth) {
  let result = ''
  let width = 0
  for (const { chunk, width: w } of visibleChars(text)) {
    if (width + w > maxWidth) break
    result += chunk
    width += w
  }
  return result
}

export function wordWrap(text, maxWidth) {
  if (maxWidth <= 0) return []
  if (!text) return ['']

  const lines = []

  for (const rawLine of text.split('\n')) {
    if (rawLine.length === 0) {
      lines.push('')
      continue
    }

    if (measureText(rawLine) <= maxWidth) {
      lines.push(rawLine)
      continue
    }

    const words = rawLine.split(/\s+/)
    let line = ''
    let lineWidth = 0

    for (const word of words) {
      if (!word) continue
      const ww = measureText(word)

      if (lineWidth === 0 && ww <= maxWidth) {
        line = word
        lineWidth = ww
      } else if (lineWidth === 0 && ww > maxWidth) {
        for (const { chunk, width } of visibleChars(word)) {
          if (lineWidth + width > maxWidth) {
            lines.push(line)
            line = ''
            lineWidth = 0
          }
          line += chunk
          lineWidth += width
        }
      } else if (lineWidth + 1 + ww <= maxWidth) {
        line += ' ' + word
        lineWidth += 1 + ww
      } else if (ww > maxWidth) {
        if (line) lines.push(line)
        line = ''
        lineWidth = 0
        for (const { chunk, width } of visibleChars(word)) {
          if (lineWidth + width > maxWidth) {
            lines.push(line)
            line = ''
            lineWidth = 0
          }
          line += chunk
          lineWidth += width
        }
      } else {
        lines.push(line)
        line = word
        lineWidth = ww
      }
    }

    lines.push(line)
  }

  return lines
}

function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33bf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  )
}
