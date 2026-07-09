JSX and flexbox are great for building TUIs, but React and Yoga? you're reconciling a virtual DOM to write escape sequences to a character grid. that's the wrong abstraction.

this is why I built trend. same ergonomics, none of the overhead. per-cell diffing, signals, zero dependencies.

bench against ink:
- 4.5x faster frame times
- 580x less I/O per render (single-cell update on a 10k cell screen)
- 24x faster on terminal resize
- 3.8x faster cold start

github.com/...




trend - terminal UIs with JSX and signals, no React/Yoga. on average 4.5x faster frames, 580x less I/O than ink. no deps

github.com/nvms/trendr
