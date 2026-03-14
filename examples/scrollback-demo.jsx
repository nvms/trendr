import { mount, createSignal, useInput, useInterval, useFocus, useTheme, ScrollBox, TextArea } from '../index.js'

const BANNER = [
  '        \u2513',
  '\u254b\u250f\u2513\u250f\u2513\u250f\u2513\u250f\u252b',
  '\u2517\u251b \u2517 \u251b\u2517\u2517\u253b',
]

const SCRIPT = [
  { kind: 'system', text: 'session booted. rendering on the main screen, preserving terminal scrollback.' },
  { kind: 'user', author: 'user', text: 'show me how a fixed bottom composer can work without an alt buffer.' },
  { kind: 'assistant', author: 'trend-agent', text: 'staying on the main screen is only part of it. the stronger version usually uses a scroll region so the top pane can scroll while the composer stays pinned.' },
  { kind: 'tool', title: 'grep alt-screen path', status: 'running', detail: 'rg "altScreen" src/renderer.js' },
  { kind: 'tool', title: 'grep alt-screen path', status: 'done', detail: 'renderer was hard-wired to enter and leave the alternate screen.' },
  { kind: 'assistant', author: 'trend-agent', text: 'for this demo the transcript is a plain scroll log, not a selectable list. that is the right model for chat.' },
  { kind: 'tool', title: 'patch demo', status: 'done', detail: 'replaced the list-based feed with a scrollable transcript view.' },
  { kind: 'user', author: 'user', text: 'simulate a longer run with tool chatter and make the input area feel like a real fixed composer.' },
  { kind: 'assistant', author: 'trend-agent', text: 'stream starting. rows will keep appending for a few seconds. tab switches between feed and composer. when the feed is focused, j and k scroll.' },
  { kind: 'tool', title: 'scan codebase', status: 'done', detail: 'examples/chat.jsx and src/scrollable-text.js are enough to wire a stable prototype.' },
  { kind: 'assistant', author: 'trend-agent', text: 'the composer below is exactly three rows tall: one blank row, one active typing row, and one blank row. the middle row contains a textarea so the implementation stays close to the real component surface.' },
  { kind: 'tool', title: 'run smoke checks', status: 'done', detail: 'layout is stable under repeated transcript growth.' },
  { kind: 'assistant', author: 'trend-agent', text: 'this sentence is intentionally long enough to wrap over multiple visual lines so the transcript behaves like a real coding conversation instead of a toy one-liner log.' },
  { kind: 'tool', title: 'prepare exit', status: 'done', detail: 'after the scripted run finishes, the app exits and prints the transcript into terminal scrollback for inspection.' },
]

let nextId = 1

function entry(kind, extra = {}) {
  return { id: nextId++, kind, ...extra }
}

function timeStamp() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function seedEntries() {
  return [entry('banner')]
}

function BannerBlock() {
  return (
    <box style={{ flexDirection: 'column' }}>
      {BANNER.map((line, i) => <text key={i} style={{ color: '#f59e0b' }}>{line}</text>)}
      <text> </text>
      <text style={{ color: '#4b5563' }}>main-screen tui simulation with a fixed bottom composer</text>
      <text style={{ color: '#4b5563' }}>{'─'.repeat(56)}</text>
      <text> </text>
    </box>
  )
}

function SystemMsg({ item }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: '#4b5563' }}>{item.at}</text>
        <text>  </text>
        <text style={{ color: '#6b7280', dim: true }}>{item.text}</text>
      </box>
    </box>
  )
}

function ToolMsg({ item }) {
  const statusColor = item.status === 'running' ? '#f59e0b' : '#34d399'
  const icon = item.status === 'running' ? '~' : '+'
  return (
    <box style={{ flexDirection: 'column' }}>
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: '#4b5563' }}>{item.at}</text>
        <text>  </text>
        <text style={{ color: statusColor }}>{icon}</text>
        <text> </text>
        <text style={{ color: '#22d3ee' }}>{item.title}</text>
      </box>
      <text style={{ color: '#6b7280' }}>{item.detail}</text>
    </box>
  )
}

function UserMsg({ item }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: '#4b5563' }}>{item.at}</text>
        <text>  </text>
        <text style={{ color: '#60a5fa', bold: true }}>{item.author}</text>
      </box>
      <text style={{ color: '#f9fafb' }}>{item.text}</text>
    </box>
  )
}

function AssistantMsg({ item }) {
  return (
    <box style={{ flexDirection: 'column' }}>
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: '#4b5563' }}>{item.at}</text>
        <text>  </text>
        <text style={{ color: '#a78bfa', bold: true }}>{item.author}</text>
      </box>
      <text style={{ color: '#e5e7eb' }}>{item.text}</text>
    </box>
  )
}

function TranscriptItem({ item }) {
  if (item.kind === 'banner') return <BannerBlock />
  if (item.kind === 'system') return <SystemMsg item={item} />
  if (item.kind === 'tool') return <ToolMsg item={item} />
  if (item.kind === 'user') return <UserMsg item={item} />
  if (item.kind === 'assistant') return <AssistantMsg item={item} />
  return null
}

export function ScrollbackDemo() {
  const { accent } = useTheme()
  const focus = useFocus({ initial: 'input' })
  focus.item('feed')
  focus.item('input')

  const [entries, setEntries] = createSignal(seedEntries())
  const [offset, setOffset] = createSignal(0)
  const [follow, setFollow] = createSignal(true)
  const [step, setStep] = createSignal(0)
  const [status, setStatus] = createSignal('streaming scripted session')
  const [finished, setFinished] = createSignal(false)

  function append(payload) {
    const next = entry(payload.kind, { ...payload, at: timeStamp() })
    setEntries(prev => [...prev, next])
    if (follow()) setOffset(1e9)
  }

  useInterval(() => {
    if (finished()) return
    const i = step()
    if (i >= SCRIPT.length) {
      setFinished(true)
      setStatus('script complete - tab between feed and composer, ctrl+c to quit')
      return
    }
    append(SCRIPT[i])
    setStep(i + 1)
  }, 900)

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
    if (!focus.is('feed')) return

    if (key === 'up' || key === 'k' || key === 'home' || key === 'g' || key === 'pageup' || (ctrl && key === 'b')) {
      setFollow(false)
    }

    if (key === 'down' || key === 'j' || key === 'end' || key === 'G' || key === 'pagedown' || (ctrl && key === 'f')) {
      setFollow(true)
      setOffset(1e9)
    }
  })

  function submit(text) {
    const value = text.trim()
    if (!value) return

    append({ kind: 'user', author: 'you', text: value })
    setStatus('queued a local echo exchange')

    setTimeout(() => append({ kind: 'tool', title: 'local echo', status: 'running', detail: `drafting response for: ${value}` }), 350)
    setTimeout(() => append({ kind: 'assistant', author: 'trend-agent', text: `received "${value}". this composer is fixed to the bottom of the viewport while the transcript above remains scrollable.` }), 900)
    setTimeout(() => setStatus(finished() ? 'script complete - tab between feed and composer, ctrl+c to quit' : 'streaming scripted session'), 1300)
  }

  const feedHint = 'feed focused - j/k scroll, tab to composer'
  const inputHint = 'composer focused - meta+enter submits, tab to feed'

  return (
    <box style={{ flexDirection: 'column', height: '100%', paddingX: 1 }}>
      <box style={{ flexDirection: 'row', height: 1, minHeight: 1 }}>
        <text style={{ bold: true, color: accent }}>scrollback demo</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: '#6b7280', dim: true }}>
          {focus.is('feed') ? feedHint : inputHint}
        </text>
      </box>

      <box style={{ flexGrow: 1, paddingX: 1 }}>
        <ScrollBox
          focused={focus.is('feed')}
          scrollOffset={offset()}
          onScroll={(next) => {
            if (next < offset()) setFollow(false)
            setOffset(next)
          }}
          scrollbar
          gap={1}
        >
          {entries().map(item => <TranscriptItem key={item.id} item={item} />)}
        </ScrollBox>
      </box>

      <box style={{ height: 1, minHeight: 1 }} />

      <box style={{ bg: '#1e1e22', flexDirection: 'column', paddingY: 1 }}>
        <box style={{ bg: '#1e1e22', flexDirection: 'row', paddingX: 1 }}>
          <text style={{ color: focus.is('input') ? accent : '#6b7280', bold: true }}>{'>'}</text>
          <text> </text>
          <TextArea
            onSubmit={submit}
            clearOnSubmit
            maxHeight={10}
            placeholder="type a message, meta+enter submits..."
            focused={focus.is('input')}
            cursor={{ blink: true, bg: accent, color: 'black' }}
          />
        </box>
      </box>

      <box style={{ flexDirection: 'row', height: 1, minHeight: 1 }}>
        <text style={{ color: '#6b7280' }}>{status()}</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: follow() ? '#34d399' : '#f59e0b' }}>{follow() ? 'follow' : 'scrolling'}</text>
      </box>
    </box>
  )
}

mount(ScrollbackDemo, {
  title: 'trend scrollback demo',
  altScreen: false,
  theme: {
    accent: '#f59e0b',
    cursor: {
      blink: true,
      bg: '#f59e0b',
      color: 'black',
    },
  },
})
