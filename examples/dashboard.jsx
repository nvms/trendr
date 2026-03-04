import { mount, createSignal, useInput, useInterval } from '../index.js'

function ProgressBar({ value, width = 20, color = 'green' }) {
  const filled = Math.round(value / 100 * width)
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
  return <text style={{ color }}>{bar} {value}%</text>
}

function Gauge({ label, value, color }) {
  return (
    <box style={{ flexDirection: 'row', gap: 1 }}>
      <text style={{ color: 'white', bold: true, width: 6 }}>{label}</text>
      <ProgressBar value={value()} width={30} color={color} />
    </box>
  )
}

function Clock() {
  const [time, setTime] = createSignal(new Date().toLocaleTimeString())

  useInterval(() => {
    setTime(new Date().toLocaleTimeString())
  }, 1000)

  return (
    <text style={{ color: 'brightCyan', bold: true }}>
      {time()}
    </text>
  )
}

function Dashboard() {
  const [cpu, setCpu] = createSignal(0)
  const [mem, setMem] = createSignal(0)
  const [disk, setDisk] = createSignal(0)
  const [net, setNet] = createSignal(0)

  useInterval(() => {
    setCpu(prev => Math.min(100, Math.max(0, prev + (Math.random() * 20 - 10) | 0)))
    setMem(prev => Math.min(100, Math.max(0, prev + (Math.random() * 10 - 5) | 0)))
    setDisk(prev => Math.min(100, Math.max(0, prev + (Math.random() * 4 - 2) | 0)))
    setNet(prev => Math.min(100, Math.max(0, prev + (Math.random() * 30 - 15) | 0)))
  }, 500)

  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text style={{ color: 'white', bold: true }}>System Monitor</text>
        <box style={{ flexGrow: 1 }} />
        <Clock />
      </box>

      <box style={{ flexDirection: 'column', gap: 0 }}>
        <Gauge label="CPU" value={cpu} color="green" />
        <Gauge label="MEM" value={mem} color="yellow" />
        <Gauge label="DISK" value={disk} color="blue" />
        <Gauge label="NET" value={net} color="magenta" />
      </box>

      <text style={{ color: 'gray' }}>press q to quit</text>
    </box>
  )
}

mount(Dashboard, { title: 'dashboard' })
