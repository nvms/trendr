import { createScope, disposeScope, runInScope } from './signal.js'

export const Fragment = Symbol('Fragment')

export function flattenChildren(children) {
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

export function resolveTree(element, parent) {
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
      _scope: null,
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
    _scope: null,
  }

  if (typeof element.type === 'function') {
    let result
    const scope = createScope(() => {
      result = element.type(element.props ?? {})
    })
    node._scope = scope
    node._resolved = resolveTree(result, node)
    return node
  }

  if (element.type === Fragment) {
    const children = flattenChildren(element.props?.children)
    node._resolvedChildren = children.map(c => resolveTree(c, node)).filter(Boolean)
    return node
  }

  const children = flattenChildren(element.props?.children)
  if (children.length > 0) {
    node._resolvedChildren = children.map(c => resolveTree(c, node)).filter(Boolean)
  }

  return node
}

export function getLeafNode(node) {
  if (!node) return null
  if (node._resolved) return getLeafNode(node._resolved)
  return node
}

export function walkTree(node, fn) {
  if (!node) return
  fn(node)
  if (node._resolved) walkTree(node._resolved, fn)
  if (node._resolvedChildren) {
    for (const child of node._resolvedChildren) walkTree(child, fn)
  }
}
