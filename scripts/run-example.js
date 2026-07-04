import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const examples = readdirSync(resolve(root, 'examples'))
  .filter(f => f.endsWith('.jsx'))
  .map(f => f.slice(0, -'.jsx'.length))
  .sort()

function printUsage(message) {
  if (message) console.error(message + '\n')
  console.error('usage: npm run ex <name> [args...]\n')
  console.error('available examples:')
  for (const name of examples) console.error(`  ${name}`)
}

const [name, ...args] = process.argv.slice(2)

if (!name) {
  printUsage()
  process.exit(1)
}

if (!examples.includes(name)) {
  printUsage(`unknown example: ${name}`)
  process.exit(1)
}

const build = spawnSync(process.execPath, [resolve(root, 'esbuild.config.js')], {
  cwd: root,
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)

const run = spawnSync(process.execPath, [resolve(root, 'dist', `${name}.js`), ...args], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(run.status ?? 0)
