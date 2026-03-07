import { mount, useInput, useFocus, useTheme, ScrollBox } from '../index.js'

const ITEMS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  name: `item-${i}`,
  desc: `description for item ${i}`,
}))

const COLORS = ['#2d1b36', '#1b2d36', '#1b361e', '#36351b', '#361b1b', '#1b1b36', '#2d361b', '#361b2d']

const CARDS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  title: `card ${i}`,
  lines: Array.from({ length: 1 + (i % 4) }, (_, j) => `line ${j} of card ${i}`),
  bg: COLORS[i % COLORS.length],
}))

export function ScrollBoxDemo() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'left' })
  fm.item('left')
  fm.item('right')

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>scroll box</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>tab: switch | j/k: scroll</text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1, gap: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('left') ? accent : 'gray', flexGrow: 1, flexDirection: 'column' }}>
          <text style={{ bold: true, paddingX: 1 }}>items</text>
          <ScrollBox focused={fm.is('left')} scrollbar>
            {ITEMS.map(item => (
              <text key={item.id} style={{ paddingX: 1 }}>{item.name}</text>
            ))}
          </ScrollBox>
        </box>

        <box style={{ border: 'round', borderColor: fm.is('right') ? accent : 'gray', flexGrow: 1, flexDirection: 'column' }}>
          <text style={{ bold: true, paddingX: 1 }}>variable height cards</text>
          <ScrollBox focused={fm.is('right')} scrollbar>
            {CARDS.map(card => (
              <box key={card.id} style={{ bg: card.bg, paddingX: 1, flexDirection: 'column' }}>
                <text style={{ bold: true, color: 'white' }}>{card.title} ({card.lines.length} rows)</text>
                {card.lines.map((line, j) => (
                  <text key={j} style={{ color: 'gray' }}>{line}</text>
                ))}
              </box>
            ))}
          </ScrollBox>
        </box>
      </box>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <ScrollBoxDemo />
}
mount(Standalone, { title: 'scroll box' })
