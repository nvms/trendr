import { jsx } from '../jsx-runtime.js'
import { createSignal } from './signal.js'
import { useInput } from './hooks.js'
import { TextInput } from './text-input.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function stepPrecision(step) {
  const decimal = String(step).split('.')[1]
  return decimal?.length ?? 0
}

export function NumberInput({
  value = 0,
  onChange,
  focused = true,
  min = -Infinity,
  max = Infinity,
  step = 1,
  width = 8,
  placeholder,
}) {
  const [draft, setDraft] = createSignal(String(value))
  const [syncedValue, setSyncedValue] = createSignal(value)

  if (value !== syncedValue()) {
    setSyncedValue(value)
    setDraft(String(value))
  }

  function update(next) {
    const bounded = clamp(next, min, max)
    const precision = stepPrecision(step)
    const normalized = precision > 0 ? Number(bounded.toFixed(precision)) : bounded
    setDraft(String(normalized))
    setSyncedValue(normalized)
    onChange?.(normalized)
  }

  useInput((event) => {
    if (!focused || (event.key !== 'up' && event.key !== 'down')) return
    const parsed = Number(draft())
    const current = Number.isFinite(parsed) ? parsed : Number(value) || 0
    update(current + (event.key === 'up' ? step : -step))
    event.stopPropagation()
  })

  function updateDraft(next) {
    if (!/^-?(?:\d+\.?\d*|\.\d*)?$/.test(next)) return
    setDraft(next)
    const parsed = Number(next)
    if (next !== '' && next !== '-' && next !== '.' && next !== '-.' && Number.isFinite(parsed)) {
      const bounded = clamp(parsed, min, max)
      if (bounded !== parsed) setDraft(String(bounded))
      setSyncedValue(bounded)
      onChange?.(bounded)
    }
  }

  return jsx('box', {
    style: { width, minWidth: width, height: 1 },
    children: jsx(TextInput, {
      value: draft(),
      focused,
      placeholder,
      onChange: updateDraft,
    }),
  })
}
