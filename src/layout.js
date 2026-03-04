import { wordWrap, measureText } from './wrap.js'
import { Fragment } from './element.js'

export function computeLayout(node, rect) {
  if (!node) return

  if (node._resolved) {
    computeLayout(node._resolved, rect)
    node._layout = node._resolved._layout
    node._availableRect = rect
    return
  }

  if (node.type === Fragment) {
    node._layout = rect
    if (node._resolvedChildren) {
      for (const child of node._resolvedChildren) {
        computeLayout(child, rect)
      }
    }
    return
  }

  const style = node.props?.style ?? {}

  const absW = typeof style.width === 'number' ? style.width : null
  const absH = typeof style.height === 'number' ? style.height : null

  const box = {
    x: rect.x,
    y: rect.y,
    width: clampSize(absW != null ? Math.min(absW, rect.width) : rect.width, style.minWidth, style.maxWidth),
    height: clampSize(absH != null ? Math.min(absH, rect.height) : rect.height, style.minHeight, style.maxHeight),
  }

  if (node.type === 'text') {
    const text = extractText(node)
    if (text) {
      const lines = wordWrap(text, box.width)
      if (style.height == null) box.height = Math.min(lines.length, rect.height)
    } else {
      if (style.height == null) box.height = 1
    }
    node._layout = box
    return
  }

  node._layout = box

  const children = node._resolvedChildren
  if (!children || children.length === 0) return

  const pad = resolvePadding(style)
  const border = style.border ? 1 : 0
  const innerX = box.x + pad.left + border
  const innerY = box.y + pad.top + border
  const innerW = Math.max(0, box.width - pad.left - pad.right - border * 2)
  const innerH = Math.max(0, box.height - pad.top - pad.bottom - border * 2)

  const isRow = style.flexDirection === 'row'
  const gap = style.gap ?? 0

  layoutFlex(children, {
    x: innerX,
    y: innerY,
    width: innerW,
    height: innerH,
    isRow,
    gap,
    justifyContent: style.justifyContent ?? 'flex-start',
    alignItems: style.alignItems ?? 'stretch',
  })
}

function layoutFlex(children, ctx) {
  const { x, y, width, height, isRow, gap, justifyContent, alignItems } = ctx
  const mainSize = isRow ? width : height
  const crossSize = isRow ? height : width
  const totalGaps = Math.max(0, children.length - 1) * gap

  let usedMain = totalGaps
  let totalFlex = 0
  const childInfo = []

  for (const child of children) {
    const cs = childStyle(child)
    const grow = cs.flexGrow ?? cs.flex ?? 0
    const margin = resolveMargin(cs)
    const marginMain = isRow ? margin.left + margin.right : margin.top + margin.bottom
    const marginCross = isRow ? margin.top + margin.bottom : margin.left + margin.right

    if (grow > 0) {
      const minMain = isRow ? (cs.minWidth ?? 0) : (cs.minHeight ?? 0)
      usedMain += minMain + marginMain
      totalFlex += grow
      childInfo.push({ child, cs, grow, minMain, marginMain, marginCross, margin, measured: null })
    } else {
      const measured = measureChild(child, cs, isRow, width, height)
      const childMain = isRow ? measured.width : measured.height
      usedMain += childMain + marginMain
      childInfo.push({ child, cs, grow: 0, minMain: childMain, marginMain, marginCross, margin, measured })
    }
  }

  const remaining = Math.max(0, mainSize - usedMain)

  let mainOffset = 0
  let spaceBetween = 0

  if (totalFlex === 0) {
    switch (justifyContent) {
      case 'center':
        mainOffset = Math.floor(remaining / 2)
        break
      case 'flex-end':
        mainOffset = remaining
        break
      case 'space-between':
        spaceBetween = children.length > 1 ? remaining / (children.length - 1) : 0
        break
      case 'space-around':
        spaceBetween = remaining / children.length
        mainOffset = Math.floor(spaceBetween / 2)
        break
    }
  }

  let pos = mainOffset

  for (const info of childInfo) {
    const { child, cs, grow, minMain, marginMain, marginCross, margin, measured } = info

    let childMain
    if (grow > 0) {
      const extra = totalFlex > 0 ? Math.floor(remaining * (grow / totalFlex)) : 0
      childMain = minMain + extra
    } else {
      childMain = minMain
    }

    const mainRemaining = mainSize - pos - marginMain
    if (childMain > mainRemaining) childMain = Math.max(0, mainRemaining)

    const explicitCross = isRow
      ? resolveSize(cs.height, crossSize)
      : resolveSize(cs.width, crossSize)
    let childCross = crossSize - marginCross
    if (alignItems !== 'stretch' || explicitCross != null) {
      const measuredCross = measured
        ? (isRow ? measured.height : measured.width)
        : childCross
      childCross = Math.min(measuredCross, childCross)
    }

    const marginBefore = isRow ? margin.left : margin.top
    const marginCrossBefore = isRow ? margin.top : margin.left

    let crossOffset = marginCrossBefore
    switch (alignItems) {
      case 'center':
        crossOffset = Math.floor((crossSize - marginCross - childCross) / 2) + marginCrossBefore
        break
      case 'flex-end':
        crossOffset = crossSize - marginCross - childCross + marginCrossBefore
        break
    }

    const childRect = isRow
      ? { x: x + pos + marginBefore, y: y + crossOffset, width: childMain, height: childCross }
      : { x: x + crossOffset, y: y + pos + marginBefore, width: childCross, height: childMain }

    computeLayout(child, childRect)

    pos += childMain + marginMain + gap + spaceBetween
  }
}

function measureChild(child, cs, isRow, availW, availH) {
  const leaf = getLeaf(child)
  if (!leaf) return { width: 0, height: 0 }

  const explicitW = resolveSize(cs.width, availW)
  const explicitH = resolveSize(cs.height, availH)

  let w, h

  if (leaf.type === 'text') {
    const text = extractText(leaf)
    const overflow = cs.overflow
    if (!text) { w = explicitW ?? 0; h = explicitH ?? 1 }
    else if (overflow === 'nowrap' || overflow === 'truncate') {
      w = explicitW ?? Math.min(availW, measureText(text))
      h = explicitH ?? 1
    } else {
      const maxW = explicitW ?? availW
      const lines = wordWrap(text, maxW)
      const textWidth = Math.min(maxW, Math.max(...lines.map(l => measureText(l))))
      w = explicitW ?? textWidth
      h = explicitH ?? lines.length
    }
  } else if (explicitW != null && explicitH != null) {
    w = explicitW
    h = explicitH
  } else {
    const intrinsic = measureIntrinsic(leaf, availW, availH)
    w = explicitW ?? intrinsic.width
    h = explicitH ?? intrinsic.height
  }

  return {
    width: clampSize(w, cs.minWidth, cs.maxWidth),
    height: clampSize(h, cs.minHeight, cs.maxHeight),
  }
}

function measureIntrinsic(node, availW, availH) {
  if (!node) return { width: 0, height: 0 }

  const style = node.props?.style ?? {}
  const pad = resolvePadding(style)
  const border = style.border ? 1 : 0
  const chrome = { x: pad.left + pad.right + border * 2, y: pad.top + pad.bottom + border * 2 }
  const innerW = availW - chrome.x
  const innerH = availH - chrome.y

  const children = node._resolvedChildren
  if (!children || children.length === 0) {
    return { width: chrome.x, height: chrome.y }
  }

  const childIsRow = style.flexDirection === 'row'
  const gap = style.gap ?? 0

  let mainTotal = 0
  let crossMax = 0

  for (const child of children) {
    const cs = childStyle(child)
    const grow = cs.flexGrow ?? cs.flex ?? 0

    const measured = measureChild(child, cs, childIsRow, innerW, innerH)
    const margin = resolveMargin(cs)
    const marginMain = childIsRow ? margin.left + margin.right : margin.top + margin.bottom
    const marginCross = childIsRow ? margin.top + margin.bottom : margin.left + margin.right

    const childMain = (childIsRow ? measured.width : measured.height) + marginMain
    mainTotal += childMain

    const childCross = (childIsRow ? measured.height : measured.width) + marginCross
    if (childCross > crossMax) crossMax = childCross
  }

  mainTotal += Math.max(0, children.length - 1) * gap

  return childIsRow
    ? { width: mainTotal + chrome.x, height: crossMax + chrome.y }
    : { width: crossMax + chrome.x, height: mainTotal + chrome.y }
}

function getLeaf(node) {
  if (!node) return null
  if (node._resolved) return getLeaf(node._resolved)
  return node
}

function childStyle(child) {
  const leaf = getLeaf(child)
  return leaf?.props?.style ?? {}
}

function resolveSize(value, available) {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.endsWith('%')) {
    return Math.floor(available * parseFloat(value) / 100)
  }
  return null
}

function clampSize(value, min, max) {
  if (min != null && value < min) value = min
  if (max != null && value > max) value = max
  return Math.max(0, Math.floor(value))
}

function resolvePadding(style) {
  const p = style.padding ?? 0
  return {
    top: style.paddingTop ?? style.paddingY ?? p,
    bottom: style.paddingBottom ?? style.paddingY ?? p,
    left: style.paddingLeft ?? style.paddingX ?? p,
    right: style.paddingRight ?? style.paddingX ?? p,
  }
}

function resolveMargin(style) {
  const m = style.margin ?? 0
  return {
    top: style.marginTop ?? style.marginY ?? m,
    bottom: style.marginBottom ?? style.marginY ?? m,
    left: style.marginLeft ?? style.marginX ?? m,
    right: style.marginRight ?? style.marginX ?? m,
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
