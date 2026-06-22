import { mount, createSignal, Shimmer, Menu, Modal, Scrollback } from '../index.js'
import { TextArea } from '../src/text-area.js'

const ACCENT = '#60a5fa'

const REPLIES = [
  'staying on the main screen is the whole trick. instead of swapping to the alternate screen buffer the way a full-screen tui does, the renderer keeps drawing into the normal buffer and only ever repaints a small live region at the bottom. every finished message is printed exactly once and then committed straight into your terminal native scrollback, where it freezes and is never touched again. that means you can scroll up with your mouse or trackpad just like you would in any other shell session, select text, and copy it, all without the framework getting in the way. the composer down here stays pinned no matter how long the transcript above it grows.',
  'this reply is streaming in a few words at a time so you can actually watch the live region update. while it is arriving the spinner and shimmer to the left tell you the model is still working, and the little counter beside them ticks up one second at a time so you have a sense of how long the response is taking. the moment the stream stops, this whole block stops changing, graduates into scrollback as a single immutable message, and the thinking indicator disappears. nothing above the composer ever redraws after that point, which is what keeps the whole thing fast and flicker free.',
  'enter sends your message and shift plus enter drops to a new line, so you can write multi line prompts without accidentally firing them off early. the composer grows downward as you type and the live region measures its height every single frame, so the bottom of the screen always lines up correctly no matter how tall the input gets. try pasting a few paragraphs in and watch it expand, then send it and watch your text commit upward into the history above while a fresh reply starts streaming in right where the old one was.',
]

const COMMANDS = [
  { name: 'modal', desc: 'Open a sample MCP servers modal (esc to close)' },
  { name: 'clear', desc: 'Clear the conversation and free the context window' },
  { name: 'compact', desc: 'Summarize the conversation so far into a shorter form' },
  { name: 'model', desc: 'Switch the active model for this session' },
  { name: 'review', desc: 'Review a pull request and leave inline comments' },
  { name: 'cost', desc: 'Show token usage and estimated cost so far' },
  { name: 'config', desc: 'Open the settings panel' },
  { name: 'init', desc: 'Generate a project guide for this repository' },
  { name: 'resume', desc: 'Pick up a previous conversation where you left off' },
  { name: 'export', desc: 'Save the current conversation to a file' },
  { name: 'help', desc: 'List every command and what it does' },
]

const BANNER = [
';D',
 // '⣀⡀ ⠄ ⢀⣀ ⢀⡀',
 // '⡧⠜ ⠇ ⠣⠤ ⠣⠜',
// '╭─╮╷╭─╴╭─╮',
// '├─╯││  │ │',
// '╵  ╵╰─╴╰─╯',
  // '  ▘    ',
  // '▛▌▌▛▘▛▌',
  // '▙▌▌▙▖▙▌',
  // '▌      ',
]

function Message({ from, text, kind }) {
  if (kind === 'banner') {
    return (
      <box style={{ flexDirection: 'column', paddingX: 2 }}>
        {BANNER.map((line, i) => (
          <text key={i} style={{ color: '#a78bfa' }}>{line}</text>
        ))}
      </box>
    )
  }

  // your own messages echo the composer: same dark bar, an empty top row, your
  // text in the middle, and an empty bottom row from paddingY
  if (from === 'you') {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text> </text>
        <box style={{ bg: '#1e1e22', flexDirection: 'column', paddingX: 2, paddingY: 1 }}>
          <text style={{ color: '#f9fafb' }}>{text}</text>
        </box>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', paddingX: 2 }}>
      <text> </text>
      <text style={{ color: '#e5e7eb' }}>{text}</text>
    </box>
  )
}

function Chat() {
  const [history, setHistory] = createSignal([{ kind: 'banner' }])
  const [streaming, setStreaming] = createSignal(null)
  const [startedAt, setStartedAt] = createSignal(0)
  const [busy, setBusy] = createSignal(false)
  const [turn, setTurn] = createSignal(0)
  const [input, setInput] = createSignal('')
  const [cmdIndex, setCmdIndex] = createSignal(0)
  const [notice, setNotice] = createSignal('')
  const [showModal, setShowModal] = createSignal(false)

  function runCommand(c) {
    setInput('')
    if (c.name === 'modal') { setShowModal(true); return }
    const msg = `ran /${c.name}`
    setNotice(msg)
    // self-clearing so a later command does not get wiped by an older timer
    setTimeout(() => setNotice(n => (n === msg ? '' : n)), 2500)
  }

  function stream(words, i) {
    if (i >= words.length) {
      setHistory(h => [...h, { from: 'trend-agent', text: streaming() }])
      setStreaming(null)
      setBusy(false)
      return
    }
    setStreaming(words.slice(0, i + 1).join(' '))
    setTimeout(() => stream(words, i + 1), 55)
  }

  function send(text) {
    const value = text.trim()
    if (!value || busy()) return
    setHistory(h => [...h, { from: 'you', text: value }])
    setBusy(true)
    setStartedAt(Date.now())
    setStreaming('')
    const reply = REPLIES[turn() % REPLIES.length]
    setTurn(t => t + 1)
    setTimeout(() => stream(reply.split(' '), 0), 400)
  }

  const elapsed = busy() ? Math.max(0, Math.floor((Date.now() - startedAt()) / 1000)) : 0

  // fake token accounting, roughly 4 chars per token, plus a base system
  // prompt so the input count looks realistic from the first turn
  const estTokens = (s) => Math.ceil(s.length / 4)
  const inTokens = 1280 + history().filter(m => m.from === 'you').reduce((a, m) => a + estTokens(m.text), 0)
  const outTokens = history().filter(m => m.from === 'trend-agent').reduce((a, m) => a + estTokens(m.text), 0)
    + (streaming() ? estTokens(streaming()) : 0)

  // slash command palette: only when the input starts with "/" and you are
  // still typing the command token (no space yet). escape clears the input,
  // which drops the list out of the live region automatically
  const slashQuery = input().startsWith('/') ? input().slice(1) : null
  const showCommands = slashQuery !== null && !slashQuery.includes(' ')
  const matchedCommands = showCommands
    ? COMMANDS.filter(c => c.name.startsWith(slashQuery.toLowerCase()))
    : []

  return (
    <box style={{ flexDirection: 'column' }}>
      <Scrollback items={history()} render={(m) => <Message {...m} />} />

      {streaming() && (
        <Message from="trend-agent" text={`${streaming()}▋`} />
      )}

      {busy() && (
        <box style={{ flexDirection: 'row', paddingX: 2, marginTop: 1 }}>
          <Shimmer color="#a78bfa" highlight="white" duration={1500} reverse>Responding</Shimmer>
          <text style={{ color: '#4b5563' }}>{` (${elapsed}s)`}</text>
        </box>
      )}

      <box style={{ bg: '#1e1e22', flexDirection: 'row', paddingX: 2, paddingY: 1, marginTop: 1 }}>
        <text style={{ color: ACCENT, bold: true }}>{'❯'}</text>
        <text> </text>
        <TextArea
          value={input()}
          onChange={(v) => { setInput(v); setCmdIndex(0) }}
          onCancel={() => setInput('')}
          onSubmit={send}
          submitOnEnter
          clearOnSubmit
          maxHeight={8}
          placeholder="enter to send, / for commands"
          cursor={{ blink: true, bg: ACCENT, color: 'black' }}
        />
      </box>

      {showCommands && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          {matchedCommands.length === 0 ? (
            <text style={{ color: '#4b5563' }}>no matching commands</text>
          ) : (
            <Menu
              items={matchedCommands}
              selected={cmdIndex()}
              onSelect={setCmdIndex}
              onSubmit={runCommand}
              focused={showCommands}
              maxVisible={5}
              scrolloff={2}
              renderItem={(c, { active }) => (
                <box style={{ flexDirection: 'row' }}>
                  <text style={{ color: ACCENT }}>{active ? '› ' : '  '}</text>
                  <text style={{ color: active ? ACCENT : '#6b7280' }}>{`/${c.name}`.padEnd(12)}</text>
                  <text style={{ color: active ? '#cbd5e1' : '#4b5563' }}>{c.desc}</text>
                </box>
              )}
            />
          )}
        </box>
      )}

      <box style={{ flexDirection: 'row', paddingX: 2, gap: 1 }}>
        {notice() ? <text style={{ color: '#34d399' }}>{notice()}</text> : null}
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: '#a78bfa' }}>claude-opus-4-8</text>
        <text style={{ color: '#4b5563' }}>↑</text>
        <text style={{ color: '#6b7280' }}>{`${inTokens.toLocaleString()} in`}</text>
        <text style={{ color: '#374151' }}>·</text>
        <text style={{ color: '#4b5563' }}>↓</text>
        <text style={{ color: '#6b7280' }}>{`${outTokens.toLocaleString()} out`}</text>
      </box>

      <Modal open={showModal()} onClose={() => setShowModal(false)} title="MCP Servers" width={56}>
        <text style={{ color: '#6b7280' }}>{'⌕  search...'}</text>
        <text> </text>
        <text style={{ color: '#7dd3fc' }}>{'▸ ▪ atlas       (global)   8/18'}</text>
        <text style={{ color: '#9ca3af' }}>{'  ▪ ledger      (global)  24/24'}</text>
        <text style={{ color: '#9ca3af' }}>{'  ▫ forge       (global)   0/12'}</text>
        <text style={{ color: '#9ca3af' }}>{'  ▫ beacon      (global)   0/9'}</text>
        <text style={{ color: '#9ca3af' }}>{'  ▪ almanac     (global)  31/31'}</text>
        <text> </text>
        <text style={{ color: '#4b5563' }}>{'↑↓ navigate   space toggle   esc close'}</text>
      </Modal>
    </box>
  )
}

mount(Chat, {
  inline: true,
  title: 'trend inline chat',
  theme: { accent: ACCENT },
})
