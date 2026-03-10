import { mount, createSignal, useInput, useTheme, useFocus, SplitPane } from '../index.js'
import { PickList } from '../src/pick-list.js'

const LANGUAGES = [
  'Assembly', 'Bash', 'C', 'C++', 'C#', 'Clojure', 'Crystal', 'Dart',
  'Elixir', 'Elm', 'Erlang', 'F#', 'Go', 'Groovy', 'Haskell', 'Java',
  'JavaScript', 'Julia', 'Kotlin', 'Lisp', 'Lua', 'Nim', 'OCaml', 'Perl',
  'PHP', 'Python', 'R', 'Ruby', 'Rust', 'Scala', 'Swift', 'TypeScript',
  'V', 'Zig',
]

const PACKAGES = [
  { name: 'express', version: '4.18.2', desc: 'Fast, unopinionated web framework', downloads: '28M/week' },
  { name: 'react', version: '18.2.0', desc: 'Library for building user interfaces', downloads: '22M/week' },
  { name: 'lodash', version: '4.17.21', desc: 'Utility library for common operations', downloads: '52M/week' },
  { name: 'axios', version: '1.6.0', desc: 'Promise based HTTP client', downloads: '45M/week' },
  { name: 'chalk', version: '5.3.0', desc: 'Terminal string styling done right', downloads: '180M/week' },
  { name: 'commander', version: '11.1.0', desc: 'CLI interfaces made easy', downloads: '95M/week' },
  { name: 'dotenv', version: '16.3.1', desc: 'Loads environment variables from .env', downloads: '35M/week' },
  { name: 'esbuild', version: '0.19.8', desc: 'Extremely fast bundler for the web', downloads: '15M/week' },
  { name: 'fastify', version: '4.24.3', desc: 'Fast and low overhead web framework', downloads: '2M/week' },
  { name: 'glob', version: '10.3.10', desc: 'Match files using glob patterns', downloads: '88M/week' },
  { name: 'inquirer', version: '9.2.12', desc: 'Collection of interactive CLI prompts', downloads: '30M/week' },
  { name: 'jest', version: '29.7.0', desc: 'Delightful JavaScript testing', downloads: '25M/week' },
  { name: 'knex', version: '3.0.1', desc: 'SQL query builder for databases', downloads: '1.8M/week' },
  { name: 'moment', version: '2.29.4', desc: 'Parse, validate, manipulate dates', downloads: '18M/week' },
  { name: 'nodemon', version: '3.0.2', desc: 'Monitor for changes and restart', downloads: '5M/week' },
  { name: 'prettier', version: '3.1.0', desc: 'Opinionated code formatter', downloads: '32M/week' },
  { name: 'redis', version: '4.6.11', desc: 'High-performance Redis client', downloads: '4M/week' },
  { name: 'socket.io', version: '4.7.2', desc: 'Realtime application framework', downloads: '6M/week' },
  { name: 'tape', version: '5.7.2', desc: 'TAP-producing test harness', downloads: '1.2M/week' },
  { name: 'uuid', version: '9.0.0', desc: 'RFC-compliant UUID generation', downloads: '75M/week' },
  { name: 'vite', version: '5.0.4', desc: 'Next generation frontend tooling', downloads: '12M/week' },
  { name: 'winston', version: '3.11.0', desc: 'Multi-transport async logging', downloads: '10M/week' },
  { name: 'yargs', version: '17.7.2', desc: 'CLI argument parser with helpers', downloads: '70M/week' },
  { name: 'zod', version: '3.22.4', desc: 'TypeScript-first schema validation', downloads: '14M/week' },
]

export function PickListDemo() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'left' })
  fm.item('left')
  fm.item('right')
  const [selected, setSelected] = createSignal(null)

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>pick list</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          tab: switch pane  up/down: navigate  type to filter
        </text>
      </box>

      {selected() && (
        <box style={{ paddingX: 1 }}>
          <text style={{ color: accent }}>
            selected: {typeof selected() === 'string' ? selected() : selected().name}
          </text>
        </box>
      )}

      <SplitPane direction="row" sizes={['1fr', '1fr']} border="single" borderColor="gray" style={{ flexGrow: 1 }}>
        <box style={{ flexDirection: 'column', flexGrow: 1 }}>
          <PickList
            items={LANGUAGES}
            focused={fm.is('left')}
            placeholder="filter languages..."
            onSelect={(item) => setSelected(item)}
            scrollbar
            gap={1}
          />
        </box>

        <box style={{ flexDirection: 'column', flexGrow: 1 }}>
          <PickList
            items={PACKAGES}
            focused={fm.is('right')}
            placeholder="filter packages..."
            onSelect={(item) => setSelected(item)}
            scrollbar
            gap={1}
            itemHeight={3}
            itemGap={1}
            renderItem={(pkg, { selected, focused }) => (
              <box style={{ flexDirection: 'column', bg: selected ? (focused ? accent : 'gray') : null, paddingX: 1 }}>
                <box style={{ flexDirection: 'row' }}>
                  <text style={{ bold: true, color: selected ? 'black' : accent }}>{pkg.name}</text>
                  <box style={{ flexGrow: 1 }} />
                  <text style={{ color: selected ? 'black' : 'gray' }}>{pkg.version}</text>
                </box>
                <text style={{ color: selected ? 'black' : 'gray', dim: !selected }}>{pkg.desc}</text>
                <text style={{ color: selected ? 'black' : 'yellow', dim: !selected }}>{pkg.downloads}</text>
              </box>
            )}
          />
        </box>
      </SplitPane>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if ((ctrl && key === 'c') || key === 'q') process.exit(0)
  })
  return <PickListDemo />
}
mount(Standalone, { title: 'pick list', theme: { accent: 'cyan' } })
