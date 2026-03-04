import { mount, createSignal, useInput, useFocus, useTheme } from '../index.js'
import { List } from '../src/list.js'
import { Select } from '../src/select.js'
import { Checkbox } from '../src/checkbox.js'
import { Radio } from '../src/radio.js'
import { TextInput } from '../src/text-input.js'
import { Modal } from '../src/modal.js'

const FILES = [
  'index.js', 'package.json', 'README.md', 'src/app.js', 'src/utils.js',
  'src/config.js', 'src/routes.js', 'src/db.js', 'test/app.test.js',
  'test/utils.test.js', 'test/config.test.js', '.gitignore', '.eslintrc.json',
]

function App() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'files' })
  fm.item('files')
  fm.group('settings', {
    items: ['theme', 'autosave', 'linting', 'indent'],
  })

  const [fileIdx, setFileIdx] = createSignal(0)
  const [theme, setTheme] = createSignal('dark')
  const [autosave, setAutosave] = createSignal(true)
  const [linting, setLinting] = createSignal(true)
  const [indent, setIndent] = createSignal('2 spaces')
  const [search, setSearch] = createSignal('')
  const [modalOpen, setModalOpen] = createSignal(false)

  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)

    if (key === '/' && !fm.is('search')) {
      fm.push('search')
      return
    }

    if (key === 'escape' && fm.is('search')) {
      fm.pop()
      setSearch('')
      return
    }

    if (key === 'm' && !fm.is('search') && !fm.is('modal')) {
      setModalOpen(true)
      fm.push('modal')
      return
    }

    if (key === 'escape' && fm.is('modal')) {
      setModalOpen(false)
      fm.pop()
      return
    }
  })

  const filtered = search()
    ? FILES.filter(f => f.includes(search()))
    : FILES

  const sel = filtered[fileIdx()]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>focus demo</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          focused: <text style={{ color: accent }}>{fm.current()}</text>
          {'  '}tab: switch  /: search  m: modal
        </text>
      </box>

      {fm.is('search') && (
        <box style={{ flexDirection: 'row', paddingX: 1 }}>
          <text style={{ color: accent }}>/ </text>
          <TextInput
            focused={true}
            placeholder="filter files..."
            onChange={setSearch}
            onSubmit={() => { fm.pop(); setSearch('') }}
            onCancel={() => { fm.pop(); setSearch('') }}
          />
        </box>
      )}

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('files') ? accent : 'gray', width: 30, flexDirection: 'column' }}>
          <List
            items={filtered}
            selected={fileIdx()}
            onSelect={setFileIdx}
            focused={fm.is('files')}
            renderItem={(item, { selected: isSel, focused }) => (
              <text style={{
                bg: isSel ? (focused ? accent : 'gray') : null,
                color: isSel ? 'black' : null,
                paddingX: 1,
              }}>
                {item}
              </text>
            )}
          />
        </box>

        <box style={{ border: 'round', borderColor: fm.is('settings') ? accent : 'gray', flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: accent }}>settings</text>
          <box style={{ height: 1 }} />

          <text style={{ color: 'gray', dim: true }}>theme</text>
          <Select
            items={['dark', 'light', 'solarized', 'monokai']}
            selected={theme()}
            onSelect={setTheme}
            focused={fm.is('theme')}
            overlay
          />
          <box style={{ height: 1 }} />

          <Checkbox
            checked={autosave()}
            label="autosave"
            onChange={setAutosave}
            focused={fm.is('autosave')}
          />
          <Checkbox
            checked={linting()}
            label="linting"
            onChange={setLinting}
            focused={fm.is('linting')}
          />
          <box style={{ height: 1 }} />

          <text style={{ color: 'gray', dim: true }}>indentation</text>
          <Radio
            options={['2 spaces', '4 spaces', 'tabs']}
            selected={indent()}
            onSelect={setIndent}
            focused={fm.is('indent')}
          />
          <box style={{ height: 1 }} />

          {sel && <text style={{ color: 'gray', dim: true }}>selected: {sel}</text>}
        </box>
      </box>

      <Modal
        open={modalOpen()}
        onClose={() => { setModalOpen(false); fm.pop() }}
        title="about"
        width={40}
      >
        <text>focus demo for trend TUI framework</text>
        <text>testing useFocus hook</text>
        <box style={{ height: 1 }} />
        <text style={{ color: 'gray', dim: true }}>press esc to close</text>
      </Modal>
    </box>
  )
}

mount(App, { title: 'focus demo' })
