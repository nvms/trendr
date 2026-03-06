import { mount, createSignal, useInput, useTheme } from '../index.js'
import { List } from '../src/list.js'

const ITEMS = [
  { name: 'node server.js', desc: 'Express API on port 3000', status: 'running', cpu: '12.3%' },
  { name: 'postgres', desc: 'Primary database, 42 connections', status: 'running', cpu: '3.1%' },
  { name: 'redis-server', desc: 'Cache layer, 2.1GB used', status: 'running', cpu: '0.8%' },
  { name: 'nginx', desc: 'Reverse proxy, TLS termination', status: 'running', cpu: '1.2%' },
  { name: 'webpack --watch', desc: 'Bundling client assets', status: 'running', cpu: '45.6%' },
  { name: 'jest --watchAll', desc: 'Test runner, 184 tests', status: 'idle', cpu: '8.4%' },
  { name: 'docker-proxy', desc: 'Container network bridge', status: 'idle', cpu: '0.1%' },
  { name: 'eslint_d', desc: 'Lint daemon for editor', status: 'idle', cpu: '0.0%' },
  { name: 'tsserver', desc: 'TypeScript language server', status: 'running', cpu: '15.7%' },
  { name: 'vite dev', desc: 'HMR dev server on port 5173', status: 'running', cpu: '2.3%' },
  { name: 'esbuild', desc: 'Bundler service process', status: 'running', cpu: '0.4%' },
  { name: 'containerd', desc: 'Container runtime daemon', status: 'running', cpu: '0.2%' },
]

function App() {
  const { accent } = useTheme()
  const [sel, setSel] = createSignal(0)

  useInput(({ key, ctrl }) => {
    if ((ctrl && key === 'c') || key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>multi-row list</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          j/k scroll  g/G top/bottom  q quit
        </text>
      </box>
      <box style={{ border: 'round', borderColor: accent, flexGrow: 1, flexDirection: 'column' }}>
        <List
          items={ITEMS}
          selected={sel()}
          onSelect={setSel}
          focused={true}
          itemHeight={3}
          gap={1}
          renderItem={(item, { selected, focused }) => (
            <box style={{ flexDirection: 'column', bg: selected ? (focused ? accent : 'gray') : null }}>
              <box style={{ flexDirection: 'row' }}>
                <text style={{ bold: true, color: selected ? 'black' : null }}> {item.name}</text>
                <box style={{ flexGrow: 1 }} />
                <text style={{ color: selected ? 'black' : 'yellow' }}>{item.cpu} </text>
              </box>
              <text style={{ color: selected ? 'black' : 'gray', dim: !selected }}> {item.desc}</text>
              <text style={{ color: selected ? 'black' : (item.status === 'running' ? 'green' : 'gray'), dim: !selected }}> {item.status}</text>
            </box>
          )}
        />
      </box>
    </box>
  )
}

mount(App, { title: 'multi-row list', theme: { accent: 'cyan' } })
