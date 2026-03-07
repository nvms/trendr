import { mount, createSignal, useInput, useInterval, ProgressBar } from '../index.js'

function App() {
  const [value, setValue] = createSignal(0)
  const [running, setRunning] = createSignal(false)

  useInterval(() => {
    if (running()) setValue(v => Math.min(1, v + 0.008))
  }, 50)

  useInput(({ key }) => {
    if (key === 'space') setRunning(r => !r)
    if (key === 'r') { setValue(0); setRunning(true) }
    if (key === 'q') process.exit(0)
  })

  const v = value()
  const downloaded = (v * 48.2).toFixed(1)

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <text style={{ bold: true }}>ProgressBar variants</text>

      <box style={{ flexDirection: 'column', gap: 1 }}>
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>thin (default)</text>
          <ProgressBar value={v} variant="thin" label="Downloading" count={`${downloaded}/48.2 MB`} />
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>ascii</text>
          <ProgressBar value={v} variant="ascii" label="Installing" count="8/12" color="green" />
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>block</text>
          <ProgressBar value={v} variant="block" label="Building" color="yellow" />
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>braille</text>
          <ProgressBar value={v} variant="braille" label="Compiling" color="magenta" />
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>no label, no percentage</text>
          <ProgressBar value={v} variant="thin" percentage={false} color="red" />
        </box>
      </box>

      <text style={{ color: 'gray' }}>space - pause/resume    r - reset    q - quit</text>
    </box>
  )
}

mount(App, { title: 'progress' })
