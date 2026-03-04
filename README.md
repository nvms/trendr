<pre align="center">
▗        ▌
▜▘▛▘█▌▛▌▛▌
▐▖▌ ▙▖▌▌▙▌

Direct-mode TUI renderer with JSX, signals, and per-cell diffing.
</pre>

<p align="center">4-16x faster than ink and neo-blessed - <a href="bench/README.md">benchmarks</a></p>

https://github.com/user-attachments/assets/d307ba1e-2b21-4f7d-8b1b-56252820db6c

https://github.com/user-attachments/assets/a5984747-f365-4fe3-a161-93101682ca42

https://github.com/user-attachments/assets/9c357c93-0299-4480-a969-61a54b49ec33

## Usage

Requires esbuild (or similar) for JSX transformation.

```json
{ "jsx": "automatic", "jsxImportSource": "trend" }
```

```jsx
import { mount, createSignal, useInput } 'from ''trend'

function App() {
  const [count, setCount] = createSignal(0)

  useInput(({ key }) => {
    if (key === 'up') setCount(c => c + 1)
    if (key === 'down') setCount(c => c - 1)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text style={{ color: 'cyan', bold: true }}>Count: {count()}</text>
      <text style={{ color: 'gray' }}>up/down to change</text>
    </box>
  )
}

mount(App)
```

`mount(Component, { stream?, stdin?, theme? })` enters alt screen, starts a 60fps render loop, and returns `{ unmount }`. Components are plain functions that return JSX. State is managed with signals - call the getter to read, the setter to write. The framework re-renders automatically when signals change.

### Theming

All built-in components use `accent` as the focus/highlight color (default: `'cyan'`). Override it globally via mount:

```jsx
mount(App, { theme: { accent: 'green' } })
```

Components read the accent with `useTheme()`. Use this in your own components to stay consistent:

```jsx
import { useTheme } from '@trendr/core'

const { accent } = useTheme()
```

Individual components still accept explicit color props (e.g. `<Spinner color="magenta" />`) which override the theme.

## Signals

```js
import { createSignal, createEffect, createMemo, batch, untrack, onCleanup } from '@trendr/core'

const [value, setValue] = createSignal(0)
value()         // read (tracks dependency)
setValue(1)     // write
setValue(v => v + 1) // updater

createEffect(() => {
  console.log(value()) // re-runs when value changes
  return () => {}      // optional cleanup
})

const doubled = createMemo(() => value() * 2) // cached derived value

batch(() => {        // coalesce multiple updates into one render
  setValue(1)
  setValue(2)
})

untrack(() => value()) // read without tracking
onCleanup(() => {})    // runs when component unmounts or effect re-runs
```

## Layout

Two element types: `box` (container) and `text` (leaf).

```jsx
<box style={{
  flexDirection: 'column',  // 'column' (default) | 'row'
  flexGrow: 1,              // fill remaining space
  gap: 1,                   // space between children
  justifyContent: 'flex-start', // 'flex-start' | 'center' | 'flex-end'
  alignItems: 'stretch',    // 'stretch' | 'flex-start' | 'center' | 'flex-end'
  width: 20,                // fixed or '50%'
  height: 10,               // fixed or '25%'
  minWidth: 5, maxWidth: 30,
  minHeight: 2, maxHeight: 15,
  padding: 1,               // all sides
  paddingX: 1, paddingY: 1, // axis
  paddingTop: 1, paddingBottom: 1, paddingLeft: 1, paddingRight: 1,
  margin: 1,                // same variants as padding
  border: 'round',          // 'single' | 'double' | 'round' | 'bold'
  borderColor: 'cyan',
  bg: 'blue',               // background color
}}>

<text style={{
  color: 'cyan',            // named, hex (#ff0000), or 256-color index
  bg: 'black',
  bold: true,
  dim: true,
  italic: true,
  underline: true,
  inverse: true,
  strikethrough: true,
  overflow: 'wrap',         // 'wrap' (default) | 'truncate' | 'nowrap'
}}>
```

`Box`, `Text`, and `Spacer` are convenience wrappers:

```jsx
import { Box, Text, Spacer } from '@trendr/core'
<Box style={{ flexDirection: 'row' }}><Text>hello</Text><Spacer /><Text>right</Text></Box>
```

## Hooks

### useInput

Used in [counter](examples/counter.jsx), [dashboard](examples/dashboard.jsx), [explorer](examples/explorer.jsx), [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx)

```jsx
useInput((event) => {
  // event.key: 'a', 'return', 'escape', 'up', 'down', 'left', 'right',
  //            'tab', 'shift-tab', 'space', 'backspace', 'delete',
  //            'home', 'end', 'pageup', 'pagedown', 'f1'-'f12'
  // event.ctrl: boolean
  // event.meta: boolean (alt/option key)
  // event.raw: raw character string
  // event.stopPropagation(): prevent other handlers from receiving this event
})
```

Handlers fire in reverse registration order (innermost component first). Call `stopPropagation()` to consume the event.

### useHotkey

Declarative key binding. Parses `'ctrl+s'`, `'alt+enter'`, etc.

```jsx
import { useHotkey } from '@trendr/core'

useHotkey('ctrl+s', () => save())
useHotkey('alt+enter', () => submit(), { when: () => isFocused })
```

### useLayout

Returns the component's computed layout rectangle.

```jsx
const { x, y, width, height } = useLayout()
```

### useResize

```jsx
useResize(({ width, height }) => { /* terminal resized */ })
```

### useInterval

Used in [dashboard](examples/dashboard.jsx)

```jsx
useInterval(() => tick(), 1000) // auto-cleaned on unmount
```

### useStdout

```jsx
const stream = useStdout() // the output stream (process.stdout or custom)
```

### useTheme

Returns the current theme object. See [Theming](#theming).

```jsx
const { accent } = useTheme()
```

### useFocus

Used in [explorer](examples/explorer.jsx), [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx), [layout](examples/layout.jsx)

Manages focus across multiple interactive regions. You register named items in the order you want tab to cycle through them. The focus manager tracks which name is currently active - it doesn't know anything about your components or layout.

```jsx
import { useFocus } from '@trendr/core'

const fm = useFocus({ initial: 'input' })

// declaration order = tab order
fm.item('input')     // tab stop 0
fm.item('list')      // tab stop 1
fm.item('sidebar')   // tab stop 2
```

Then wire each component's `focused` prop to `fm.is()`, which returns true when that name is the active one:

```jsx
<TextInput focused={fm.is('input')} />
<List focused={fm.is('list')} />
<Select focused={fm.is('sidebar')} />
```

Tab and shift-tab cycle through the registered names. The focus manager handles the index - you just query it.

```jsx
fm.is('input')   // boolean - is 'input' the active name?
fm.focus('list')  // jump to 'list' programmatically
fm.current()      // the currently active name
```

Groups let you nest multiple items under one tab stop, navigable with j/k or up/down within the group:

```jsx
fm.group('settings', { items: ['theme', 'autosave', 'format'], navigate: 'updown', wrap: true })
// fm.is('theme'), fm.is('autosave'), etc. work within the group
```

Stack-based focus for modals and drills - push saves the current focus and switches, pop restores it:

```jsx
fm.push('modal')  // save current focus, switch to 'modal'
fm.pop()          // restore previous focus
```

### useToast

Used in [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx)

```jsx
import { useToast } from '@trendr/core'

const toast = useToast({
  duration: 2000,           // ms, default 2000
  position: 'bottom-right', // see positions below
  margin: 1,                // padding from screen edge, default 1
  render: (message) => (    // optional custom render
    <box style={{ bg: '#1E1E1E', paddingX: 1 }}>
      <text style={{ color: '#9A9EA3' }}>{message}</text>
    </box>
  ),
})

toast('saved')

// positions: 'top-left', 'top-center', 'top-right',
//            'center-left', 'center', 'center-right',
//            'bottom-left', 'bottom-center', 'bottom-right'
```

## Components

All interactive components accept a `focused` prop that controls whether they respond to keyboard input. When multiple components are on screen, only the focused one should capture keys - otherwise a keypress meant for a text input would also scroll a list. In practice you wire this to a focus manager:

```jsx
const fm = useFocus({ initial: 'search' })
fm.item('search')
fm.item('results')

<TextInput focused={fm.is('search')} />
<List focused={fm.is('results')} />
```

### TextInput

Used in [explorer](examples/explorer.jsx), [modal-form](examples/modal-form.jsx), [focus-demo](examples/focus-demo.jsx)

Single-line text input with horizontal scrolling.

```jsx
<TextInput
  focused={fm.is('search')}
  placeholder="search..."
  onChange={v => {}}   // every keystroke
  onSubmit={v => {}}   // Enter
  onCancel={() => {}}  // Escape (only stopPropagates if provided)
/>
```

Keys: left/right, home/end, ctrl-a/e, ctrl-u/k/w, backspace, delete.

### TextArea

Used in [chat](examples/chat.jsx)

Multi-line text input. Auto-grows up to `maxHeight`, then scrolls.

```jsx
<TextArea
  focused={fm.is('input')}
  placeholder="write something..."
  maxHeight={10}         // default 10
  onChange={v => {}}     // every edit
  onSubmit={v => {}}     // Alt+Enter
  onCancel={() => {}}    // Escape
/>
```

Keys: Enter inserts newline. Up/down with sticky goal column. Home/end operate on display rows. Ctrl-u/k/w operate on logical lines.

### List

Used in [explorer](examples/explorer.jsx), [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx), [layout](examples/layout.jsx)

Scrollable list with keyboard navigation.

```jsx
<List
  items={data}
  selected={selectedIndex}  // controlled, or omit for internal state
  onSelect={setIndex}
  focused={fm.is('list')}
  height={10}               // defaults to layout height
  header={<text>title</text>}
  renderItem={(item, { selected, index, focused }) => (
    <text style={{ bg: selected ? (focused ? accent : 'gray') : null }}>{item.name}</text>
  )}
/>
```

Multi-row items are supported via `itemHeight`. The layout engine sizes each item naturally from its children - `itemHeight` just tells the scroll math how many rows each item occupies:

```jsx
<List
  items={data}
  itemHeight={3}
  renderItem={(item, { selected, focused }) => (
    <box style={{ flexDirection: 'column', bg: selected ? accent : null }}>
      <text style={{ bold: true }}>{item.name}</text>
      <text style={{ color: 'gray' }}>{item.description}</text>
      <text style={{ color: 'green' }}>{item.status}</text>
    </box>
  )}
/>
```

Keys: j/k or up/down, g/G for top/bottom, ctrl-d/u half page, ctrl-f/b full page, pageup/pagedown.

### Table

Used in [components](examples/components.jsx)

Column-based data table. Uses List internally.

```jsx
<Table
  columns={[
    { header: 'Name', key: 'name', flexGrow: 1 },
    { header: 'Size', key: 'size', width: 10, color: 'gray', paddingX: 1 },
    { header: 'Type', render: (row, sel) => row.type.toUpperCase(), width: 8 },
  ]}
  data={rows}
  selected={selectedRow}
  onSelect={setRow}
  focused={fm.is('table')}
  separator={true}              // horizontal rule below header
  separatorChars={{ left: '', fill: '─', right: '' }}  // customizable
/>
```

### Tabs

Used in [chat](examples/chat.jsx)

```jsx
<Tabs
  items={['general', 'settings', 'logs']}
  selected={activeTab}
  onSelect={setTab}
  focused={fm.is('tabs')}
/>
```

Keys: left/right, tab/shift-tab. Wraps around.

### Select

Used in [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx)

Dropdown selector. Can render inline or as overlay.

```jsx
<Select
  items={['red', 'green', 'blue']}
  selected={color}
  onSelect={setColor}
  focused={fm.is('color')}
  overlay={false}          // true renders as floating overlay
  placeholder="pick one..."
  openIcon="▲"             // default ▲
  closedIcon="▼"           // default ▼
  renderItem={(item, { selected, index }) => <text>{item}</text>}
  style={{
    border: 'single', borderColor: 'green', bg: 'black',
    cursorBg: 'green', cursorTextColor: 'black',
    color: null, focusedColor: 'green',
  }}
/>
```

Keys: j/k or up/down to navigate, enter/space to select, escape to close.

### Checkbox

Used in [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx)

```jsx
<Checkbox
  checked={isChecked}
  label="Enable feature"
  onChange={setChecked}  // (newState: boolean) => void
  focused={fm.is('feature')}
  checkedIcon="[✓]"     // default '[x]'
  uncheckedIcon="[ ]"   // default '[ ]'
/>
```

Keys: space or enter to toggle.

### Radio

Used in [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx)

```jsx
<Radio
  options={['small', 'medium', 'large']}
  selected={size}
  onSelect={setSize}
  focused={fm.is('size')}
/>
```

Keys: j/k or up/down, enter/space to select. Renders `●` / `○`.

### ProgressBar

Used in [dashboard](examples/dashboard.jsx), [components](examples/components.jsx)

```jsx
<ProgressBar
  value={0.65}      // 0 to 1
  width={20}        // characters, default 20
  color="red"       // overrides theme accent
  label="65%"       // optional text after bar
/>
```

### Spinner

Used in [components](examples/components.jsx)

```jsx
<Spinner
  label="loading..."
  color="magenta"    // overrides theme accent
  interval={80}      // ms, default 80
/>
```

### Button

Used in [modal-form](examples/modal-form.jsx)

Focusable button. Enter or space to activate.

```jsx
<Button
  label="save"
  onPress={() => save()}
  focused={fm.is('save')}
  variant="dim"   // optional, grays out when unfocused
/>
```

### Modal

Used in [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx)

Centered overlay with dimmed backdrop. Height is driven by content.

```jsx
<Modal
  open={isOpen}
  onClose={() => setOpen(false)}
  title="Confirm"
  width={40}     // default 40
>
  <text>Are you sure?</text>
  <Button label="ok" onPress={() => setOpen(false)} focused={fm.is('ok')} />
</Modal>
```

Keys: escape to close.

### ScrollableText

Used in [explorer](examples/explorer.jsx), [reader](examples/reader.jsx), [highlight](examples/highlight.jsx)

Scrollable text viewer with optional scrollbar. Content can include ANSI escape sequences (SGR) - colors, bold, dim, etc. are parsed and rendered correctly. This means you can pipe output from any syntax highlighter (shiki, cli-highlight, etc.) directly into `content`.

```jsx
<ScrollableText
  content={longText}
  focused={fm.is('preview')}
  scrollOffset={offset}    // controlled, or omit for internal state
  onScroll={setOffset}
  scrollbar={true}         // default false
  wrap={false}             // default true, set false for horizontal scroll
  thumbChar="█"            // default █
  trackChar="░"            // default │
/>
```

Keys: same as List (j/k, g/G, ctrl-d/u, ctrl-f/b, pageup/pagedown).

## Build

Uses esbuild. JSX configured with `jsxImportSource: 'trend'`.

```
node esbuild.config.js
```

Examples run via npm scripts:

```
npm run counter
npm run chat
npm run dashboard
npm run explorer
npm run highlight
```
