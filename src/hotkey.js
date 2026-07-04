import { useInput } from './hooks.js'
import { registerHook } from './renderer.js'

const KEY_ALIASES = { enter: 'return', esc: 'escape' }
const MOD_NAMES = new Set(['ctrl', 'alt', 'meta', 'shift'])

function parseDescriptor(desc) {
  const mods = { ctrl: false, meta: false, shift: false }
  let key = desc

  while (true) {
    const idx = key.indexOf('+')
    if (idx <= 0 || idx === key.length - 1) break
    const mod = key.slice(0, idx).toLowerCase()
    if (!MOD_NAMES.has(mod)) break
    if (mod === 'ctrl') mods.ctrl = true
    else if (mod === 'shift') mods.shift = true
    else mods.meta = true
    key = key.slice(idx + 1)
  }

  if (key.length > 1) {
    key = key.toLowerCase()
    if (KEY_ALIASES[key]) key = KEY_ALIASES[key]
  }

  // an uppercase letter descriptor implies shift
  if (key.length === 1 && key !== key.toLowerCase()) {
    mods.shift = true
  }

  return { key, ...mods }
}

function matches(parsed, event) {
  const key = event.key
  if (typeof key !== 'string') return false

  // uppercase single-char keys imply shift even when the terminal
  // doesn't report the modifier
  const eventShift = !!event.shift || (key.length === 1 && key !== key.toLowerCase())

  const keyMatch = parsed.key.length === 1 && key.length === 1
    ? parsed.key.toLowerCase() === key.toLowerCase()
    : parsed.key === key || (parsed.shift && parsed.key === 'tab' && key === 'shift-tab')

  if (!keyMatch) return false
  if (parsed.ctrl !== !!event.ctrl) return false
  if (parsed.meta !== !!event.meta) return false
  if (parsed.shift !== eventShift && !(parsed.shift && key === 'shift-tab')) return false
  return true
}

export function useHotkey(descriptor, handler, { when } = {}) {
  const ref = registerHook(() => ({ descriptor: undefined, parsed: null, handler, when }))
  if (ref.descriptor !== descriptor) {
    ref.descriptor = descriptor
    ref.parsed = parseDescriptor(descriptor)
  }
  ref.handler = handler
  ref.when = when

  useInput((event) => {
    if (ref.when && !ref.when()) return
    if (event.key === 'paste') return
    if (!matches(ref.parsed, event)) return
    ref.handler()
    event.stopPropagation()
  })
}
