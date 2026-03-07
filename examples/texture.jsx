import { mount, useInput } from '../index.js'

export function Texture() {
  return (
    <box style={{ flexDirection: 'column', height: '100%', paddingX: 1, paddingY: 1, gap: 1 }}>

      <text style={{ bold: true }}>background textures</text>

      <box style={{ flexDirection: 'row', gap: 1, height: 5 }}>
        <box style={{ bg: '#1a1a2e', texture: 'shade-light', textureColor: '#2a2a4e', flexGrow: 1, border: 'round', borderColor: 'gray' }}>
          <text style={{ paddingX: 1, bold: true, color: 'white' }}>shade-light</text>
        </box>
        <box style={{ bg: '#1a1a2e', texture: 'shade-medium', textureColor: '#2a2a4e', flexGrow: 1, border: 'round', borderColor: 'gray' }}>
          <text style={{ paddingX: 1, bold: true, color: 'white' }}>shade-medium</text>
        </box>
        <box style={{ bg: '#1a1a2e', texture: 'shade-heavy', textureColor: '#2a2a4e', flexGrow: 1, border: 'round', borderColor: 'gray' }}>
          <text style={{ paddingX: 1, bold: true, color: 'white' }}>shade-heavy</text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 1, height: 5 }}>
        <box style={{ bg: '#0a2a0a', texture: 'dots', textureColor: '#1a4a1a', flexGrow: 1, border: 'round', borderColor: 'green' }}>
          <text style={{ paddingX: 1, bold: true, color: 'green' }}>dots</text>
        </box>
        <box style={{ bg: '#2a0a0a', texture: 'cross', textureColor: '#4a1a1a', flexGrow: 1, border: 'round', borderColor: 'red' }}>
          <text style={{ paddingX: 1, bold: true, color: 'red' }}>cross</text>
        </box>
        <box style={{ bg: '#0a0a2a', texture: 'grid', textureColor: '#1a1a4a', flexGrow: 1, border: 'round', borderColor: 'blue' }}>
          <text style={{ paddingX: 1, bold: true, color: 'blue' }}>grid</text>
        </box>
        <box style={{ bg: '#2a2a0a', texture: 'dash', textureColor: '#4a4a1a', flexGrow: 1, border: 'round', borderColor: 'yellow' }}>
          <text style={{ paddingX: 1, bold: true, color: 'yellow' }}>dash</text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 1, height: 5 }}>
        <box style={{ bg: '#1a1a1a', texture: '~', textureColor: '#333', flexGrow: 1, border: 'round', borderColor: 'cyan' }}>
          <text style={{ paddingX: 1, bold: true, color: 'cyan' }}>custom: ~</text>
        </box>
        <box style={{ bg: '#1a1a1a', texture: '*', textureColor: '#444', flexGrow: 1, border: 'round', borderColor: 'magenta' }}>
          <text style={{ paddingX: 1, bold: true, color: 'magenta' }}>custom: *</text>
        </box>
        <box style={{ texture: '.', textureColor: '#333', flexGrow: 1, border: 'round', borderColor: 'gray' }}>
          <text style={{ paddingX: 1, bold: true, color: 'white' }}>texture only (no bg)</text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 1, flexGrow: 1 }}>
        <box style={{ bg: '#1e1e2e', texture: 'dots', textureColor: '#313244', flexGrow: 1, border: 'round', borderColor: '#cba6f7', flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: '#cba6f7' }}>panel with texture bg</text>
          <text style={{ color: '#cdd6f4' }}>content renders on top of the texture</text>
          <text style={{ color: '#a6adc8', dim: true }}>regular text and styles work as expected</text>
        </box>
        <box style={{ bg: '#1a1a2e', flexGrow: 1, border: 'round', borderColor: '#89b4fa', flexDirection: 'column', paddingX: 1 }}>
          <text style={{ bold: true, color: '#89b4fa' }}>panel with solid bg</text>
          <text style={{ color: '#cdd6f4' }}>same layout, no texture</text>
          <text style={{ color: '#a6adc8', dim: true }}>for comparison</text>
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
  return <Texture />
}
mount(Standalone, { title: 'textures' })
