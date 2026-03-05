import { mount, createSignal, useInput, useInterval, useTheme } from '../index.js'

function App() {
  const { accent } = useTheme()
  const [status, setStatus] = createSignal('online')
  const [count, setCount] = createSignal(0)

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
    if (key === 's') setStatus(s => s === 'online' ? 'offline' : 'online')
  })

  useInterval(() => setCount(c => c + 1), 1000)

  const isOnline = status() === 'online'

  return (
    <box style={{ flexDirection: 'column', height: '100%', padding: 1 }}>

      <box style={{ border: 'round', borderColor: accent, height: 8, flexDirection: 'column', paddingX: 1 }}>
        <text style={{ bold: true }}>server panel</text>
        <text>uptime: {count()}s</text>
        <text style={{ color: 'gray', dim: true }}>press s to toggle status</text>

        <box style={{ position: 'absolute', top: 0, right: 1 }}>
          <text style={{ color: isOnline ? 'green' : 'red', bold: true }}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true }}>logs</text>
          <text>GET /api/health 200</text>
          <text>POST /api/data 201</text>

          <box style={{ position: 'absolute', bottom: 0, right: 1 }}>
            <text style={{ color: 'gray', dim: true }}>3 entries</text>
          </box>
        </box>

        <box style={{ border: 'round', borderColor: 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true }}>metrics</text>
          <text>cpu: <text style={{ color: 'green' }}>12%</text></text>
          <text>mem: <text style={{ color: 'yellow' }}>58%</text></text>

          <box style={{ position: 'absolute', top: 0, right: 1 }}>
            <text style={{ color: accent, bold: true }}>live</text>
          </box>
        </box>
      </box>

    </box>
  )
}

mount(App, { title: 'absolute positioning' })
