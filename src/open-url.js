import { spawn } from 'node:child_process'

export function isOpenableUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function openUrl(value, { platform = process.platform, spawnProcess = spawn } = {}) {
  if (!isOpenableUrl(value)) return false

  let command
  let args
  if (platform === 'darwin') {
    command = 'open'
    args = [value]
  } else if (platform === 'win32') {
    command = 'rundll32.exe'
    args = ['url.dll,FileProtocolHandler', value]
  } else {
    command = 'xdg-open'
    args = [value]
  }

  try {
    const child = spawnProcess(command, args, { detached: true, stdio: 'ignore' })
    child.on?.('error', () => {})
    child.unref?.()
    return true
  } catch {
    return false
  }
}
