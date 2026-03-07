import { mount, useInput, Shimmer, Spinner } from '../index.js'

function App() {
  useInput(({ key }) => {
    if (key === 'q') process.exit(0)
  })

  return (
    <box style={{ flexDirection: 'column', padding: 1, gap: 1 }}>
      <text style={{ bold: true }}>Shimmer</text>

      <box style={{ flexDirection: 'column', gap: 1 }}>
        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>default (size=3, gradient=1)</text>
          <Shimmer>Loading resources...</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>wide shimmer (size=8, gradient=4)</text>
          <Shimmer size={8} gradient={4} highlight="white">Downloading packages from registry</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>no gradient, fast</text>
          <Shimmer size={2} gradient={0} duration={600} delay={200} highlight="yellow">Compiling source files</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>slow, green</text>
          <Shimmer size={5} gradient={2} duration={2000} delay={1000} color="gray" highlight="green">Waiting for server response...</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>single char shimmer</text>
          <Shimmer size={1} gradient={1} duration={2000} delay={300} highlight="magenta">trend - terminal rendering engine</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>reverse</text>
          <Shimmer reverse highlight="cyan">Scanning files...</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>long delay (delay=3000)</text>
          <Shimmer delay={3000} duration={600} highlight="white">Idle shimmer</Shimmer>
        </box>

        <box style={{ flexDirection: 'column' }}>
          <text style={{ color: 'gray', dim: true }}>spinner + shimmer</text>
          <box style={{ flexDirection: 'row' }}>
            <Spinner color="white" />
            <text> </text>
            <Shimmer highlight="white" duration={1500} delay={800} reverse>Thinking...</Shimmer>
          </box>
        </box>
      </box>

      <text style={{ color: 'gray' }}>q - quit</text>
    </box>
  )
}

mount(App, { title: 'shimmer' })
