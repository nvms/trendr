import { mount, createSignal, useInput, useTheme } from '../index.js'
import { ScrollableText } from '../src/scrollable-text.js'

const CONTENT = `The MIT License (MIT)

Copyright (c) 2026 trend contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

trend is a direct-mode terminal UI renderer with JSX support. it uses SolidJS-style signals for reactivity and a custom flexbox layout engine for positioning.

the rendering pipeline has five stages:

1. RESOLVE - walk the JSX tree, calling function components within reactive scopes. each component gets its own scope for cleanup tracking.

2. LAYOUT - compute { x, y, width, height } for every element using a custom flexbox implementation. supports row/column direction, flex-grow, padding, margin, gap, and alignment.

3. PAINT - write cells into the buffer based on layout rectangles. each cell stores a character, foreground color, background color, and attribute flags.

4. DIFF - compare previous and current buffers cell by cell. only cells that actually changed produce ANSI output. this is the key optimization - full paint is cheap (array writes), but terminal I/O is expensive.

5. EMIT - single stream.write() call with the accumulated ANSI diff. no flickering because we never erase and rewrite - we only update changed positions.

key design decisions:

- signals over react hooks: fine-grained reactivity in ~100 lines. no virtual DOM, no reconciler, no fiber tree.

- own flexbox engine: ~300 lines of JS handles the common cases. no need for yoga's 2MB C++ binary.

- double buffering: prev and curr buffers swap each frame. diff produces minimal terminal output.

- scopes for lifecycle: no componentDidMount/useEffect. just onCleanup(() => ...) within a reactive scope.

- ESM only, JS only, zero dependencies.

built-in components:

Box - flexbox container with optional border, padding, margin
Text - text content with styling (color, bold, dim, inverse, etc.)
Spacer - flexible space filler
TextInput - single-line text input with cursor, placeholder, ctrl shortcuts
List - scrollable list with keyboard navigation and renderItem
Table - column headers with scrollable rows (built on List)
Tabs - horizontal tab switcher
Select - dropdown with overlay mode
Checkbox - toggle with label
Radio - radio group with visual indicators
ProgressBar - filled/empty bar with optional label
Spinner - braille dot animation
Modal - overlay dialog with backdrop dimming
ScrollableText - word-wrapped scrollable text content

all interactive components follow the same patterns:

- focused prop controls whether the component responds to input
- useInput for keyboard handling with stopPropagation support
- controlled and uncontrolled modes via optional value/onChange props
- consistent vim-style navigation (j/k/g/G/ctrl-d/ctrl-u)

this text is long enough to demonstrate scrolling. try pressing j/k to scroll line by line, ctrl-d/ctrl-u for half-page jumps, ctrl-b/ctrl-f for full pages, and g/G to jump to the top or bottom. resize your terminal to see word wrapping adjust in real time.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula.

Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula ut dictum pharetra, nisi nunc fringilla magna, in commodo elit erat nec turpis. Ut pharetra augue nec augue. Nam elit agna, endrerit sit amet, tincidunt ac, viverra sed, nulla.

end of document.`

function App() {
  const { accent } = useTheme()
  const [showScrollbar, setShowScrollbar] = createSignal(true)

  useInput(({ key, ctrl }) => {
    if ((ctrl && key === 'c') || key === 'q') process.exit(0)
    if (key === 's') setShowScrollbar(v => !v)
  })

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>reader</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>j/k scroll  g/G top/bottom  s: scrollbar ({showScrollbar() ? 'on' : 'off'})  q quit</text>
      </box>
      <box style={{ border: 'round', borderColor: accent, flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
        <ScrollableText content={CONTENT} scrollbar={showScrollbar()} />
      </box>
    </box>
  )
}

mount(App, { title: 'reader' })
