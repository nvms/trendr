<pre align="center">
▗        ▌
▜▘▛▘█▌▛▌▛▌
▐▖▌ ▙▖▌▌▙▌

</pre>


JSX components, signals, per-cell diffing and flexbox without React and Yoga. Terminals are character grids, not DOM trees.

4-16x faster frame times and 580x less I/O per render than popular TUI frameworks. No dependencies. [benchmarks](bench/README.md)

https://github.com/user-attachments/assets/70c91ab3-659a-4bb0-939a-961dcfbaba61

## Usage

Requires esbuild (or similar) for JSX transformation.

```json
{ "jsx": "automatic", "jsxImportSource": "trend" }
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

`mount(Component, { stream?, stdin?, title?, theme? })` enters alt screen, starts a 60fps render loop, and returns `{ unmount, repaint }`. Components are plain functions that return JSX. Signals drive state - read with the getter, write with the setter, and the framework re-renders automatically.

### Theming

Pass a theme object to `mount` to configure global defaults:

```jsx
mount(App, {
  theme: {
    accent: 'green',        // focus/highlight color, default 'cyan'
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
  borderEdges: { bottom: true, left: true }, // render only specific sides
  bg: 'blue',               // background color
  texture: 'dots',          // background texture (see below)
  textureColor: '#333',     // color for texture characters
  position: 'absolute',     // remove from flow, position with top/left/right/bottom
  top: 0, left: 0, right: 0, bottom: 0,
  overflow: 'scroll',       // scrollable container (see ScrollBox)
  scrollOffset: 0,          // scroll position (rows from top)
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
const repaint = useRepaint()

// leave alt screen, spawn editor, re-enter, repaint
stdout.write('\x1b[?1049l\x1b[?25h')
execSync(`${process.env.EDITOR} ${file}`, { stdio: 'inherit' })
stdout.write('\x1b[?1049h\x1b[?25l')
repaint()
```

### useTheme

Returns the current theme object. See [Theming](#theming).

```jsx
const { accent } = useTheme()
```

### useFocus

Used in [explorer](examples/explorer.jsx), [chat](examples/chat.jsx), [modal-form](examples/modal-form.jsx), [components](examples/components.jsx), [focus-demo](examples/focus-demo.jsx), [layout](examples/layout.jsx)

Register named items in tab order. The focus manager tracks which is active.

```jsx
import { useFocus } from '@trendr/core'

const fm = useFocus({ initial: 'input' })

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
  scrollbar={true}          // default false
  header={<text>title</text>}
  headerHeight={1}          // default 1, rows the header occupies
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
  width={40}     // default 40
>
  <text>Are you sure?</text>
  <Button label="ok" onPress={() => setOpen(false)} focused={fm.is('ok')} />
</Modal>
```

Keys: escape to close.

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
  wrap={false}             // default true, set false for horizontal scroll
  thumbChar="█"            // default █
  trackChar="│"            // default │
/>
```

Keys: same as List (j/k, g/G, ctrl-d/u, ctrl-f/b, pageup/pagedown).

### ScrollBox

Scrollable container for JSX children (vs ScrollableText which takes a string).

```jsx
<ScrollBox
  focused={fm.is('list')}
  scrollbar={true}          // default false
  scrollOffset={offset}     // controlled, or omit for internal state
  onScroll={setOffset}
  thumbChar="\u2588"        // default █
  trackChar="\u2502"        // default │
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
