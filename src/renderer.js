import { createBuffer, clearBuffer, fillRect, writeText, dimBuffer, blitRect } from './buffer.js'
import { diff } from './diff.js'
import { computeLayout, resolveBorderEdges } from './layout.js'
import { Fragment } from './element.js'
import { createScheduler } from './scheduler.js'
import { createInputHandler } from './input.js'
import { setSchedulerHook, setHookRegistrar, createScope, disposeScope, onCleanup, startRenderTracking, stopRenderTracking } from './signal.js'
import { wordWrap, measureText, sliceVisible } from './wrap.js'
import * as ansi from './ansi.js'

let activeContext = null
let overlays = []
let lastFrameStats = { changed: 0, total: 0, bytes: 0, fps: 0 }
let frameTimeWindow = []
let lastFrameTimestamp = 0

export function getContext() {
  return activeContext
}

const DEFAULT_THEME = { accent: 'cyan' }

export function getTheme() {
  return activeContext?.theme ?? DEFAULT_THEME
}

export function getFrameStats() {
  return lastFrameStats
}

export function getInstanceLayout() {
  if (!currentHookOwner) return { x: 0, y: 0, width: 0, height: 0 }
  return currentHookOwner.layout ?? { x: 0, y: 0, width: 0, height: 0 }
}

export function registerOverlay(element, { backdrop, fullscreen } = {}) {
  if (!currentHookOwner) return
  overlays.push({ element, owner: currentHookOwner, backdrop, fullscreen })
}

const BORDER_CHARS = {
  single: { tl: '\u250c', tr: '\u2510', bl: '\u2514', br: '\u2518', h: '\u2500', v: '\u2502', tDown: '\u252c', tUp: '\u2534', tRight: '\u251c', tLeft: '\u2524' },
  double: { tl: '\u2554', tr: '\u2557', bl: '\u255a', br: '\u255d', h: '\u2550', v: '\u2551', tDown: '\u2566', tUp: '\u2569', tRight: '\u2560', tLeft: '\u2563' },
  round: { tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f', h: '\u2500', v: '\u2502', tDown: '\u252c', tUp: '\u2534', tRight: '\u251c', tLeft: '\u2524' },
  bold: { tl: '\u250f', tr: '\u2513', bl: '\u2517', br: '\u251b', h: '\u2501', v: '\u2503', tDown: '\u2533', tUp: '\u253b', tRight: '\u2523', tLeft: '\u252b' },
}

const TEXTURE_PRESETS = {
  'shade-light': '░',
  'shade-medium': '▒',
  'shade-heavy': '▓',
  'dots': '·',
  'cross': '╳',
  'grid': '┼',
  'dash': '╌',
}

function resolveTexture(texture) {
  if (!texture) return null
  return TEXTURE_PRESETS[texture] ?? texture
}

function resolveAttrs(style) {
  let attrs = 0
  if (style.bold) attrs |= ansi.BOLD
  if (style.dim) attrs |= ansi.DIM
  if (style.italic) attrs |= ansi.ITALIC
  if (style.underline) attrs |= ansi.UNDERLINE
  if (style.inverse) attrs |= ansi.INVERSE
  if (style.strikethrough) attrs |= ansi.STRIKETHROUGH
  return attrs
}

function paintBorder(buf, rect, borderStyle, fg, edges) {
  const chars = typeof borderStyle === 'string'
    ? (BORDER_CHARS[borderStyle] ?? BORDER_CHARS.single)
    : BORDER_CHARS.single

  const { x, y, width, height } = rect
  if (width < 2 || height < 2) return

  const cell = (ch) => ({ ch, fg: fg ?? null, bg: null, attrs: 0 })
  const { top, right, bottom, left } = edges

  if (top && left) buf.cells[y * buf.width + x] = cell(chars.tl)
  else if (top) buf.cells[y * buf.width + x] = cell(chars.h)
  else if (left) buf.cells[y * buf.width + x] = cell(chars.v)

  if (top && right) buf.cells[y * buf.width + x + width - 1] = cell(chars.tr)
  else if (top) buf.cells[y * buf.width + x + width - 1] = cell(chars.h)
  else if (right) buf.cells[y * buf.width + x + width - 1] = cell(chars.v)

  if (bottom && left) buf.cells[(y + height - 1) * buf.width + x] = cell(chars.bl)
  else if (bottom) buf.cells[(y + height - 1) * buf.width + x] = cell(chars.h)
  else if (left) buf.cells[(y + height - 1) * buf.width + x] = cell(chars.v)

  if (bottom && right) buf.cells[(y + height - 1) * buf.width + x + width - 1] = cell(chars.br)
  else if (bottom) buf.cells[(y + height - 1) * buf.width + x + width - 1] = cell(chars.h)
  else if (right) buf.cells[(y + height - 1) * buf.width + x + width - 1] = cell(chars.v)

  if (top) for (let col = x + 1; col < x + width - 1; col++)
    buf.cells[y * buf.width + col] = cell(chars.h)

  if (bottom) for (let col = x + 1; col < x + width - 1; col++)
    buf.cells[(y + height - 1) * buf.width + col] = cell(chars.h)

  if (left) for (let row = y + 1; row < y + height - 1; row++)
    buf.cells[row * buf.width + x] = cell(chars.v)

  if (right) for (let row = y + 1; row < y + height - 1; row++)
    buf.cells[row * buf.width + x + width - 1] = cell(chars.v)
}

function paintJunctions(buf, rect, borderStyle, fg, children, edges) {
  if (!children) return
  const chars = typeof borderStyle === 'string'
    ? (BORDER_CHARS[borderStyle] ?? BORDER_CHARS.single)
    : BORDER_CHARS.single
  const cell = (ch) => ({ ch, fg: fg ?? null, bg: null, attrs: 0 })

  for (const child of children) {
    const leaf = child._resolved ? child._resolved : child
    const divider = leaf?.props?.style?._divider
    if (!divider) continue
    const cl = leaf._layout
    if (!cl) continue

    if (divider === 'vertical') {
      if (cl.x >= rect.x && cl.x < rect.x + rect.width) {
        if (edges.top) buf.cells[rect.y * buf.width + cl.x] = cell(chars.tDown)
        if (edges.bottom) buf.cells[(rect.y + rect.height - 1) * buf.width + cl.x] = cell(chars.tUp)
      }
    } else if (divider === 'horizontal') {
      if (cl.y >= rect.y && cl.y < rect.y + rect.height) {
        if (edges.left) buf.cells[cl.y * buf.width + rect.x] = cell(chars.tRight)
        if (edges.right) buf.cells[cl.y * buf.width + rect.x + rect.width - 1] = cell(chars.tLeft)
      }
    }
  }
}

function findContentRect(node) {
  if (!node?._layout) return null
  const style = node.props?.style ?? {}
  if (style.border) return node._layout
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const found = findContentRect(child)
      if (found) return found
    }
  }
  if (node._resolved) return findContentRect(node._resolved)
  return null
}

function clearOverlayRect(overlayTree, buf) {
  const rect = findContentRect(overlayTree)
  if (!rect) return
  fillRect(buf, rect.x, rect.y, rect.width, rect.height, ' ', null, null, 0)
}

function findScrollContentHeight(node) {
  if (!node) return null
  if (node._contentHeight != null) return node._contentHeight
  if (node._resolved) return findScrollContentHeight(node._resolved)
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const h = findScrollContentHeight(child)
      if (h != null) return h
    }
  }
  return null
}

function clipRect(a, b) {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.width, b.x + b.width)
  const bot = Math.min(a.y + a.height, b.y + b.height)
  return { x, y, width: Math.max(0, r - x), height: Math.max(0, bot - y) }
}

function propagateDirty(node) {
  if (!node) return false
  if (node._resolved) {
    const childDirty = propagateDirty(node._resolved)
    const inst = node._instance
    if (inst) {
      inst._subtreeDirty = inst._dirty || childDirty
      return inst._subtreeDirty
    }
    return childDirty
  }
  if (node._resolvedChildren) {
    let anyDirty = false
    for (const child of node._resolvedChildren) {
      if (propagateDirty(child)) anyDirty = true
    }
    return anyDirty
  }
  return false
}

function layoutEqual(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function paintTree(node, buf, clip, offset, prevBuf) {
  if (!node) return

  if (node._resolved) {
    const inst = node._instance
    if (prevBuf && inst && !inst._subtreeDirty) {
      const layout = node._resolved?._layout ?? node._layout
      if (layout && layoutEqual(layout, inst._lastLayout)) {
        blitRect(prevBuf, buf, layout.x, layout.y, layout.width, layout.height)
        return
      }
    }
    if (inst) inst._lastLayout = node._resolved?._layout ?? node._layout
    paintTree(node._resolved, buf, clip, offset, prevBuf)
    return
  }

  if (node.type === Fragment) {
    if (node._resolvedChildren) {
      for (const child of node._resolvedChildren) paintTree(child, buf, clip, offset, prevBuf)
    }
    return
  }

  const rawLayout = node._layout
  if (!rawLayout || rawLayout.width <= 0 || rawLayout.height <= 0) return

  const layout = offset
    ? { x: rawLayout.x + offset.x, y: rawLayout.y + offset.y, width: rawLayout.width, height: rawLayout.height }
    : rawLayout

  const clipped = clip ? clipRect(layout, clip) : layout
  if (clipped.width <= 0 || clipped.height <= 0) return

  const style = node.props?.style ?? {}
  const attrs = resolveAttrs(style)

  if (node.type === 'text') {
    const text = extractText(node)
    if (!text) return

    const truncate = style.overflow === 'truncate'
    const wrap = style.overflow !== 'nowrap' && !truncate

    if (wrap) {
      const lines = wordWrap(text, layout.width)
      for (let i = 0; i < lines.length && i < layout.height; i++) {
        const rowY = layout.y + i
        if (rowY < clipped.y || rowY >= clipped.y + clipped.height) continue
        writeText(buf, clipped.x, rowY, lines[i].slice(clipped.x - layout.x), style.color, style.bg, attrs, clipped.width)
      }
    } else {
      let line = text.replace(/\n/g, ' ')
      if (truncate && measureText(line) > layout.width && layout.width > 3) {
        line = sliceVisible(line, layout.width - 1) + '\u2026'
      }
      if (layout.y >= clipped.y && layout.y < clipped.y + clipped.height) {
        writeText(buf, clipped.x, layout.y, line.slice(clipped.x - layout.x), style.color, style.bg, attrs, clipped.width)
      }
    }
    return
  }

  if (style.bg || style.texture) {
    const ch = resolveTexture(style.texture) ?? ' '
    const fg = style.textureColor ?? null
    fillRect(buf, clipped.x, clipped.y, clipped.width, clipped.height, ch, fg, style.bg, 0)
  }

  if (style.border) {
    const edges = resolveBorderEdges(style)
    paintBorder(buf, layout, style.border, style.borderColor, edges)
    paintJunctions(buf, layout, style.border, style.borderColor, node._resolvedChildren, edges)
  }

  const childClip = clip ? clipRect(layout, clip) : layout

  let childOffset = offset
  if (style.overflow === 'scroll') {
    const scrollY = style.scrollOffset ?? 0
    childOffset = { x: offset?.x ?? 0, y: (offset?.y ?? 0) - scrollY }
  }

  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      paintTree(child, buf, childClip, childOffset, prevBuf)
    }
  }
}

function extractText(node) {
  if (node == null || node === true || node === false) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  const children = node.props?.children
  if (children == null || children === true || children === false) return ''
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(c => extractText(c)).join('')
  return ''
}

function flattenChildren(children) {
  if (children == null || children === true || children === false) return []
  if (!Array.isArray(children)) return [children]
  const result = []
  for (const child of children) {
    if (child == null || child === true || child === false) continue
    if (Array.isArray(child)) result.push(...flattenChildren(child))
    else result.push(child)
  }
  return result
}

// component instances track the split between setup (runs once)
// and render (runs every frame)
//
// on first call, the component body executes fully - hooks register,
// signals are created, and the returned JSX is captured.
// the component function is wrapped so that on subsequent calls,
// only the JSX-producing part re-executes (by re-calling the component),
// but hooks detect they're already registered and skip.

// simpler model: each component is called once during mount.
// it returns a render function (a closure that produces JSX).
// on each frame, we call the render functions to get fresh trees.
//
// convention: components return either JSX directly (for static content)
// or we wrap them so the return value is always a function.

// actually simplest: components are just functions that return JSX.
// we call them once at mount time within a scope (hooks register).
// we store a reference to the component + props + scope.
// on each frame, we re-call the component function to get fresh JSX.
// BUT hooks must not re-register. hooks track their own registration
// using the scope.

// ok, final approach. the component model:
//
// 1. each component function is called once. this is the "setup" call.
//    during setup, hooks (useInput, useInterval) register side effects
//    in the current scope. the component also returns JSX.
//
// 2. we extract the "render" part by having the component return a
//    function. if it returns JSX directly, we treat the whole component
//    as the render function and call it on each frame - but hooks must
//    be idempotent.
//
// since requiring users to return functions is a bad API, let's make
// hooks idempotent. each hook checks a per-scope registry to see
// if it's already been called with the same identity.

let hookIndex = 0
let currentHookOwner = null

export function startHookTracking(owner) {
  currentHookOwner = owner
  hookIndex = 0
  setHookRegistrar(registerHook)
}

export function endHookTracking() {
  currentHookOwner = null
  hookIndex = 0
  setHookRegistrar(null)
}

export function registerHook(setupFn) {
  if (!currentHookOwner) {
    return setupFn()
  }

  const owner = currentHookOwner
  if (!owner.hooks) owner.hooks = []
  const idx = hookIndex++

  if (idx >= owner.hooks.length) {
    const result = setupFn()
    owner.hooks.push(result)
    return result
  }

  return owner.hooks[idx]
}

// resolve tree with component instance caching.
// instances are keyed by component function + occurrence index,
// so multiple instances of the same component each get their own state.

function shallowPropsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (k === 'children') continue
    if (a[k] !== b[k]) return false
  }
  return true
}

function isInstanceClean(instance, newProps) {
  if (!instance._trackedSignals) return false
  if (!shallowPropsEqual(instance._lastProps, newProps)) return false
  const sigs = instance._trackedSignals
  const vals = instance._signalValues
  for (let i = 0; i < sigs.length; i++) {
    if (sigs[i]() !== vals[i]) return false
  }
  return true
}

function snapshotSignals(instance, signals) {
  instance._trackedSignals = signals
  instance._signalValues = signals.map(g => g())
}

function resolveForFrame(element, parent, instances, counters, visited) {
  if (element == null || typeof element === 'boolean') return null

  if (typeof element === 'string' || typeof element === 'number') {
    return {
      type: 'text',
      props: { children: String(element) },
      key: null,
      _parent: parent,
      _layout: null,
      _resolved: null,
      _resolvedChildren: null,
    }
  }

  const node = {
    type: element.type,
    props: element.props ?? {},
    key: element.key,
    _parent: parent,
    _layout: null,
    _resolved: null,
    _resolvedChildren: null,
  }

  if (typeof element.type === 'function') {
    const fn = element.type
    const count = counters.get(fn) ?? 0
    counters.set(fn, count + 1)

    const instanceKey = element.key != null ? `${fn.name}:key:${element.key}` : `${fn.name}:${count}`
    if (visited) visited.add(instanceKey)
    let instance = instances.get(instanceKey)

    if (!instance) {
      let result
      instance = { scope: null, fn, hooks: [], node: null, layout: null, _dirty: true }
      instances.set(instanceKey, instance)
      instance.scope = createScope(() => {
        startHookTracking(instance)
        startRenderTracking()
        result = fn(element.props ?? {})
        const signals = stopRenderTracking()
        endHookTracking()
        snapshotSignals(instance, signals)
        instance._lastProps = element.props
      })
      node._resolved = resolveForFrame(result, node, instances, counters, visited)
    } else {
      const clean = isInstanceClean(instance, element.props)
      instance._dirty = !clean

      startHookTracking(instance)
      startRenderTracking()
      const result = fn(element.props ?? {})
      const signals = stopRenderTracking()
      endHookTracking()
      snapshotSignals(instance, signals)
      instance._lastProps = element.props

      node._resolved = resolveForFrame(result, node, instances, counters, visited)
    }

    node._instance = instance
    instance.node = node
    return node
  }

  if (element.type === Fragment) {
    const children = flattenChildren(element.props?.children)
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances, counters, visited)).filter(Boolean)
    return node
  }

  const children = flattenChildren(element.props?.children)
  if (children.length > 0) {
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances, counters, visited)).filter(Boolean)
  }

  return node
}

export function mount(rootComponent, { stream, stdin, title, theme } = {}) {
  const out = stream ?? process.stdout
  const inp = stdin ?? process.stdin

  let width = out.columns ?? 80
  let height = out.rows ?? 24

  let prev = createBuffer(width, height)
  let curr = createBuffer(width, height)

  const input = createInputHandler(inp)
  const ctx = { stream: out, input, stdin: inp, theme: { ...DEFAULT_THEME, ...theme } }
  activeContext = ctx

  // component instance cache persists across frames
  // maps instanceKey -> { scope, fn, hooks }
  const instances = new Map()

  function frame() {
    const prevCtx = activeContext
    activeContext = ctx
    overlays = []

    clearBuffer(curr)

    // counters reset each frame so occurrence indices are stable
    const counters = new Map()
    const visited = new Set()
    const element = { type: rootComponent, props: {}, key: null }
    const tree = resolveForFrame(element, null, instances, counters, visited)

    computeLayout(tree, { x: 0, y: 0, width, height })

    let layoutChanged = false
    for (const inst of instances.values()) {
      const rect = inst.node?._availableRect ?? inst.node?._layout
      if (!rect) continue
      const ch = findScrollContentHeight(inst.node)
      const next = ch != null ? { ...rect, contentHeight: ch } : rect
      const prev = inst.layout
      if (!prev || prev.width !== next.width || prev.height !== next.height || prev.contentHeight !== next.contentHeight) {
        layoutChanged = true
      }
      inst.layout = next
    }

    // layout values changed - re-resolve so components see updated useLayout()
    if (layoutChanged) {
      counters.clear()
      visited.clear()
      const tree2 = resolveForFrame(element, null, instances, counters, visited)
      computeLayout(tree2, { x: 0, y: 0, width, height })
      for (const inst of instances.values()) {
        const rect = inst.node?._availableRect ?? inst.node?._layout
        if (!rect) continue
        const ch = findScrollContentHeight(inst.node)
        inst.layout = ch != null ? { ...rect, contentHeight: ch } : rect
        inst._dirty = true
      }
      propagateDirty(tree2)
      paintTree(tree2, curr, null, null, null)
    } else {
      propagateDirty(tree)
      paintTree(tree, curr, null, null, prev)
    }

    for (const { element: overlayEl, owner, backdrop, fullscreen } of overlays) {
      if (backdrop) dimBuffer(curr)

      const overlayTree = resolveForFrame(overlayEl, null, instances, counters, visited)
      if (overlayTree) {
        if (backdrop || fullscreen) {
          computeLayout(overlayTree, { x: 0, y: 0, width, height })
        } else {
          const anchor = owner.node?._layout ?? owner.layout ?? { x: 0, y: 0, width: 0, height: 0 }
          computeLayout(overlayTree, {
            x: anchor.x,
            y: anchor.y + 1,
            width: width - anchor.x,
            height: height - anchor.y - 1,
          })
        }
        clearOverlayRect(overlayTree, curr)
        paintTree(overlayTree, curr)
      }
    }

    for (const [key, inst] of instances) {
      if (!visited.has(key)) {
        disposeScope(inst.scope)
        instances.delete(key)
      }
    }

    activeContext = prevCtx

    const { output, changed } = diff(prev, curr)
    if (changed > 0) {
      out.write(ansi.hideCursor)
      out.write(output)
    }

    const now = performance.now()
    if (lastFrameTimestamp > 0) {
      frameTimeWindow.push(now - lastFrameTimestamp)
      if (frameTimeWindow.length > 30) frameTimeWindow.shift()
    }
    lastFrameTimestamp = now
    const avgMs = frameTimeWindow.length > 0 ? frameTimeWindow.reduce((a, b) => a + b, 0) / frameTimeWindow.length : 16.67
    lastFrameStats = { changed, total: width * height, bytes: output ? Buffer.byteLength(output) : 0, fps: Math.round(1000 / avgMs) }

    const tmp = prev
    prev = curr
    curr = tmp
  }

  const scheduler = createScheduler({
    fps: 60,
    onFrame: frame,
  })

  setSchedulerHook(scheduler.requestFrame)

  out.write(ansi.altScreen + ansi.hideCursor + ansi.clearScreen + (title ? ansi.setTitle(title) : ''))
  if (inp.isTTY && inp.setRawMode) inp.setRawMode(true)

  frame()
  scheduler.requestFrame()

  const onResize = () => {
    width = out.columns ?? 80
    height = out.rows ?? 24
    prev = createBuffer(width, height)
    curr = createBuffer(width, height)
    out.write(ansi.clearScreen)
    scheduler.forceFrame()
  }
  out.on('resize', onResize)

  input.onKey((event) => {
    if (event.key === 'c' && event.ctrl) {
      unmount()
      process.exit(0)
    }
  })

  let unmounted = false

  function unmount() {
    if (unmounted) return
    unmounted = true

    scheduler.destroy()
    input.detach()
    out.off('resize', onResize)
    process.off('exit', onExit)

    for (const inst of instances.values()) {
      disposeScope(inst.scope)
    }
    instances.clear()

    out.write(ansi.sgrReset + ansi.showCursor + ansi.exitAltScreen)
    if (inp.isTTY && inp.setRawMode) inp.setRawMode(false)
    activeContext = null
    setSchedulerHook(null)
  }

  function onExit() {
    unmount()
  }

  process.on('exit', onExit)

  return { unmount }
}
