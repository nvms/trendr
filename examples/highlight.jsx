import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { List } from '../src/list.js'
import { ScrollableText } from '../src/scrollable-text.js'
import { codeToANSI } from '@shikijs/cli'
import { readFileSync, readdirSync } from 'fs'

const EXT_TO_LANG = {
  '.js': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.json': 'json', '.md': 'markdown',
  '.css': 'css', '.html': 'html',
  '.py': 'python', '.rs': 'rust',
  '.go': 'go', '.sh': 'bash',
}

function detectLang(filename) {
  const ext = filename.slice(filename.lastIndexOf('.'))
  return EXT_TO_LANG[ext] ?? 'text'
}

const dir = process.argv[2] || '.'
const files = readdirSync(dir, { withFileTypes: true })
  .filter(d => !d.isDirectory() && !d.name.startsWith('.'))
  .map(d => d.name)
  .sort()

const cache = new Map()

async function highlight(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const path = dir === '.' ? filename : `${dir}/${filename}`
  const source = readFileSync(path, 'utf8')
  const lang = detectLang(filename)
  const lines = source.replace(/\n+$/, '').split('\n')
  const numbered = lines
    .map((line, i) => `${String(i + 1).padStart(4)}  ${line}`)
    .join('\n')

  let result
  try {
    result = (await codeToANSI(numbered, lang, 'nord')).replace(/\n$/, '')
  } catch {
    result = numbered
  }
  cache.set(filename, result)
  return result
}

// pre-highlight the first file
const initial = files.length > 0 ? await highlight(files[0]) : ''

function App() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'files' })
  fm.item('files')
  fm.item('preview')

  const [fileIdx, setFileIdx] = createSignal(0)
  const [content, setContent] = createSignal(initial)
  const [scroll, setScroll] = createSignal(0)

  function selectFile(idx) {
    setFileIdx(idx)
    setScroll(0)
    highlight(files[idx]).then(setContent)
  }

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c' || key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>highlight</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          {fm.is('files') ? 'j/k: select  tab: preview' : 'j/k: scroll  tab: files'}
        </text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('files') ? accent : 'gray', width: 28, flexDirection: 'column' }}>
          <List
            items={files}
            selected={fileIdx()}
            onSelect={selectFile}
            focused={fm.is('files')}
            renderItem={(item, { selected: isSel, focused }) => (
              <text style={{
                paddingX: 1,
                bg: isSel ? (focused ? accent : 'gray') : null,
                color: isSel ? 'black' : null,
              }}>
                {item}
              </text>
            )}
          />
        </box>

        <box style={{ border: 'round', borderColor: fm.is('preview') ? accent : 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
          <text style={{ color: accent, bold: true }}>{files[fileIdx()] || ''}</text>
          <ScrollableText
            content={content()}
            focused={fm.is('preview')}
            scrollOffset={scroll()}
            onScroll={setScroll}
            scrollbar
            wrap={false}
          />
        </box>
      </box>
    </box>
  )
}

mount(App, { title: 'highlight' })
