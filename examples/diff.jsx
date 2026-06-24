import { mount, createSignal, useInput, useFocus, useTheme, computeDiff } from '../index.js'
import { List } from '../src/list.js'
import { Diff } from '../src/diff-view.js'
import { codeToANSI } from '@shikijs/cli'

// each sample exercises a different way a coding agent hands work to the
// component: edit-time before/after, a unified patch, or structured hunks
const SAMPLES = [
  {
    name: 'redis-queue.js',
    language: 'javascript',
    before: `if (this._redis?.isOpen) {
  try {
    const keys = []
    for await (const batch of this._redis.scanIterator({ MATCH: 'queue:inflight:*', COUNT: 100 })) {
      if (Array.isArray(batch)) keys.push(...batch)
      else keys.push(batch)
    }`,
    after: `if (this._redis?.isOpen) {
  try {
    const keys = []
    for await (const batch of this._redis.scanIterator({ MATCH: this._keys.inflightMatch, COUNT: 100 })) {
      if (Array.isArray(batch)) keys.push(...batch)
      else keys.push(batch)
    }`,
  },
  {
    name: 'settings.js  (folded)',
    language: 'javascript',
    context: 3,
    before: `export const settings = {
  host: 'localhost',
  port: 5432,
  database: 'app',
  pool: { min: 2, max: 10 },
  ssl: false,
  timeout: 30000,
  retries: 3,
  logging: true,
  cache: {
    driver: 'memory',
    ttl: 60,
  },
  features: {
    signup: true,
    invites: false,
  },
}`,
    after: `export const settings = {
  host: 'localhost',
  port: 5432,
  database: 'app',
  pool: { min: 2, max: 20 },
  ssl: true,
  timeout: 30000,
  retries: 3,
  logging: true,
  cache: {
    driver: 'redis',
    ttl: 300,
  },
  features: {
    signup: true,
    invites: false,
  },
}`,
  },
  {
    name: 'auth.py  (patch)',
    language: 'python',
    patch: `diff --git a/auth.py b/auth.py
index 3f1a2b4..9c8d7e6 100644
--- a/auth.py
+++ b/auth.py
@@ -12,7 +12,8 @@ def verify(token):
     payload = decode(token, SECRET, algorithms=['HS256'])
     if payload['exp'] < time.time():
         raise TokenExpired()
-    return payload['sub']
+    user = lookup(payload['sub'])
+    return user if user and user.active else None

 def issue(user_id):`,
  },
  {
    name: 'schema.ts  (hunks)',
    language: 'typescript',
    hunks: [{
      oldStart: 8,
      newStart: 8,
      lines: [
        { type: 'context', content: 'export interface User {' },
        { type: 'context', content: '  id: string' },
        { type: 'del', content: '  name: string' },
        { type: 'add', content: '  firstName: string' },
        { type: 'add', content: '  lastName: string' },
        { type: 'context', content: '  email: string' },
        { type: 'context', content: '}' },
      ],
    }],
  },
]

const cache = new Map()

async function warm() {
  for (const sample of SAMPLES) {
    const keys = new Set()
    if (sample.before != null || sample.after != null) {
      keys.add(sample.before ?? '')
      keys.add(sample.after ?? '')
    } else {
      const { rows } = computeDiff(sample)
      for (const row of rows) {
        if (row.type === 'add' || row.type === 'del' || row.type === 'context') keys.add(row.text)
      }
    }
    for (const code of keys) {
      try {
        cache.set(code, (await codeToANSI(code, sample.language, 'nord')).replace(/\n$/, ''))
      } catch {
        cache.set(code, code)
      }
    }
  }
}

await warm()

const highlight = (code) => cache.get(code) ?? code

const stats = SAMPLES.map(s => computeDiff(s).stats)

function App() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'files' })
  fm.item('files')
  fm.item('diff')

  const [idx, setIdx] = createSignal(0)
  const [scroll, setScroll] = createSignal(0)

  function select(i) {
    setIdx(i)
    setScroll(0)
  }

  useInput(({ key, ctrl }) => {
    if ((ctrl && key === 'c') || key === 'q') process.exit(0)
  })

  const sample = () => SAMPLES[idx()]

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>diff</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>
          {fm.is('files') ? 'j/k: file   tab: diff   q: quit' : 'j/k: scroll   tab: files   q: quit'}
        </text>
      </box>

      <box style={{ flexDirection: 'row', flexGrow: 1 }}>
        <box style={{ border: 'round', borderColor: fm.is('files') ? accent : 'gray', width: 26, flexDirection: 'column' }}>
          <List
            items={SAMPLES}
            selected={idx()}
            onSelect={select}
            focused={fm.is('files')}
            renderItem={(item, { index, selected: isSel, focused }) => (
              <box style={{ flexDirection: 'row', paddingX: 1, bg: isSel ? (focused ? accent : 'gray') : null }}>
                <text style={{ color: isSel ? 'black' : null, overflow: 'nowrap' }}>{item.name}</text>
                <box style={{ flexGrow: 1 }} />
                <text style={{ color: isSel ? 'black' : '#7ee787', overflow: 'nowrap' }}>+{stats[index].additions}</text>
                <text style={{ color: isSel ? 'black' : '#f47067', overflow: 'nowrap' }}> -{stats[index].deletions}</text>
              </box>
            )}
          />
        </box>

        <box style={{ border: 'round', borderColor: fm.is('diff') ? accent : 'gray', flexGrow: 1, flexDirection: 'column' }}>
          <Diff
            {...sample()}
            filename={sample().name}
            highlight={highlight}
            focused={fm.is('diff')}
            scrollOffset={scroll()}
            onScroll={setScroll}
          />
        </box>
      </box>
    </box>
  )
}

mount(App, { title: 'diff' })
