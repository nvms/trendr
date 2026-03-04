import { jsx } from '../jsx-runtime.js'
import { createSignalRaw } from './signal.js'
import { useInterval } from './hooks.js'
import { registerHook } from './renderer.js'
import { registerOverlay } from './renderer.js'

const POSITIONS = {
  'top-left':      { justifyContent: 'flex-start', alignItems: 'flex-start' },
  'top-center':    { justifyContent: 'flex-start', alignItems: 'center' },
  'top-right':     { justifyContent: 'flex-start', alignItems: 'flex-end' },
  'center-left':   { justifyContent: 'center',     alignItems: 'flex-start' },
  'center':        { justifyContent: 'center',     alignItems: 'center' },
  'center-right':  { justifyContent: 'center',     alignItems: 'flex-end' },
  'bottom-left':   { justifyContent: 'flex-end',   alignItems: 'flex-start' },
  'bottom-center': { justifyContent: 'flex-end',   alignItems: 'center' },
  'bottom-right':  { justifyContent: 'flex-end',   alignItems: 'flex-end' },
}

let nextId = 0

export function useToast({ duration = 2000, position = 'bottom-right', margin = 1 } = {}) {
  const [items, setItems] = registerHook(() => createSignalRaw([]))

  useInterval(() => {
    const now = Date.now()
    setItems(prev => {
      const next = prev.filter(t => t.expires > now)
      return next.length === prev.length ? prev : next
    })
  }, 200)

  function toast(message) {
    const id = nextId++
    setItems(prev => [...prev, { id, message, expires: Date.now() + duration }])
  }

  const list = items()

  if (list.length > 0) {
    const pos = POSITIONS[position] || POSITIONS['bottom-right']
    const overlay = jsx('box', {
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        padding: margin,
        ...pos,
      },
      children: list.map(t =>
        jsx('text', {
          key: t.id,
          style: { inverse: true },
          children: ` ${t.message} `,
        })
      ),
    })
    registerOverlay(overlay, { fullscreen: true })
  }

  return toast
}
