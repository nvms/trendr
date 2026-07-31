import { createBuffer, clearBuffer, fillRect, writeText, dimBuffer, dimRect, blitRect } from './buffer.js'
import { diff } from './diff.js'
import { openUrl } from './open-url.js'
import { bufferToLines } from './serialize.js'
import { computeLayout, resolveBorderEdges, intrinsicHeight } from './layout.js'
import { Fragment } from './element.js'
import { createScheduler } from './scheduler.js'
import { createInputHandler } from './input.js'
import { setSchedulerHook, setHookRegistrar, createScope, disposeScope, runInScope, onCleanup, startRenderTracking, stopRenderTracking } from './signal.js'
import { wordWrap, wordWrapMarked, measureText, sliceVisible, sliceVisibleRange } from './wrap.js'
import * as ansi from './ansi.js'

let activeContext = null
let overlays = []
let lastFrameStats = { changed: 0, total: 0, bytes: 0, fps: 0 }
let frameTimeWindow = []
let lastFrameTimestamp = 0

export function getContext() {
  return activeContext
}

const DEFAULT_CURSOR = { blink: false, rate: 530, style: 'block' }
const DEFAULT_THEME = { accent: 'cyan', accentText: 'black', muted: 'gray' }

const enableBracketedPaste = '\x1b[?2004h'
const disableBracketedPaste = '\x1b[?2004l'

export function getTheme() {
  return activeContext?.theme ?? DEFAULT_THEME
}

export function getCursor(propCursor) {
  const themeCursor = activeContext?.theme?.cursor
  if (!propCursor && !themeCursor) return DEFAULT_CURSOR
  if (propCursor === true) return { ...DEFAULT_CURSOR, blink: true, ...themeCursor }
  return { ...DEFAULT_CURSOR, ...themeCursor, ...propCursor }
}

export function getFrameStats() {
  return lastFrameStats
}

export function getInstanceLayout() {
  if (!currentHookOwner) return { x: 0, y: 0, width: 0, height: 0 }
  if (!currentHookOwner.layout) currentHookOwner.layout = { x: 0, y: 0, width: 0, height: 0 }
  return currentHookOwner.layout
}

export function registerOverlay(element, { backdrop, fullscreen, capture } = {}) {
  if (!currentHookOwner) return
  overlays.push({ element, owner: currentHookOwner, backdrop, fullscreen, capture })
}

export function getCurrentHookOwner() {
  return currentHookOwner
}

// instances created while an overlay tree resolves are tagged with the overlay's
// owning instance, so input dispatch can tell whether a handler lives inside a
// capturing overlay's subtree (following the chain for overlays inside overlays)
const overlayContexts = new WeakMap()
let resolvingOverlayOwner = null

function captureOwnerFrom(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].capture) return list[i].owner
  }
  return null
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
  if (style.copyIgnore) attrs |= ansi.COPY_IGNORE
  return attrs
}

function paintBorder(buf, rect, borderStyle, fg, edges) {
  const chars = typeof borderStyle === 'string'
    ? (BORDER_CHARS[borderStyle] ?? BORDER_CHARS.single)
    : BORDER_CHARS.single

  const { x, y, width, height } = rect
  if (width < 1 || height < 1) return

  const cell = (ch) => ({ ch, fg: fg ?? null, bg: null, attrs: 0 })
  const { top, right, bottom, left } = edges

  const x2 = x + width - 1
  const y2 = y + height - 1
  const singleRow = height === 1
  const singleCol = width === 1

  // top-left corner
  if (top && left) buf.cells[y * buf.width + x] = cell(singleRow || singleCol ? (singleRow && singleCol ? chars.v : singleRow ? chars.h : chars.v) : chars.tl)
  else if (top && !singleCol) buf.cells[y * buf.width + x] = cell(chars.h)
  else if (left) buf.cells[y * buf.width + x] = cell(chars.v)

  // top-right corner
  if (!singleCol) {
    if (top && right) buf.cells[y * buf.width + x2] = cell(singleRow ? chars.h : chars.tr)
    else if (top) buf.cells[y * buf.width + x2] = cell(chars.h)
    else if (right) buf.cells[y * buf.width + x2] = cell(chars.v)
  }

  // bottom-left corner
  if (!singleRow) {
    if (bottom && left) buf.cells[y2 * buf.width + x] = cell(singleCol ? chars.v : chars.bl)
    else if (bottom && !singleCol) buf.cells[y2 * buf.width + x] = cell(chars.h)
    else if (left) buf.cells[y2 * buf.width + x] = cell(chars.v)
  }

  // bottom-right corner
  if (!singleRow && !singleCol) {
    if (bottom && right) buf.cells[y2 * buf.width + x2] = cell(chars.br)
    else if (bottom) buf.cells[y2 * buf.width + x2] = cell(chars.h)
    else if (right) buf.cells[y2 * buf.width + x2] = cell(chars.v)
  }

  // top edge
  if (top) for (let col = x + 1; col < x2; col++)
    buf.cells[y * buf.width + col] = cell(chars.h)

  // bottom edge
  if (bottom && !singleRow) for (let col = x + 1; col < x2; col++)
    buf.cells[y2 * buf.width + col] = cell(chars.h)

  // left edge
  if (left) for (let row = y + 1; row < y2; row++)
    buf.cells[row * buf.width + x] = cell(chars.v)

  // right edge
  if (right) for (let row = y + 1; row < y2; row++)
    buf.cells[row * buf.width + x2] = cell(chars.v)
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
  if (node.type === 'text' || style.bg || style.inverse) return node._layout

  let bounds = null
  const merge = (rect) => {
    if (!rect) return
    if (!bounds) { bounds = { ...rect }; return }
    const r = Math.max(bounds.x + bounds.width, rect.x + rect.width)
    const b = Math.max(bounds.y + bounds.height, rect.y + rect.height)
    bounds.x = Math.min(bounds.x, rect.x)
    bounds.y = Math.min(bounds.y, rect.y)
    bounds.width = r - bounds.x
    bounds.height = b - bounds.y
  }

  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) merge(findContentRect(child))
  }
  if (node._resolved) merge(findContentRect(node._resolved))
  return bounds
}

function clearOverlayRect(overlayTree, buf) {
  const rect = findContentRect(overlayTree)
  if (!rect) return
  fillRect(buf, rect.x, rect.y, rect.width, rect.height, ' ', null, null, 0)
}

function findScrollContentSize(node, field) {
  if (!node) return null
  if (node[field] != null) return node[field]
  if (node._resolved) return findScrollContentSize(node._resolved, field)
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const size = findScrollContentSize(child, field)
      if (size != null) return size
    }
  }
  return null
}

function findScrollChildHeights(node) {
  if (!node) return null
  if (node._childHeights) return node._childHeights
  if (node._resolved) return findScrollChildHeights(node._resolved)
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const h = findScrollChildHeights(child)
      if (h != null) return h
    }
  }
  return null
}

function updateOverlayLayouts(node) {
  if (!node) return
  if (node._instance) {
    const rect = node._availableRect ?? node._layout
    if (rect) {
      const ch = findScrollContentSize(node, '_contentHeight')
      const cw = findScrollContentSize(node, '_contentWidth')
      if (!node._instance.layout) node._instance.layout = { x: 0, y: 0, width: 0, height: 0 }
      const target = node._instance.layout
      target.x = rect.x
      target.y = rect.y
      target.width = rect.width
      target.height = rect.height
      target.contentHeight = ch
      target.contentWidth = cw
      target.childHeights = findScrollChildHeights(node)
    }
  }
  if (node._resolved) updateOverlayLayouts(node._resolved)
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) updateOverlayLayouts(child)
  }
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

function applySelectionHighlight(buf, sel) {
  const lastY = Math.min(sel.ey, buf.height - 1)
  for (let y = Math.max(0, sel.sy); y <= lastY; y++) {
    const from = y === sel.sy ? Math.max(0, sel.sx) : 0
    const to = y === sel.ey ? Math.min(sel.ex, buf.width - 1) : buf.width - 1
    const base = y * buf.width
    for (let x = from; x <= to; x++) {
      const c = buf.cells[base + x]
      buf.cells[base + x] = { ...c, attrs: c.attrs ^ ansi.INVERSE }
    }
  }
}

function applyLinkHover(buf, url, color) {
  if (!url) return
  for (let i = 0; i < buf.cells.length; i++) {
    const cell = buf.cells[i]
    if (cell.link === url) buf.cells[i] = { ...cell, fg: color }
  }
}

function paintTree(node, buf, clip, offset, prevBuf) {
  if (!node) return

  if (node._resolved) {
    const inst = node._instance
    // painted terminal-space geometry for useHitTest: logical layout plus
    // accumulated ancestor paint offset, intersected with the active clip.
    // recorded before the blit fast-path so clean subtrees stay hit-testable
    if (inst) {
      const lay = node._resolved?._layout ?? node._layout
      if (lay && lay.width > 0 && lay.height > 0) {
        const painted = offset
          ? { x: lay.x + offset.x, y: lay.y + offset.y, width: lay.width, height: lay.height }
          : lay
        const vis = clip ? clipRect(painted, clip) : painted
        inst._paintedRect = vis.width > 0 && vis.height > 0
          ? { x: vis.x, y: vis.y, width: vis.width, height: vis.height }
          : null
      } else {
        inst._paintedRect = null
      }
    }
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
    const clip = style.overflow === 'clip'
    const wrap = style.overflow !== 'nowrap' && !truncate && !clip

    const leftClip = clipped.x - layout.x

    if (wrap) {
      const { lines, soft } = wordWrapMarked(text, layout.width)
      for (let i = 0; i < lines.length && i < layout.height; i++) {
        const rowY = layout.y + i
        if (rowY < clipped.y || rowY >= clipped.y + clipped.height) continue
        if (soft[i] && rowY >= 0 && rowY < buf.height) buf.softWrap[rowY] = 1
        const line = leftClip > 0 ? sliceVisibleRange(lines[i], leftClip, Infinity) : lines[i]
        writeText(buf, clipped.x, rowY, line, style.color, style.bg, attrs, clipped.width)
      }
    } else {
      let line = text.replace(/\n/g, ' ')
      if (truncate && measureText(line) > layout.width && layout.width > 3) {
        line = sliceVisible(line, layout.width - 1) + '\u2026'
      }
      if (layout.y >= clipped.y && layout.y < clipped.y + clipped.height) {
        if (leftClip > 0) line = sliceVisibleRange(line, leftClip, Infinity)
        writeText(buf, clipped.x, layout.y, line, style.color, style.bg, attrs, clipped.width)
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
  let childPrevBuf = prevBuf
  if (style.overflow === 'scroll') {
    const scrollX = style.scrollOffsetX ?? 0
    const scrollY = style.scrollOffset ?? 0
    childOffset = { x: (offset?.x ?? 0) - scrollX, y: (offset?.y ?? 0) - scrollY }
    childPrevBuf = null
  }

  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      paintTree(child, buf, childClip, childOffset, childPrevBuf)
    }
  }

  // style.dim on a box dims its whole painted region after children render:
  // the scoped sibling of the overlay backdrop's full-buffer dim
  if (style.dim) dimRect(buf, clipped.x, clipped.y, clipped.width, clipped.height)
}

function extractText(node, parentCtx) {
  if (node == null || node === true || node === false) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)

  const children = node.props?.children
  if (children == null || children === true || children === false) return ''
  if (typeof children === 'string' && !node.props?.style) return children
  if (typeof children === 'number' && !node.props?.style) return String(children)

  const style = node.props?.style
  const ownAttrs = style ? resolveAttrs(style) : 0
  const hasOwnStyle = style && (style.color != null || style.bg != null || ownAttrs)

  const myCtx = hasOwnStyle ? {
    fg: style.color ?? parentCtx?.fg ?? null,
    bg: style.bg ?? parentCtx?.bg ?? null,
    attrs: ownAttrs || parentCtx?.attrs || 0,
  } : (parentCtx || null)

  let inner
  if (typeof children === 'string') inner = children
  else if (typeof children === 'number') inner = String(children)
  else if (Array.isArray(children)) inner = children.map(c => extractText(c, myCtx)).join('')
  else inner = ''

  if (parentCtx !== undefined && hasOwnStyle) {
    const prefix = ansi.sgr(myCtx.fg, myCtx.bg, myCtx.attrs)
    const suffix = parentCtx ? ansi.sgr(parentCtx.fg, parentCtx.bg, parentCtx.attrs) : ansi.sgrReset
    return prefix + inner + suffix
  }

  return inner
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
  const owner = currentHookOwner
  const count = hookIndex
  currentHookOwner = null
  hookIndex = 0
  setHookRegistrar(null)
  if (owner) {
    if (owner._hookCount == null) {
      owner._hookCount = count
    } else if (owner._hookCount !== count) {
      const name = owner.fn?.name || 'anonymous component'
      throw new Error(
        `hook count changed between renders in ${name} (${owner._hookCount} then ${count}). ` +
        'hooks must be called unconditionally, in the same order, on every render'
      )
    }
  }
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
// instances are keyed by component function identity + occurrence index,
// so multiple instances of the same component each get their own state.

let nextFnId = 1
const fnIds = new WeakMap()

function getFnId(fn) {
  let id = fnIds.get(fn)
  if (id === undefined) {
    id = nextFnId++
    fnIds.set(fn, id)
  }
  return id
}

// structural equality over props, including children element trees. anything
// that can't be proven equal (fresh closures, exotic values) counts as changed,
// so unprovable cases fall back to a repaint instead of a stale blit
function propValueEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const aArr = Array.isArray(a)
  if (aArr !== Array.isArray(b)) return false
  if (aArr) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!propValueEqual(a[i], b[i])) return false
    }
    return true
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!(k in b)) return false
    if (!propValueEqual(a[k], b[k])) return false
  }
  return true
}

function isInstanceClean(instance, newProps) {
  if (!instance._trackedSignals) return false
  if (!propValueEqual(instance._lastProps ?? null, newProps ?? null)) return false
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

function resolveForFrame(element, parent, instances, counters, visited, scope) {
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
    const fnKey = `${fn.name || 'anon'}#${getFnId(fn)}`
    const counterKey = `${scope}/${fnKey}`
    const count = counters.get(counterKey) ?? 0
    counters.set(counterKey, count + 1)

    const instanceKey = element.key != null ? `${scope}/${fnKey}:key:${element.key}` : `${scope}/${fnKey}:${count}`
    if (visited) visited.add(instanceKey)
    let instance = instances.get(instanceKey)

    if (instance && instance.fn !== fn) {
      disposeScope(instance.scope)
      instances.delete(instanceKey)
      instance = undefined
    }

    if (!instance) {
      let result
      instance = { scope: null, fn, hooks: [], node: null, layout: null, _dirty: true }
      instances.set(instanceKey, instance)
      if (resolvingOverlayOwner) overlayContexts.set(instance, resolvingOverlayOwner)
      instance.scope = createScope(() => {
        startHookTracking(instance)
        startRenderTracking()
        result = fn(element.props ?? {})
        const signals = stopRenderTracking()
        endHookTracking()
        snapshotSignals(instance, signals)
        instance._lastProps = element.props
      })
      node._resolved = resolveForFrame(result, node, instances, counters, visited, instanceKey)
    } else {
      const clean = isInstanceClean(instance, element.props)
      instance._dirty = !clean

      // re-render inside the instance scope so any effect or cleanup created
      // during a re-render is still disposed with the instance
      const result = runInScope(instance.scope, () => {
        startHookTracking(instance)
        startRenderTracking()
        const r = fn(element.props ?? {})
        const signals = stopRenderTracking()
        endHookTracking()
        snapshotSignals(instance, signals)
        return r
      })
      instance._lastProps = element.props

      node._resolved = resolveForFrame(result, node, instances, counters, visited, instanceKey)
    }

    node._instance = instance
    instance.node = node
    return node
  }

  if (element.type === Fragment) {
    const children = flattenChildren(element.props?.children)
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances, counters, visited, scope)).filter(Boolean)
    return node
  }

  const children = flattenChildren(element.props?.children)
  if (children.length > 0) {
    node._resolvedChildren = children.map(c => resolveForFrame(c, node, instances, counters, visited, scope)).filter(Boolean)
  }

  return node
}

function findScrollback(node) {
  if (!node) return null
  if (typeof node.type === 'function' && node.type.__scrollback) return node
  if (node._resolved) {
    const found = findScrollback(node._resolved)
    if (found) return found
  }
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) {
      const found = findScrollback(child)
      if (found) return found
    }
  }
  return null
}

// render a one-shot element (a committed scrollback item) to ANSI lines. it
// gets its own throwaway instance map so it never pollutes the live tree's
// cache, and scopes are disposed immediately since committed content is frozen
function renderElementToLines(element, width) {
  if (element == null) return []
  const instances = new Map()
  const counters = new Map()
  const tree = resolveForFrame(element, null, instances, counters, null, '')
  const h = Math.max(1, intrinsicHeight(tree, width, 100000))
  computeLayout(tree, { x: 0, y: 0, width, height: h })
  const buf = createBuffer(width, h)
  paintTree(tree, buf, null, null, null)
  const lines = bufferToLines(buf)
  for (const inst of instances.values()) disposeScope(inst.scope)
  return lines
}

export function mount(rootComponent, { stream, stdin, title, theme, onExit: onExitCb, onOpenLink = openUrl, altScreen = true, inline = false } = {}) {
  const out = stream ?? process.stdout
  const inp = stdin ?? process.stdin

  let width = out.columns ?? 80
  let height = out.rows ?? 24

  let prev = createBuffer(width, height)
  let curr = createBuffer(width, height)

  const ctx = { stream: out, input: null, stdin: inp, theme: { ...DEFAULT_THEME, ...theme }, captureOwner: null, selection: null }
  const linkPointer = { hovered: null, pressed: null, dragged: false }
  const cellLink = (x, y) => {
    const buf = ctx.getPaintBuffer?.()
    return buf && x >= 0 && y >= 0 && x < buf.width && y < buf.height ? buf.cells[y * buf.width + x]?.link ?? null : null
  }
  const input = createInputHandler(inp, {
    isEligible: (owner) => {
      const cap = ctx.captureOwner
      if (!cap || owner == null) return true
      let i = owner
      while (i) {
        if (i === cap) return true
        i = overlayContexts.get(i) ?? null
      }
      return false
    },
  })
  ctx.input = input
  input.onMouse(event => {
    const link = cellLink(event.x, event.y)
    if (event.action === 'move') {
      if (link !== linkPointer.hovered) {
        linkPointer.hovered = link
        forceFullPaint = true
        ctx.requestFrame?.()
      }
    } else if (event.action === 'press' && event.button === 'left') {
      linkPointer.pressed = link
      linkPointer.dragged = false
    } else if (event.action === 'drag' && linkPointer.pressed) {
      linkPointer.dragged = true
    } else if (event.action === 'release') {
      if (linkPointer.pressed && !linkPointer.dragged && link === linkPointer.pressed) onOpenLink?.(link)
      linkPointer.pressed = null
      linkPointer.dragged = false
    }
  })
  ctx.hoveredLink = () => linkPointer.hovered
  activeContext = ctx

  // component instance cache persists across frames
  // maps instanceKey -> { scope, fn, hooks }
  const instances = new Map()
  let forceFullPaint = false
  let prevHadOverlays = false
  let prevHadSelection = false

  // inline mode state: how many scrollback items have been committed, the
  // visible width of each line the live region last emitted (so a later resize
  // can compute how many physical rows they reflowed into), and that emit's
  // text for skipping unchanged frames
  let flushedCount = 0
  let prevLineLens = []
  let prevLiveText = null

  // while a modal/overlay is open, inline mode renders it fullscreen on the
  // alternate screen. the terminal saves the main screen on entry and restores
  // it exactly on exit, so the committed transcript and native scrollback are
  // never touched
  let overlayActive = false
  let overlayPrev = null

  // mirror per-instance layout (incl. scroll contentHeight/childHeights) back
  // onto each instance so useLayout() consumers like List/Menu can window.
  // returns whether anything changed, so the caller can re-resolve once and let
  // those components observe the freshly measured values
  function syncInstanceLayouts() {
    let changed = false
    for (const inst of instances.values()) {
      const rect = inst.node?._availableRect ?? inst.node?._layout
      if (!rect) continue
      const ch = findScrollContentSize(inst.node, '_contentHeight')
      const cw = findScrollContentSize(inst.node, '_contentWidth')
      if (!inst.layout) inst.layout = { x: 0, y: 0, width: 0, height: 0 }
      const p = inst.layout
      if (p.width !== rect.width || p.height !== rect.height || p.contentHeight !== ch || p.contentWidth !== cw) changed = true
      p.x = rect.x
      p.y = rect.y
      p.width = rect.width
      p.height = rect.height
      p.contentHeight = ch
      p.contentWidth = cw
      p.childHeights = findScrollChildHeights(inst.node)
    }
    return changed
  }

  function inlineFrame() {
    const prevCtx = activeContext
    activeContext = ctx
    overlays = []

    const counters = new Map()
    const visited = new Set()
    const element = { type: rootComponent, props: {}, key: null }
    let tree = resolveForFrame(element, null, instances, counters, visited, '')

    // a registered overlay (e.g. a Modal) takes over the screen. render it on
    // the alternate buffer so the inline transcript is saved/restored by the
    // terminal around it - no scrollback wipe, no relative-erase guesswork.
    // we reconstruct the visible transcript + live region into the alt buffer
    // as a backdrop so the conversation still shows behind the modal
    if (overlays.length > 0) {
      if (!overlayActive) {
        out.write(ansi.altScreen + ansi.hideCursor + ansi.clearScreen)
        overlayActive = true
        overlayPrev = createBuffer(width, height)
      }
      const overlayCurr = createBuffer(width, height)

      const sbNode = findScrollback(tree)
      const sbItems = sbNode?.props?.items ?? []
      const sbRender = sbNode?.props?.render
      const bg = []
      if (sbRender) {
        for (let i = 0; i < sbItems.length; i++) bg.push(...renderElementToLines(sbRender(sbItems[i], i), width))
      }
      const lh = Math.min(height, Math.max(1, intrinsicHeight(tree, width, height)))
      computeLayout(tree, { x: 0, y: 0, width, height: lh })
      const lbuf = createBuffer(width, lh)
      paintTree(tree, lbuf, null, null, null)
      bg.push(...bufferToLines(lbuf))

      // show the tail that fits, top-aligned (matches the main screen's view)
      const visible = bg.slice(Math.max(0, bg.length - height))
      for (let i = 0; i < visible.length; i++) writeText(overlayCurr, 0, i, visible[i], null, null, 0)

      for (const { element: ovEl, owner, backdrop } of overlays) {
        resolvingOverlayOwner = owner
        let ovTree
        try {
          ovTree = resolveForFrame(ovEl, null, instances, counters, visited, '')
        } finally {
          resolvingOverlayOwner = null
        }
        if (!ovTree) continue
        computeLayout(ovTree, { x: 0, y: 0, width, height })
        updateOverlayLayouts(ovTree)
        if (backdrop) dimBuffer(overlayCurr)
        clearOverlayRect(ovTree, overlayCurr)
        paintTree(ovTree, overlayCurr, null, null, null)
      }
      ctx.captureOwner = captureOwnerFrom(overlays)

      for (const [key, inst] of instances) {
        if (!visited.has(key)) {
          disposeScope(inst.scope)
          instances.delete(key)
        }
      }
      activeContext = prevCtx
      const { output } = diff(overlayPrev, overlayCurr)
      if (output) out.write(ansi.hideCursor + output)
      overlayPrev = overlayCurr
      return
    }

    ctx.captureOwner = null

    if (overlayActive) {
      // modal closed: the terminal restores the saved main screen exactly
      out.write(ansi.exitAltScreen)
      overlayActive = false
      overlayPrev = null
      prevLiveText = null
    }

    const sb = findScrollback(tree)
    const items = sb?.props?.items ?? []
    const renderItem = sb?.props?.render

    let committed = ''
    if (renderItem && items.length > flushedCount) {
      for (let i = flushedCount; i < items.length; i++) {
        const lines = renderElementToLines(renderItem(items[i], i), width)
        for (const ln of lines) committed += ln + '\r\n'
      }
    }
    // items can only grow while mounted; a shrink means the app reset its log,
    // which we can't un-print, so just resync the counter
    flushedCount = items.length

    let liveHeight = Math.min(height, Math.max(1, intrinsicHeight(tree, width, height)))
    computeLayout(tree, { x: 0, y: 0, width, height: liveHeight })

    if (syncInstanceLayouts()) {
      counters.clear()
      visited.clear()
      tree = resolveForFrame(element, null, instances, counters, visited, '')
      liveHeight = Math.min(height, Math.max(1, intrinsicHeight(tree, width, height)))
      computeLayout(tree, { x: 0, y: 0, width, height: liveHeight })
      syncInstanceLayouts()
    }

    for (const [key, inst] of instances) {
      if (!visited.has(key)) {
        inst._paintedRect = null
        disposeScope(inst.scope)
        instances.delete(key)
      }
    }

    const liveBuf = createBuffer(width, liveHeight)
    paintTree(tree, liveBuf, null, null, null)
    const liveLines = bufferToLines(liveBuf)
    lastInlineBuf = liveBuf

    activeContext = prevCtx

    const liveText = liveLines.join('\r\n')
    if (!committed && liveText === prevLiveText) return

    // the cursor rests at the end of the last live line between frames. erase
    // the previous live region before repainting: since it was drawn, a resize
    // may have reflowed each of its lines into ceil(visibleWidth / width) rows,
    // so step back over that real physical height rather than the logical line
    // count - otherwise a shrink leaves the extra wrapped rows stranded as
    // ghost bars. history above is left to the terminal's own reflow
    let phys = 0
    for (const len of prevLineLens) phys += Math.max(1, Math.ceil(len / width))

    let out_ = ''
    if (phys > 0) {
      out_ += '\r'
      if (phys > 1) out_ += ansi.moveUp(phys - 1)
      out_ += ansi.clearDown
    }
    out_ += committed + liveText

    out.write(ansi.hideCursor + out_)
    prevLineLens = liveLines.map(l => measureText(l))
    prevLiveText = liveText
  }

  let lastInlineBuf = null

  function frame() {
    const frameStart = performance.now()
    const prevCtx = activeContext
    activeContext = ctx
    overlays = []

    clearBuffer(curr)

    // counters reset each frame so occurrence indices are stable
    const counters = new Map()
    const visited = new Set()
    const element = { type: rootComponent, props: {}, key: null }
    let tree = resolveForFrame(element, null, instances, counters, visited, '')
    computeLayout(tree, { x: 0, y: 0, width, height })

    let layoutChanged = syncInstanceLayouts()
    const hadLayoutChange = layoutChanged
    let layoutPass = 1
    while (layoutChanged && layoutPass++ < 32) {
      overlays = []
      counters.clear()
      visited.clear()
      tree = resolveForFrame(element, null, instances, counters, visited, '')
      computeLayout(tree, { x: 0, y: 0, width, height })
      layoutChanged = syncInstanceLayouts()
    }

    if (hadLayoutChange) {
      for (const inst of instances.values()) inst._dirty = true
      propagateDirty(tree)
      paintTree(tree, curr, null, null, null)
    } else {
      propagateDirty(tree)
      paintTree(tree, curr, null, null, (forceFullPaint || prevHadOverlays || prevHadSelection) ? null : prev)
    }
    forceFullPaint = false

    const hasOverlays = overlays.length > 0

    for (const { element: overlayEl, owner, backdrop, fullscreen } of overlays) {
      if (backdrop) dimBuffer(curr)

      resolvingOverlayOwner = owner
      let overlayTree
      try {
        overlayTree = resolveForFrame(overlayEl, null, instances, counters, visited, '')
      } finally {
        resolvingOverlayOwner = null
      }
      if (overlayTree) {
        let overlayRect
        if (backdrop || fullscreen) {
          overlayRect = { x: 0, y: 0, width, height }
        } else {
          const anchor = owner.node?._layout ?? owner.layout ?? { x: 0, y: 0, width: 0, height: 0 }
          const below = height - anchor.y - 1
          if (below > 0) {
            overlayRect = { x: anchor.x, y: anchor.y + 1, width: width - anchor.x, height: below }
          } else {
            // no room below the anchor - flip the overlay to sit right above it
            const ovWidth = width - anchor.x
            const h = Math.min(anchor.y, Math.max(1, intrinsicHeight(overlayTree, ovWidth, anchor.y)))
            overlayRect = { x: anchor.x, y: anchor.y - h, width: ovWidth, height: h }
          }
        }
        computeLayout(overlayTree, overlayRect)
        updateOverlayLayouts(overlayTree)
        clearOverlayRect(overlayTree, curr)
        paintTree(overlayTree, curr)
      }
    }

    prevHadOverlays = hasOverlays
    ctx.captureOwner = captureOwnerFrom(overlays)

    // selection paints last, over everything, by flipping inverse on the
    // covered cells. new cell objects are required: blitting shares cell refs
    // with prev, and diff must see prev unchanged
    applyLinkHover(curr, linkPointer.hovered, ctx.theme.accent)
    if (ctx.selection) applySelectionHighlight(curr, ctx.selection)
    prevHadSelection = !!ctx.selection

    for (const [key, inst] of instances) {
      if (!visited.has(key)) {
        inst._paintedRect = null
        disposeScope(inst.scope)
        instances.delete(key)
      }
    }

    activeContext = prevCtx

    const { output, changed } = diff(prev, curr)
    if (changed > 0) {
      // synchronized output (dec 2026): supporting terminals apply the whole
      // frame atomically instead of tearing mid-write; others ignore it
      out.write(ansi.beginSync + ansi.hideCursor)
      // diff() returns a view into a shared double buffer that gets reused two
      // frames later; write a copy so backpressured streams never see it mutate
      out.write(Buffer.from(output))
      out.write(ansi.endSync)
    }

    const now = performance.now()
    if (lastFrameTimestamp > 0) {
      frameTimeWindow.push(now - lastFrameTimestamp)
      if (frameTimeWindow.length > 30) frameTimeWindow.shift()
    }
    lastFrameTimestamp = now
    const avgMs = frameTimeWindow.length > 0 ? frameTimeWindow.reduce((a, b) => a + b, 0) / frameTimeWindow.length : 16.67
    lastFrameStats = { changed, total: width * height, bytes: output ? Buffer.byteLength(output) : 0, fps: Math.round(1000 / avgMs), renderMs: performance.now() - frameStart }

    const tmp = prev
    prev = curr
    curr = tmp
  }

  const scheduler = createScheduler({
    fps: 60,
    onFrame: inline ? inlineFrame : frame,
  })

  setSchedulerHook(scheduler.requestFrame)

  // inline mode stays on the main screen buffer so native scrollback survives:
  // no alt screen, no clear, no mouse capture (so the terminal handles scroll
  // and text selection itself)
  if (inline) {
    out.write(ansi.hideCursor + enableBracketedPaste + (title ? ansi.setTitle(title) : ''))
  } else {
    out.write((altScreen ? ansi.altScreen : '') + ansi.hideCursor + ansi.clearScreen + ansi.enableMouse + enableBracketedPaste + (title ? ansi.setTitle(title) : ''))
  }
  if (inp.isTTY && inp.setRawMode) inp.setRawMode(true)
  // decode stdin as utf8 at the stream level so multibyte sequences split
  // across chunks arrive as complete strings, never U+FFFD halves
  if (typeof inp.setEncoding === 'function') inp.setEncoding('utf8')

  // registered before the first frame resolves components, so component
  // useInput handlers (registered later) dispatch first and can intercept
  // ctrl+c via stopPropagation
  input.onKey((event) => {
    if (event.key === 'c' && event.ctrl) {
      unmount()
      if (onExitCb) onExitCb()
      else process.exit(0)
    }
  })

  if (inline) inlineFrame()
  else frame()
  scheduler.requestFrame()

  const onResize = () => {
    width = out.columns ?? 80
    height = out.rows ?? 24
    if (inline) {
      width = out.columns ?? 80
      height = out.rows ?? 24
      if (overlayActive) {
        // on the alternate screen: just clear and re-render the modal centered
        // at the new size. the saved main screen is restored on close
        overlayPrev = createBuffer(width, height)
        out.write(ansi.clearScreen)
        scheduler.forceFrame()
        return
      }
      // a resize reflows committed scrollback unpredictably, and a relative
      // erase of the live region cannot reliably track it across terminals.
      // rebuild instead: wipe the screen and scrollback, reset the commit
      // cursor, and re-commit the whole transcript cleanly at the new width
      out.write(ansi.clearScrollback + ansi.clearScreen + ansi.moveTo(1, 1))
      flushedCount = 0
      prevLineLens = []
      prevLiveText = null
      scheduler.forceFrame()
      return
    }
    prev = createBuffer(width, height)
    curr = createBuffer(width, height)
    out.write(ansi.clearScreen)
    scheduler.forceFrame()
  }
  out.on('resize', onResize)

  let unmounted = false

  function unmount() {
    if (unmounted) return
    unmounted = true

    scheduler.destroy()
    input.detach()
    out.off('resize', onResize)
    process.off('exit', onExit)
    process.off('SIGTERM', onSigterm)
    process.off('SIGHUP', onSighup)

    for (const inst of instances.values()) {
      inst._paintedRect = null
      disposeScope(inst.scope)
    }
    instances.clear()

    if (inline) {
      out.write((overlayActive ? ansi.exitAltScreen : '') + ansi.sgrReset + disableBracketedPaste + ansi.showCursor + '\r\n')
    } else {
      out.write(ansi.sgrReset + ansi.disableMouse + disableBracketedPaste + ansi.showCursor + (altScreen ? ansi.exitAltScreen : ansi.moveTo(height, 1) + '\n'))
    }
    if (inp.isTTY && inp.setRawMode) inp.setRawMode(false)
    activeContext = null
    setSchedulerHook(null)
  }

  function onExit() {
    unmount()
  }

  // SIGTERM/SIGHUP terminate without emitting 'exit', which would leave the
  // terminal in raw mode on the alt screen. restore, then re-raise the signal
  // so the default exit-code semantics are preserved - unless the app has its
  // own handler, in which case it owns the decision to exit
  function makeSignalHandler(sig) {
    const handler = () => {
      unmount()
      process.off(sig, handler)
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig)
    }
    return handler
  }

  const onSigterm = makeSignalHandler('SIGTERM')
  const onSighup = makeSignalHandler('SIGHUP')

  process.on('exit', onExit)
  process.on('SIGTERM', onSigterm)
  process.on('SIGHUP', onSighup)

  function repaint() {
    if (inline) {
      prevLiveText = null
      scheduler.forceFrame()
      return
    }
    prev = createBuffer(width, height)
    curr = createBuffer(width, height)
    forceFullPaint = true
    out.write(ansi.clearScreen)
    scheduler.forceFrame()
  }

  function setTheme(patch) {
    Object.assign(ctx.theme, patch)
    scheduler.forceFrame()
  }

  ctx.repaint = repaint
  // gentle sibling of repaint: schedules a normal diffed frame with no
  // clear-screen; right for overlay state like selection that frame()
  // already applies each pass
  ctx.requestFrame = () => scheduler.forceFrame()
  ctx.getPaintBuffer = () => (inline ? lastInlineBuf : prev)

  return { unmount, repaint, setTheme, getBuffer: ctx.getPaintBuffer }
}
