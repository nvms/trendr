import { createSignalRaw } from './signal.js'
import { registerHook } from './renderer.js'
import { useInput } from './hooks.js'

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
      initialized: false,
    }
  })

  function resolveLeaf(name) {
    const g = state.groups.get(name)
    if (g) return g.items[g.subIdx]
    return name
  }

  function item(name) {
    if (!state.items.find(i => i.name === name)) {
      state.items.push({ name, type: 'item' })
    }
    if (!state.initialized && !state.current()) {
      state.setCurrent(name)
      state.initialized = true
    }
  }

  function group(name, { items: subItems, navigate = 'both', wrap = false } = {}) {
    if (!state.items.find(i => i.name === name)) {
      state.items.push({ name, type: 'group' })
    }
    if (!state.groups.has(name)) {
      state.groups.set(name, { items: subItems, navigate, wrap, subIdx: 0 })
      for (const sub of subItems) {
        state.nameToParent.set(sub, name)
      }
    }
    if (!state.initialized && !state.current()) {
      state.setCurrent(subItems[0])
      state.initialized = true
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

  function findTopLevel(cur) {
    const parent = state.nameToParent.get(cur)
    if (parent) return state.items.findIndex(i => i.name === parent)
    return state.items.findIndex(i => i.name === cur)
  }

  useInput((event) => {
    if (state.items.length === 0) return

    const { key } = event
    const cur = state.current()

    if (state.stack.length > 0) return

    if (cycle === 'tab' && (key === 'tab' || key === 'shift-tab')) {
      const idx = findTopLevel(cur)
      if (idx === -1) return
      const dir = key === 'tab' ? 1 : -1
      const next = (idx + dir + state.items.length) % state.items.length
      const nextItem = state.items[next]
      state.setCurrent(resolveLeaf(nextItem.name))
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
      g.subIdx = next
      state.setCurrent(g.items[next])
    } else {
      const next = idx + dir
      if (next < 0 || next >= len) return
      g.subIdx = next
      state.setCurrent(g.items[next])
    }
  })

  return { item, group, is, focus, push, pop, current }
}
