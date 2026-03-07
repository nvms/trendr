import { mount, createSignal, useInput, useFocus, useToast, useTheme } from '../index.js'
import { TextInput } from '../src/text-input.js'
import { Select } from '../src/select.js'
import { Checkbox } from '../src/checkbox.js'
import { Radio } from '../src/radio.js'
import { Button } from '../src/button.js'
import { Modal } from '../src/modal.js'
import { List } from '../src/list.js'

const SEED = [
  { name: 'alice', role: 'admin', notify: true, theme: 'dark' },
  { name: 'bob', role: 'editor', notify: false, theme: 'light' },
  { name: 'charlie', role: 'viewer', notify: true, theme: 'system' },
]

function UserForm({ user, onSave, onCancel }) {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'name' })
  fm.item('name')
  fm.item('role')
  fm.item('notify')
  fm.item('theme')
  fm.item('save')
  fm.item('cancel')

  const [name, setName] = createSignal(user?.name ?? '')
  const [role, setRole] = createSignal(user?.role ?? 'viewer')
  const [notify, setNotify] = createSignal(user?.notify ?? false)
  const [theme, setTheme] = createSignal(user?.theme ?? 'system')

  const submit = () => onSave({ name: name(), role: role(), notify: notify(), theme: theme() })

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ color: 'gray', dim: true }}>name</text>
      <box style={{ border: 'round', borderColor: fm.is('name') ? accent : 'gray', paddingX: 1 }}>
        <TextInput
          focused={fm.is('name')}
          placeholder="enter name..."
          initialValue={user?.name}
          onChange={setName}
        />
      </box>

      <box style={{ height: 1 }} />
      <text style={{ color: 'gray', dim: true }}>role</text>
      <Select
        items={['admin', 'editor', 'viewer', 'moderator', 'analyst', 'support', 'billing', 'developer', 'designer', 'manager', 'intern', 'contractor', 'auditor', 'ops', 'security']}
        selected={role()}
        onSelect={setRole}
        focused={fm.is('role')}
        overlay
      />

      <box style={{ height: 1 }} />
      <Checkbox
        checked={notify()}
        label="email notifications"
        onChange={setNotify}
        focused={fm.is('notify')}
      />

      <box style={{ height: 1 }} />
      <text style={{ color: 'gray', dim: true }}>theme</text>
      <Radio
        options={['dark', 'light', 'system']}
        selected={theme()}
        onSelect={setTheme}
        focused={fm.is('theme')}
      />

      <box style={{ height: 1 }} />
      <box style={{ flexDirection: 'row' }}>
        <Button label="save" onPress={submit} focused={fm.is('save')} />
        <text>  </text>
        <Button label="cancel" onPress={onCancel} focused={fm.is('cancel')} variant="dim" />
      </box>
    </box>
  )
}

export function ModalForm() {
  const { accent } = useTheme()
  const fm = useFocus({ initial: 'list' })
  fm.item('list')

  const toast = useToast({ position: 'bottom-right' })
  const [users, setUsers] = createSignal([...SEED])
  const [listIdx, setListIdx] = createSignal(0)
  const [modalOpen, setModalOpen] = createSignal(false)
  const [editIdx, setEditIdx] = createSignal(-1)

  function openEdit(idx) {
    setEditIdx(idx)
    setModalOpen(true)
    fm.push('modal')
  }

  function closeModal() {
    setModalOpen(false)
    fm.pop()
  }

  function saveUser(data) {
    const idx = editIdx()
    setUsers(prev => {
      const next = [...prev]
      if (idx >= 0) next[idx] = data
      else next.push(data)
      return next
    })
    closeModal()
    toast(idx >= 0 ? 'user updated' : 'user created')
  }

  useInput(({ key }) => {
    if (key === 'return' && fm.is('list') && !modalOpen()) {
      openEdit(listIdx())
    }
    if (key === 'n' && fm.is('list') && !modalOpen()) {
      openEdit(-1)
    }
  })

  const list = users()
  const editing = editIdx() >= 0 ? list[editIdx()] : null

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <box style={{ flexDirection: 'row', paddingX: 1 }}>
        <text style={{ bold: true }}>modal form</text>
        <box style={{ flexGrow: 1 }} />
        <text style={{ color: 'gray', dim: true }}>enter: edit  n: new user</text>
      </box>

      <box style={{ flexGrow: 1, flexDirection: 'column', paddingX: 1 }}>
        <List
          items={list}
          selected={listIdx()}
          onSelect={setListIdx}
          focused={fm.is('list')}
          renderItem={(user, { selected, focused }) => (
            <box style={{ flexDirection: 'row', bg: selected ? (focused ? accent : 'gray') : null }}>
              <text style={{ color: selected ? 'black' : accent, bold: true, width: 12 }}>{user.name}</text>
              <text style={{ color: selected ? 'black' : 'gray', width: 10 }}>{user.role}</text>
              <text style={{ color: selected ? 'black' : null, width: 10 }}>{user.notify ? 'notify' : ''}</text>
              <text style={{ color: selected ? 'black' : 'gray' }}>{user.theme}</text>
            </box>
          )}
        />
      </box>

      <Modal
        open={modalOpen()}
        onClose={closeModal}
        title={editIdx() >= 0 ? 'edit user' : 'new user'}
        width={40}
      >
        <UserForm
          user={editing}
          onSave={saveUser}
          onCancel={closeModal}
        />
      </Modal>
    </box>
  )
}

// --- standalone ---
function Standalone() {
  useInput(({ key, ctrl }) => {
    if (ctrl && key === 'c') process.exit(0)
  })
  return <ModalForm />
}
mount(Standalone, { title: 'modal form' })
