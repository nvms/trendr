import { createSignalRaw, batch } from './signal.js'
import { registerHook } from './renderer.js'
import { onCleanup } from './signal.js'

const active = new Set()
let loopTimer = null

function startLoop() {
  if (loopTimer) return
  loopTimer = setInterval(tickAll, 1000 / 60)
}

function stopLoop() {
  if (loopTimer) {
    clearInterval(loopTimer)
    loopTimer = null
  }
}

function tickAll() {
  if (active.size === 0) {
    stopLoop()
    return
  }

  const dt = 1 / 60

  batch(() => {
    for (const anim of active) {
      const result = anim.interpolator(anim.current, anim.target, anim.velocity, dt)
      anim.current = result.value
      anim.velocity = result.velocity
      anim.setter(result.value)
      if (anim.onTick) anim.onTick(result.value)

      if (result.done) {
        anim.current = anim.target
        anim.setter(anim.target)
        if (anim.onTick) anim.onTick(anim.target)
        active.delete(anim)
      }
    }
  })

  if (active.size === 0) stopLoop()
}

export function animated(initial, interpolator) {
  const [get, set] = createSignalRaw(initial)

  const anim = {
    current: initial,
    target: initial,
    velocity: 0,
    interpolator,
    setter: set,
    onTick: null,
  }

  function setTarget(target) {
    if (target === anim.target && !active.has(anim)) return
    anim.target = target
    active.add(anim)
    startLoop()
  }

  function getValue() {
    return get()
  }

  getValue.set = setTarget
  getValue.get = get
  getValue.snap = (v) => {
    anim.target = v
    anim.current = v
    anim.velocity = 0
    active.delete(anim)
    set(v)
  }
  getValue.setInterpolator = (interp) => {
    anim.interpolator = interp
    anim.velocity = 0
  }
  getValue.onTick = (fn) => { anim.onTick = fn }
  getValue._anim = anim

  return getValue
}

export function useAnimated(initial, interpolator) {
  return registerHook(() => {
    const a = animated(initial, interpolator)
    onCleanup(() => {
      active.delete(a._anim)
    })
    return a
  })
}

// -- interpolators --

export function spring({ frequency = 2, damping = 0.3 } = {}) {
  const omega = frequency * 2 * Math.PI
  const zeta = damping

  return function stepSpring(current, target, velocity, dt) {
    const x0 = current - target
    const v0 = velocity

    let newX, newV

    if (zeta > 1) {
      // overdamped
      const za = -omega * (zeta + Math.sqrt(zeta * zeta - 1))
      const zb = -omega * (zeta - Math.sqrt(zeta * zeta - 1))
      const expA = Math.exp(za * dt)
      const expB = Math.exp(zb * dt)
      const c2 = (v0 - x0 * za) / (zb - za)
      const c1 = x0 - c2
      newX = c1 * expA + c2 * expB
      newV = c1 * za * expA + c2 * zb * expB
    } else if (zeta === 1) {
      // critically damped
      const expW = Math.exp(-omega * dt)
      newX = (x0 + (v0 + omega * x0) * dt) * expW
      newV = (v0 - (v0 + omega * x0) * omega * dt) * expW
    } else {
      // underdamped
      const alpha = omega * Math.sqrt(1 - zeta * zeta)
      const expW = Math.exp(-zeta * omega * dt)
      const cosA = Math.cos(alpha * dt)
      const sinA = Math.sin(alpha * dt)
      newX = expW * (x0 * cosA + ((v0 + zeta * omega * x0) / alpha) * sinA)
      newV = expW * (v0 * cosA - ((v0 * zeta * omega + omega * omega * x0) / alpha) * sinA)
    }

    const done = Math.abs(newX) < 0.01 && Math.abs(newV) < 0.01

    return { value: target + newX, velocity: newV, done }
  }
}

export function ease(durationMs, easingFn = easeOutCubic) {
  let elapsed = 0
  let startValue = null

  return function stepEase(current, target, velocity, dt) {
    if (startValue === null) startValue = current

    elapsed += dt * 1000
    const t = Math.min(1, elapsed / durationMs)
    const eased = easingFn(t)
    const value = startValue + (target - startValue) * eased

    if (t >= 1) {
      startValue = null
      elapsed = 0
      return { value: target, velocity: 0, done: true }
    }

    return { value, velocity: 0, done: false }
  }
}

export function decay({ deceleration = 0.998 } = {}) {
  return function stepDecay(current, target, velocity, dt) {
    const newVelocity = velocity * Math.pow(deceleration, dt * 1000)
    const newValue = current + newVelocity * dt

    if (Math.abs(newVelocity) < 0.1) {
      return { value: newValue, velocity: 0, done: true }
    }

    return { value: newValue, velocity: newVelocity, done: false }
  }
}

// -- easing functions --

export function linear(t) { return t }
export function easeInQuad(t) { return t * t }
export function easeOutQuad(t) { return t * (2 - t) }
export function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t }
export function easeInCubic(t) { return t * t * t }
export function easeOutCubic(t) { return (--t) * t * t + 1 }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1 }
export function easeOutElastic({ amplitude = 1, period = 0.3 } = {}) {
  const a = Math.max(1, amplitude)
  const s = period / (2 * Math.PI) * Math.asin(1 / a)
  return function (t) {
    if (t === 0 || t === 1) return t
    return a * Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / period) + 1
  }
}

export function easeOutBounce({ bounciness = 7.5625, threshold = 2.75 } = {}) {
  return function (t) {
    const inv = 1 / threshold
    if (t < inv) return bounciness * t * t
    if (t < 2 * inv) return bounciness * (t -= 1.5 / threshold) * t + 0.75
    if (t < 2.5 / threshold) return bounciness * (t -= 2.25 / threshold) * t + 0.9375
    return bounciness * (t -= 2.625 / threshold) * t + 0.984375
  }
}
