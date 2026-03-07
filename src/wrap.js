// matches any ANSI escape sequence (CSI + OSC)
const ANSI_RE = /\x1b\[[0-9;]*m/g

export function stripAnsi(text) {
  return text.indexOf('\x1b') === -1 ? text : text.replace(ANSI_RE, '')
}

export function measureText(text) {
  const clean = stripAnsi(text)
  let width = 0
  for (let i = 0; i < clean.length; i++) {
    const code = clean.codePointAt(i)
    if (code > 0xffff) i++
    width += (code >= 0x1100 && isWide(code)) ? 2 : 1
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
    const code = str.codePointAt(i)
    const len = code > 0xffff ? 2 : 1
    yield { chunk: pending + str.slice(i, i + len), width: charWidth(code) }
    pending = ''
    i += len
  }
}

export function charWidth(code) {
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

// generated from Unicode 15.1 EastAsianWidth=W/F + Emoji_Presentation=Yes
function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x231a && code <= 0x231b) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x23e9 && code <= 0x23ec) ||
    code === 0x23f0 ||
    code === 0x23f3 ||
    (code >= 0x25fd && code <= 0x25fe) ||
    (code >= 0x2614 && code <= 0x2615) ||
    (code >= 0x2648 && code <= 0x2653) ||
    code === 0x267f ||
    code === 0x2693 ||
    code === 0x26a1 ||
    (code >= 0x26aa && code <= 0x26ab) ||
    (code >= 0x26bd && code <= 0x26be) ||
    (code >= 0x26c4 && code <= 0x26c5) ||
    code === 0x26ce ||
    code === 0x26d4 ||
    code === 0x26ea ||
    (code >= 0x26f2 && code <= 0x26f3) ||
    code === 0x26f5 ||
    code === 0x26fa ||
    code === 0x26fd ||
    code === 0x2705 ||
    (code >= 0x270a && code <= 0x270b) ||
    code === 0x2728 ||
    code === 0x274c ||
    code === 0x274e ||
    (code >= 0x2753 && code <= 0x2755) ||
    code === 0x2757 ||
    (code >= 0x2795 && code <= 0x2797) ||
    code === 0x27b0 ||
    code === 0x27bf ||
    (code >= 0x2b1b && code <= 0x2b1c) ||
    code === 0x2b50 ||
    code === 0x2b55 ||
    (code >= 0x2e80 && code <= 0x2fd5) ||
    (code >= 0x2ff0 && code <= 0x2ffb) ||
    (code >= 0x3000 && code <= 0x3096) ||
    (code >= 0x3099 && code <= 0x30ff) ||
    (code >= 0x3105 && code <= 0x312f) ||
    (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x3190 && code <= 0x31ba) ||
    (code >= 0x31c0 && code <= 0x31e3) ||
    (code >= 0x31f0 && code <= 0x321e) ||
    (code >= 0x3220 && code <= 0x32fe) ||
    (code >= 0x3300 && code <= 0x4db5) ||
    (code >= 0x4e00 && code <= 0x9fef) ||
    (code >= 0xa000 && code <= 0xa4c6) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfa6d) ||
    (code >= 0xfa70 && code <= 0xfad9) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code === 0x1f004 ||
    code === 0x1f0cf ||
    code === 0x1f18e ||
    (code >= 0x1f191 && code <= 0x1f19a) ||
    (code >= 0x1f1e6 && code <= 0x1f202) ||
    (code >= 0x1f210 && code <= 0x1f23b) ||
    (code >= 0x1f240 && code <= 0x1f248) ||
    (code >= 0x1f250 && code <= 0x1f251) ||
    (code >= 0x1f300 && code <= 0x1f320) ||
    (code >= 0x1f32d && code <= 0x1f335) ||
    (code >= 0x1f337 && code <= 0x1f37c) ||
    (code >= 0x1f37e && code <= 0x1f393) ||
    (code >= 0x1f3a0 && code <= 0x1f3ca) ||
    (code >= 0x1f3cf && code <= 0x1f3d3) ||
    (code >= 0x1f3e0 && code <= 0x1f3f0) ||
    code === 0x1f3f4 ||
    (code >= 0x1f3f8 && code <= 0x1f43e) ||
    code === 0x1f440 ||
    (code >= 0x1f442 && code <= 0x1f4fc) ||
    (code >= 0x1f4ff && code <= 0x1f53d) ||
    (code >= 0x1f54b && code <= 0x1f54e) ||
    (code >= 0x1f550 && code <= 0x1f567) ||
    code === 0x1f57a ||
    (code >= 0x1f595 && code <= 0x1f596) ||
    code === 0x1f5a4 ||
    (code >= 0x1f5fb && code <= 0x1f64f) ||
    (code >= 0x1f680 && code <= 0x1f6c5) ||
    code === 0x1f6cc ||
    (code >= 0x1f6d0 && code <= 0x1f6d2) ||
    (code >= 0x1f6d5 && code <= 0x1f6d7) ||
    (code >= 0x1f6dc && code <= 0x1f6df) ||
    (code >= 0x1f6eb && code <= 0x1f6ec) ||
    (code >= 0x1f6f4 && code <= 0x1f6fc) ||
    (code >= 0x1f7e0 && code <= 0x1f7eb) ||
    code === 0x1f7f0 ||
    (code >= 0x1f90c && code <= 0x1f93a) ||
    (code >= 0x1f93c && code <= 0x1f945) ||
    (code >= 0x1f947 && code <= 0x1f9ff) ||
    (code >= 0x1fa70 && code <= 0x1fa7c) ||
    (code >= 0x1fa80 && code <= 0x1fa88) ||
    (code >= 0x1fa90 && code <= 0x1fabd) ||
    (code >= 0x1fabf && code <= 0x1fac5) ||
    (code >= 0x1face && code <= 0x1fadb) ||
    (code >= 0x1fae0 && code <= 0x1fae8) ||
    (code >= 0x1faf0 && code <= 0x1faf8) ||
    (code >= 0x20000 && code <= 0x2a6d6) ||
    (code >= 0x2a700 && code <= 0x2b734) ||
    (code >= 0x2b740 && code <= 0x2b81d) ||
    (code >= 0x2b820 && code <= 0x2ebe0) ||
    (code >= 0x30000 && code <= 0x3134a)
  )
}
