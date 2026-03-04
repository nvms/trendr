export function createScheduler({ fps = 60, onFrame } = {}) {
  const interval = Math.floor(1000 / fps)
  let lastFrame = 0
  let queued = false
  let running = false
  let timer = null

  function tick() {
    queued = false
    timer = null

    const now = Date.now()
    const elapsed = now - lastFrame

    if (elapsed < interval) {
      timer = setTimeout(tick, interval - elapsed)
      queued = true
      return
    }

    running = true
    lastFrame = now
    onFrame()
    running = false
  }

  function requestFrame() {
    if (queued || running) return
    queued = true
    setImmediate(tick)
  }

  function forceFrame() {
    if (running) return
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    queued = false
    running = true
    lastFrame = Date.now()
    onFrame()
    running = false
  }

  function destroy() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    queued = false
  }

  return { requestFrame, forceFrame, destroy }
}
