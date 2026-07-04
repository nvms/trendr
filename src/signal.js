let currentEffect = null
let currentScope = null
let pendingEffects = null
let batchDepth = 0
let schedulerHook = null
let hookRegistrar = null
let renderTracker = null

export function startRenderTracking() {
  renderTracker = []
}

export function stopRenderTracking() {
  const tracked = renderTracker
  renderTracker = null
  return tracked
}

export function setSchedulerHook(fn) {
  schedulerHook = fn
}

export function setHookRegistrar(fn) {
  hookRegistrar = fn
}

export function createSignalRaw(value) {
  const subs = new Set()

  function get() {
    if (currentEffect) subs.add(currentEffect)
    if (renderTracker) renderTracker.push(get)
    return value
  }

  function set(next) {
    const v = typeof next === 'function' ? next(value) : next
    if (v === value) return
    value = v
    if (batchDepth > 0) {
      for (const s of subs) {
        if (s.disposed) subs.delete(s)
        else pendingEffects.add(s)
      }
    } else {
      const snapshot = [...subs]
      for (const s of snapshot) {
        if (s.disposed) subs.delete(s)
        else s.run()
      }
    }
    if (schedulerHook && batchDepth === 0) schedulerHook()
  }

  return [get, set]
}

export function createSignal(value) {
  if (hookRegistrar) {
    return hookRegistrar(() => createSignalRaw(value))
  }
  return createSignalRaw(value)
}

export function createEffectRaw(fn) {
  const effect = {
    fn,
    cleanup: null,
    disposed: false,
    run() {
      if (effect.disposed) return
      if (effect.cleanup) effect.cleanup()
      const prev = currentEffect
      currentEffect = effect
      try {
        const result = fn()
        effect.cleanup = typeof result === 'function' ? result : null
      } finally {
        currentEffect = prev
      }
    },
  }

  effect.run()

  if (currentScope) currentScope.effects.push(effect)

  return effect
}

export function createEffect(fn) {
  if (hookRegistrar) {
    return hookRegistrar(() => createEffectRaw(fn))
  }
  return createEffectRaw(fn)
}

export function createMemo(fn) {
  const [get, set] = createSignal(undefined)
  createEffect(() => set(fn()))
  return get
}

export function batch(fn) {
  if (batchDepth === 0) pendingEffects = new Set()
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const effects = [...pendingEffects]
      pendingEffects = null
      for (const e of effects) e.run()
      if (schedulerHook) schedulerHook()
    }
  }
}

export function untrack(fn) {
  const prev = currentEffect
  currentEffect = null
  try {
    return fn()
  } finally {
    currentEffect = prev
  }
}

export function onCleanup(fn) {
  if (currentScope) currentScope.cleanups.push(fn)
  else if (currentEffect) {
    const prev = currentEffect.cleanup
    currentEffect.cleanup = prev
      ? () => { prev(); fn() }
      : fn
  }
}

export function createScope(fn) {
  const scope = {
    effects: [],
    children: [],
    cleanups: [],
    parent: currentScope,
  }
  if (currentScope) currentScope.children.push(scope)

  const prev = currentScope
  currentScope = scope
  try {
    fn()
  } finally {
    currentScope = prev
  }
  return scope
}

export function disposeScope(scope) {
  for (const child of scope.children) disposeScope(child)
  for (const effect of scope.effects) {
    effect.disposed = true
    if (effect.cleanup) effect.cleanup()
    effect.cleanup = null
  }
  for (const fn of scope.cleanups) fn()
  scope.effects.length = 0
  scope.children.length = 0
  scope.cleanups.length = 0
}

export function getCurrentScope() {
  return currentScope
}

export function runInScope(scope, fn) {
  const prev = currentScope
  currentScope = scope
  try {
    return fn()
  } finally {
    currentScope = prev
  }
}

export function notifyScheduler() {
  if (schedulerHook) schedulerHook()
}
