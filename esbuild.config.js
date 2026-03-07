import * as esbuild from 'esbuild'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const examples = readdirSync('./examples')
  .filter(f => f.endsWith('.jsx'))
  .map(f => `./examples/${f}`)

const trendResolve = {
  name: 'trend-resolve',
  setup(build) {
    build.onResolve({ filter: /^trend/ }, (args) => {
      const subpath = args.path.replace(/^trend\/?/, '') || 'index.js'
      const file = subpath === 'index.js' ? 'index.js'
        : subpath === 'jsx-runtime' ? 'jsx-runtime.js'
        : subpath === 'jsx-dev-runtime' ? 'jsx-runtime.js'
        : subpath
      return { path: resolve(__dirname, file) }
    })
  },
}

// strips everything after "// --- standalone ---" when examples
// are imported as dependencies (not entry points)
const stripStandalone = {
  name: 'strip-standalone',
  setup(build) {
    build.onLoad({ filter: /examples\/.*\.jsx$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8')
      const marker = '// --- standalone ---'
      const idx = source.indexOf(marker)
      const contents = idx !== -1 ? source.slice(0, idx) : source
      return { contents, loader: 'jsx' }
    })
  },
}

await esbuild.build({
  entryPoints: examples,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  jsxImportSource: 'trend',
  outdir: 'dist',
  plugins: [trendResolve],
})

await esbuild.build({
  entryPoints: ['./demo/app.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  jsxImportSource: 'trend',
  outdir: 'demo/dist',
  plugins: [stripStandalone, trendResolve],
})
