// Integration: cold-session cwd, async creation routes, bound-only progress tools.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

const tmp = await mkdtemp(path.join(os.tmpdir(), 'prd-progress-routes-'))
const routes = new Map(), tools = [], cleanups = [], agents = new Map()
const ctx = {
  logger: console,
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
  on() {},
  inject(_keys, cb) { cb({ ...ctx, get: name => name === 'connection' ? { fetch: { register(route) { routes.set(route.path, route); return () => {} } } } : name === 'agents' ? agents : undefined,
    skills: { registerProvider() {} }, tools: { register(t) { tools.push(t) }, guard() {} } }) },
}
const call = async (name, payload) => {
  const response = await routes.get('/api/prd-view.' + name).fetch(new Request('http://local/api/prd-view.' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rpcId: 'test', payload }),
  }))
  const result = (await response.json()).result
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
try {
  const cwd = path.join(tmp, 'project')
  await mkdir(cwd); await mkdir(path.join(cwd, '.git'))
  const prdPath = path.join(tmp, 'requirements.md')
  await writeFile(prdPath, '# Requirements\n![diagram](diagram.png)\n![missing](missing.png)\n')
  await writeFile(path.join(tmp, 'diagram.png'), 'image fixture')
  apply(ctx, { registryDir: path.join(tmp, 'registry'), autoExport: false })
  const binding = await call('binding', { sessionId: 'cold', cwd })
  assert.equal(binding.cwd, cwd)
  assert.equal(binding.project, null)
  const input = { sessionId: 'cold', requestId: 'create-once', title: 'Example', prdPath }
  const first = await call('createTask', input)
  const again = await call('createTask', input)
  assert.equal(first.id, again.id)
  let task
  for (let i = 0; i < 150; i++) {
    task = await call('creationTask', { id: first.id })
    if (['completed', 'failed', 'interrupted'].includes(task.status)) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(task.status, 'completed', JSON.stringify(task))
  assert.ok(task.created.dataFile.startsWith(cwd))
  assert.equal((await call('creationTasks', { sessionId: 'cold' })).length, 1)
  const bound = await call('binding', { sessionId: 'cold' })
  assert.equal(bound.project.id, task.created.id)
  const state = await call('getGeneration', { project: bound.project.id })
  assert.equal(state.phase, 'pending')
  const view = tools.find(tool => tool.name === 'prd_view')
  const agent = { id: 'cold', session: { header: { cwd } } }
  agents.set('cold', agent)
  await assert.rejects(view.execute({ action: 'import', dataFile: path.join(tmp, 'unauthorized.prdview.json'), source: prdPath }, { agent }), /其他研发视图/)
  const reported = JSON.parse(await view.execute({ action: 'generation', phase: 'reading', detail: 'Reading the source' }, { agent }))
  assert.equal(reported.phase, 'reading')
  await assert.rejects(view.execute({ action: 'generation', phase: 'complete' }, { agent }))
  await call('bind', { sessionId: 'cold', project: null })
  await assert.rejects(view.execute({ action: 'generation', phase: 'code' }, { agent }), /未绑定/)
  const outside = { id: 'outside', session: { header: { cwd: tmp } } }
  await assert.rejects(view.execute({ action: 'generation', project: bound.project.id, phase: 'code' }, { agent: outside }), /未绑定/)
  await assert.rejects(call('binding', { sessionId: 'bad', cwd: 'relative' }), /绝对路径/)
  console.log('PASS progress routes: cold session, idempotent creation, progress query, completion gate, binding permissions')
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup()
  // mkdtemp returns the exact test-owned absolute directory; never remove outside it.
  assert.equal(path.dirname(tmp), os.tmpdir())
  assert.ok(path.basename(tmp).startsWith('prd-progress-routes-'))
  await rm(tmp, { recursive: true, force: true })
}
