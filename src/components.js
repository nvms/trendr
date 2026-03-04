import { jsx } from '../jsx-runtime.js'

export function Box(props) {
  return jsx('box', props)
}

export function Text(props) {
  return jsx('text', props)
}

export function Spacer() {
  return jsx('box', { style: { flexGrow: 1 } })
}
