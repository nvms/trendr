import { mount, useInput, useTheme, SplitPane } from '../index.js'

export function SplitPaneDemo() {
  const { accent } = useTheme()

  return (
    <SplitPane direction="column" sizes={['1fr', 8]} border="round" borderColor="gray" style={{ height: '100%' }}>

      <SplitPane direction="row" sizes={[20, '2fr', '1fr']} border="round" borderColor="gray" borderEdges={{ bottom: true }}>
        <box style={{ flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: accent }}>nav</text>
          <text>dashboard</text>
          <text>users</text>
          <text>settings</text>
          <text>logs</text>
        </box>

        <box style={{ flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: accent }}>main</text>
          <text>active connections: 142</text>
          <text>requests/sec: 1,283</text>
          <text>avg latency: 12ms</text>
          <text>error rate: 0.02%</text>
          <text style={{ color: 'gray', dim: true }}>last updated: just now</text>
        </box>

        <box style={{ flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: accent }}>detail</text>
          <text>region: us-east-1</text>
          <text>cpu: <text style={{ color: 'green' }}>23%</text></text>
          <text>mem: <text style={{ color: 'yellow' }}>67%</text></text>
          <text>disk: <text style={{ color: 'green' }}>41%</text></text>
        </box>
      </SplitPane>

      <box style={{ flexDirection: 'column', paddingX: 1 }}>
        <text style={{ bold: true, color: accent }}>logs</text>
        <text>12:00:01 GET  /api/health      <text style={{ color: 'green' }}>200</text>  1ms</text>
        <text>12:00:02 POST /api/users       <text style={{ color: 'green' }}>201</text> 45ms</text>
        <text>12:00:03 GET  /api/dashboard   <text style={{ color: 'green' }}>200</text>  8ms</text>
        <text>12:00:04 PUT  /api/settings    <text style={{ color: 'yellow' }}>304</text> 23ms</text>
        <text>12:00:05 GET  /api/metrics     <text style={{ color: 'green' }}>200</text> 34ms</text>
      </box>

    </SplitPane>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <SplitPaneDemo />
}
mount(Standalone, { title: 'split pane' })
