const ESC = '\x1b['

export const moveTo = (row, col) => `${ESC}${row};${col}H`
export const moveUp = (n = 1) => `${ESC}${n}A`
export const moveDown = (n = 1) => `${ESC}${n}B`
export const moveRight = (n = 1) => `${ESC}${n}C`
export const moveLeft = (n = 1) => `${ESC}${n}D`

export const hideCursor = `${ESC}?25l`
export const showCursor = `${ESC}?25h`
export const clearScreen = `${ESC}2J`
export const clearLine = `${ESC}2K`
export const altScreen = `${ESC}?1049h`
export const exitAltScreen = `${ESC}?1049l`
export const sgrReset = `${ESC}0m`

export const setTitle = (title) => `\x1b]2;${title}\x07`

export const enableMouse = `${ESC}?1002h${ESC}?1006h`
export const disableMouse = `${ESC}?1002l${ESC}?1006l`

export const BOLD = 1
export const DIM = 2
export const ITALIC = 4
export const UNDERLINE = 8
export const INVERSE = 16
export const STRIKETHROUGH = 32

const ATTR_CODES = [
  [BOLD, '1'],
  [DIM, '2'],
  [ITALIC, '3'],
  [UNDERLINE, '4'],
  [INVERSE, '7'],
  [STRIKETHROUGH, '9'],
]

const NAMED_COLORS = {
  black: 0, red: 1, green: 2, yellow: 3,
  blue: 4, magenta: 5, cyan: 6, white: 7,
  gray: 8, grey: 8,
  brightRed: 9, brightGreen: 10, brightYellow: 11,
  brightBlue: 12, brightMagenta: 13, brightCyan: 14, brightWhite: 15,
}

function parseColor(color, offset) {
  if (color == null) return null
  if (typeof color === 'number') return `${offset};5;${color}`
  if (color in NAMED_COLORS) return `${offset};5;${NAMED_COLORS[color]}`
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `${offset};2;${r};${g};${b}`
  }
  return null
}

// reverse lookup: 256-color index -> named color string
// only the 16 standard colors get names, everything else stays numeric
const INDEX_TO_NAME = Object.entries(NAMED_COLORS)
  .filter(([k]) => k !== 'grey')
  .reduce((map, [name, idx]) => { map[idx] = name; return map }, {})

// maps basic ansi fg codes (30-37, 90-97) to 256-color index
function basicFgToIndex(code) {
  if (code >= 30 && code <= 37) return code - 30
  if (code >= 90 && code <= 97) return code - 90 + 8
  return null
}

function basicBgToIndex(code) {
  if (code >= 40 && code <= 47) return code - 40
  if (code >= 100 && code <= 107) return code - 100 + 8
  return null
}

function indexToColor(idx) {
  return INDEX_TO_NAME[idx] ?? idx
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

export function parseSgr(params, state) {
  if (!state) state = { fg: null, bg: null, attrs: 0 }
  const codes = params.split(';').map(Number)
  let i = 0

  while (i < codes.length) {
    const c = codes[i]

    if (c === 0) {
      state.fg = null
      state.bg = null
      state.attrs = 0
    } else if (c === 1) state.attrs |= BOLD
    else if (c === 2) state.attrs |= DIM
    else if (c === 3) state.attrs |= ITALIC
    else if (c === 4) state.attrs |= UNDERLINE
    else if (c === 7) state.attrs |= INVERSE
    else if (c === 9) state.attrs |= STRIKETHROUGH
    else if (c === 22) state.attrs &= ~(BOLD | DIM)
    else if (c === 23) state.attrs &= ~ITALIC
    else if (c === 24) state.attrs &= ~UNDERLINE
    else if (c === 27) state.attrs &= ~INVERSE
    else if (c === 29) state.attrs &= ~STRIKETHROUGH
    else if (c === 39) state.fg = null
    else if (c === 49) state.bg = null
    else if (c === 38 && codes[i + 1] === 5) {
      state.fg = indexToColor(codes[i + 2])
      i += 2
    } else if (c === 48 && codes[i + 1] === 5) {
      state.bg = indexToColor(codes[i + 2])
      i += 2
    } else if (c === 38 && codes[i + 1] === 2) {
      state.fg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4])
      i += 4
    } else if (c === 48 && codes[i + 1] === 2) {
      state.bg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4])
      i += 4
    } else {
      const fgIdx = basicFgToIndex(c)
      if (fgIdx != null) state.fg = indexToColor(fgIdx)
      else {
        const bgIdx = basicBgToIndex(c)
        if (bgIdx != null) state.bg = indexToColor(bgIdx)
      }
    }

    i++
  }

  return state
}

export function sgr(fg, bg, attrs) {
  const parts = ['0']

  for (const [mask, code] of ATTR_CODES) {
    if (attrs & mask) parts.push(code)
  }

  const fgCode = parseColor(fg, 38)
  if (fgCode) parts.push(fgCode)

  const bgCode = parseColor(bg, 48)
  if (bgCode) parts.push(bgCode)

  return `${ESC}${parts.join(';')}m`
}
