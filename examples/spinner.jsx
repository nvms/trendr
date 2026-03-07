import { mount, useInput, Spinner } from '../index.js'

function App() {
  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <text style={{ bold: true }}>Spinner variants</text>

      <box style={{ flexDirection: 'column' }}>
        <Spinner variant="dots" label="dots (default)" />
        <Spinner variant="line" label="line" />
        <Spinner variant="circle" label="circle" />
        <Spinner variant="bounce" label="bounce" />
        <Spinner variant="arrow" label="arrow" />
        <Spinner variant="square" label="square" />
        <Spinner variant="star" label="star" />
        <Spinner frames={['.  ', '.. ', '...', ' ..', '  .', '   ']} label="custom" />
      </box>

      <text style={{ color: 'gray' }}>q - quit</text>
    </box>
  )
}

mount(App, { title: 'spinner' })
