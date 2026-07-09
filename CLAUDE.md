# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

trend is a direct-mode TUI renderer for Node.js with JSX, signals, and per-cell diffing. It's a framework for building terminal UIs - an alternative to ink and neo-blessed, with faster frame times in every benchmarked scenario (4.5-24.8x vs ink, 1.9-8.6x vs neo-blessed; see bench/).

Published as `@trendr/core`. ESM only (`"type": "module"`). JavaScript, no TypeScript.

## Commands

```bash
npm test                    # runs all seven test files sequentially
node test/test.js           # unit tests (buffer, diff, ansi, signals, jsx, layout, wrap)
node test/test-e2e.js       # e2e tests (signal lifecycle, hook idempotency, diff minimality)
node test/test-mount.js     # mount integration test with fake streams
node test/test-render.js    # render tests (layout, components, scrolling, theming)
node test/test-diff.js      # Diff component / diff-engine tests
node test/test-input.js     # input parsing, paste, focus, hotkeys, text editing
node test/test-components.js # component library (list, table, select, radio, ...)

node esbuild.config.js      # build examples from examples/*.jsx -> dist/
npm run ex                  # list available examples
npm run ex counter          # build + run a specific example (counter, chat, dashboard, ...)
```

Tests use a custom minimal test harness (assert/assertEq/suite), not a framework. No test runner config needed.

## Architecture

The render pipeline runs at 60fps:

1. **JSX** (`jsx-runtime.js`) - `jsx(type, props, key)` returns plain `{ type, props, key }` objects. `jsxImportSource: 'trend'` tells esbuild to use this.

2. **Tree resolution** (`src/renderer.js:resolveForFrame`) - walks the JSX tree, calls component functions, caches component instances by `fn.name:index` key. Hooks are tracked per-instance via `hookIndex` so they're idempotent across frames (setup runs once, re-renders just re-call the component).

3. **Layout** (`src/layout.js:computeLayout`) - flexbox-like layout engine. Two element types: `box` (container) and `text` (leaf). Supports column/row direction, flex-grow, gap, justify-content, align-items, padding, margin, borders, percentage sizing, min/max constraints. Text nodes auto-size height via word wrap.

4. **Paint** (`src/renderer.js:paintTree`) - renders the resolved+laid-out tree into a cell buffer. Handles text wrapping/truncation, backgrounds, borders, clipping. Overlays (modals, selects, toasts) paint after the main tree with optional backdrop dimming.

5. **Diff** (`src/diff.js`) - per-cell comparison of previous and current buffers, emits only changed cells as ANSI escape sequences.

6. **Buffer** (`src/buffer.js`) - flat array of `{ ch, fg, bg, attrs }` cells. `writeText` handles inline ANSI escape parsing so content from syntax highlighters renders correctly.

### Signals (`src/signal.js`)

SolidJS-inspired reactivity: `createSignal`, `createEffect`, `createMemo`, `batch`, `untrack`, `onCleanup`. Signals notify the scheduler on write, which triggers a new frame. Scopes track effects and cleanups for disposal when components unmount.

### Key modules

- `src/input.js` - stdin parser. `splitKeys` tokenizes raw input into individual key sequences, `parseKey` maps them to `{ key, ctrl, meta }` events. Handlers fire in reverse registration order (innermost component first) with `stopPropagation`.
- `src/hooks.js` - `useInput`, `useResize`, `useInterval`, `useLayout`, `useTheme`, `useStdout`. All register via `registerHook` for idempotency.
- `src/focus.js` - focus manager with tab cycling, groups (nested items navigable with j/k), and stack-based push/pop for modals.
- `src/wrap.js` - word wrap, ANSI-aware text measurement, visible character slicing.
- `src/ansi.js` - escape sequence generation and SGR parsing. Colors: named, 256-index, hex truecolor. Attributes stored as bitmask.
- `src/scheduler.js` - 60fps frame scheduler with coalescing (multiple signal writes = one frame).

### Component files

Each in `src/`: `text-input.js`, `text-area.js`, `list.js`, `table.js`, `tabs.js`, `select.js`, `checkbox.js`, `radio.js`, `progress.js`, `spinner.js`, `modal.js`, `button.js`, `scrollable-text.js`, `toast.js`, `markdown.js`. All interactive components accept a `focused` prop.

`src/markdown.js` (`Markdown`) renders a markdown string as trend elements: headings, paragraphs, fenced code blocks (optional sync `highlight(code, lang)`), lists, blockquotes, rules, and inline bold/italic/code/links via inline ANSI. It tolerates partial input, so it can render streaming text.

`src/diff-view.js` (`Diff`) renders a unified git diff. `src/diff-engine.js` is its pure core: it normalizes `before`/`after` strings, a unified `patch` string, or structured `hunks` into one row model with line numbers and word-level change ranges (`intra`). The component layers diff backgrounds under syntax-highlighted foreground - pass a synchronous `highlight(code, lang)` function (the render loop can't await, so async highlighters like shiki must be pre-warmed into a cache; see `examples/diff.jsx`). Word-level highlight backgrounds are sliced over the highlighted line via `sliceVisibleRange` in `src/wrap.js`.

### Selection

`useSelection` (`src/selection.js`) gives back the click-drag select-and-copy that enabling mouse reporting takes away from the terminal. Dragging highlights cells (inverse video applied post-paint), releasing extracts the region from the cell buffer, writes it to the system clipboard via OSC 52, and calls `onCopy(text)`. Rows painted as soft wraps are flagged on the buffer at paint time (`buf.softWrap`, set from `wordWrapMarked` in `src/wrap.js`), so extraction rejoins wrapped prose into single paragraphs while hard newlines (code) survive; hard rows share one dedent so screen padding stays out of the clipboard.

### Overlays

`registerOverlay` (from renderer) is how modals, select dropdowns, and toasts render above the main tree. They compute layout independently and paint after the main pass. An overlay registered with `capture: true` (Modal does this) restricts input dispatch to handlers owned by its own subtree: instances created while an overlay tree resolves are tagged with the overlay's owner, and the input handler walks that chain at dispatch time. Mount-level handlers (owner null, e.g. the ctrl+c exit) always stay eligible.

## Build

`esbuild.config.js` bundles examples with a custom plugin (`trend-resolve`) that redirects `trend` imports to local source. JSX configured with `jsx: 'automatic'` and `jsxImportSource: 'trend'`.

## Exports

Everything is re-exported from `index.js`. The package exposes `./jsx-runtime` and `./jsx-dev-runtime` for JSX transformation.
