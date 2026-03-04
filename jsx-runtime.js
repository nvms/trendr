import { Fragment } from './src/element.js'

export { Fragment }

export function jsx(type, props, key) {
  return { type, props, key: key ?? props?.key ?? null }
}

export const jsxs = jsx
