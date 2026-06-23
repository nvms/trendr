// the alt-screen counterpart to inline-chat.jsx: the same fake coding agent,
// same look and feel, but rendered fullscreen on the alternate screen buffer
// instead of committing to native scrollback. because the terminal's own
// scrollback is unavailable here, the transcript lives in an in-app ScrollBox
// and a focus manager (tab) switches between scrolling history and composing
import { mount, createSignal, Shimmer, Menu, Modal, ScrollBox, useFocus } from '../index.js'
import { TextArea } from '../src/text-area.js'

const ACCENT = '#6BE795'

const REPLIES = [
  'Bacon ipsum dolor amet meatball pork belly short ribs, jerky tenderloin ham hock turkey corned beef pancetta. Spare ribs pork loin ground round prosciutto, flank capicola short loin tri-tip pig. Sausage chislic burgdoggen chicken, pancetta beef ribs venison strip steak cupim ribeye porchetta frankfurter andouille filet mignon swine drumstick.',
  'Pork chop landjaeger boudin brisket, sirloin shoulder beef ribs alcatra biltong frankfurter buffalo picanha. Kielbasa pastrami ball tip leberkas turducken doner bresaola ground round. Chuck salami meatloaf shankle hamburger tail, pancetta turkey jowl drumstick spare ribs strip steak cow capicola short ribs.',
  'Tenderloin shank ham hock swine, pork chop bacon doner ribeye boudin chislic tri-tip beef ribs. Corned beef jowl venison fatback short loin buffalo salami burgdoggen. Meatball andouille chicken pork pig prosciutto sausage flank drumstick alcatra rump biltong pastrami cupim sirloin meatloaf kielbasa porchetta.',
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
  'pico',
]

function Message({ from, text, kind }) {
  if (kind === 'banner') {
    return (
      <box style={{ flexDirection: 'column', paddingX: 2 }}>
        {BANNER.map((line, i) => (
          <text key={i} style={{ color: ACCENT }}>{line}</text>
        ))}
      </box>
    )
  }

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

  // in-app scroll position. while following, the feed stays pinned to the
  // bottom (a huge offset clamps to the end inside ScrollBox)
  const [offset, setOffset] = createSignal(0)
  const [follow, setFollow] = createSignal(true)

  const fm = useFocus({ initial: 'input' })
  fm.item('feed')
  fm.item('input')

  function runCommand(c) {
    setInput('')
    if (c.name === 'modal') { setShowModal(true); return }
    const msg = `ran /${c.name}`
    setNotice(msg)
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
    setFollow(true) // sending snaps back to the bottom
    setBusy(true)
    setStartedAt(Date.now())
    setStreaming('')
    const reply = REPLIES[turn() % REPLIES.length]
    setTurn(t => t + 1)
    setTimeout(() => stream(reply.split(' '), 0), 400)
  }

  const elapsed = busy() ? Math.max(0, Math.floor((Date.now() - startedAt()) / 1000)) : 0

  const estTokens = (s) => Math.ceil(s.length / 4)
  const inTokens = 1280 + history().filter(m => m.from === 'you').reduce((a, m) => a + estTokens(m.text), 0)
  const outTokens = history().filter(m => m.from === 'trend-agent').reduce((a, m) => a + estTokens(m.text), 0)
    + (streaming() ? estTokens(streaming()) : 0)

  const slashQuery = input().startsWith('/') ? input().slice(1) : null
  const showCommands = slashQuery !== null && !slashQuery.includes(' ')
  const matchedCommands = showCommands
    ? COMMANDS.filter(c => c.name.startsWith(slashQuery.toLowerCase()))
    : []

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <ScrollBox
        style={{ flexGrow: 1 }}
        focused={fm.is('feed')}
        scrollOffset={follow() ? 1e9 : offset()}
        onScroll={(next) => { setFollow(false); setOffset(next) }}
        scrollbar
      >
        {history().map((m, i) => <Message key={i} {...m} />)}
        {streaming() && <Message key="streaming" from="trend-agent" text={`${streaming()}▋`} />}
      </ScrollBox>

      {busy() && (
        <box style={{ flexDirection: 'row', paddingX: 2, marginTop: 1 }}>
          <Shimmer color={ACCENT} highlight="white" duration={1500} reverse>Responding</Shimmer>
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
          focused={fm.is('input') && !showModal()}
          maxHeight={8}
          placeholder="enter to send, / for commands, tab to scroll"
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
        {notice()
          ? <text style={{ color: '#34d399' }}>{notice()}</text>
          : <text style={{ color: '#4b5563' }}>{fm.is('feed') ? 'feed · tab to compose' : 'tab to scroll history'}</text>}
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: ACCENT }}>claude-opus-4-8</text>
        <text style={{ color: '#4b5563' }}>↑</text>
        <text style={{ color: '#6b7280' }}>{`${inTokens.toLocaleString()} in`}</text>
        <text style={{ color: '#374151' }}>·</text>
        <text style={{ color: '#4b5563' }}>↓</text>
        <text style={{ color: '#6b7280' }}>{`${outTokens.toLocaleString()} out`}</text>
      </box>

      <Modal open={showModal()} onClose={() => setShowModal(false)} title="MCP Servers" width={56}>
        <text style={{ color: '#6b7280' }}>{'⌕  search...'}</text>
        <text> </text>
        <text style={{ color: ACCENT }}>{'▸ ▪ atlas       (global)   8/18'}</text>
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
  title: 'trend alt-buffer chat',
  theme: { accent: ACCENT },
})
