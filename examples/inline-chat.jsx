import { mount, createSignal, Scrollback } from '../index.js'
import { TextArea } from '../src/text-area.js'

const ACCENT = '#f59e0b'

const REPLIES = [
  'staying on the main screen is the whole trick - finished messages commit once into native scrollback and the composer stays pinned below. scroll up with your mouse to read the history.',
  'this reply streams in a few words at a time, then freezes into scrollback once it stops changing. nothing above the composer ever redraws again.',
  'enter sends, shift+enter drops to a new line. the composer grows as you type and the live region tracks its height every frame.',
]

function now() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Message({ from, text, at }) {
  const isYou = from === 'you'
  return (
    <box style={{ flexDirection: 'column', paddingX: 2 }}>
      <text> </text>
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text style={{ color: '#4b5563' }}>{at}</text>
        <text style={{ color: isYou ? '#60a5fa' : '#a78bfa', bold: true }}>{isYou ? 'you' : 'trend-agent'}</text>
      </box>
      <text style={{ color: isYou ? '#f9fafb' : '#e5e7eb' }}>{text}</text>
    </box>
  )
}

function Chat() {
  const [history, setHistory] = createSignal([])
  const [streaming, setStreaming] = createSignal(null)
  const [streamAt, setStreamAt] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [turn, setTurn] = createSignal(0)

  function stream(words, i) {
    if (i >= words.length) {
      setHistory(h => [...h, { from: 'trend-agent', text: streaming(), at: streamAt() }])
      setStreaming(null)
      setBusy(false)
      return
    }
    setStreaming(words.slice(0, i + 1).join(' '))
    setTimeout(() => stream(words, i + 1), 45)
  }

  function send(text) {
    const value = text.trim()
    if (!value || busy()) return
    setHistory(h => [...h, { from: 'you', text: value, at: now() }])
    setBusy(true)
    setStreamAt(now())
    setStreaming('')
    const reply = REPLIES[turn() % REPLIES.length]
    setTurn(t => t + 1)
    setTimeout(() => stream(reply.split(' '), 0), 200)
  }

  return (
    <box style={{ flexDirection: 'column' }}>
      <Scrollback items={history()} render={(m) => <Message {...m} />} />

      {streaming() != null && (
        <Message from="trend-agent" at={streamAt()} text={`${streaming()}▋`} />
      )}

      <box style={{ bg: '#1e1e22', flexDirection: 'row', paddingX: 2, paddingY: 1, marginTop: 1 }}>
        <text style={{ color: ACCENT, bold: true }}>{'❯'}</text>
        <text> </text>
        <TextArea
          onSubmit={send}
          submitOnEnter
          clearOnSubmit
          maxHeight={8}
          placeholder="message trend-agent - enter to send, shift+enter for newline"
          cursor={{ blink: true, bg: ACCENT, color: 'black' }}
        />
      </box>

      <box style={{ flexDirection: 'row', paddingX: 2 }}>
        <text style={{ color: '#6b7280' }}>{`${history().length} message${history().length === 1 ? '' : 's'} in scrollback`}</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: busy() ? ACCENT : '#34d399' }}>{busy() ? 'streaming' : 'ready'}</text>
      </box>
    </box>
  )
}

mount(Chat, {
  inline: true,
  title: 'trend inline chat',
  theme: { accent: ACCENT },
})
