// Cross-platform, sequential regression entry point: node test/run.mjs
// Full suite needs devDependencies: react/react-dom 18.3.1 and jsdom 24.1.3.
// node test/run.mjs --core runs only dependency-free checks (not the full suite).
// Run scripts directly: node --test normally captures child stdio through pipes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, lstat, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
assert.ok(args.every(arg => arg === '--core') && args.length <= 1, 'Usage: node test/run.mjs [--core]')
const coreOnly = args.includes('--core')
let jsdomEntry
if (!coreOnly) {
  const missing = []
  for (const name of ['react', 'react-dom/client', 'jsdom']) {
    try {
      const entry = require.resolve(name)
      if (name === 'jsdom') jsdomEntry = entry
    } catch { missing.push(name) }
  }
  if (missing.length) {
    console.error(`Missing test devDependencies: ${missing.join(', ')}. Full suite requires react@18.3.1, react-dom@18.3.1 and jsdom@24.1.3. No dependencies were installed.`)
    console.error('Use node test/run.mjs --core for the dependency-free subset only.')
    process.exitCode = 1
  }
}

if (!process.exitCode) {
  const temporaryRoot = path.resolve(os.tmpdir())
  const directory = await mkdtemp(path.join(temporaryRoot, 'prd-regression-'))
  const identity = await lstat(directory)
  const canonical = await realpath(directory)
  const fixture = await mkdtemp(path.join(directory, 'shared-'))
  const template = fileURLToPath(new URL('../assets/template/snapshot-template.html', import.meta.url))
  const cases = [
    ['layout-regression.mjs'],
    ['sanitized-template.mjs', ...(coreOnly ? [] : ['--dom', jsdomEntry])],
    ['generation-state.mjs'],
    ['create-tasks.mjs'],
    ['progress-routes.mjs'],
    // Order matters: smoke creates the registry; Host reuses it; rendering sees both.
    ['smoke.mjs', template, fixture],
    ['host-harness.mjs', fixture],
    ...(coreOnly ? [] : [
      ['render-test.mjs', fixture],
      ['sidebar-render.mjs'],
      ['notices-render.mjs'],
    ]),
  ]
  let child, interrupted
  const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
    interrupted = signal
    child?.kill(signal)
  }]))
  for (const [signal, handler] of handlers) process.on(signal, handler)
  try {
    for (const [script, ...parameters] of cases) {
      if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
      console.log(`\n=== ${script} ===`)
      await new Promise((resolve, reject) => {
        child = spawn(process.execPath, [path.join(projectRoot, 'test', script), ...parameters], {
          cwd: projectRoot,
          stdio: 'inherit',
          shell: false,
          // Every test's os.tmpdir() is inside this run's private directory.
          env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory },
        })
        child.once('error', reject)
        child.once('close', (code, signal) => {
          child = undefined
          if (code === 0 && !signal && !interrupted) resolve()
          else reject(new Error(`${script} failed (${signal || interrupted || `exit ${code}`})`))
        })
      })
    }
    console.log(`\nPASS: ${cases.length} sequential regression scripts${coreOnly ? ' (core subset; DOM/render checks excluded)' : ', including template/export DOM checks'}.`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler)
    // Never delete a CLI path, a shared scratch directory, or a replaced directory.
    // This exact absolute path came from this process's successful mkdtemp call.
    assert.equal(path.dirname(directory), temporaryRoot)
    assert.ok(path.basename(directory).startsWith('prd-regression-'))
    const current = await lstat(directory)
    assert.ok(current.isDirectory() && !current.isSymbolicLink())
    assert.equal(current.dev, identity.dev)
    assert.equal(current.ino, identity.ino)
    assert.equal(await realpath(directory), canonical)
    await rm(directory, { recursive: true, force: true })
  }
}
