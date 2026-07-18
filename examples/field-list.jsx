import { mount, createSignal, FieldList, Field, Checkbox, Button, NumberInput } from 'trend'

function Setting({ focused, control, label, description, path }) {
  return (
    <box style={{ flexDirection: 'column', marginBottom: 1 }}>
      <box style={{ flexDirection: 'row', gap: 1 }}>
        {control(focused)}
        <text>{label}</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>{path}</text>
      </box>
      <text style={{ marginLeft: 4, color: 'gray', dim: true }}>{description}</text>
    </box>
  )
}

function App() {
  const [clouds, setClouds] = createSignal(true)
  const [agentLimit, setAgentLimit] = createSignal(3)
  const [screen, setScreen] = createSignal('config')

  if (screen() === 'models') {
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <text style={{ bold: true }}>Choose research model</text>
        <text style={{ color: 'gray', dim: true }}>A completely different application screen.</text>
        <Button label="Return to config" focused onPress={() => setScreen('config')} />
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <text style={{ bold: true, marginBottom: 1 }}>Configuration</text>
      <FieldList focused initialFocus="clouds" focusPadding={1} scrollbar>
        <Field name="clouds">
          {({ focused }) => (
            <Setting
              focused={focused}
              label="Show clouds"
              description="Display decorative clouds in the header."
              path="ui.clouds"
              control={(active) => <Checkbox checked={clouds()} focused={active} onChange={setClouds} />}
            />
          )}
        </Field>
        <Field name="model">
          {({ focused }) => (
            <Setting
              focused={focused}
              label="Research worker model"
              description="Model used by background research agents."
              path="models.researchWorker"
              control={(active) => <Button label="Pick" focused={active} onPress={() => setScreen('models')} />}
            />
          )}
        </Field>
        <Field name="limit">
          {({ focused }) => (
            <Setting
              focused={focused}
              label="Research agent limit"
              description="Maximum number of concurrent background agents."
              path="research.maxAgents"
              control={(active) => (
                <NumberInput
                  focused={active}
                  value={agentLimit()}
                  onChange={setAgentLimit}
                  min={1}
                  max={100}
                  width={6}
                />
              )}
            />
          )}
        </Field>
      </FieldList>
      <text style={{ color: 'gray', dim: true }}>tab navigate · enter activate · ctrl+c quit</text>
    </box>
  )
}

mount(App)
