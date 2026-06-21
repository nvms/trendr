// marker component for inline mode. everything inside Scrollback is the
// committed transcript: append-only items that get printed once into native
// terminal scrollback and never touched again. the renderer reads its props
// directly during the inline frame, so the component itself renders nothing
export function Scrollback() {
  return null
}

Scrollback.__scrollback = true
