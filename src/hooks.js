import { onCleanup, createSignal as rawCreateSignal, createSignalRaw } from './signal.js'
import { getContext, getTheme, registerHook, getInstanceLayout, getFrameStats } from './renderer.js'
import { setTitle } from './ansi.js'

export function useState(initial) {
  return registerHook(() => rawCreateSignal(initial))
}

export function useInput(handler) {
  const ref = registerHook(() => {
    const ctx = getContext()
    if (!ctx) throw new Error('useInput must be called within a mounted component')
    const state = { current: handler }
    const unsub = ctx.input.onKey((event) => state.current(event))
    onCleanup(unsub)
    return state
  })
  ref.current = handler
}

export function useMouse(handler) {
  const ref = registerHook(() => {
    const ctx = getContext()
    if (!ctx) throw new Error('useMouse must be called within a mounted component')
    const state = { current: handler }
    const unsub = ctx.input.onMouse((event) => state.current(event))
    onCleanup(unsub)
    return state
  })
  ref.current = handler
}

export function useResize(handler) {
  const ref = registerHook(() => {
    const ctx = getContext()
    if (!ctx) throw new Error('useResize must be called within a mounted component')
    const stream = ctx.stream
    const state = { current: handler }
    const onResize = () => state.current({ width: stream.columns, height: stream.rows })
    stream.on('resize', onResize)
    onCleanup(() => stream.off('resize', onResize))
    return state
  })
  ref.current = handler
}

export function useInterval(fn, ms) {
  const ref = registerHook(() => {
    const state = { current: fn }
    const id = setInterval(() => state.current(), ms)
    onCleanup(() => clearInterval(id))
    return state
  })
  ref.current = fn
}

export function useLayout() {
  return getInstanceLayout()
}

export function useTheme() {
  return getTheme()
}

export function useStdout() {
  const ctx = getContext()
  if (!ctx) throw new Error('useStdout must be called within a mounted component')
  return ctx.stream
}

export function useRepaint() {
  const ctx = getContext()
  if (!ctx) throw new Error('useRepaint must be called within a mounted component')
  return ctx.repaint
}

export function useFrameStats() {
  return getFrameStats()
}

export function useTitle(title) {
  const ctx = getContext()
  if (!ctx) throw new Error('useTitle must be called within a mounted component')
  ctx.stream.write(setTitle(title))
}

export function useTimeout(fn, ms) {
  const ref = registerHook(() => {
    const state = { current: fn }
    const id = setTimeout(() => state.current(), ms)
    onCleanup(() => clearTimeout(id))
    return state
  })
  ref.current = fn
}

export function useScrollDrag({ barX, barY, thumbHeight, trackHeight, maxOffset, scrollOffset, onScroll }) {
  const drag = registerHook(() => ({ active: false, startY: 0, startOffset: 0 }))

  useMouse((event) => {
    if (barX == null || thumbHeight <= 0) return

    if (event.action === 'press' && event.button === 'left' && event.x === barX) {
      if (event.y >= barY && event.y < barY + thumbHeight) {
        drag.active = true
        drag.startY = event.y
        drag.startOffset = scrollOffset
        event.stopPropagation()
      }
    }

    if (event.action === 'drag' && drag.active) {
      const dy = event.y - drag.startY
      const travel = Math.max(1, trackHeight - thumbHeight)
      const ratio = maxOffset / travel
      const newOffset = Math.max(0, Math.min(maxOffset, Math.round(drag.startOffset + dy * ratio)))
      onScroll(newOffset)
      event.stopPropagation()
    }

    if (event.action === 'release' && drag.active) {
      drag.active = false
    }
  })
}

export function useAsync(fn, { immediate = false } = {}) {
  const state = registerHook(() => {
    const [status, setStatus] = createSignalRaw('idle')
    const [data, setData] = createSignalRaw(null)
    const [error, setError] = createSignalRaw(null)
    let generation = 0

    function run(...args) {
      const gen = ++generation
      setStatus('loading')
      setData(null)
      setError(null)
      fn(...args).then(
        result => { if (gen === generation) { setData(result); setStatus('success') } },
        err => { if (gen === generation) { setError(err); setStatus('error') } },
      )
    }

    if (immediate) run()

    return { status, data, error, run }
  })

  return state
}
