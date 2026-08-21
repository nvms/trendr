import { onCleanup, createSignalRaw } from './signal.js'
import { getContext, getTheme, getCursor, registerHook, getInstanceLayout, getFrameStats, getCurrentHookOwner } from './renderer.js'
import { setTitle } from './ansi.js'

export function useInput(handler) {
  const ref = registerHook(() => {
    const ctx = getContext()
    if (!ctx) throw new Error('useInput must be called within a mounted component')
    const state = { current: handler }
    const unsub = ctx.input.onKey((event) => state.current(event), getCurrentHookOwner())
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
    const unsub = ctx.input.onMouse((event) => state.current(event), getCurrentHookOwner())
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
    const onResize = () => state.current(ctx.getViewportSize())
    stream.on('resize', onResize)
    onCleanup(() => stream.off('resize', onResize))
    return state
  })
  ref.current = handler
}

export function useInterval(fn, ms) {
  const state = registerHook(() => {
    const s = { current: fn, ms: undefined, id: null }
    onCleanup(() => {
      if (s.id !== null) clearInterval(s.id)
    })
    return s
  })
  state.current = fn
  if (state.ms !== ms) {
    if (state.id !== null) clearInterval(state.id)
    state.ms = ms
    state.id = ms == null ? null : setInterval(() => state.current(), ms)
  }
}

export function useLayout() {
  return getInstanceLayout()
}

// terminal-space hit testing: tests mouse coordinates against the component's
// final painted, clipped rectangle - unlike useLayout, which is logical
// content space and knows nothing of ancestor scroll offsets or clipping
export function useHitTest() {
  const state = registerHook(() => ({ owner: getCurrentHookOwner() }))
  return (x, y) => {
    const rect = state.owner?._paintedRect
    if (!rect) return false
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  }
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
  const state = registerHook(() => ({ last: undefined }))
  if (state.last !== title) {
    state.last = title
    ctx.stream.write(setTitle(title))
  }
}

export function useTimeout(fn, ms) {
  const state = registerHook(() => {
    const s = { current: fn, ms: undefined, id: null }
    onCleanup(() => {
      if (s.id !== null) clearTimeout(s.id)
    })
    return s
  })
  state.current = fn
  if (state.ms !== ms) {
    if (state.id !== null) clearTimeout(state.id)
    state.ms = ms
    state.id = ms == null ? null : setTimeout(() => {
      state.id = null
      state.current()
    }, ms)
  }
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

export function useCursor(propCursor, focused) {
  const config = getCursor(propCursor)

  const state = registerHook(() => {
    const [visible, setVisible] = createSignalRaw(true)
    let id = null

    function start(rate) {
      stop()
      id = setInterval(() => setVisible(v => !v), rate)
    }

    function stop() {
      if (id !== null) { clearInterval(id); id = null }
      setVisible(true)
    }

    onCleanup(stop)
    return { visible, setVisible, start, stop, blinking: false, rate: 0 }
  })

  const shouldBlink = config.blink && focused
  if (shouldBlink && (!state.blinking || state.rate !== config.rate)) {
    state.start(config.rate)
    state.blinking = true
    state.rate = config.rate
  } else if (!shouldBlink && state.blinking) {
    state.stop()
    state.blinking = false
  }

  if (!shouldBlink) state.setVisible(true)

  function reset() {
    if (!state.blinking) return
    state.setVisible(true)
    state.start(config.rate)
  }

  function cursorStyle() {
    if (!focused || !state.visible()) return null
    const s = {}
    if (config.color) s.color = config.color
    if (config.bg) s.bg = config.bg
    if (!config.color && !config.bg) s.inverse = true
    if (config.style === 'underline') { s.underline = true; delete s.inverse }
    return s
  }

  return { config, visible: state.visible, cursorStyle, reset }
}

export function useAsync(fn, { immediate = false } = {}) {
  const state = registerHook(() => {
    const [status, setStatus] = createSignalRaw('idle')
    const [data, setData] = createSignalRaw(null)
    const [error, setError] = createSignalRaw(null)
    let generation = 0
    let disposed = false

    const s = { status, data, error, fn }
    onCleanup(() => {
      disposed = true
      generation++
    })

    s.run = (...args) => {
      const gen = ++generation
      setStatus('loading')
      setData(null)
      setError(null)
      s.fn(...args).then(
        result => { if (!disposed && gen === generation) { setData(result); setStatus('success') } },
        err => { if (!disposed && gen === generation) { setError(err); setStatus('error') } },
      )
    }

    if (immediate) s.run()

    return s
  })

  state.fn = fn
  return state
}
