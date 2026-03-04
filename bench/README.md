
# trend bench

four benchmarks comparing trend against ink and neo-blessed. the rendering
benchmarks use fake streams so we're measuring pure computation - tree
resolution, layout, painting, and diffing - the work that blocks your event
loop and determines how responsive your app feels.

```
npm install
node run.js
node list.js
node resize.js
node single-cell.js
node startup.js
```

## dashboard (run.js)

renders a frame counter + 4 animated gauge bars over 10k frames. tests the
basic render pipeline with moderate per-frame changes.

```bash
benchmark: 10000 frames, 100 warmup

library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)      fps
------------------------------------------------------------------------------
trend            0.018    0.078    0.021    0.017    0.344    55044
ink              0.083    0.231    0.088    0.075     1.30    12108
neo-blessed      0.045    0.068    0.047    0.039    0.842    22451

fastest: trend
  ink is 4.5x slower
  neo-blessed is 2.5x slower
```

## list scrolling (list.js)

10k items, scroll through 1000 of them one at a time. each frame the selection
moves down by one, which means the visible window shifts and the highlight
moves. this is a realistic hot path for any list-heavy TUI.

```bash
list benchmark: 10000 items, 1000 scroll frames, 100 warmup

library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)      fps    bytes
-------------------------------------------------------------------------------------
trend            0.058    0.177    0.067    0.053    0.434    17210    930KB
ink              0.250    0.998    0.290    0.229     1.66     3994     16KB
neo-blessed      0.111    0.530    0.135    0.103     1.85     9020      0KB

fastest: trend
  ink is 4.3x slower
  neo-blessed is 1.9x slower
```

## resize storm (resize.js)

cycles through 6 terminal sizes (40x12 up to 160x50) over 10000 frames. every
frame is a full resize - new buffers, fresh layout, complete repaint. this is
the worst case for frameworks that cache layout since every cache invalidates
at once. trend's gap widens here because its layout pass has nothing to
invalidate - it recomputes from scratch every frame anyway, and that recompute
is cheap. ink has to re-layout through Yoga for the new dimensions, reconcile
the React tree, and re-serialize everything. blessed reallocates its screen
buffer and recomputes all widget positions.

```bash
resize benchmark: 10000 resizes across 6 sizes, 50 warmup

library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)      fps    bytes
-------------------------------------------------------------------------------------
trend            0.018    0.089    0.022    0.009    0.303    56072   2692KB
ink              0.398    0.606    0.408    0.352     1.89     2512      4KB
neo-blessed      0.144    0.775    0.171    0.058     2.11     6934      0KB

fastest: trend
  ink is 22.3x slower
  neo-blessed is 8.1x slower
```

## single-cell I/O (single-cell.js)

the per-cell diffing proof point. 200x50 terminal (10,000 cells), 100 frames,
only a counter in the corner changes each frame. this measures bytes written to
stdout per render - the raw I/O cost that determines flicker, SSH responsiveness,
and terminal throughput.

```bash
single-cell benchmark: 200x50 terminal (10,000 cells), 100 frames
each frame changes only a counter in the corner. everything else is static.

library          bytes/frame
-----------------------------------
trend                    17
ink                    9870

ink writes 581x more bytes per frame than trend.
on a 10,000-cell screen where ~4 cells change, per-cell diffing
skips 99.8% of the stdout output.
```

trend writes 17 bytes. ink rewrites the entire screen: 9,870 bytes. every frame.
this is where per-cell diffing matters most - the fewer cells that change, the
bigger the gap. in real apps (a blinking cursor, a ticking clock, a spinner) most
frames change very little. over SSH or slow terminals, 580x less I/O is the
difference between responsive and sluggish.

## cold start (startup.js)

measures `node -e "import('...')"` for each library. this is the time from
process start to module fully loaded - what your users wait through before
anything appears on screen. trend has zero dependencies so node just loads a
handful of plain JS files. ink pulls in React, Yoga WASM bindings, and numerous
transitive packages. matters most for CLI tools that briefly mount a TUI
(prompts, spinners, interactive menus) where startup is a real fraction of
total runtime.

```bash
startup benchmark: 50 runs, 5 warmup

library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)
-----------------------------------------------------------------
trend             45.2     49.9     45.5     43.8     49.9
ink              171.9    178.7    171.8    164.5    178.7
neo-blessed       53.9     57.8     54.2     52.5     57.8

fastest: trend
  ink is 3.8x slower
  neo-blessed is 1.2x slower
```

## why trend wins

three things:

**virtual by default.** trend's `List` component only renders JSX for the visible
slice. 10k items costs the same as 22 items. ink and blessed both do this in
the benchmark too (we wrote them fairly), but trend's resolution step is lighter
since there's no React reconciler or widget tree to walk.

**cell-level diffing.** scrolling a list by one row changes maybe 3 rows
visually (new row appears, old row disappears, highlight shifts). trend's diff
engine compares the previous and current frame cell-by-cell and only emits ANSI
escape sequences for cells that actually changed. on an 80x24 terminal that's
~240 cells out of 1920 - the diff skips 87% of the buffer. ink re-serializes
its output on every render. blessed's smartCSR helps but still recomputes the
full screen buffer.

**no framework tax.** trend's render pipeline is: call component functions ->
flat array of nodes -> single-pass flex layout -> paint cells -> diff. no
fiber tree, no reconciliation passes, no yoga bindings, no virtual DOM diffing.
the entire pipeline is ~500 lines of plain JS operating on flat arrays and
typed buffers.

## notes

ink defers its actual terminal writes via microtasks so its bytes-written count
isn't directly comparable. neo-blessed buffers internally through a path our
fake stream can't fully intercept. timing is fair though - all three libraries
do their real work synchronously in the measured window.
