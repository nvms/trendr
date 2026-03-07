import { mount, useInput, useAsync, Spinner } from '../index.js'

function fakeFetch(url) {
  return new Promise((resolve, reject) => {
    const delay = 1500 + Math.random() * 1000
    setTimeout(() => {
      if (url === '/fail') reject(new Error('network error: connection refused'))
      else resolve({ users: ['alice', 'bob', 'charlie'], ts: Date.now() })
    }, delay)
  })
}

function fakeConfig() {
  return new Promise(resolve => {
    setTimeout(() => resolve({ theme: 'dark', locale: 'en-US', version: '2.4.1' }), 2000)
  })
}

function StatusLine({ status, data, error }) {
  const s = status()

  if (s === 'idle') {
    return <text style={{ color: 'gray' }}>idle - press f or e to start</text>
  }

  if (s === 'loading') {
    return <Spinner label="fetching..." color="cyan" />
  }

  if (s === 'error') {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text style={{ color: 'red', bold: true }}>error</text>
        <text style={{ color: 'red' }}>{error().message}</text>
      </box>
    )
  }

  const d = data()
  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ color: 'green', bold: true }}>success</text>
      <text>users: {d.users.join(', ')}</text>
      <text style={{ color: 'gray' }}>fetched at {new Date(d.ts).toLocaleTimeString()}</text>
    </box>
  )
}

function ImmediatePanel() {
  const { status, data } = useAsync(fakeConfig, { immediate: true })
  const s = status()

  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text style={{ bold: true }}>immediate</text>
      {s === 'loading' && <Spinner label="loading config..." color="yellow" />}
      {s === 'success' && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'green', bold: true }}>config loaded</text>
          <text>theme: {data().theme}</text>
          <text>locale: {data().locale}</text>
          <text>version: {data().version}</text>
        </box>
      )}
    </box>
  )
}

function ManualPanel() {
  const { status, data, error, run } = useAsync(fakeFetch)

  useInput(({ key }) => {
    if (key === 'f') run('/api/users')
    if (key === 'e') run('/fail')
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text style={{ bold: true }}>manual</text>
      <StatusLine status={status} data={data} error={error} />
      <text style={{ color: 'gray' }}>f - fetch    e - error    q - quit</text>
    </box>
  )
}

function App() {
  return (
    <box style={{ flexDirection: 'row', padding: 1, gap: 4 }}>
      <ManualPanel />
      <ImmediatePanel />
    </box>
  )
}

mount(App, { title: 'useAsync' })
