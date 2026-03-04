import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { Table } from '../src/table.js'
import { Select } from '../src/select.js'
import { Checkbox } from '../src/checkbox.js'
import { Radio } from '../src/radio.js'
import { ProgressBar } from '../src/progress.js'
import { Spinner } from '../src/spinner.js'
import { Modal } from '../src/modal.js'

const PROCESSES = [
  { pid: 1234, name: 'node server.js', cpu: 12.3, mem: 145, status: 'running' },
  { pid: 1235, name: 'postgres', cpu: 3.1, mem: 512, status: 'running' },
  { pid: 1236, name: 'redis-server', cpu: 0.8, mem: 24, status: 'running' },
  { pid: 1237, name: 'nginx', cpu: 1.2, mem: 32, status: 'running' },
  { pid: 1238, name: 'webpack --watch', cpu: 45.6, mem: 890, status: 'running' },
  { pid: 1239, name: 'jest --watchAll', cpu: 8.4, mem: 256, status: 'idle' },
  { pid: 1240, name: 'docker-proxy', cpu: 0.1, mem: 18, status: 'idle' },
  { pid: 1241, name: 'eslint_d', cpu: 0.0, mem: 42, status: 'idle' },
  { pid: 1242, name: 'tsserver', cpu: 15.7, mem: 380, status: 'running' },
  { pid: 1243, name: 'vite dev', cpu: 2.3, mem: 95, status: 'running' },
]

function App() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'table' })
  fm.item('table')
  fm.group('settings', {
    items: ['sortBy', 'autoRefresh', 'showIdle', 'refreshRate'],
  })

  const [tableIdx, setTableIdx] = createSignal(0)
  const [sortBy, setSortBy] = createSignal('cpu')
  const [autoRefresh, setAutoRefresh] = createSignal(true)
  const [showIdle, setShowIdle] = createSignal(false)
  const [refreshRate, setRefreshRate] = createSignal('1s')
  const [modalOpen, setModalOpen] = createSignal(false)

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
    if (key === 'm') {
      if (!fm.is('modal')) { setModalOpen(true); fm.push('modal') }
      else { setModalOpen(false); fm.pop() }
    }
  })

  const filtered = showIdle() ? PROCESSES : PROCESSES.filter(p => p.status === 'running')
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy() === 'cpu') return b.cpu - a.cpu
    if (sortBy() === 'mem') return b.mem - a.mem
    if (sortBy() === 'name') return a.name.localeCompare(b.name)
    return a.pid - b.pid
  })

  const sel = sorted[tableIdx()]

  const columns = [
    { header: 'PID', key: 'pid', width: 7 },
    { header: 'PROCESS', key: 'name', flexGrow: 1 },
    {
      header: 'CPU %',
      width: 10,
      render: (row) => `${row.cpu.toFixed(1)}%`,
      color: 'yellow',
    },
    {
      header: 'MEM',
      width: 10,
      render: (row) => `${row.mem}MB`,
    },
    {
      header: 'STATUS',
      width: 10,
      render: (row) => row.status,
      color: 'green',
    },
  ]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>components</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          tab: switch  m: modal
        </text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('table') ? accent : 'gray', flexGrow: 1, flexDirection: 'column' }}>
          <Table
            columns={columns}
            data={sorted}
            selected={tableIdx()}
            onSelect={setTableIdx}
            focused={fm.is('table')}
          />
        </box>

        <box style={{ border: 'round', borderColor: fm.is('settings') ? accent : 'gray', width: 30, flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: accent }}>settings</text>
          <box style={{ height: 1 }} />

          <text style={{ color: 'gray', dim: true }}>sort by</text>
          <Select
            items={['pid', 'name', 'cpu', 'mem']}
            selected={sortBy()}
            onSelect={setSortBy}
            focused={fm.is('sortBy')}
            overlay
          />
          <box style={{ height: 1 }} />

          <Checkbox
            checked={autoRefresh()}
            label="auto refresh"
            onChange={setAutoRefresh}
            focused={fm.is('autoRefresh')}
          />
          <Checkbox
            checked={showIdle()}
            label="show idle"
            onChange={setShowIdle}
            focused={fm.is('showIdle')}
          />
          <box style={{ height: 1 }} />

          <text style={{ color: 'gray', dim: true }}>refresh rate</text>
          <Radio
            options={['500ms', '1s', '5s', '10s']}
            selected={refreshRate()}
            onSelect={setRefreshRate}
            focused={fm.is('refreshRate')}
          />
          <box style={{ height: 1 }} />

          <text style={{ color: 'gray', dim: true }}>system load</text>
          <ProgressBar value={0.67} color="green" label="cpu 67%" />
          <ProgressBar value={0.43} label="mem 43%" />
          <ProgressBar value={0.91} color="red" label="disk 91%" />
          <box style={{ height: 1 }} />

          <Spinner label="monitoring..." />
        </box>
      </box>

      <Modal
        open={modalOpen()}
        onClose={() => { setModalOpen(false); fm.pop() }}
        title="process details"
        width={45}
      >
        {sel && <text>pid: {sel.pid}</text>}
        {sel && <text>name: {sel.name}</text>}
        {sel && <text>cpu: <text style={{ color: 'yellow' }}>{sel.cpu}%</text>  mem: {sel.mem}MB</text>}
        <box style={{ height: 1 }} />
        <text style={{ color: 'gray', dim: true }}>press esc to close</text>
      </Modal>
    </box>
  )
}

mount(App, { title: 'components', theme: { accent: 'magenta' } })
