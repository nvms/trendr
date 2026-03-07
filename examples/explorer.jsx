import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { TextInput } from '../src/text-input.js'
import { List } from '../src/list.js'
import { ScrollableText } from '../src/scrollable-text.js'

const TREE = [
  { name: 'src/', depth: 0, dir: true, children: [
    { name: 'components/', depth: 1, dir: true, children: [
      { name: 'Button.tsx', depth: 2, size: '1.2k' },
      { name: 'Input.tsx', depth: 2, size: '2.4k' },
      { name: 'Modal.tsx', depth: 2, size: '3.1k' },
      { name: 'Table.tsx', depth: 2, size: '4.8k' },
      { name: 'Tabs.tsx', depth: 2, size: '1.9k' },
      { name: 'Toast.tsx', depth: 2, size: '0.8k' },
    ]},
    { name: 'hooks/', depth: 1, dir: true, children: [
      { name: 'useAuth.ts', depth: 2, size: '1.1k' },
      { name: 'useFetch.ts', depth: 2, size: '2.3k' },
      { name: 'useLocalStorage.ts', depth: 2, size: '0.6k' },
    ]},
    { name: 'pages/', depth: 1, dir: true, children: [
      { name: 'Dashboard.tsx', depth: 2, size: '5.2k' },
      { name: 'Login.tsx', depth: 2, size: '3.4k' },
      { name: 'Settings.tsx', depth: 2, size: '4.1k' },
      { name: 'UserProfile.tsx', depth: 2, size: '6.7k' },
    ]},
    { name: 'utils/', depth: 1, dir: true, children: [
      { name: 'api.ts', depth: 2, size: '2.1k' },
      { name: 'constants.ts', depth: 2, size: '0.4k' },
      { name: 'format.ts', depth: 2, size: '1.8k' },
      { name: 'validation.ts', depth: 2, size: '3.2k' },
    ]},
    { name: 'App.tsx', depth: 1, size: '1.5k' },
    { name: 'index.ts', depth: 1, size: '0.3k' },
    { name: 'types.ts', depth: 1, size: '2.8k' },
  ]},
  { name: 'public/', depth: 0, dir: true, children: [
    { name: 'favicon.ico', depth: 1, size: '4.2k' },
    { name: 'index.html', depth: 1, size: '0.8k' },
  ]},
  { name: 'test/', depth: 0, dir: true, children: [
    { name: 'components/', depth: 1, dir: true, children: [
      { name: 'Button.test.tsx', depth: 2, size: '1.8k' },
      { name: 'Modal.test.tsx', depth: 2, size: '2.9k' },
      { name: 'Table.test.tsx', depth: 2, size: '3.4k' },
    ]},
    { name: 'setup.ts', depth: 1, size: '0.5k' },
  ]},
  { name: '.gitignore', depth: 0, size: '0.1k' },
  { name: 'package.json', depth: 0, size: '1.1k' },
  { name: 'README.md', depth: 0, size: '2.4k' },
  { name: 'tsconfig.json', depth: 0, size: '0.6k' },
  { name: 'vite.config.ts', depth: 0, size: '0.9k' },
]

const PREVIEWS = {
  'App.tsx': [
    'import { Routes, Route } from "react-router-dom"',
    'import { Dashboard } from "./pages/Dashboard"',
    'import { Login } from "./pages/Login"',
    'import { Settings } from "./pages/Settings"',
    '',
    'export function App() {',
    '  return (',
    '    <Routes>',
    '      <Route path="/" element={<Dashboard />} />',
    '      <Route path="/login" element={<Login />} />',
    '      <Route path="/settings" element={<Settings />} />',
    '    </Routes>',
    '  )',
    '}',
  ],
  'package.json': [
    '{',
    '  "name": "my-app",',
    '  "version": "1.0.0",',
    '  "scripts": {',
    '    "dev": "vite",',
    '    "build": "tsc && vite build",',
    '    "test": "vitest"',
    '  },',
    '  "dependencies": {',
    '    "react": "^18.2.0",',
    '    "react-router-dom": "^6.20.0"',
    '  }',
    '}',
  ],
  'Button.tsx': [
    'interface ButtonProps {',
    '  label: string',
    '  onClick: () => void',
    '  variant?: "primary" | "secondary"',
    '  disabled?: boolean',
    '}',
    '',
    'export function Button({ label, onClick, variant = "primary", disabled }: ButtonProps) {',
    '  return (',
    '    <button',
    '      className={`btn btn-${variant}`}',
    '      onClick={onClick}',
    '      disabled={disabled}',
    '    >',
    '      {label}',
    '    </button>',
    '  )',
    '}',
  ],
}

function flatten(nodes, expanded) {
  const result = []
  for (const node of nodes) {
    result.push(node)
    if (node.dir && expanded.has(node.name) && node.children) {
      result.push(...flatten(node.children, expanded))
    }
  }
  return result
}

function filterFlat(items, query) {
  if (!query) return items
  const q = query.toLowerCase()
  return items.filter(item => item.name.toLowerCase().includes(q))
}

export function Explorer() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'tree' })
  fm.item('tree')
  fm.item('preview')

  const [expanded, setExpanded] = createSignal(new Set(['src/']))
  const [selected, setSelected] = createSignal(0)
  const [search, setSearch] = createSignal('')
  const [previewScroll, setPreviewScroll] = createSignal(0)

  useInput(({ key }) => {
    if (key === '/' && fm.is('tree')) {
      fm.push('search')
      return
    }
    if (key === 'escape' && fm.is('search')) {
      fm.pop()
      setSearch('')
      return
    }

    if (fm.is('tree')) {
      const items = filterFlat(flatten(TREE, expanded()), search())

      if (key === 'return' || key === 'right') {
        const item = items[selected()]
        if (item?.dir) {
          setExpanded(prev => {
            const next = new Set(prev)
            next.add(item.name)
            return next
          })
        }
      }
      if (key === 'left') {
        const item = items[selected()]
        if (item?.dir && expanded().has(item.name)) {
          setExpanded(prev => {
            const next = new Set(prev)
            next.delete(item.name)
            return next
          })
        }
      }
    }

  })

  const items = filterFlat(flatten(TREE, expanded()), search())
  const sel = selected()
  const item = items[sel]
  const previewLines = item ? (PREVIEWS[item.name] || []) : []
  const numbered = previewLines.map((line, i) => `${String(i + 1).padStart(3)}  ${line}`).join('\n')

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>explorer</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          {fm.is('tree') ? '/: search  tab: preview  enter/arrows: navigate' : ''}
          {fm.is('preview') ? 'tab: tree  j/k: scroll' : ''}
          {fm.is('search') ? 'type to filter  esc: cancel' : ''}
        </text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('tree') || fm.is('search') ? accent : 'gray', width: '40%', minWidth: 30, flexDirection: 'column' }}>
          <List
            items={items}
            selected={sel}
            onSelect={(i) => { setSelected(i); setPreviewScroll(0) }}
            focused={fm.is('tree')}
            renderItem={(item, { selected: isSel, focused }) => {
              const indent = '  '.repeat(item.depth)
              const icon = item.dir ? (expanded().has(item.name) ? '\u25be ' : '\u25b8 ') : '  '
              const color = item.dir ? accent : null
              const label = `${indent}${icon}${item.name}`

              return (
                <box style={{ flexDirection: 'row', bg: isSel ? (focused ? accent : 'gray') : null }}>
                  <text style={{
                    color: isSel ? 'black' : color,
                    bold: item.dir,
                    overflow: 'truncate',
                    flexGrow: 1,
                  }}>{label}</text>
                  {item.size && (
                    <text style={{
                      color: isSel ? 'black' : 'gray',
                      dim: !isSel,
                      width: 6,
                    }}>{item.size.padStart(5)}</text>
                  )}
                </box>
              )
            }}
          />
          {fm.is('search') && (
            <>
              <box style={{ flexGrow: 1 }} />
              <box style={{ flexDirection: 'row', paddingX: 1 }}>
                <text style={{ color: accent }}>/ </text>
                <TextInput
                  focused={true}
                  onChange={setSearch}
                  onSubmit={() => { fm.pop() }}
                  onCancel={() => { fm.pop(); setSearch('') }}
                />
              </box>
            </>
          )}
        </box>

        <box style={{ border: 'round', borderColor: fm.is('preview') ? accent : 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
          {item && (
            <text style={{ color: accent, bold: true }}>{item.name}</text>
          )}
          {previewLines.length > 0 ? (
            <ScrollableText
              content={numbered}
              focused={fm.is('preview')}
              scrollOffset={previewScroll()}
              onScroll={setPreviewScroll}
              scrollbar
              wrap={false}
            />
          ) : (
            <text style={{ color: 'gray', dim: true }}>
              {item?.dir ? 'select a file to preview' : 'no preview available'}
            </text>
          )}
        </box>
      </box>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <Explorer />
}
mount(Standalone, { title: 'explorer' })
