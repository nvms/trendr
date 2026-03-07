import { mount, createSignal, useInput, useTimeout } from '../index.js'

let nextId = 0
let removeNotification

function Notification({ id, message, color = 'green' }) {
  useTimeout(() => removeNotification(id), 3000)

  return (
    <box style={{ border: 'round', paddingX: 1 }}>
      <text style={{ color }}>{message}</text>
    </box>
  )
}

function App() {
  const [notifications, setNotifications] = createSignal([])

  removeNotification = (id) => setNotifications(ns => ns.filter(n => n.id !== id))

  useInput(({ key }) => {
    if (key === 'n') { const id = ++nextId; setNotifications(ns => [...ns, { id, message: `notification #${id}` }]) }
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <text style={{ bold: true }}>useTimeout demo</text>
      <text style={{ color: 'gray' }}>n - add notification (auto-dismiss 3s)    q - quit</text>
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {notifications().map(n => <Notification key={n.id} id={n.id} message={n.message} />)}
      </box>
    </box>
  )
}

mount(App, { title: 'useTimeout' })
