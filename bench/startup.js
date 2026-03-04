import { execFileSync } from 'child_process'
import { performance } from 'perf_hooks'

function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function p99(arr) {
  const sorted = arr.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.99)]
}

const ITERATIONS = 50
const WARMUP = 5

const ROOT = new URL('..', import.meta.url).pathname

const SCRIPTS = {
  trend: `import('${ROOT}index.js')`,
  ink: `import('${ROOT}bench/node_modules/ink/build/index.js')`,
  'neo-blessed': `import('${ROOT}bench/node_modules/neo-blessed/lib/blessed.js')`,
}

function bench(name, script, iterations) {
  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    execFileSync('node', ['--input-type=module', '-e', script], {
      stdio: 'ignore',
    })
    times.push(performance.now() - start)
  }
  return times
}

console.log(`startup benchmark: ${ITERATIONS} runs, ${WARMUP} warmup\n`)

const results = []

for (const [name, script] of Object.entries(SCRIPTS)) {
  bench(name, script, WARMUP)
  const times = bench(name, script, ITERATIONS)

  results.push({
    name,
    median: median(times),
    p99: p99(times),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
  })
}

const pad = (s, n) => String(s).padStart(n)
const fmt = (n) => n.toFixed(1)

console.log('library      median(ms)  p99(ms)  mean(ms)  min(ms)  max(ms)')
console.log('-'.repeat(65))
for (const r of results) {
  console.log(
    r.name.padEnd(13) +
    pad(fmt(r.median), 9) +
    pad(fmt(r.p99), 9) +
    pad(fmt(r.mean), 9) +
    pad(fmt(r.min), 9) +
    pad(fmt(r.max), 9)
  )
}

const fastest = results.reduce((a, b) => a.median < b.median ? a : b)
console.log(`\nfastest: ${fastest.name}`)
for (const r of results) {
  if (r !== fastest) {
    console.log(`  ${r.name} is ${(r.median / fastest.median).toFixed(1)}x slower`)
  }
}
