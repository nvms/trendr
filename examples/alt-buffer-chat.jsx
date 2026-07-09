// the alt-screen counterpart to inline-chat.jsx: the same fake coding agent,
// same look and feel, but rendered fullscreen on the alternate screen buffer
// instead of committing to native scrollback. because the terminal's own
// scrollback is unavailable here, the transcript lives in an in-app ScrollBox
// and a focus manager (tab) switches between scrolling history and composing
import { codeToANSI } from '@shikijs/cli'
import { mount, createSignal, computeDiff, Diff, Markdown, Menu, Modal, PickList, ScrollBox, Shimmer, Spinner, useFocus, useFocusTrap, useInput, useSelection } from '../index.js'
import { TextArea } from '../src/text-area.js'
import pkg from '../package.json'

const ACCENT = '#6BE795'

const WRITE_SIGNAL_BEFORE = `function writeSignal(node, next) {
  node.value = next
  for (const sub of node.subs) markDirty(sub)
  return next
}`

const WRITE_SIGNAL_AFTER = `function writeSignal(node, next) {
  if (Object.is(node.value, next)) return node.value
  node.value = next
  for (const sub of node.subs) markDirty(sub)
  return next
}`

const TEST_OUTPUT = `> @trendr/core@0.3.0 test
> node test/test.js && node test/test-e2e.js && node test/test-mount.js && ...

BUFFER: write and clip
SIGNAL: batch coalesces writes
SIGNAL: unchanged write does not notify
LAYOUT: flex row with gaps
439 passed, 0 failed
61 passed, 0 failed
11 passed, 0 failed
138 passed, 0 failed
76 passed, 0 failed
108 passed, 0 failed
94 passed, 0 failed`

const BENCH_OUTPUT = `spinners mounted: 4
duration: 60s

before  idle wakeups: 240/min
after   idle wakeups: 0/min

frames painted: 2412 (all animation-driven)`

const TURNS = [
  [
    {
      text: `Took a look at the scheduler. The frame loop itself is fine, but a few call sites schedule more work than they need to:

- \`setInterval\` handlers write signals even when the value is unchanged, which wakes the scheduler for a no-op frame
- \`useResize\` fires twice on some terminals because both SIGWINCH and the stream resize event are wired up
- the spinner advances its frame counter with **one signal write per tick**, so four spinners mean four wakeups

The cheapest fix is an equality check in the signal setter. Want me to make that change?`,
    },
  ],
  [
    {
      text: `The equality check belongs in \`writeSignal\`, right before the subscribers are notified:

\`\`\`js
${WRITE_SIGNAL_AFTER}
\`\`\`

Every setter goes through this path, so the interval and spinner cases are covered without touching them. Object identity is the right comparison here - deep equality would cost more than the frames it saves. Say the word and I'll apply it.`,
    },
  ],
  [
    { text: 'Making the change in `src/signal.js`:' },
    {
      tool: 'edit',
      title: 'src/signal.js',
      diff: { before: WRITE_SIGNAL_BEFORE, after: WRITE_SIGNAL_AFTER, language: 'js' },
      duration: 1100,
    },
    { text: 'Applied. Running the suite and the scheduler benchmark to verify:' },
    { tool: 'bash', title: 'npm test', output: TEST_OUTPUT, duration: 1600 },
    {
      tool: 'bash',
      title: 'node bench/scheduler.js --spinners 4 --duration 60 --report idle-wakeups --format table --compare-baseline main',
      output: BENCH_OUTPUT,
      duration: 1300,
    },
    {
      text: 'All seven test files pass and idle wakeups drop from 240/min to *zero* with four spinners mounted. One thing worth knowing: a signal holding `NaN` now never notifies, since `Object.is(NaN, NaN)` is true - that matches SolidJS behavior.',
    },
  ],
]

const FILES = [
  'index.js',
  'jsx-runtime.js',
  'esbuild.config.js',
  'src/renderer.js',
  'src/layout.js',
  'src/buffer.js',
  'src/diff.js',
  'src/signal.js',
  'src/scheduler.js',
  'src/input.js',
  'src/hooks.js',
  'src/focus.js',
  'src/wrap.js',
  'src/ansi.js',
  'src/text-area.js',
  'src/pick-list.js',
  'src/markdown.js',
  'src/scroll-box.js',
  'test/test.js',
  'test/test-render.js',
  'test/test-components.js',
  'examples/alt-buffer-chat.jsx',
  'examples/pick-list.jsx',
]

const COMMANDS = [
  { name: 'modal', desc: 'Open a sample MCP servers modal (esc to close)' },
  { name: 'clear', desc: 'Clear the conversation and free the context window' },
  { name: 'compact', desc: 'Summarize the conversation so far into a shorter form' },
  { name: 'model', desc: 'Switch the active model for this session' },
  { name: 'review', desc: 'Review a pull request and leave inline comments' },
  { name: 'rewind', desc: 'Restore the conversation to a previous message' },
  { name: 'cost', desc: 'Show token usage and estimated cost so far' },
  { name: 'config', desc: 'Open the settings panel' },
  { name: 'init', desc: 'Generate a project guide for this repository' },
  { name: 'resume', desc: 'Pick up a previous conversation where you left off' },
  { name: 'export', desc: 'Save the current conversation to a file' },
  { name: 'help', desc: 'List every command and what it does' },
]

const MODELS = [
  { name: 'claude-fable-5', desc: 'Deepest reasoning for hard, long-horizon work', price: '$15 in · $75 out' },
  { name: 'claude-opus-4-8', desc: 'Frontier coding and agentic workflows', price: '$15 in · $75 out' },
  { name: 'claude-sonnet-5', desc: 'Balanced speed and capability', price: '$3 in · $15 out' },
  { name: 'claude-haiku-4-5', desc: 'Fastest, for light interactive tasks', price: '$1 in · $5 out' },
  { name: 'gpt-5.2', desc: 'Strong general reasoning and tool use', price: '$10 in · $40 out' },
  { name: 'gpt-5.2-mini', desc: 'Small and quick for everyday edits', price: '$0.6 in · $2.4 out' },
  { name: 'gemini-3-pro', desc: 'Long context, multimodal grounding', price: '$7 in · $21 out' },
  { name: 'gemini-3-flash', desc: 'Low latency at very low cost', price: '$0.3 in · $1.2 out' },
  { name: 'deepseek-v4', desc: 'Open-weights generalist, strong at math', price: '$0.5 in · $1.5 out' },
  { name: 'qwen3-coder', desc: 'Code-tuned open model, repo-scale edits', price: '$0.4 in · $1.6 out' },
  { name: 'kimi-k2', desc: 'Agentic open model with long context', price: '$0.6 in · $2.5 out' },
  { name: 'glm-4.7', desc: 'Fast open generalist for chat and tools', price: '$0.5 in · $1.8 out' },
  { name: 'grok-4', desc: 'Realtime knowledge, strong reasoning', price: '$5 in · $25 out' },
  { name: 'llama-4-maverick', desc: 'Open-weights workhorse, cheap to serve', price: '$0.2 in · $0.8 out' },
]

const HOME = process.env.HOME
const CWD = HOME && process.cwd().startsWith(HOME) ? process.cwd().replace(HOME, '~') : process.cwd()

// prompt history scopes. session prompts live in memory; the other two would
// come from per-project and global stores on disk - faked here with seed data
const SCOPES = ['session', 'project', 'everywhere']
const NOW = Date.now()
const MIN = 60000

const PROJECT_PROMPTS = [
  { text: 'why is the diff pass allocating on every frame', at: NOW - 48 * MIN, scope: 'project' },
  { text: 'add a scrollbar to the file explorer example', at: NOW - 3 * 60 * MIN, scope: 'project' },
  { text: 'the modal border prop is hardcoded to round, make it configurable', at: NOW - 5 * 60 * MIN, scope: 'project' },
  { text: 'benchmark the wrap cache against ink for long paragraphs', at: NOW - 26 * 60 * MIN, scope: 'project' },
]

const GLOBAL_PROMPTS = [
  { text: 'write a dockerfile for the api server with a multi-stage build', at: NOW - 30 * 60 * MIN, scope: 'everywhere' },
  { text: 'fix the flaky auth test in ci, it only fails on node 22', at: NOW - 2 * 24 * 60 * MIN, scope: 'everywhere' },
  { text: 'migrate the orders table to use uuid primary keys', at: NOW - 4 * 24 * 60 * MIN, scope: 'everywhere' },
  { text: 'summarize the changes between v0.2.0 and v0.3.0 for the changelog', at: NOW - 6 * 24 * 60 * MIN, scope: 'everywhere' },
]

// the render loop can't await, so fence lines are highlighted ahead of time
// per line (the same trick as examples/diff.jsx) and looked up synchronously.
// per-line keys mean partially streamed fences still highlight as they arrive
const highlightCache = new Map()

async function warmHighlights() {
  const jobs = []
  const addLines = (code, lang) => {
    for (const line of code.split('\n')) jobs.push([line, lang])
  }
  const fenceRe = /```(\S*)\n([\s\S]*?)```/g
  for (const steps of TURNS) {
    for (const step of steps) {
      if (step.text) {
        let m
        while ((m = fenceRe.exec(step.text))) addLines(m[2], m[1] || 'txt')
      }
      if (step.diff) {
        addLines(step.diff.before, step.diff.language)
        addLines(step.diff.after, step.diff.language)
      }
    }
  }
  for (const [line, lang] of jobs) {
    if (highlightCache.has(line)) continue
    try {
      highlightCache.set(line, (await codeToANSI(line, lang, 'nord')).replace(/\n$/, ''))
    } catch {
      highlightCache.set(line, line)
    }
  }
}

await warmHighlights()

const highlight = (code) => code.split('\n').map(line => highlightCache.get(line) ?? line).join('\n')

function ToolCard({ tool, title, output, diff, status, verbose }) {
  const running = status === 'running'
  const interrupted = status === 'interrupted'
  const reverted = status === 'reverted'
  const outLines = output ? output.split('\n') : null
  const diffResult = diff ? computeDiff({ before: diff.before, after: diff.after }) : null

  const info = running ? 'running'
    : interrupted ? 'interrupted'
    : reverted ? 'reverted'
    : diffResult ? `+${diffResult.stats.additions} -${diffResult.stats.deletions}`
    : outLines ? `${outLines.length} lines · ctrl+o`
    : 'done'

  return (
    <box style={{ flexDirection: 'column', paddingX: 2 }}>
      <text> </text>
      <box style={{ flexDirection: 'row' }}>
        {running
          ? <Spinner color={ACCENT} />
          : <text style={{ color: interrupted ? '#f87171' : reverted ? '#6b7280' : ACCENT }}>{interrupted ? '✗' : reverted ? '↩' : '✓'}</text>}
        <text> </text>
        <text style={{ color: '#6b7280' }}>{tool.padEnd(5)}</text>
        <box style={{ flexGrow: 1, height: 1 }}>
          <text style={{ overflow: 'truncate', color: '#e5e7eb' }}>{title}</text>
        </box>
        <text style={{ color: '#4b5563' }}>{`  ${info}`}</text>
      </box>
      {diffResult && !running && (
        <box style={{ flexDirection: 'column', height: Math.min(diffResult.rows.length, 12), marginTop: 1 }}>
          <Diff
            before={diff.before}
            after={diff.after}
            language={diff.language}
            highlight={highlight}
            focused={false}
            scrollbar={false}
          />
        </box>
      )}
      {outLines && verbose && status === 'done' && (
        <box style={{ flexDirection: 'column', bg: '#1e1e22', paddingX: 1, marginTop: 1 }}>
          <text style={{ color: '#6b7280' }}>{`$ ${title}`}</text>
          {outLines.map((line, i) => (
            <text key={i} style={{ color: '#9ca3af', overflow: 'truncate' }}>{line || ' '}</text>
          ))}
        </box>
      )}
    </box>
  )
}

function Message({ from, text, kind, ...rest }) {
  if (kind === 'tool') {
    return <ToolCard {...rest} />
  }

  if (kind === 'summary') {
    return (
      <box style={{ flexDirection: 'column', paddingX: 2 }}>
        <text> </text>
        <text style={{ color: '#6b7280', italic: true }}>{`✦ summary of rewound messages: ${text}`}</text>
      </box>
    )
  }

  if (kind === 'banner') {
    return (
      <box style={{ flexDirection: 'row', paddingX: 2, marginTop: 1 }}>
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: ACCENT }}>{'(\\_/)'}</text>
          <text style={{ color: ACCENT }}>{'(•ᴗ•)'}</text>
        </box>
        <box style={{ flexDirection: 'column' }}>
          <box style={{ flexDirection: 'row' }}>
            <text style={{ bold: true, color: ACCENT }}>{'  pico'}</text>
            <text style={{ color: '#4b5563' }}>{` v${pkg.version}`}</text>
          </box>
          <text style={{ color: '#6b7280' }}>{`  ${CWD}`}</text>
        </box>
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
      <Markdown text={text} highlight={highlight} codeBg={null} />
    </box>
  )
}

// subsequence match scored for ranking: contiguous runs and matches that
// start on a path boundary beat scattered hits, so the best candidate is on
// top (and picked by enter) from the very first character. greedy matching
// from the first occurrence can miss a better alignment later in the path,
// so every occurrence of the first query char is tried and the best kept
function timeAgo(at) {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fuzzyScore(query, path) {
  const q = query.toLowerCase()
  const s = path.toLowerCase()
  if (!q) return 0
  let best = -1
  for (let start = s.indexOf(q[0]); start !== -1; start = s.indexOf(q[0], start + 1)) {
    let score = 0
    let prev = -1
    let matched = true
    for (const ch of q) {
      const i = s.indexOf(ch, prev === -1 ? start : prev + 1)
      if (i === -1) { matched = false; break }
      if (prev !== -1 && i === prev + 1) score += 3
      if (i === 0 || '/.-_'.includes(s[i - 1])) score += 2
      score += 1
      prev = i
    }
    if (matched && score > best) best = score
  }
  if (best < 0) return -1
  const base = s.slice(s.lastIndexOf('/') + 1)
  if (base.startsWith(q)) best += 8
  else if (base.includes(q)) best += 5
  else if (s.includes(q)) best += 3
  return best - s.length / 100
}

function fakeSummary(tail) {
  const bits = tail.filter(m => m.text).map(m => m.text.split(/\s+/).slice(0, 6).join(' '))
  return bits.slice(0, 3).join(' · ')
}

const HELP_TEXT = `A fake coding agent that shows what trend gives you for building an agentic terminal UI: an alt-screen transcript with per-cell diffing, markdown rendering, focus management, and inline panels that borrow the composer's keyboard.

## Commands

Type \`/\` in the composer to filter these as you type.

${COMMANDS.map(c => `- \`/${c.name}\` - ${c.desc}`).join('\n')}

## Composer

- \`enter\` sends, \`shift+enter\` inserts a newline
- \`@\` opens a fuzzy file picker; enter inserts the selected path
- \`up\` and \`down\` on an empty composer recall messages you already sent
- \`ctrl+r\` fuzzy-searches your prompt history with a preview; enter puts the match back in the composer
- inside the search, \`ctrl+s\` cycles the scope: this session, this project, or everywhere
- \`/rewind\` restores the conversation to an earlier message; a rewind can be undone with \`ctrl+z\`
- messages sent while the agent is responding queue up above the composer, in order, and are delivered as one message when the turn finishes; \`up\` pulls them all back into the composer for editing
- \`esc\` interrupts a streaming response, or clears the composer when idle

## Moving around

- \`tab\` switches focus between the transcript and the composer
- with the transcript focused, \`up\`/\`down\`/\`j\`/\`k\` scroll and \`g\`/\`G\` jump to the ends
- \`ctrl+o\` expands and collapses tool call output in the transcript
- the mouse wheel scrolls whatever is under the cursor
- click-drag selects text and copies it on release; wrapped prose is rejoined into a
  single paragraph while code keeps its line breaks and indentation

## Under the hood

Every frame is resolved, laid out, and painted into a cell buffer, then diffed per cell:

\`\`\`
jsx -> resolve -> layout -> paint -> diff -> stdout
\`\`\`

Only cells that changed are written, so a blinking cursor costs two cells, not a repaint.

---

*esc takes you back to the conversation*`

function Help({ onClose }) {
  useInput((event) => {
    if (event.key === 'escape') {
      onClose()
      event.stopPropagation()
    }
  })

  return (
    <box style={{ flexDirection: 'column', height: '100%', paddingX: 2, paddingY: 1 }}>
      <box style={{ flexDirection: 'row' }}>
        <text style={{ color: ACCENT, bold: true }}>pico · help</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: '#4b5563' }}>↑↓ scroll · esc back</text>
      </box>
      <text> </text>
      <ScrollBox style={{ flexGrow: 1 }} focused scrollbar>
        <Markdown text={HELP_TEXT} codeBg={null} />
      </ScrollBox>
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
  const [showModelPanel, setShowModelPanel] = createSignal(false)
  const [model, setModel] = createSignal(MODELS.find(m => m.name === 'claude-opus-4-8'))
  const [queued, setQueued] = createSignal([])
  const [sent, setSent] = createSignal([])
  const [histIdx, setHistIdx] = createSignal(-1)
  const [fileIndex, setFileIndex] = createSignal(0)
  const [filesDismissed, setFilesDismissed] = createSignal(false)
  const [view, setView] = createSignal('chat')
  const [gen, setGen] = createSignal(0)
  const [verbose, setVerbose] = createSignal(false)
  const [showHistoryPanel, setShowHistoryPanel] = createSignal(false)
  const [histQuery, setHistQuery] = createSignal('')
  const [histPreview, setHistPreview] = createSignal(null)
  const [histScope, setHistScope] = createSignal(0)
  const [rewindStep, setRewindStep] = createSignal(null)
  const [rewindTarget, setRewindTarget] = createSignal(null)
  const [rewindPreview, setRewindPreview] = createSignal(null)
  const [rewindUndo, setRewindUndo] = createSignal(null)

  // in-app scroll position. while following, the feed stays pinned to the
  // bottom (a huge offset clamps to the end inside ScrollBox)
  const [offset, setOffset] = createSignal(0)
  const [follow, setFollow] = createSignal(true)

  const fm = useFocus({ initial: 'input' })
  fm.item('feed')
  fm.item('input')
  useFocusTrap(showModelPanel() || showHistoryPanel() || rewindStep() !== null || view() === 'help')
  useSelection({
    onCopy: (text) => flash(`copied ${text.length} ${text.length === 1 ? 'character' : 'characters'}`),
  })

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(n => (n === msg ? '' : n)), 2500)
  }

  function runCommand(c) {
    setInput('')
    if (c.name === 'modal') { setShowModal(true); return }
    if (c.name === 'model') { setShowModelPanel(true); return }
    if (c.name === 'help') { setView('help'); return }
    if (c.name === 'rewind') {
      if (busy()) flash('finish or interrupt the current turn first')
      else if (history().some(m => m.from === 'you')) { setRewindPreview(null); setRewindStep('pick') }
      else flash('nothing to rewind yet')
      return
    }
    flash(`ran /${c.name}`)
  }

  function rewindStats(index) {
    const tail = history().slice(index)
    return {
      msgs: tail.length,
      edits: tail.filter(m => m.kind === 'tool' && m.tool === 'edit' && m.status !== 'reverted'),
    }
  }

  function performRewind(opt) {
    const t = rewindTarget()
    const tail = history().slice(t.index)
    const { edits } = rewindStats(t.index)
    const e = edits.length
    const editsLabel = `${e} ${e === 1 ? 'edit' : 'edits'}`
    setRewindUndo({ history: history(), input: input() })
    if (opt.key === 'code') {
      setHistory(h => h.map((m, i) =>
        i >= t.index && m.kind === 'tool' && m.tool === 'edit' && m.status !== 'reverted'
          ? { ...m, status: 'reverted' }
          : m))
      flash(`reverted ${editsLabel}, conversation kept · ctrl+z to undo`)
    } else if (opt.key === 'summary') {
      setHistory(h => [...h.slice(0, t.index), { kind: 'summary', text: fakeSummary(tail) }])
      setInput(t.text)
      flash(`rewound, ${tail.length} entries summarized · ctrl+z to undo`)
    } else {
      setHistory(h => h.slice(0, t.index))
      setInput(t.text)
      flash(opt.key === 'both'
        ? `rewound, ${editsLabel} reverted · ctrl+z to undo`
        : `rewound, file changes kept · ctrl+z to undo`)
    }
    setRewindStep(null)
    setRewindTarget(null)
  }

  function chooseModel(m) {
    setModel(m)
    setShowModelPanel(false)
    flash(`model set to ${m.name}`)
  }

  function streamText(words, i, myGen, done) {
    if (gen() !== myGen) return
    if (i >= words.length) {
      setHistory(h => [...h, { from: 'trend-agent', text: streaming() }])
      setStreaming(null)
      done()
      return
    }
    setStreaming(words.slice(0, i + 1).join(' '))
    setTimeout(() => streamText(words, i + 1, myGen, done), 55)
  }

  function runSteps(steps, i, myGen) {
    if (gen() !== myGen) return
    if (i >= steps.length) {
      setBusy(false)
      const q = queued()
      if (q.length > 0) {
        setQueued([])
        deliver(q.join('\n'))
      }
      return
    }
    const step = steps[i]
    if (step.text !== undefined) {
      setStreaming('')
      setTimeout(() => streamText(step.text.split(' '), 0, myGen, () => runSteps(steps, i + 1, myGen)), 400)
      return
    }
    const id = `tool-${myGen}-${i}`
    setHistory(h => [...h, { kind: 'tool', id, tool: step.tool, title: step.title, output: step.output, diff: step.diff, status: 'running' }])
    setTimeout(() => {
      if (gen() !== myGen) return
      setHistory(h => h.map(m => m.id === id ? { ...m, status: 'done' } : m))
      runSteps(steps, i + 1, myGen)
    }, step.duration ?? 900)
  }

  function deliver(value) {
    setHistory(h => [...h.filter(m => m.kind !== 'banner'), { from: 'you', text: value }])
    setFollow(true) // sending snaps back to the bottom
    setBusy(true)
    setStartedAt(Date.now())
    const myGen = gen()
    const steps = TURNS[turn() % TURNS.length]
    setTurn(t => t + 1)
    runSteps(steps, 0, myGen)
  }

  function send(text) {
    const value = text.trim()
    if (!value) return
    setSent(s => [...s, { text: value, at: Date.now() }])
    setHistIdx(-1)
    if (busy()) {
      setQueued(q => [...q, value])
      return
    }
    deliver(value)
  }

  // bumping gen orphans the pending step timeout so the turn stops mid-word
  // (or mid-tool: running cards settle as interrupted instead of spinning)
  function interrupt() {
    if (!busy()) return
    setGen(g => g + 1)
    const partial = streaming()
    setHistory(h => [
      ...h.map(m => m.kind === 'tool' && m.status === 'running' ? { ...m, status: 'interrupted' } : m),
      { from: 'trend-agent', text: `${partial ? `${partial} ` : ''}*(interrupted)*` },
    ])
    setStreaming(null)
    setBusy(false)
    if (queued().length > 0) {
      setInput(queued().join('\n'))
      setQueued([])
    }
  }

  useInput((event) => {
    if (event.key === 'escape' && busy()) {
      interrupt()
      event.stopPropagation()
      return
    }
    if (event.ctrl && event.key === 'o') {
      setVerbose(v => !v)
      event.stopPropagation()
      return
    }
    if (event.ctrl && event.key === 'r' && view() === 'chat' && !showModal() && !showModelPanel() && !rewindStep()) {
      if (showHistoryPanel()) {
        setShowHistoryPanel(false)
      } else if (sent().length > 0) {
        setHistQuery('')
        setHistPreview(null)
        setHistScope(0)
        setShowHistoryPanel(true)
      } else {
        flash('no prompt history yet')
      }
      event.stopPropagation()
      return
    }
    if (event.ctrl && event.key === 's' && showHistoryPanel()) {
      setHistScope(s => (s + 1) % SCOPES.length)
      event.stopPropagation()
      return
    }
    if (event.ctrl && event.key === 'z' && rewindUndo() && !busy() && view() === 'chat') {
      const snap = rewindUndo()
      setHistory(snap.history)
      setInput(snap.input)
      setRewindUndo(null)
      flash('rewind undone')
      event.stopPropagation()
    }
  })

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

  const atMatch = input().match(/(^|[\s(])@([^\s@]*)$/)
  const showFiles = atMatch !== null && !showCommands && !filesDismissed()
  const matchedFiles = showFiles
    ? FILES.map(f => [fuzzyScore(atMatch[2], f), f])
        .filter(([score]) => score >= 0)
        .sort((a, b) => b[0] - a[0])
        .map(([, f]) => f)
    : []

  function pickFile(f) {
    const v = input()
    const at = v.lastIndexOf('@')
    setInput(v.slice(0, at + 1) + f + ' ')
    setFileIndex(0)
  }

  const scopePool = histScope() === 0 ? sent()
    : histScope() === 1 ? [...sent(), ...PROJECT_PROMPTS]
    : [...sent(), ...PROJECT_PROMPTS, ...GLOBAL_PROMPTS]
  const seenPrompts = new Set()
  const promptHistory = []
  for (const entry of scopePool.slice().sort((a, b) => b.at - a.at)) {
    if (seenPrompts.has(entry.text)) continue
    seenPrompts.add(entry.text)
    promptHistory.push(entry)
  }
  const histMatches = promptHistory.some(p => fuzzyScore(histQuery(), p.text) >= 0)

  const userMessages = []
  history().forEach((m, i) => {
    if (m.from === 'you' && !m.kind) userMessages.push({ text: m.text, index: i })
  })
  userMessages.reverse()

  const rewindOptions = (() => {
    const t = rewindTarget()
    if (!t) return []
    const { msgs, edits } = rewindStats(t.index)
    const e = edits.length
    const editsLabel = `${e} ${e === 1 ? 'edit' : 'edits'}`
    const opts = []
    if (e > 0) opts.push({ key: 'both', label: 'restore code and conversation', desc: `chat returns to this message · ${editsLabel} reverted` })
    opts.push({
      key: 'chat',
      label: e > 0 ? 'restore conversation only' : 'restore conversation',
      desc: e > 0 ? 'chat returns to this message · file changes kept' : `chat returns to this message · drops ${msgs} entries`,
    })
    if (e > 0) opts.push({ key: 'code', label: 'restore code only', desc: `conversation kept · ${editsLabel} reverted` })
    opts.push({ key: 'summary', label: 'rewind and keep a summary', desc: `dropped entries collapse into a one-line note` })
    return opts
  })()

  if (view() === 'help') {
    return <Help onClose={() => setView('chat')} />
  }

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <ScrollBox
        style={{ flexGrow: 1 }}
        focused={fm.is('feed')}
        scrollOffset={follow() ? 1e9 : offset()}
        onScroll={(next) => { setFollow(false); setOffset(next) }}
        scrollbar
      >
        {history().map((m, i) => <Message key={i} {...m} verbose={verbose()} />)}
        {streaming() && <Message key="streaming" from="trend-agent" text={`${streaming()}▋`} />}
      </ScrollBox>

      {queued().length > 0 && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          {queued().map((q, i) => (
            <box key={i} style={{ flexDirection: 'row' }}>
              <text style={{ color: '#4b5563' }}>{'› '}</text>
              <box style={{ flexGrow: 1, height: 1 }}>
                <text style={{ overflow: 'truncate', color: '#6b7280' }}>{q.replace(/\n/g, ' ')}</text>
              </box>
              {i === 0 && <text style={{ color: '#4b5563', dim: true }}>{'  pending · ↑ to edit'}</text>}
            </box>
          ))}
        </box>
      )}

      <box style={{ bg: '#1e1e22', flexDirection: 'row', paddingX: 2, paddingY: 1, marginTop: 1 }}>
        <text style={{ color: ACCENT, bold: true }}>{'❯'}</text>
        <text> </text>
        <TextArea
          value={input()}
          onChange={(v) => { setInput(v); setCmdIndex(0); setFileIndex(0); setHistIdx(-1); setFilesDismissed(false) }}
          onCancel={() => { if (busy()) interrupt(); else setInput('') }}
          onSubmit={send}
          onKeyDown={(e) => {
            if (e.ctrl || e.meta || showCommands || showFiles) return false
            if (e.key === 'up' && e.value === '' && queued().length > 0) {
              setInput(queued().join('\n'))
              setQueued([])
              return true
            }
            const browsing = histIdx() >= 0
            if (e.key === 'up' && (browsing || e.value === '') && histIdx() < sent().length - 1) {
              const n = histIdx() + 1
              setHistIdx(n)
              setInput(sent()[sent().length - 1 - n].text)
              return true
            }
            if (e.key === 'down' && browsing) {
              const n = histIdx() - 1
              setHistIdx(n)
              setInput(n < 0 ? '' : sent()[sent().length - 1 - n].text)
              return true
            }
            return false
          }}
          submitOnEnter
          clearOnSubmit
          focused={fm.is('input') && !showModal() && !showModelPanel() && !showHistoryPanel() && !rewindStep()}
          maxHeight={8}
          placeholder="enter to send · / commands · @ files · tab to scroll"
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

      {showFiles && matchedFiles.length > 0 && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          <Menu
            items={matchedFiles}
            selected={fileIndex()}
            onSelect={setFileIndex}
            onSubmit={pickFile}
            onCancel={() => setFilesDismissed(true)}
            focused={showFiles}
            maxVisible={5}
            scrolloff={2}
            renderItem={(f, { active }) => (
              <box style={{ flexDirection: 'row' }}>
                <text style={{ color: ACCENT }}>{active ? '› ' : '  '}</text>
                <text style={{ color: active ? ACCENT : '#9ca3af' }}>{f}</text>
              </box>
            )}
          />
        </box>
      )}

      {showModelPanel() && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          <text style={{ color: ACCENT, bold: true }}>Select model</text>
          <text style={{ color: '#6b7280' }}>type to filter · ↑↓ to move · enter to select · esc to keep current</text>
          <box style={{ flexDirection: 'column', height: 12, marginTop: 1 }}>
            <PickList
              items={MODELS}
              focused={showModelPanel() && !showModal()}
              placeholder="filter models..."
              onSubmit={chooseModel}
              onCancel={() => setShowModelPanel(false)}
              scrollbar
              gap={1}
              itemHeight={2}
              scrolloff={1}
              renderItem={(m, { selected, focused }) => (
                <box style={{ flexDirection: 'column', bg: selected ? (focused ? ACCENT : '#374151') : null, paddingX: 1 }}>
                  <box style={{ flexDirection: 'row' }}>
                    <text style={{ bold: true, color: selected ? 'black' : '#e5e7eb' }}>{m.name}</text>
                    {m.name === model().name && <text style={{ color: selected ? 'black' : ACCENT }}>{' ✓'}</text>}
                    <box style={{ flexGrow: 1 }} />
                    <text style={{ color: selected ? 'black' : '#6b7280' }}>{m.price}</text>
                  </box>
                  <text style={{ color: selected ? 'black' : '#6b7280' }}>{m.desc}</text>
                </box>
              )}
            />
          </box>
        </box>
      )}

      {showHistoryPanel() && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          <box style={{ flexDirection: 'row' }}>
            <text style={{ color: ACCENT, bold: true }}>Search prompts</text>
            <box style={{ flexGrow: 1 }} />
            {SCOPES.map((s, i) => (
              <text key={s} style={{ color: i === histScope() ? ACCENT : '#4b5563', bold: i === histScope() }}>{`${i > 0 ? '  ' : ''}${s}`}</text>
            ))}
          </box>
          <text style={{ color: '#6b7280' }}>type to filter · ↑↓ to move · ctrl+s scope · enter to edit · esc to close</text>
          <box style={{ flexDirection: 'row', height: 12, marginTop: 1, gap: 2 }}>
            <box style={{ flexDirection: 'column', width: '50%' }}>
              <PickList
                items={promptHistory}
                focused={showHistoryPanel() && !showModal()}
                placeholder="filter prompts..."
                filter={(q, p) => fuzzyScore(q, p.text) >= 0}
                onChange={setHistQuery}
                onCursorChange={(p) => setHistPreview(p)}
                onSubmit={(p) => { setInput(p.text); setShowHistoryPanel(false) }}
                onCancel={() => setShowHistoryPanel(false)}
                scrollbar
                gap={1}
                renderItem={(p, { selected, focused }) => (
                  <box style={{ flexDirection: 'row', bg: selected ? (focused ? ACCENT : '#374151') : null, paddingX: 1 }}>
                    <box style={{ flexGrow: 1, height: 1 }}>
                      <text style={{ overflow: 'truncate', color: selected ? 'black' : '#e5e7eb' }}>{p.text.replace(/\n/g, ' ')}</text>
                    </box>
                    <text style={{ color: selected ? 'black' : '#4b5563', dim: !selected }}>{`  ${timeAgo(p.at)}`}</text>
                  </box>
                )}
              />
            </box>
            <box style={{ flexDirection: 'column', flexGrow: 1, bg: '#1e1e22', paddingX: 1 }}>
              {histMatches && histPreview() ? (
                <text style={{ color: '#e5e7eb' }}>{histPreview().text.slice(0, 2000)}</text>
              ) : (
                <text style={{ color: '#4b5563' }}>no matching prompts</text>
              )}
            </box>
          </box>
        </box>
      )}

      {rewindStep() === 'pick' && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          <text style={{ color: ACCENT, bold: true }}>Rewind to a message</text>
          <text style={{ color: '#6b7280' }}>type to filter · ↑↓ to move · enter to choose · esc to close</text>
          <box style={{ flexDirection: 'row', height: 12, marginTop: 1, gap: 2 }}>
            <box style={{ flexDirection: 'column', width: '50%' }}>
              <PickList
                items={userMessages}
                focused={rewindStep() === 'pick' && !showModal()}
                placeholder="filter messages..."
                filter={(q, m) => fuzzyScore(q, m.text) >= 0}
                onCursorChange={(m) => setRewindPreview(m)}
                onSubmit={(m) => { setRewindTarget(m); setRewindStep('action') }}
                onCancel={() => setRewindStep(null)}
                scrollbar
                gap={1}
                renderItem={(m, { selected, focused }) => (
                  <box style={{ flexDirection: 'row', bg: selected ? (focused ? ACCENT : '#374151') : null, paddingX: 1 }}>
                    <box style={{ flexGrow: 1, height: 1 }}>
                      <text style={{ overflow: 'truncate', color: selected ? 'black' : '#e5e7eb' }}>{m.text.replace(/\n/g, ' ')}</text>
                    </box>
                    <text style={{ color: selected ? 'black' : '#4b5563', dim: !selected }}>{`  ${rewindStats(m.index).msgs} after`}</text>
                  </box>
                )}
              />
            </box>
            <box style={{ flexDirection: 'column', flexGrow: 1, bg: '#1e1e22', paddingX: 1 }}>
              {rewindPreview() ? (
                <box style={{ flexDirection: 'column' }}>
                  <text style={{ color: '#e5e7eb' }}>{rewindPreview().text.slice(0, 2000)}</text>
                  <text> </text>
                  <text style={{ color: '#4b5563' }}>{`rewinding here drops ${rewindStats(rewindPreview().index).msgs} entries`}</text>
                  {rewindStats(rewindPreview().index).edits.map((m, i) => (
                    <text key={i} style={{ color: '#4b5563' }}>{`  ↩ ${m.title}`}</text>
                  ))}
                </box>
              ) : (
                <text style={{ color: '#4b5563' }}>no matching messages</text>
              )}
            </box>
          </box>
        </box>
      )}

      {rewindStep() === 'action' && rewindTarget() && (
        <box style={{ flexDirection: 'column', paddingX: 2, marginTop: 1 }}>
          <text style={{ color: ACCENT, bold: true }}>Rewind options</text>
          <box style={{ flexDirection: 'row' }}>
            <text style={{ color: '#6b7280' }}>{'to: '}</text>
            <box style={{ flexGrow: 1, height: 1 }}>
              <text style={{ overflow: 'truncate', color: '#9ca3af' }}>{rewindTarget().text.replace(/\n/g, ' ')}</text>
            </box>
          </box>
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <Menu
              items={rewindOptions}
              focused={rewindStep() === 'action'}
              maxVisible={4}
              itemHeight={2}
              gap={1}
              onSubmit={performRewind}
              onCancel={() => setRewindStep('pick')}
              renderItem={(o, { active }) => (
                <box style={{ flexDirection: 'column' }}>
                  <box style={{ flexDirection: 'row' }}>
                    <text style={{ color: ACCENT }}>{active ? '› ' : '  '}</text>
                    <text style={{ color: active ? ACCENT : '#e5e7eb' }}>{o.label}</text>
                  </box>
                  <text style={{ color: '#4b5563' }}>{`  ${o.desc}`}</text>
                </box>
              )}
            />
          </box>
          <text style={{ color: '#4b5563' }}>enter to confirm · esc to pick a different message</text>
        </box>
      )}

      <box style={{ flexDirection: 'row', paddingX: 2, gap: 1, marginTop: 1 }}>
        {notice()
          ? <text style={{ color: '#34d399' }}>{notice()}</text>
          : busy()
            ? (
              <box style={{ flexDirection: 'row' }}>
                <Shimmer color={ACCENT} highlight="white" duration={1500} reverse>Responding</Shimmer>
                <text style={{ color: '#4b5563' }}>{` (${elapsed}s) · esc to interrupt`}</text>
              </box>
            )
            : null}
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: ACCENT }}>{model().name}</text>
        <text style={{ color: '#4b5563' }}>↑</text>
        <text style={{ color: '#6b7280' }}>{`${inTokens.toLocaleString()} in`}</text>
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
