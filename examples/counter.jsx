import { mount, createSignal, useInput, useTheme } from '../index.js'

function Counter() {
  const { accent } = useTheme()
  const [count, setCount] = createSignal(0)

  useInput(({ key }) => {
    if (key === 'up') setCount(c => c + 1)
    if (key === 'down') setCount(c => c - 1)
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text style={{ color: accent, bold: true }}>
        Count: {count()}
      </text>
      <box style={{ height: 1 }} />
      <text style={{ color: 'gray' }}>
        up/down to change, q to quit
      </text>
    </box>
  )
}

mount(Counter, { title: 'counter', theme: { accent: 'magenta' } })
