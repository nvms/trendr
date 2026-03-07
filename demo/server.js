import ssh2 from 'ssh2'
const { Server } = ssh2
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HOST_KEY_PATH = join(__dirname, 'host_key')

if (!existsSync(HOST_KEY_PATH)) {
  console.log('generating host key...')
  execSync(`ssh-keygen -t ed25519 -f ${HOST_KEY_PATH} -N "" -q`)
}

const PORT = parseInt(process.env.PORT || '2222', 10)
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '20', 10)
let activeConnections = 0

const server = new Server({
  hostKeys: [readFileSync(HOST_KEY_PATH)],
})

server.on('connection', (client, info) => {
  if (activeConnections >= MAX_CONNECTIONS) {
    client.end()
    return
  }

  activeConnections++
  const clientAddr = info.ip

  console.log(`connect: ${clientAddr} (${activeConnections} active)`)

  client.on('authentication', (ctx) => ctx.accept())

  client.on('ready', () => {
    let ptyInfo = { cols: 80, rows: 24 }

    client.on('session', (accept) => {
      const session = accept()

      session.on('pty', (accept, reject, info) => {
        ptyInfo = { cols: info.cols, rows: info.rows }
        accept()
      })

      session.on('window-change', (accept, reject, info) => {
        ptyInfo.cols = info.cols
        ptyInfo.rows = info.rows
        if (stream) {
          stream.columns = info.cols
          stream.rows = info.rows
          stream.emit('resize')
        }
      })

      let stream = null

      session.on('shell', (accept) => {
        stream = accept()

        stream.columns = ptyInfo.cols
        stream.rows = ptyInfo.rows

        stream.isTTY = true
        stream.setRawMode = () => {}

        import('./dist/app.js').then(({ start }) => {
          const { unmount } = start({
            stream,
            stdin: stream,
            title: 'trend',
            onExit: () => {
              stream.exit(0)
              stream.end()
            },
          })

          stream.on('close', () => {
            unmount()
            activeConnections--
            console.log(`disconnect: ${clientAddr} (${activeConnections} active)`)
          })
        }).catch(err => {
          stream.write(`error loading demo: ${err.message}\r\n`)
          stream.exit(1)
          stream.end()
        })
      })
    })
  })

  client.on('error', () => {})

  client.on('close', () => {
    if (activeConnections > 0) activeConnections--
  })
})

server.listen(PORT, () => {
  console.log(`trend ssh demo listening on port ${PORT}`)
  console.log(`connect with: ssh -p ${PORT} demo@localhost`)
})
