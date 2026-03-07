import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { List } from '../src/list.js'

const NAV = ['dashboard', 'users', 'settings', 'logs', 'deploy']

const LOGS = [
  'GET /api/users 200 12ms',
  'POST /api/auth 200 45ms',
  'GET /api/dashboard 200 8ms',
  'PUT /api/settings 200 23ms',
  'GET /api/logs 200 15ms',
  'DELETE /api/cache 204 3ms',
  'GET /api/health 200 1ms',
  'POST /api/deploy 202 120ms',
  'GET /api/metrics 200 34ms',
  'GET /api/users/1 200 9ms',
  'PATCH /api/users/1 200 18ms',
  'GET /api/config 200 5ms',
  'POST /api/webhook 200 67ms',
  'GET /api/status 200 2ms',
  'GET /api/events 200 41ms',
]

export function Layout() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'nav' })
  fm.item('nav')
  fm.item('logs')

  const [navIdx, setNavIdx] = createSignal(0)
  const [logIdx, setLogIdx] = createSignal(0)

  const sel = NAV[navIdx()]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>

      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>layout stress test</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>tab: switch panes</text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>

        <box style={{ border: 'round', borderColor: fm.is('nav') ? accent : 'gray', width: 20, flexDirection: 'column' }}>
          <text style={{ bold: true, color: accent, paddingX: 1 }}>nav</text>
          <List
            items={NAV}
            selected={navIdx()}
            onSelect={setNavIdx}
            focused={fm.is('nav')}
            renderItem={(item, { selected: isSel, focused }) => (
              <text style={{
                paddingX: 1,
                bg: isSel ? (focused ? accent : 'gray') : null,
                color: isSel ? 'black' : null,
              }}>{item}</text>
            )}
          />
        </box>

        <box style={{ flexGrow: 1, flexDirection: 'column' }}>

          <box style={{ flexDirection: 'row', height: 5 }}>
            <box style={{ border: 'round', borderColor: 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
              <text style={{ bold: true }}>{sel}</text>
              <text style={{ color: 'green' }}>status: active</text>
              <text style={{ color: 'gray', dim: true }}>uptime: 14d 3h</text>
            </box>
            <box style={{ border: 'round', borderColor: 'gray', width: 24, flexDirection: 'column', paddingX: 1 }}>
              <text style={{ bold: true }}>metrics</text>
              <text>cpu: <text style={{ color: 'green' }}>23%</text></text>
              <text>mem: <text style={{ color: 'yellow' }}>67%</text></text>
            </box>
          </box>

          <box style={{ border: 'round', borderColor: fm.is('logs') ? accent : 'gray', flexGrow: 1, flexDirection: 'column' }}>
            <text style={{ bold: true, paddingX: 1 }}>logs</text>
            <List
              items={LOGS}
              selected={logIdx()}
              onSelect={setLogIdx}
              focused={fm.is('logs')}
              renderItem={(item, { selected: isSel, focused }) => {
                const method = item.split(' ')[0]
                const color = method === 'GET' ? 'green'
                  : method === 'POST' ? 'cyan'
                  : method === 'PUT' || method === 'PATCH' ? 'yellow'
                  : method === 'DELETE' ? 'red'
                  : null

                return (
                  <box style={{ flexDirection: 'row', paddingX: 1, bg: isSel ? (focused ? accent : 'gray') : null }}>
                    <text style={{ color: isSel ? 'black' : color, width: 7 }}>{method}</text>
                    <text style={{ color: isSel ? 'black' : null }}>{item.slice(method.length + 1)}</text>
                  </box>
                )
              }}
            />
          </box>

          <box style={{ flexDirection: 'row', paddingX: 1 }}>
            <text style={{ color: 'green' }}>ok</text>
            <box style={{ flexGrow: 1 }} />
            <text style={{ color: 'gray', dim: true }}>5 services  |  15 requests  |  0 errors</text>
          </box>

        </box>
      </box>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <Layout />
}
mount(Standalone, { title: 'layout' })
