import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { Table } from '../src/table.js'

const TASKS = [
  { id: 1, title: 'design auth flow', bucket: 'auth', priority: 'high', age: '2d' },
  { id: 2, title: 'fix token refresh', bucket: 'auth', priority: 'critical', age: '5hr' },
  { id: 3, title: 'add rate limiting', bucket: 'api', priority: 'medium', age: '1d' },
  { id: 4, title: 'optimize query planner', bucket: 'db', priority: 'low', age: '3d' },
  { id: 5, title: 'migrate to postgres 17', bucket: 'db', priority: 'medium', age: '1w' },
  { id: 6, title: 'write integration tests', bucket: 'testing', priority: 'high', age: '4d' },
  { id: 7, title: 'set up CI pipeline', bucket: 'infra', priority: 'high', age: '6hr' },
  { id: 8, title: 'dashboard mockup', bucket: 'ui', priority: 'low', age: '2w' },
]

const PRIORITY_COLOR = { critical: 'red', high: 'yellow', medium: 'cyan', low: 'gray' }

function App() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'default' })
  fm.item('default')
  fm.item('custom')

  const [defaultIdx, setDefaultIdx] = createSignal(0)
  const [customIdx, setCustomIdx] = createSignal(0)

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
    if (key === 'q') process.exit(0)
  })

  const columns = [
    { header: 'task', key: 'title', flexGrow: 1 },
    { header: 'bucket', key: 'bucket', width: 12 },
    { header: 'priority', width: 12, render: (row) => row.priority, color: 'yellow' },
    { header: 'age', key: 'age', width: 8 },
  ]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>custom-table</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>tab: switch panes  q: quit</text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1, gap: 1 }}>
        <box style={{ flexDirection: 'column', flexGrow: 1 }}>
          <box style={{ paddingX: 1 }}>
            <text style={{ color: accent, bold: true }}>default renderItem</text>
          </box>
          <Table
            columns={columns}
            data={TASKS}
            selected={defaultIdx()}
            onSelect={setDefaultIdx}
            focused={fm.is('default')}
            separator
          />
        </box>

        <box style={{ flexDirection: 'column', flexGrow: 1 }}>
          <box style={{ paddingX: 1 }}>
            <text style={{ color: accent, bold: true }}>custom renderItem</text>
          </box>
          <Table
            columns={columns}
            data={TASKS}
            selected={customIdx()}
            onSelect={setCustomIdx}
            focused={fm.is('custom')}
            separator
            renderItem={(row, { selected, focused }) => {
              const bg = selected ? (focused ? accent : 'gray') : null
              const fg = selected && focused ? 'black' : null
              const pColor = selected && focused ? 'black' : PRIORITY_COLOR[row.priority]
              return (
                <box style={{ flexDirection: 'row', bg, paddingX: 1 }}>
                  <text style={{ color: fg, flexGrow: 1 }}>{row.title}</text>
                  <text style={{ color: fg || 'gray', width: 12 }}>{row.bucket}</text>
                  <text style={{ color: pColor, bold: row.priority === 'critical', width: 12 }}>{row.priority}</text>
                  <text style={{ color: fg || 'gray', width: 8 }}>{row.age}</text>
                </box>
              )
            }}
          />
        </box>
      </box>
    </box>
  )
}

mount(App, { title: 'custom-table', theme: { accent: 'magenta' } })
