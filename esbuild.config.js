import * as esbuild from 'esbuild'
import { readdirSync } from 'fs'
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
