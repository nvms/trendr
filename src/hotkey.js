import { useInput } from './hooks.js'
import { registerHook } from './renderer.js'

function parseDescriptor(desc) {
  const parts = desc.toLowerCase().split('+')
  const key = parts.pop()
  const mods = { ctrl: false, meta: false }
  for (const p of parts) {
    if (p === 'ctrl') mods.ctrl = true
    if (p === 'alt' || p === 'meta') mods.meta = true
  }
  return { key, ...mods }
}

const RAW_KEYS = { return: '\r', enter: '\r' }

export function useHotkey(descriptor, handler, { when } = {}) {
  const parsed = registerHook(() => parseDescriptor(descriptor))
  const ref = registerHook(() => ({ handler, when }))
  ref.handler = handler
  ref.when = when

  useInput((event) => {
    if (ref.when && !ref.when()) return

    const rawKey = RAW_KEYS[parsed.key] || parsed.key
    const keyMatch = event.key === rawKey || event.key === parsed.key
    if (!keyMatch) return
    if (parsed.ctrl !== event.ctrl) return
    if (parsed.meta !== event.meta) return

    ref.handler()
    event.stopPropagation()
  })
}
