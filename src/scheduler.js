export function createScheduler({ fps = 60, onFrame } = {}) {
  const interval = Math.floor(1000 / fps)
  let lastFrame = 0
  let queued = false
  let running = false
  let pending = false
  let destroyed = false
  let timer = null

  function runFrame(now) {
    running = true
    lastFrame = now
    try {
      onFrame()
    } finally {
      running = false
    }
    if (pending) {
      pending = false
      requestFrame()
    }
  }

  function tick() {
    if (destroyed) return
    queued = false
    timer = null

    const now = Date.now()
    const elapsed = now - lastFrame

    if (elapsed < interval) {
      timer = setTimeout(tick, interval - elapsed)
      queued = true
      return
    }

    runFrame(now)
  }

  function requestFrame() {
    if (destroyed) return
    if (running) {
      pending = true
      return
    }
    if (queued) return
    queued = true
    setImmediate(tick)
  }

  function forceFrame() {
    if (destroyed || running) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    queued = false
    runFrame(Date.now())
  }

  function destroy() {
    destroyed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    queued = false
    pending = false
  }

  return { requestFrame, forceFrame, destroy }
}
