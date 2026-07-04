<pre align="center">
▗        ▌
▜▘▛▘█▌▛▌▛▌
▐▖▌ ▙▖▌▌▙▌

</pre>


JSX components, signals, per-cell diffing and flexbox without React and [Yoga](https://github.com/facebook/yoga/issues/1859). Terminals are character grids, not DOM trees. Why reconcile a virtual DOM to write escape sequences?

No dependencies. In the included [benchmarks](bench/README.md), median frame times are 4.5x faster than ink on the dashboard and list-scrolling scenarios, 10.5x on ink's own rerender benchmark, and 24.8x on the resize-storm worst case; against neo-blessed the range is 1.9x to 8.6x. In the single-cell scenario (a 10,000-cell screen where only a corner counter changes), per-cell diffing writes 17 bytes per frame where ink writes about 9.9KB - though ink defers its terminal writes, so bytes written is not directly comparable between the two (see the notes in bench/README.md).

https://github.com/user-attachments/assets/6e84bb4b-a99e-46f2-a235-1ee4be62c0ae

## Usage

```bash
npm i @trendr/core
```

Requires esbuild (or similar) for JSX transformation.

```json
{ "jsx": "automatic", "jsxImportSource": "@trendr/core" }
```

```jsx
import { mount, createSignal, useInput } from '@trendr/core'

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

`mount(Component, options)` starts the render loop. Frames render on demand when signals change, capped at 60fps.

Options:

- `stream` - output stream, default `process.stdout`
- `stdin` - input stream, default `process.stdin`
- `title` - terminal window title
- `theme` - theme object, see [Theming](#theming)
- `onExit` - called after ctrl-c unmounts the app; when provided it replaces the default `process.exit(0)`
- `altScreen` - enter the alternate screen buffer, default `true`
- `inline` - inline mode, default `false` (see [Inline mode](#inline-mode))

Returns `{ unmount, repaint, getBuffer }`. `unmount` tears down input handling and restores the terminal, `repaint` forces a full repaint, `getBuffer` returns the last rendered cell buffer.

### Inline mode

`mount(App, { inline: true })` renders below the shell prompt instead of taking over the screen. The UI is split into a committed transcript and a live region. Committed content goes inside `<Scrollback items={...} render={...} />`: items are append-only, each new item is rendered once, printed into native terminal scrollback, and never touched again, so it scrolls and copies like normal terminal output. Everything outside `Scrollback` is the live region, which re-renders in place below the transcript.

```jsx
import { mount, Scrollback } from '@trendr/core'

function Chat() {
  return (
    <box style={{ flexDirection: 'column' }}>
      <Scrollback items={history()} render={(msg) => <Message {...msg} />} />
      <TextArea onSubmit={send} />
    </box>
  )
}

mount(Chat, { inline: true })
```

While an overlay (such as a Modal) is open, inline mode temporarily switches to the alternate screen and restores the transcript when it closes, so native scrollback is preserved. See [inline-chat](examples/inline-chat.jsx) for a full example.

### Theming

Pass a theme object to `mount` to configure global defaults:

```jsx
mount(App, {
  theme: {
    accent: 'green',        // focus/highlight color, default 'cyan'
    accentText: 'black',    // text drawn on accent backgrounds (cursor rows, focused buttons, active tabs), default 'black'
    muted: 'gray',          // de-emphasized text (placeholders, hints, inactive items, scrollbar rails), default 'gray'
    cursor: {
      blink: true,          // default false
      rate: 530,            // blink interval ms, default 530
      style: 'block',       // default 'block'
      bg: 'cyan',           // cursor background color
      color: 'black',       // cursor text color
    },
  },
})
```

Components read the theme with `useTheme()`:

```jsx
import { useTheme } from '@trendr/core'

const { accent, accentText, muted } = useTheme()
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
  borderEdges: { bottom: true, left: true }, // render only specific sides
  bg: 'blue',               // background color
  texture: 'dots',          // background texture (see below)
  textureColor: '#333',     // color for texture characters
  position: 'absolute',     // remove from flow, position with top/left/right/bottom
  top: 0, left: 0, right: 0, bottom: 0,
  overflow: 'scroll',       // scrollable container (see ScrollBox)
  scrollOffset: 0,          // scroll position (rows from top)
}}>
```

```jsx
<text style={{
  color: 'cyan',            // named, hex (#ff0000), or 256-color index
  bg: 'black',
  bold: true, dim: true, italic: true,
  underline: true, inverse: true, strikethrough: true,
  overflow: 'wrap',         // 'wrap' (default) | 'truncate' | 'nowrap'
}}>
```

### Background Textures

Repeating character fill for box backgrounds. Works with or without `bg`.

```jsx
<box style={{ bg: '#1a1a2e', texture: 'dots', textureColor: '#2a2a4e' }}>
```

Presets: `'shade-light'` (░), `'shade-medium'` (▒), `'shade-heavy'` (▓), `'dots'` (·), `'cross'` (╳), `'grid'` (┼), `'dash'` (╌). Or pass any single character: `texture: '~'`.

Texture characters show through spaces in text rendered on top (unless the text has an explicit `bg`, which claims the cell).

### Absolute Positioning

Position relative to parent, removed from flex flow.

```jsx
<box style={{ border: 'round', height: 5, flexDirection: 'column' }}>
  <text>content here</text>
  <box style={{ position: 'absolute', top: 0, right: 1 }}>
    <text style={{ color: 'green', bold: true }}>ONLINE</text>
  </box>
</box>
```

If both `left` and `right` are set, width is derived (same for `top`/`bottom`).

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

Returns a live reference to the component's computed layout rectangle. Values update in-place each frame, including after terminal resize.

```jsx
const layout = useLayout()
// layout.x, layout.y, layout.width, layout.height, layout.contentHeight
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

### useTimeout

Used in [timeout](examples/timeout.jsx)

Single-shot timer. Auto-cleaned on unmount.

```jsx
useTimeout(() => hide(), 3000)
```

### useAsync

Used in [async](examples/async.jsx)

Async function to reactive signals.

```jsx
import { useAsync } from '@trendr/core'

const { status, data, error, run } = useAsync(fetchUsers)

// status(): 'idle' | 'loading' | 'success' | 'error'
// data():   resolved value (null until success)
// error():  rejected error (null until error)
// run():    trigger the async function. forwards args: run(userId)
```

Stale calls are discarded. Use `{ immediate: true }` to fire on mount:

```jsx
const { status, data } = useAsync(fetchUsers, { immediate: true })
```

### useMouse

```jsx
useMouse((event) => {
  // event.action: 'press' | 'release' | 'drag' | 'scroll'
  // event.button: 'left' | 'middle' | 'right' (press/release only)
  // event.direction: 'up' | 'down' (scroll only)
  // event.x, event.y: 0-based terminal coordinates
  // event.stopPropagation(): prevent other handlers from receiving this event
})
```

Mouse is enabled automatically. Built-in components support click, scroll wheel, and scrollbar dragging.

### useStdout

```jsx
const stream = useStdout() // the output stream (process.stdout or custom)
```

### useRepaint

Forces a full repaint. Useful after spawning an external process (e.g. `$EDITOR`).

```jsx
import { useRepaint, useStdout, exitAltScreen, showCursor, altScreen, hideCursor } from '@trendr/core'

const repaint = useRepaint()
const stdout = useStdout()

stdout.write(exitAltScreen + showCursor)
execSync(`${process.env.EDITOR} ${file}`, { stdio: 'inherit' })
stdout.write(altScreen + hideCursor)
repaint()
```

### useTitle

Sets the terminal window title.

```jsx
useTitle('my app')
```

### useFrameStats

Returns stats for the last rendered frame.

```jsx
const { changed, total, bytes, fps } = useFrameStats()
// changed: cells that differed from the previous frame
// total:   cells in the buffer (width * height)
// bytes:   bytes written to the stream for the frame
// fps:     rolling frames-per-second estimate
```

### useTheme

Returns the current theme object. See [Theming](#theming).

```jsx
const { accent } = useTheme()
```

### useCursor

Drives the text cursor for input-style components using the theme's cursor config (blink, style, colors). Pass an optional per-component cursor config and whether the component is focused.

```jsx
const { config, visible, cursorStyle, reset } = useCursor(cursorProp, focused)

// cursorStyle(): style object for the cursor cell (null when hidden or unfocused)
// visible():     blink state signal
// reset():       restart the blink cycle (call on keystrokes)
```

The built-in inputs (TextInput, TextArea, PickList) use this internally and accept a `cursor` prop that is forwarded here.

### useFocus

Used in [explorer](examples/explorer.jsx), [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx), [layout](examples/layout.jsx)

Register named items in tab order. The focus manager tracks which is active.

```jsx
import { useFocus } from '@trendr/core'

const fm = useFocus({ initial: 'input' })
// options: initial (name focused at mount),
//          cycle: 'tab' (default) handles tab/shift-tab cycling;
//          any other value disables it so you can drive focus yourself

// declaration order = tab order
fm.item('input')     // tab stop 0
fm.item('list')      // tab stop 1
fm.item('sidebar')   // tab stop 2
```

Wire `fm.is()` to each component's `focused` prop. Tab/shift-tab cycles through items.

```jsx
<TextInput focused={fm.is('input')} />
<List focused={fm.is('list')} />
<Select focused={fm.is('sidebar')} />

fm.focus('list')  // jump programmatically
fm.current()      // the active name
```

Groups nest multiple items under one tab stop:

```jsx
fm.group('settings', { items: ['theme', 'autosave', 'format'] })
// fm.is('theme'), fm.is('autosave'), etc. work within the group
```

Options:
- `navigate` - which keys move between group items: `'both'` (default, j/k and up/down), `'jk'`, or `'updown'`
- `wrap` - wrap around at ends (default `false`)

Stack-based focus for modals - push saves current focus, pop restores it:

```jsx
fm.push('modal')  // save current focus, switch to 'modal'
fm.pop()          // restore previous focus
```

### useFocusTrap

While active, stops tab/shift-tab from propagating past the calling component, so focus managers registered earlier in the tree do not also cycle. Handlers fire innermost-first: a `useFocus` inside the trapped subtree still receives the tab first, then the trap halts it. Useful for modals with their own focus manager.

```jsx
import { useFocusTrap } from '@trendr/core'

useFocusTrap(modalOpen)
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

All interactive components accept a `focused` prop. Wire it to a focus manager so only one component captures keys at a time:

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
  initialValue="prefill"  // starting value
  clearOnSubmit={false}   // reset to empty on Enter (default false)
  cursor={{ blink: true }} // per-component cursor config (overrides theme)
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
  maxHeight={10}           // default 10
  value={draft()}          // controlled value (optional)
  submitOnEnter={false}    // default false: Alt+Enter submits, Enter inserts newline.
                           // true flips it: Enter submits, Shift/Alt+Enter inserts newline
  clearOnSubmit={true}     // reset to empty on submit (default true)
  cursor={{ blink: true }} // per-component cursor config (overrides theme)
  onChange={(v, prev) => {}} // every edit, receives new and previous value
  onSubmit={v => {}}       // submit key (see submitOnEnter)
  onCancel={() => {}}      // Escape
  onKeyDown={event => {}}  // raw key hook before internal handling;
                           // return true to consume the key (event.value is the current text)
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
  onCursorChange={(item, index) => {}} // fires when the highlighted item changes
  focused={fm.is('list')}
  scrollbar={true}          // default false
  scrolloff={2}             // items of margin from edges when scrolling (default 2)
  interactive={true}        // handle keyboard input (default: same as focused)
  header={<text>title</text>}
  headerHeight={1}          // default 1, rows the header occupies
  stickyHeader={false}      // keep the header pinned while the list scrolls (default false)
  gap={0}                   // blank rows between items (default 0)
  renderItem={(item, { selected, index, focused }) => (
    <text style={{ bg: selected ? (focused ? accent : 'gray') : null }}>{item.name}</text>
  )}
/>
```

`itemHeight` enables multi-row items (tells scroll math how many rows each item occupies):

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

### PickList

Used in [pick-list](examples/pick-list.jsx)

Filterable list with live search. Text input at the top filters a scrollable list below. Navigate the list with up/down or ctrl-n/ctrl-p while typing.

```jsx
<PickList
  items={data}
  focused={fm.is('search')}
  placeholder="search..."
  onSelect={item => {}}       // Enter on highlighted item
  onCancel={() => {}}          // Escape
  onChange={query => {}}       // every keystroke in the filter
  clearOnSelect={false}        // reset filter on select (default false)
  scrollbar={true}             // default false
  scrolloff={0}                // items of margin from edges (default 0)
  gap={1}                      // space between input and list (default 0)
  filter={(query, item) => {}} // custom filter (default: case-insensitive includes)
/>
```

Multi-row items with `renderItem`, `itemHeight`, and `itemGap`:

```jsx
<PickList
  items={packages}
  itemHeight={3}
  itemGap={1}
  renderItem={(pkg, { selected, focused }) => (
    <box style={{ flexDirection: 'column', bg: selected ? accent : null, paddingX: 1 }}>
      <text style={{ bold: true }}>{pkg.name}</text>
      <text style={{ color: 'gray' }}>{pkg.desc}</text>
      <text style={{ color: 'yellow' }}>{pkg.downloads}</text>
    </box>
  )}
/>
```

Keys: type to filter, up/down or ctrl-n/ctrl-p to navigate, enter to select, escape to cancel. All bash-style editing keys work (ctrl-a/e/u/k/w).

### Menu

Used in [inline-chat](examples/inline-chat.jsx)

Windowed single-select list with no text input of its own. Shows at most `maxVisible` rows and scrolls as the cursor moves. It pairs with an external input, such as a slash-command palette above a TextArea: render it near the input and, while focused, it intercepts up/down/enter before the input sees them.

```jsx
<Menu
  items={commands}
  selected={index}          // controlled, or omit for internal state
  onSelect={setIndex}       // cursor moved
  onSubmit={(item, index) => {}} // Enter
  onCancel={() => {}}       // Escape (only stopPropagates if provided)
  focused={showPalette}
  maxVisible={5}            // default 5
  scrolloff={2}             // default 2
  itemHeight={1}            // rows per item (default 1)
  gap={0}                   // blank rows between items (default 0)
  arrow="›"                 // marker before the active item (default '›')
  renderItem={(item, { active }) => <text>{item.name}</text>}
/>
```

Keys: up/down or ctrl-p/ctrl-n, enter to submit, escape to cancel.

### Table

Used in [components](examples/components.jsx), [custom-table](examples/custom-table.jsx)

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
  columnGap={1}                 // spaces between columns (default 1)
  stickyHeader={false}          // pin header row while scrolling (default false)
  gap={0}                       // blank rows between data rows (default 0)
  itemHeight={1}                // rows per data row, for multi-row rendering (default 1)
  scrolloff={2}                 // rows of margin from edges when scrolling (default 2)
  scrollbar={false}             // default false
/>
```

`renderItem` gives full control over row rendering while keeping column-aligned headers:

```jsx
<Table
  columns={columns}
  data={rows}
  selected={idx()}
  onSelect={setIdx}
  renderItem={(row, { selected, focused }) => (
    <box style={{ flexDirection: 'row', bg: selected ? accent : null, paddingX: 1 }}>
      <text style={{ color: selected ? 'black' : null, flexGrow: 1 }}>{row.name}</text>
      <text style={{ color: selected ? 'black' : row.stale ? 'yellow' : 'gray' }}>{row.age}</text>
    </box>
  )}
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

### MenuBar

Used in [menubar](examples/menubar.jsx)

Horizontal menu bar with dropdown submenus rendered as overlays. Menu and item hotkeys are underlined in their labels and activate directly.

```jsx
<MenuBar
  items={[
    {
      label: 'File',
      hotkey: 'f',
      children: [
        { label: 'New', hotkey: 'n' },
        { label: 'Open', hotkey: 'o', value: 'open-file' },
      ],
    },
    { label: 'Edit', hotkey: 'e', children: [/* ... */] },
  ]}
  focused={fm.is('menu')}
  maxVisible={10}       // dropdown rows before scrolling (default 10)
  onSelect={({ menu, item, value }) => {}}
  hotkeyColor="cyan"    // hotkey letter color (default: theme accent)
  style={{}}            // pass-through style for the bar row
/>
```

Keys: h/l or left/right to move between menus, enter/space to open, j/k or up/down inside a dropdown, enter/space to select, escape to close. Pressing a hotkey letter opens that menu or selects that item.

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
  maxVisible={10}          // rows shown before the dropdown scrolls (default 10)
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

Used in [progress](examples/progress.jsx), [components](examples/components.jsx)

```jsx
<ProgressBar
  value={0.65}              // 0 to 1
  variant="thin"            // 'thin' (default), 'block', 'ascii', 'braille'
  color="red"               // overrides theme accent
  label="Installing"        // optional label before bar
  count="8/12"              // optional count after percentage
  percentage={true}         // show percentage (default true)
  width={30}                // override bar width (default: fills available space)
/>
```

Variants:
- `thin` - clean `━` bar (default)
- `block` - thick `█░` blocks
- `ascii` - plain `[###---]`, works in any terminal
- `braille` - smooth `⣿` fill

```
Installing  ━━━━━━━━━━━━━━━━━━━━━━━━ 67% (8/12)
```

### Spinner

Used in [components](examples/components.jsx)

```jsx
<Spinner
  label="loading..."
  variant="dots"     // 'dots' (default), 'line', 'circle', 'bounce', 'arrow', 'square', 'star'
  color="magenta"    // overrides theme accent
  interval={80}      // ms, default 80
  frames={['a','b']} // custom frames (overrides variant)
/>
```

### Task

Used in [task](examples/task.jsx)

Spinner while loading, checkmark on success, x on error. Built on `useAsync`.

```jsx
<Task
  run={() => fetchData()}   // async function
  label="Fetching data..."  // shown while loading
  successLabel="Done"       // optional, shown on success (defaults to label)
  errorLabel="Failed"       // optional, shown on error (defaults to error message)
  immediate={true}          // fire on mount (default true)
  icon={{ success: '+' }}   // override icons per status
  color="cyan"              // override color (defaults vary by status)
/>
```

Multiple tasks render as a step list:

```jsx
<Task run={() => install()} label="Installing..." successLabel="Installed" />
<Task run={() => build()} label="Building..." successLabel="Built" />
<Task run={() => test()} label="Testing..." successLabel="Tests passed" />
```

### Shimmer

Used in [shimmer](examples/shimmer.jsx)

Sliding highlight effect with gradient falloff.

```jsx
<Shimmer
  color="gray"         // base text color (default 'gray')
  highlight="cyan"     // shimmer color (default: theme accent)
  size={3}             // width of bright center in chars (default 3)
  gradient={3}         // gradient tail length each side (default 3, 0 for hard edge)
  duration={1000}      // ms for one pass across the text (default 1000)
  delay={500}          // ms pause between passes (default 500)
  reverse={false}      // slide right to left (default false)
>
  Loading resources...
</Shimmer>
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
  width={40}       // default 40
  border="round"   // 'single' | 'double' | 'round' | 'bold' (default 'round')
>
  <text>Are you sure?</text>
  <Button label="ok" onPress={() => setOpen(false)} focused={fm.is('ok')} />
</Modal>
```

Keys: escape to close.

### registerOverlay

The mechanism behind Modal, Select's dropdown mode, and toasts. Registers an element to be laid out and painted above the main tree for the current frame. Overlays are collected fresh every frame, so call it during render and gate it on your own open state.

```jsx
import { registerOverlay } from '@trendr/core'

function Palette({ open }) {
  if (open) {
    registerOverlay(
      <box style={{ position: 'absolute', top: 2, left: 4, width: 40, border: 'round' }}>
        <text>palette</text>
      </box>,
      { backdrop: true },
    )
  }
  return null
}
```

Options:

- `backdrop` - lay the overlay out over the full screen and dim everything behind it
- `fullscreen` - full-screen layout without dimming
- `capture` - while this overlay is registered, key and mouse events are dispatched only to handlers inside the overlay's subtree (the registering component, components rendered in its overlay tree, and overlays they open in turn). Everything else is skipped, except mount-level handlers like the built-in ctrl+c exit. Modal sets this, which is why content behind an open modal never reacts to input regardless of mount order. When several capturing overlays are open, the most recently registered one wins.

With neither positioning flag, the overlay is anchored just below the calling component's layout rectangle, which is how Select positions its dropdown.

### ScrollableText

Used in [explorer](examples/explorer.jsx), [reader](examples/reader.jsx), [highlight](examples/highlight.jsx)

Scrollable text viewer. ANSI escape sequences are parsed and rendered, so syntax highlighter output (shiki, cli-highlight, etc.) works directly.

```jsx
<ScrollableText
  content={longText}
  focused={fm.is('preview')}
  scrollOffset={offset}    // controlled, or omit for internal state
  onScroll={setOffset}
  scrollbar={true}         // default false
  width={60}               // wrap width override (default: measured layout width)
  wrap={false}             // default true, false truncates long lines
  thumbChar="█"            // default █
  trackChar="│"            // default │
/>
```

Keys: same as List (j/k, g/G, ctrl-d/u, ctrl-f/b, pageup/pagedown).

### Diff

Used in [diff](examples/diff.jsx)

Unified diff viewer with line numbers, word-level change highlighting, and optional syntax highlighting. Input is one of three forms: `before`/`after` strings, a unified `patch` string (`git diff` output), or structured `hunks`.

```jsx
<Diff
  before={oldSource}       // or patch="diff --git ..." or hunks={[...]}
  after={newSource}
  language="js"            // passed to highlight (default 'text')
  filename="src/app.js"    // optional header row with +/- stats
  highlight={(code, lang) => ansiString} // optional syntax highlighter
  wordDiff={true}          // word-level ranges within changed lines (default true)
  context={3}              // context lines around changes, folds the rest (default Infinity)
  lineNumbers={true}       // default true
  focused={true}
  scrollOffset={offset}    // controlled, or omit for internal state
  onScroll={setOffset}
  scrollbar={true}         // default true
  colors={{ addBg: '#10301a' }} // palette overrides
/>
```

The `highlight` function must be synchronous - the render loop cannot await. For async highlighters like shiki, pre-highlight into a cache before mounting and return cached results (see [diff](examples/diff.jsx)).

Keys: j/k or up/down, ctrl-d/u half page, ctrl-f/b or pageup/pagedown full page, g/home for top, G/end for bottom.

`computeDiff` is the pure core, exported for building custom diff UIs:

```js
import { computeDiff } from '@trendr/core'

const { rows, stats } = computeDiff({ before, after, patch, hunks, wordDiff, context })
// rows:  { type: 'context' | 'add' | 'del' | 'hunk' | 'meta' | 'fold',
//          oldNo, newNo, text, intra }
//        intra is an array of [start, end] changed ranges for word diff
// stats: { additions, deletions }
```

### ScrollBox

Scrollable container for JSX children (vs ScrollableText which takes a string).

```jsx
<ScrollBox
  focused={fm.is('list')}
  scrollbar={true}          // default false
  scrollOffset={offset}     // controlled, or omit for internal state
  onScroll={setOffset}
  thumbChar="█"             // default █
  trackChar="│"             // default │
  style={{ flexGrow: 1 }}   // pass-through style for the scroll container
>
  {items.map(item => (
    <text key={item.id}>{item.name}</text>
  ))}
</ScrollBox>
```

Keys: same as List and ScrollableText.

### SplitPane

Paneled layout with shared borders and junction characters. Sizes use `fr` units or fixed values.

```jsx
import { SplitPane } from '@trendr/core'

<SplitPane direction="row" sizes={[20, '2fr', '1fr']} border="round" borderColor="gray">
  <box style={{ paddingX: 1 }}>
    <text>sidebar</text>
  </box>
  <box style={{ paddingX: 1 }}>
    <text>main content</text>
  </box>
  <box style={{ paddingX: 1 }}>
    <text>detail</text>
  </box>
</SplitPane>
```

Props:
- `direction` - `'row'` (vertical dividers) or `'column'` (horizontal dividers)
- `sizes` - array of fixed numbers or `'Nfr'` strings. `[20, '1fr']` = 20 cols fixed + rest. `['1fr', '1fr']` = even split. Defaults to equal fractions.
- `border` - `'single'` | `'double'` | `'round'` | `'bold'`
- `borderColor` - color for border and dividers
- `borderEdges` - object with `top`, `right`, `bottom`, `left` booleans to render only specific sides. Omitted keys default to false.

Nesting works:

```jsx
<SplitPane direction="column" sizes={['1fr', 8]} border="round">
  <SplitPane direction="row" sizes={[20, '1fr']} border="round">
    <box>nav</box>
    <box>main</box>
  </SplitPane>
  <box>status</box>
</SplitPane>
```

### MillerNav

Used in [miller-nav](examples/miller-nav.jsx)

Miller-column navigator in the style of Finder's column view. Columns show the path from root to the active item; children are fetched on demand with a synchronous `getChildren`.

```jsx
<MillerNav
  rootItems={items}
  getChildren={item => item.children ?? []}  // synchronous, returns an array
  hasChildren={item => !!item.children}      // optional, marks items that can expand
  onSelectionChange={({ item, breadcrumb, column }) => {}}
  focused={fm.is('nav')}
  interactive={true}        // handle keyboard input (default: same as focused)
  scrollbar={false}         // default false
  peekColumn={true}         // preview column for the active item's children (default true)
  maxChars={{ focused: 20, unfocused: 10 }}  // column width caps, or a single number
  divider={true}            // vertical divider between columns (default true)
  dividerChar="▏"           // default '▏'
  dividerColor="#333333"    // default '#333333'
  renderItem={(item, { selected, focused, column }) => <text>{item.name}</text>}
/>
```

Items are strings or objects with a `name` or `label` field.

Keys: j/k or up/down to move within a column, l/right to descend, h/left to go back, ctrl-d/u half page.

## Animation

Physics-based animation. Animated values are signals that trigger re-renders.

```jsx
import { useAnimated, spring, ease, decay } from '@trendr/core'

const x = useAnimated(0, spring())    // spring physics
x.set(100)                            // animate to 100
x()                                   // read current value (tracks as signal)
x.snap(50)                            // jump instantly, no animation
```

`useAnimated` is the hook version (auto-cleanup on unmount). `animated` is the standalone version for use outside components.

### Interpolators

```js
spring({ frequency: 2, damping: 0.3 })   // underdamped spring (bouncy)
spring({ damping: 1 })                    // critically damped (no bounce)
ease(300)                                 // 300ms ease-out-cubic
ease(500, linear)                         // 500ms linear
decay({ deceleration: 0.998 })            // momentum-based decay
```

Switch interpolator mid-animation:

```js
x.setInterpolator(ease(200))
x.set(newTarget)
```

### Easing functions

`linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutElastic()`, `easeOutBounce()`

### Tick callback

```js
x.onTick((value) => { /* called each frame while animating */ })
```

## Development

Inside this repo, examples import from the local alias `trend`, which a custom esbuild plugin in `esbuild.config.js` resolves to the local source; published consumers configure `jsxImportSource: '@trendr/core'` as shown in [Usage](#usage).

Build the examples:

```
npm run build
```

Run one:

```
npm run ex counter
npm run ex chat
npm run ex highlight
```

`npm run ex` without a name lists all available examples.
