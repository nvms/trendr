import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { MillerNav } from '../src/miller-nav.js'
import { ScrollableText } from '../src/scrollable-text.js'

const DATA = {
  null: [
    { id: 'projects', name: 'projects' },
    { id: 'notes', name: 'notes' },
    { id: 'bookmarks', name: 'bookmarks' },
  ],
  projects: [
    { id: 'trend', name: 'trend', content: 'direct-mode TUI renderer with JSX, signals, and per-cell diffing.\n\nbuilt for fast, expressive terminal interfaces.\n\n## core concepts\n\nsignals provide reactive state management. createSignal returns a getter/setter tuple. createEffect runs side effects when dependencies change. batch groups multiple updates into a single render pass.\n\njsx is the template language. jsxImportSource: "trend" enables automatic transform. primitives are box, text, and spacer. box is a flex container, text renders content, spacer fills remaining space.\n\n## layout engine\n\nflex-based layout with row and column directions. supports flexGrow, width, height, padding, margin, gap, minWidth, maxWidth, overflow.\n\nabsolute positioning available with position: "absolute". children are clipped to parent bounds.\n\n## rendering pipeline\n\n1. jsx creates element tree\n2. layout engine computes positions and sizes\n3. renderer paints cells to buffer\n4. differ compares with previous frame\n5. only changed cells are written to stdout\n\nper-cell diffing means only the characters that actually changed get redrawn. this makes it extremely efficient even for complex layouts with frequent updates.\n\n## hooks\n\nuseInput - keyboard events\nuseMouse - mouse events (scroll, press, drag)\nuseLayout - component dimensions\nuseTheme - accent color\nuseInterval / useTimeout - timers\nuseAsync - async operations with loading state\nuseFocus - focus management stack\nuseToast - notification system\n\n## components\n\nList - scrollable list with keyboard nav\nTable - column-based data display\nPickList - searchable filtered list\nTextInput - single-line text editing\nTextArea - multi-line text editing\nSelect - dropdown selector\nModal - overlay dialog\nScrollableText - scrollable text content\nMillerNav - hierarchical miller columns\nProgressBar, Spinner, Checkbox, Radio, Button, Tabs, SplitPane' },
    { id: 'noted', name: 'noted', content: 'a hierarchical note-taking app for the terminal.\n\nuses miller columns for navigation.' },
    { id: 'lore', name: 'lore', content: 'project context server.\n\nstores pre-generated summaries of codebases for AI assistants.' },
  ],
  notes: [
    { id: 'ideas', name: 'ideas' },
    { id: 'journal', name: 'journal' },
    { id: 'recipes', name: 'recipes', content: 'collection of favorite recipes\n\nmostly sourdough and pasta.' },
    { id: 'til', name: 'today i learned' },
    { id: 'drafts', name: 'drafts', content: 'half-baked thoughts that need more time.' },
    { id: 'meetings', name: 'meetings' },
    { id: 'travel', name: 'travel', content: 'places to go, things to see.' },
    { id: 'music', name: 'music', content: 'albums, playlists, recommendations.' },
    { id: 'quotes', name: 'quotes', content: 'things people said that stuck.' },
    { id: 'goals', name: 'goals' },
    { id: 'bugs', name: 'bugs', content: 'things that are broken and need fixing.' },
    { id: 'links', name: 'links', content: 'urls worth revisiting.' },
    { id: 'errands', name: 'errands', content: 'groceries, hardware store, post office.' },
    { id: 'watchlist', name: 'watchlist', content: 'movies and shows to get to eventually.' },
    { id: 'fitness', name: 'fitness', content: 'workout logs and PRs.' },
  ],
  til: [
    { id: 'til-1', name: 'git worktrees', content: 'git worktree add lets you check out multiple branches simultaneously in separate directories. no more stashing.' },
    { id: 'til-2', name: 'sqlite wal mode', content: 'PRAGMA journal_mode=WAL allows concurrent readers and a single writer. massive throughput improvement for read-heavy workloads.' },
    { id: 'til-3', name: 'css :has()', content: 'parent selector finally exists. .card:has(img) targets cards that contain images. no javascript needed.' },
  ],
  meetings: [
    { id: 'meet-1', name: 'standup notes', content: 'keep these short. what you did, what you are doing, blockers.' },
    { id: 'meet-2', name: 'retro takeaways', content: 'more async communication. fewer meetings about meetings.' },
  ],
  goals: [
    { id: 'goal-1', name: 'q1 objectives', content: 'ship trend v1.0\nopen source noted\nwrite three blog posts' },
    { id: 'goal-2', name: 'personal', content: 'read 12 books\nrun a half marathon\nlearn piano basics' },
  ],
  ideas: [
    { id: 'tui-game', name: 'tui game engine', content: 'what if trend could render games?\n\n- sprite system\n- collision detection\n- frame-based animation\n- input mapping' },
    { id: 'cli-dashboard', name: 'cli dashboard', content: 'a composable dashboard framework\n\n- widget system\n- live data sources\n- configurable layouts' },
  ],
  journal: [
    { id: 'j-mon', name: 'monday', content: 'shipped the miller nav component.\n\nfeels clean - the stack/depth/focusCol model works well.' },
    { id: 'j-tue', name: 'tuesday', content: 'added peek column.\n\nsubtle but makes navigation feel much more fluid.' },
    { id: 'j-wed', name: 'wednesday', content: 'refactored into reusable component.\n\ngood candidate for trend core.' },
  ],
  bookmarks: [
    { id: 'tools', name: 'tools' },
    { id: 'reading', name: 'reading' },
  ],
  tools: [
    { id: 'esbuild', name: 'esbuild', content: 'extremely fast javascript bundler.\n\nhttps://esbuild.github.io' },
    { id: 'ripgrep', name: 'ripgrep', content: 'fast recursive search tool.\n\nrg > grep' },
  ],
  reading: [
    { id: 'designing-data', name: 'designing data-intensive apps', content: 'martin kleppmann\n\nthe best systems book. covers replication, partitioning, transactions, batch/stream processing.' },
    { id: 'pragmatic', name: 'pragmatic programmer', content: 'hunt & thomas\n\nclassic. still holds up.' },
  ],
  trend: [
    { id: 'trend-signals', name: 'signals', content: 'reactive primitives\n\ncreateSignal, createEffect, createMemo, batch, untrack' },
    { id: 'trend-jsx', name: 'jsx runtime', content: 'automatic jsx transform\n\njsxImportSource: "trend"' },
    { id: 'trend-components', name: 'components', content: 'box, text, spacer\n\nflex layout with style props' },
  ],
  noted: [
    { id: 'noted-db', name: 'database', content: 'sqlite via better-sqlite3\n\nhierarchical notes with parent_id foreign key' },
    { id: 'noted-crypto', name: 'encryption', content: 'optional aes-256-gcm encryption\n\nderived key from password + salt' },
  ],
}

const CHILDREN_CACHE = {}
function getChildren(item) {
  const id = item?.id ?? null
  if (CHILDREN_CACHE[id]) return CHILDREN_CACHE[id]
  const children = DATA[id] || []
  CHILDREN_CACHE[id] = children
  return children
}

function hasChildren(item) {
  return !!(DATA[item?.id])
}

export function MillerNavDemo() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'nav' })
  fm.item('nav')
  fm.item('preview')

  const [selected, setSelected] = createSignal(null)
  const [crumbs, setCrumbs] = createSignal([])

  useInput(({ key, raw, stopPropagation }) => {
    if (key === 'tab') {
      fm.focus(fm.is('nav') ? 'preview' : 'nav')
      stopPropagation()
    }
  })

  function hints() {
    if (fm.is('preview')) return 'j/k: scroll  tab: nav  q: quit'
    return 'hjkl: navigate  tab: preview  q: quit'
  }

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ paddingX: 1, height: 2, flexDirection: 'column' }}>
        <text style={{ color: accent }}>miller nav</text>
        <box style={{ flexDirection: 'row' }}>
          {crumbs().map((item, i) => (
            <text key={i} style={{ color: 'gray', dim: true }}>{i > 0 ? ' / ' : ''}{item.name}</text>
          ))}
        </box>
      </box>

      <box style={{ marginLeft: 1, flexGrow: 1, flexDirection: 'row' }}>
        <MillerNav
          rootItems={DATA[null]}
          getChildren={getChildren}
          hasChildren={hasChildren}
          focused={fm.is('nav')}
          scrollbar
          onSelectionChange={({ item, breadcrumb }) => {
            setSelected(item)
            setCrumbs(breadcrumb)
          }}
          renderItem={(item, { selected: isSel, focused }) => {
            const bg = isSel ? (focused ? accent : '#333333') : null
            const fg = isSel && focused ? 'black' : null
            const hasKids = hasChildren(item)
            return (
              <box style={{ bg, flexDirection: 'row' }}>
                <text style={{ color: fg, overflow: 'truncate', flexGrow: 1 }}> {item.name}</text>
                {hasKids && <text style={{ color: fg || 'gray', dim: !isSel }}>{'›'}</text>}
              </box>
            )
          }}
        />

        <box style={{ flexGrow: 1, marginLeft: 0, marginRight: 1 }}>
          <ScrollableText
            content={selected()?.content || ''}
            focused={fm.is('preview')}
            scrollbar
            wrap
          />
        </box>
      </box>

      <box style={{ paddingX: 1, flexDirection: 'row' }}>
        <text style={{ color: 'gray', dim: true }}>{hints()}</text>
      </box>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ raw }) => {
    if (raw === 'q') process.exit(0)
  })
  return <MillerNavDemo />
}
mount(Standalone, { title: 'miller-nav', theme: { accent: 'magenta' } })
