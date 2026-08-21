let currentEffect = null
let currentScope = null
let pendingEffects = null
let pendingSignals = null
let batchDepth = 0
let currentRuntime = null
let schedulerHook = null
const detachedRuntime = {
  requestFrame: () => schedulerHook?.(),
  signals: new Set(),
  hookRegistrar: null,
  renderTracker: null,
  disposed: false,
}

function getRuntime() {
  return currentRuntime ?? detachedRuntime
}

export function setSchedulerHook(fn) {
  schedulerHook = fn
}

export function createReactiveRuntime(requestFrame) {
  return { requestFrame, signals: new Set(), hookRegistrar: null, renderTracker: null, disposed: false }
}

export function runInReactiveRuntime(runtime, fn) {
  const prev = currentRuntime
  currentRuntime = runtime
  try {
    return fn()
  } finally {
    currentRuntime = prev
  }
}

export function disposeReactiveRuntime(runtime) {
  if (runtime.disposed) return
  runtime.disposed = true
  for (const signal of runtime.signals) signal.runtimes.delete(runtime)
  runtime.signals.clear()
  runtime.hookRegistrar = null
  runtime.renderTracker = null
}

export function startRenderTracking() {
  getRuntime().renderTracker = []
}

export function stopRenderTracking() {
  const runtime = getRuntime()
  const tracked = runtime.renderTracker ?? []
  runtime.renderTracker = null
  return tracked
}

export function setHookRegistrar(fn) {
  getRuntime().hookRegistrar = fn
}

function subscribeRuntime(signal) {
  const runtime = getRuntime()
  if (runtime.disposed || signal.runtimes.has(runtime)) return
  signal.runtimes.add(runtime)
  runtime.signals.add(signal)
}

function schedule(signal) {
  if (signal.runtimes.size === 0) schedulerHook?.()
  for (const runtime of signal.runtimes) {
    if (!runtime.disposed) runtime.requestFrame()
  }
}

export function createSignalRaw(value) {
  const subs = new Set()
  const signal = { runtimes: new Set() }

  function get() {
    if (currentEffect) {
      subs.add(currentEffect)
      currentEffect.dependencies.add(subs)
    }
    const runtime = getRuntime()
    if (runtime.renderTracker) runtime.renderTracker.push(get)
    subscribeRuntime(signal)
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
    if (batchDepth === 0) schedule(signal)
    else pendingSignals.add(signal)
  }

  return [get, set]
}

export function createSignal(value) {
  const registrar = getRuntime().hookRegistrar
  if (registrar) return registrar(() => createSignalRaw(value))
  return createSignalRaw(value)
}

export function createEffectRaw(fn) {
  const runtime = getRuntime()
  const effect = {
    fn,
    cleanup: null,
    disposed: false,
    dependencies: new Set(),
    unsubscribe() {
      for (const subs of effect.dependencies) subs.delete(effect)
      effect.dependencies.clear()
    },
    run() {
      if (effect.disposed) return
      return runInReactiveRuntime(runtime, () => {
        if (effect.cleanup) effect.cleanup()
        effect.unsubscribe()
        const prev = currentEffect
        currentEffect = effect
        try {
          const result = fn()
          effect.cleanup = typeof result === 'function' ? result : null
        } finally {
          currentEffect = prev
        }
      })
    },
  }

  effect.run()

  if (currentScope) currentScope.effects.push(effect)

  return effect
}

export function createEffect(fn) {
  const registrar = getRuntime().hookRegistrar
  if (registrar) return registrar(() => createEffectRaw(fn))
  return createEffectRaw(fn)
}

export function createMemo(fn) {
  const [get, set] = createSignal(undefined)
  createEffect(() => set(fn()))
  return get
}

export function batch(fn) {
  if (batchDepth === 0) {
    pendingEffects = new Set()
    pendingSignals = new Set()
  }
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const effects = [...pendingEffects]
      const signals = [...pendingSignals]
      pendingEffects = null
      pendingSignals = null
      for (const e of effects) e.run()
      for (const signal of signals) schedule(signal)
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
    effect.unsubscribe()
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
  const runtime = getRuntime()
  if (!runtime.disposed) runtime.requestFrame()
}
