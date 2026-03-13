import { mount, createSignal, useInput, useFocus } from '../index.js'
import { MenuBar } from '../src/menubar.js'

export function MenuBarDemo() {
  const fm = useFocus({ initial: 'menu' })
  fm.item('menu')

  const [lastAction, setLastAction] = createSignal('none')

  const menus = [
    {
      label: 'File',
      hotkey: 'f',
      children: [
        { label: 'New', hotkey: 'n' },
        { label: 'Open', hotkey: 'o' },
        { label: 'Save', hotkey: 's' },
        { label: 'Save As' },
        { label: 'Export' },
        { label: 'Close', hotkey: 'c' },
      ],
    },
    {
      label: 'Edit',
      hotkey: 'e',
      children: [
        { label: 'Undo', hotkey: 'u' },
        { label: 'Redo', hotkey: 'r' },
        { label: 'Cut', hotkey: 'x' },
        { label: 'Copy', hotkey: 'c' },
        { label: 'Paste', hotkey: 'v' },
        { label: 'Find', hotkey: 'f' },
        { label: 'Replace' },
        { label: 'Select All', hotkey: 'a' },
      ],
    },
    {
      label: 'View',
      hotkey: 'v',
      children: [
        { label: 'Zoom In' },
        { label: 'Zoom Out' },
        { label: 'Reset Zoom' },
        { label: 'Toggle Sidebar', hotkey: 's' },
        { label: 'Toggle Terminal', hotkey: 't' },
      ],
    },
    {
      label: 'Help',
      hotkey: 'p',
      children: [
        { label: 'Documentation', hotkey: 'd' },
        { label: 'About' },
      ],
    },
  ]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <MenuBar
        items={menus}
        focused={fm.is('menu')}
        onSelect={({ menu, item }) => setLastAction(`${menu} > ${item}`)}
      />
      <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <text style={{ color: 'gray' }}>last action: {lastAction()}</text>
      </box>
    </box>
  )
}

// --- standalone ---

function Standalone() {
  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
  })
  return <MenuBarDemo />
}

mount(Standalone, { altScreen: true, mouse: true })
