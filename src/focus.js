import { createSignalRaw } from './signal.js'
import { registerHook } from './renderer.js'
import { useInput } from './hooks.js'

// while active, keeps tab/shift-tab from propagating past the trapping
// component to focus managers registered before it. handlers fire
// innermost-first, so any useFocus registered deeper in the tree handles the
// tab first; this handler then stops propagation so shallower managers don't
// also react. when traps nest, the innermost active one fires first and halts
// the rest, so it becomes the effective boundary
export function useFocusTrap(active) {
  useInput((event) => {
    if (!active) return
    if (event.key === 'tab' || event.key === 'shift-tab') {
      event.stopPropagation()
    }
  })
}

export function useFocus({ initial, cycle = 'tab' } = {}) {
  const state = registerHook(() => {
    const [current, setCurrent] = createSignalRaw(initial ?? null)
    return {
      items: [],
      groups: new Map(),
      nameToParent: new Map(),
      current,
      setCurrent,
      stack: [],
      gen: 0,
    }
  })

  // items and groups re-register every frame like hooks. entries that were
  // not re-registered during the previous frame are swept here, at the start
  // of the next one, and input handling only ever considers current-gen
  // entries so unmounted items drop out of the tab order immediately
  sweep()

  function sweep() {
    const prevGen = state.gen
    state.gen = prevGen + 1
    state.seq = 0
    if (prevGen === 0) return

    const stale = state.items.filter(i => i.gen < prevGen)
    if (stale.length > 0) {
      state.items = state.items.filter(i => i.gen >= prevGen)
      for (const it of stale) {
        const g = state.groups.get(it.name)
        if (g) {
          for (const sub of g.items) state.nameToParent.delete(sub)
          state.groups.delete(it.name)
        }
      }
    }

    if (state.items.length > 0 && !isRegistered(state.current())) {
      state.setCurrent(resolveLeaf(state.items[0].name) ?? null)
    }
  }

  function isRegistered(name) {
    if (name == null) return false
    if (state.nameToParent.has(name)) return true
    return state.items.some(i => i.name === name)
  }

  function resolveLeaf(name) {
    const g = state.groups.get(name)
    if (g) return g.items[g.subIdx]
    return name
  }

  // cycle order follows this frame's registration order, not first-ever
  // registration: a conditionally rendered field slots in where it is
  // declared instead of appending to the end of the tab order
  function liveItems() {
    return state.items.filter(i => i.gen === state.gen).sort((a, b) => a.seq - b.seq)
  }

  function item(name) {
    const existing = state.items.find(i => i.name === name)
    if (existing) {
      existing.gen = state.gen
      existing.seq = state.seq++
    } else {
      state.items.push({ name, type: 'item', gen: state.gen, seq: state.seq++ })
    }
    if (state.current() == null) state.setCurrent(name)
  }

  function group(name, { items: subItems = [], navigate = 'both', wrap = false } = {}) {
    const existing = state.items.find(i => i.name === name)
    if (existing) {
      existing.gen = state.gen
      existing.seq = state.seq++
    } else {
      state.items.push({ name, type: 'group', gen: state.gen, seq: state.seq++ })
    }

    let g = state.groups.get(name)
    if (!g) {
      g = { items: [], navigate, wrap, subIdx: 0 }
      state.groups.set(name, g)
    }

    const prevFocused = g.items[g.subIdx]
    for (const sub of g.items) {
      if (!subItems.includes(sub)) state.nameToParent.delete(sub)
    }
    g.items = subItems.slice()
    g.navigate = navigate
    g.wrap = wrap
    for (const sub of subItems) state.nameToParent.set(sub, name)

    const keep = subItems.indexOf(prevFocused)
    g.subIdx = keep >= 0 ? keep : Math.min(g.subIdx, Math.max(0, subItems.length - 1))

    const cur = state.current()
    if (cur == null && subItems.length > 0) {
      state.setCurrent(subItems[0])
    } else if (cur === prevFocused && keep === -1 && subItems.length > 0) {
      state.setCurrent(subItems[g.subIdx])
    }
  }

  function is(name) {
    const cur = state.current()
    if (cur === name) return true
    const g = state.groups.get(name)
    if (g && g.items.includes(cur)) return true
    return false
  }

  function focus(name) {
    const parentGroup = state.nameToParent.get(name)
    if (parentGroup) {
      const g = state.groups.get(parentGroup)
      const idx = g.items.indexOf(name)
      if (idx >= 0) g.subIdx = idx
    }
    state.setCurrent(name)
  }

  function push(name) {
    state.stack.push(state.current())
    focus(name)
  }

  function pop() {
    if (state.stack.length === 0) return
    focus(state.stack.pop())
  }

  function current() {
    return state.current()
  }

  function findTopLevel(cur, items) {
    const parent = state.nameToParent.get(cur)
    if (parent) return items.findIndex(i => i.name === parent)
    return items.findIndex(i => i.name === cur)
  }

  useInput((event) => {
    const items = liveItems()
    if (items.length === 0) return

    const { key } = event
    const cur = state.current()

    if (state.stack.length > 0) return

    if (cycle === 'tab' && (key === 'tab' || key === 'shift-tab')) {
      const dir = key === 'tab' ? 1 : -1
      const len = items.length
      const idx = findTopLevel(cur, items)
      const start = idx === -1 ? (dir === 1 ? -1 : 0) : idx
      for (let step = 1; step <= len; step++) {
        const next = ((start + dir * step) % len + len) % len
        const leaf = resolveLeaf(items[next].name)
        if (leaf === undefined) continue
        if (leaf !== cur) {
          state.setCurrent(leaf)
          event.stopPropagation()
        }
        return
      }
      return
    }

    const parentName = state.nameToParent.get(cur)
    if (!parentName) return

    const g = state.groups.get(parentName)
    const isNav =
      (g.navigate === 'jk' && (key === 'j' || key === 'k')) ||
      (g.navigate === 'updown' && (key === 'up' || key === 'down')) ||
      (g.navigate === 'both' && (key === 'j' || key === 'k' || key === 'up' || key === 'down'))

    if (!isNav) return

    const dir = (key === 'j' || key === 'down') ? 1 : -1
    const idx = g.subIdx
    const len = g.items.length

    if (g.wrap) {
      const next = (idx + dir + len) % len
      if (next === idx) return
      g.subIdx = next
      state.setCurrent(g.items[next])
      event.stopPropagation()
    } else {
      const next = idx + dir
      if (next < 0 || next >= len) return
      g.subIdx = next
      state.setCurrent(g.items[next])
      event.stopPropagation()
    }
  })

  return { item, group, is, focus, push, pop, current }
}
