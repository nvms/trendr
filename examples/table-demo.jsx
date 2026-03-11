import { mount, createSignal, useInput, useTheme, Table } from 'trend'

const thoughts = [
  { text: 'maybe the broadcast layer should batch messages instead of sending individually to reduce overhead', time: '2h ago' },
  { text: 'redis pub/sub has too much overhead per message, especially for high frequency updates across multiple channels', time: '3h ago' },
  { text: 'is there a way to reduce broadcast latency without sacrificing reliability?', time: '5h ago' },
  { text: 'short thought', time: '6h ago' },
  { text: 'the auth system needs a complete redesign - current token refresh flow has race conditions when multiple tabs are open simultaneously and competing for the refresh endpoint', time: '1d ago' },
  { text: 'consider using a mutex or leader election pattern for token refresh across browser tabs', time: '1d ago' },
  { text: 'fsm library should support parallel states - right now everything is strictly sequential which limits expressiveness for complex UI flows', time: '2d ago' },
  { text: 'another short one', time: '2d ago' },
  { text: 'what if we used a service worker as the single refresh coordinator? all tabs communicate through it, only one refresh happens at a time', time: '3d ago' },
  { text: 'mesh-kit channel ordering is broken when messages arrive during a reconnect window - need to buffer and replay in sequence', time: '3d ago' },
  { text: 'the distillation system should weight more recent fragments higher - older thoughts may have been superseded', time: '4d ago' },
  { text: 'yet another thought about something interesting that wraps to demonstrate scrolling behavior with many items in the list', time: '5d ago' },
]

function App() {
  const { accent } = useTheme()
  const [selected, setSelected] = createSignal(0)

  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      <box style={{ paddingX: 2 }}>
        <text style={{ dim: true, width: 10 }}>bucket</text>
        <text style={{ bold: true }}>broadcast-batching</text>
      </box>
      <box style={{ paddingX: 2 }}>
        <text style={{ dim: true, width: 10 }}>entity</text>
        <text>mesh-kit</text>
      </box>
      <box style={{ paddingX: 2 }}>
        <text style={{ dim: true, width: 10 }}>thoughts</text>
        <text>{thoughts.length}</text>
      </box>

      <box style={{ paddingX: 1, marginTop: 1, flexGrow: 1 }}>
        <Table
          columns={[
            { header: 'thought', flexGrow: 1, paddingX: 1 },
            { header: 'captured', paddingX: 1 },
          ]}
          data={thoughts}
          selected={selected()}
          onSelect={setSelected}
          focused
          scrollbar
          separator
          stickyHeader
          gap={1}
          scrolloff={0}
          renderItem={(item, { selected: isSel, focused: isFoc }) => (
            <box style={{ flexDirection: 'row', bg: isSel ? (isFoc ? accent : 'gray') : null }}>
              <text style={{ color: isSel && isFoc ? 'black' : null, flexGrow: 1, overflow: 'wrap', paddingX: 1 }}>{item.text}</text>
              <text style={{ color: isSel && isFoc ? 'black' : 'gray', paddingX: 1 }}>{item.time}</text>
            </box>
          )}
        />
      </box>

      <box style={{ paddingX: 2, marginTop: 1 }}>
        <text style={{ dim: true }}>j/k: navigate  q: quit</text>
      </box>
    </box>
  )
}

mount(App, { title: 'table demo', theme: { accent: 'cyan' } })
