import { mount, createSignal, useInput, useFocus, useToast, useTheme } from '../index.js'
import { TextArea } from '../src/text-area.js'
import { List } from '../src/list.js'
import { Tabs } from '../src/tabs.js'

const ROOMS = ['general', 'random', 'dev']

const SEED = {
  general: [
    { from: 'alice', text: 'hey everyone', time: '09:01' },
    { from: 'bob', text: 'morning! anyone working on the new release?', time: '09:02' },
    { from: 'alice', text: 'yeah, almost done with the layout engine', time: '09:03' },
    { from: 'charlie', text: 'nice, can\'t wait to try it', time: '09:05' },
    { from: 'bob', text: 'the flex gap support is clean', time: '09:06' },
    { from: 'alice', text: 'just need to wire up border insets and we\'re good', time: '09:07' },
  ],
  random: [
    { from: 'charlie', text: 'anyone seen that new terminal emulator?', time: '10:15' },
    { from: 'bob', text: 'ghostty? yeah it\'s fast', time: '10:16' },
    { from: 'charlie', text: 'might switch from kitty', time: '10:18' },
  ],
  dev: [
    { from: 'alice', text: 'should we use signals or hooks for state?', time: '11:30' },
    { from: 'bob', text: 'signals. way less overhead', time: '11:31' },
    { from: 'alice', text: 'agreed. no reconciler needed', time: '11:32' },
    { from: 'charlie', text: 'what about the hook closure problem?', time: '11:35' },
    { from: 'bob', text: 'ref pattern - mutable object updated each frame', time: '11:36' },
  ],
}

const COLORS = { alice: 'cyan', bob: 'green', charlie: 'yellow', you: 'magenta' }

function now() {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function Chat() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'input' })
  fm.item('input')
  fm.item('list')

  const toast = useToast({ margin: 4 })
  const [room, setRoom] = createSignal('general')
  const [allMessages, setAllMessages] = createSignal({ ...SEED })
  const [listIdx, setListIdx] = createSignal(0)

  useInput(({ key }) => {
    if (fm.is('list')) {
      if (key === 'left' || key === 'h') {
        const i = ROOMS.indexOf(room())
        setRoom(ROOMS[(i - 1 + ROOMS.length) % ROOMS.length])
        setListIdx(0)
      }
      if (key === 'right' || key === 'l') {
        const i = ROOMS.indexOf(room())
        setRoom(ROOMS[(i + 1) % ROOMS.length])
        setListIdx(0)
      }
    }
  })

  const msgs = allMessages()[room()] || []

  function send(text) {
    if (!text.trim()) return
    setAllMessages(prev => ({
      ...prev,
      [room()]: [...(prev[room()] || []), { from: 'you', text: text.trim(), time: now() }],
    }))
    setListIdx(msgs.length)
    toast('message sent')
  }

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1, gap: 1 }}>
        <text style={{ bold: true }}>chat</text>
        <Tabs items={ROOMS} selected={room()} onSelect={setRoom} focused={false} />
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          {fm.is('list') ? 'left/right: rooms  tab: input  j/k: scroll' : 'tab: browse  cmd/alt+enter: send'}
        </text>
      </box>

      <box style={{ flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
        <List
          items={msgs}
          selected={listIdx()}
          onSelect={setListIdx}
          focused={fm.is('list')}
          renderItem={(msg, { selected, focused }) => {
            const highlight = selected && focused
            return (
            <box style={{ flexDirection: 'row', bg: highlight ? accent : null }}>
              <text style={{ color: highlight ? 'black' : 'gray', width: 6 }}>{msg.time}</text>
              <text style={{ color: highlight ? 'black' : COLORS[msg.from], bold: true, width: 10 }}>{msg.from}</text>
              <text style={{ color: highlight ? 'black' : null }}>{msg.text}</text>
            </box>
            )
          }}
        />
      </box>

      <box style={{ border: 'round', borderColor: fm.is('input') ? accent : 'gray', marginX: 1, paddingX: 1 }}>
        <TextArea onSubmit={send} placeholder="type a message..." focused={fm.is('input')} maxHeight={5} cursor={{ blink: true, bg: 'cyan', color: 'black' }} />
      </box>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <Chat />
}
mount(Standalone, { title: 'chat' })
