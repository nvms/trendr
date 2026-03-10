import {
  mount, createSignal, useInput, useInterval, useResize, useStdout, useTheme,
} from 'trend'

import { Plasma } from '../examples/plasma.jsx'
import { Rain } from '../examples/rain.jsx'
import { Dashboard } from '../examples/dashboard.jsx'
import { Components } from '../examples/components.jsx'
import { Animation } from '../examples/animation.jsx'
import { Explorer } from '../examples/explorer.jsx'
import { Chat } from '../examples/chat.jsx'
import { Texture } from '../examples/texture.jsx'
import { SplitPaneDemo } from '../examples/split-pane.jsx'
import { ModalForm } from '../examples/modal-form.jsx'
import { Layout } from '../examples/layout.jsx'
import { ScrollBoxDemo } from '../examples/scroll-box.jsx'
import { ShimmerDemo } from '../examples/shimmer.jsx'
import { Progress } from '../examples/progress.jsx'
import { PickListDemo } from '../examples/pick-list.jsx'

function hueToRgb(hue, s = 0.9, l = 0.65) {
  const h = ((hue % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else               { r = c; g = 0; b = x }
  const clamp = v => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `${clamp(r + m)};${clamp(g + m)};${clamp(b + m)}`
}

const DEMOS = [
  { id: 'plasma',      label: 'plasma',       desc: 'fullscreen plasma animation with per-cell diffing stats',    component: Plasma },
  { id: 'rain',        label: 'rain',         desc: 'colorful particle rain with performance overlay',            component: Rain },
  { id: 'animation',   label: 'animation',    desc: 'spring and easing animation playground',                    component: Animation },
  { id: 'dashboard',   label: 'dashboard',    desc: 'live system monitor with gauges and clock',                  component: Dashboard },
  { id: 'components',  label: 'components',   desc: 'interactive component gallery - tables, selects, modals',    component: Components },
  { id: 'modal-form',  label: 'modal form',   desc: 'crud form with modal, text inputs, buttons, and toasts',    component: ModalForm },
  { id: 'explorer',    label: 'explorer',     desc: 'file tree with search, preview pane, and focus management',  component: Explorer },
  { id: 'chat',        label: 'chat',         desc: 'multi-room chat with tabs, messages, and text input',        component: Chat },
  { id: 'layout',      label: 'layout',       desc: 'nested flex layout with nav, panels, and log viewer',       component: Layout },
  { id: 'split-pane',  label: 'split pane',   desc: 'nested split panes with border junctions',                  component: SplitPaneDemo },
  { id: 'scroll-box',  label: 'scroll box',   desc: 'scrollable containers with variable-height content',        component: ScrollBoxDemo },
  { id: 'texture',     label: 'textures',     desc: 'background texture presets and custom patterns',            component: Texture },
  { id: 'shimmer',     label: 'shimmer',      desc: 'animated shimmer text effects with spinner combos',        component: ShimmerDemo },
  { id: 'progress',    label: 'progress',     desc: 'progress bar variants - thin, ascii, block, braille',     component: Progress },
  { id: 'pick-list',   label: 'pick list',    desc: 'filterable list with live search and multi-row items',    component: PickListDemo },
]

function Menu({ onSelect, selected, setSelected }) {
  const [hue, setHue] = createSignal(0)
  const stream = useStdout()
  const [cols, setCols] = createSignal(stream.columns || 80)

  useResize(({ width }) => setCols(width))
  useInterval(() => setHue(h => (h + 1) % 360), 50)

  useInput(({ key }) => {
    if (key === 'up' || key === 'k') setSelected(i => Math.max(0, i - 1))
    if (key === 'down' || key === 'j') setSelected(i => Math.min(DEMOS.length - 1, i + 1))
    if (key === 'return') onSelect(DEMOS[selected()].id)
  })

  const h = hue()

  const title = 'trend'
  const titleChars = title.split('').map((ch, i) => {
    const charHue = (h + i * 30) % 360
    return `\x1b[38;2;${hueToRgb(charHue)}m${ch}\x1b[0m`
  }).join('')

  const subtitle = `\x1b[38;2;100;100;100mdirect-mode tui renderer  -  jsx, signals, per-cell diffing\x1b[0m`

  return (
    <box style={{ flexDirection: 'column', height: '100%', padding: 1 }}>
      <box style={{ height: 2 }} />
      <text style={{ bold: true }}>  {titleChars}</text>
      <text>  {subtitle}</text>
      <box style={{ height: 2 }} />

      {DEMOS.map((demo, i) => {
        const isSel = i === selected()
        const pointer = isSel ? `\x1b[38;2;${hueToRgb((h + 60) % 360, 0.8, 0.6)}m>\x1b[0m` : ' '
        const labelColor = isSel ? 'white' : 'gray'

        return (
          <box key={demo.id} style={{ flexDirection: 'column', paddingLeft: 2 }}>
            <box style={{ flexDirection: 'row', gap: 1 }}>
              <text>{pointer}</text>
              <text style={{ color: labelColor, bold: isSel }}>{demo.label}</text>
            </box>
            {isSel && <text style={{ color: 'gray', dim: true, paddingLeft: 4 }}>  {demo.desc}</text>}
          </box>
        )
      })}

      <box style={{ flexGrow: 1 }} />

      <box style={{ paddingLeft: 2 }}>
        <text style={{ color: 'gray', dim: true }}>j/k or arrows to navigate  -  enter to select  -  ctrl+c to disconnect</text>
      </box>
    </box>
  )
}

function App() {
  const [currentDemo, setCurrentDemo] = createSignal(null)
  const [selected, setSelected] = createSignal(0)

  useInput(({ key }) => {
    if (key === 'escape' && currentDemo() !== null) {
      setCurrentDemo(null)
    }
  })

  const demoId = currentDemo()

  if (demoId === null) {
    return <Menu onSelect={setCurrentDemo} selected={selected} setSelected={setSelected} />
  }

  const demo = DEMOS.find(d => d.id === demoId)
  const DemoComponent = demo.component

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexGrow: 1 }}>
        <DemoComponent />
      </box>
      <box style={{ paddingX: 1 }}>
        <text style={{ color: 'gray', dim: true }}>esc: back to menu  -  ctrl+c: disconnect</text>
      </box>
    </box>
  )
}

export default App

export function start(opts) {
  return mount(App, opts)
}
