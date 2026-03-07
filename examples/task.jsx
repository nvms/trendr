import { mount, useInput, createSignal, Task } from '../index.js'

function fakeStep(label, delay) {
  return () => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (label === 'Linting') reject(new Error('2 lint errors found'))
      else resolve()
    }, delay)
  })
}

function TaskList() {
  return (
    <box style={{ flexDirection: 'column' }}>
      <Task run={fakeStep('Install', 1200)} label="Installing dependencies..." successLabel="Dependencies installed" />
      <Task run={fakeStep('Build', 2000)} label="Building project..." successLabel="Build complete" />
      <Task run={fakeStep('Linting', 1500)} label="Linting..." errorLabel="Lint failed" />
      <Task run={fakeStep('Tests', 2500)} label="Running tests..." successLabel="All tests passed" />
    </box>
  )
}

function App() {
  const [gen, setGen] = createSignal(0)

  useInput(({ key }) => {
    if (key === 'r') setGen(g => g + 1)
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <text style={{ bold: true }}>Task demo</text>

      {gen() > 0
        ? <TaskList key={gen()} />
        : <text style={{ color: 'gray' }}>press r to run tasks</text>
      }

      <text style={{ color: 'gray' }}>r - run tasks    q - quit</text>
    </box>
  )
}

mount(App, { title: 'task' })
