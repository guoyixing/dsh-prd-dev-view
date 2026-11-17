// Run directly: node test/create-tasks.mjs (no child processes or shared scratch cleanup).
import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PrdViewService } from '../lib/service.js'
import { inspectPrd, planPrd, renameWithRetry, writePrd } from '../lib/prd-doc.js'
import { CreateTaskManager } from '../lib/create-tasks.js'

const temporaryRoot = path.resolve(os.tmpdir())
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(temporaryRoot, 'prd-create-tasks-'))
  const managers = []
  t.after(async () => {
    for (const manager of managers) await manager.dispose()
    assert.equal(path.dirname(dir), temporaryRoot)
    assert.ok(path.basename(dir).startsWith('prd-create-tasks-'))
    await fs.rm(dir, { recursive: true, force: true }) // Only this fixture's unique directory.
  })
  const source = path.join(dir, 'source.md')
  await fs.writeFile(path.join(dir, 'a.png'), Buffer.alloc(11, 1))
  await fs.writeFile(path.join(dir, 'b.png'), Buffer.alloc(17, 2))
  await fs.writeFile(source, '# PRD\n![a](a.png)\n![again](a.png)\n![b](b.png)\n![missing](missing.png)\n![web](https://example.test/x.png)\n')
  const service = new PrdViewService({ registryDir: path.join(dir, 'registry'), autoExport: false })
  const manager = options => { const m = new CreateTaskManager({ service, bind: async ({ created }) => ({ project: created }), ...options }); managers.push(m); return m }
  const input = (title = 'demo') => ({ requestId: title, cwd: dir, sessionId: 'session-1', form: { title, prdPath: source } })
  return { dir, source, service, manager, input }
}
async function settled(manager, id) {
  await manager.jobs.get(id)
  await manager.writes
  return manager.get(id)
}

test('cold concurrent state initialization shares one object and preserves initial session cwd', async t => {
  const f = await fixture(t)
  const [one, two] = await Promise.all([f.service.readState(), f.service.readState()])
  assert.equal(one, two)
  one.sessions.cold = { cwd: f.dir }
  assert.equal((await f.service.readState()).sessions.cold.cwd, f.dir)
  const cold = new PrdViewService({ registryDir: path.join(f.dir, 'cold-registry') })
  await Promise.all([cold.refreshProtected(), cold.bindingFor('cold', f.dir)])
  assert.equal((await cold.bindingFor('cold')).cwd, f.dir)
})

test('slow discovery never replaces a concurrent explicit none binding', async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = await fixture(t)
  await f.service.createInProject({ cwd: f.dir, title: 'candidate', prdPath: f.source })
  const original = f.service.discoverViews.bind(f.service)
  let calls = 0
  f.service.discoverViews = async cwd => {
    if (++calls === 1) { entered.resolve(); await release.promise }
    return original(cwd)
  }
  const discovering = f.service.bindingFor('race', f.dir)
  await entered.promise
  const explicit = await f.service.setBinding('race', null, f.dir)
  release.resolve()
  const result = await discovering
  assert.equal(result.project, null)
  assert.equal(result.source, 'none')
  assert.equal(result.bindingToken, explicit.bindingToken)
  assert.equal((await f.service.bindingFor('race')).project, null)
})

test('Windows lock canonicalization serializes differently cased paths', async t => {
  if (process.platform !== 'win32') return
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = await fixture(t), events = []
  const target = path.join(f.dir, 'DATA.prdview.json')
  const first = f.service.withLock(target, async () => { events.push('first'); entered.resolve(); await release.promise })
  await entered.promise
  const second = f.service.withLock(target.toLowerCase(), async () => { events.push('second') })
  await Promise.resolve()
  assert.deepEqual(events, ['first'])
  release.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first', 'second'])
  assert.equal(f.service.locks.size, 0)
})

test('real inspect/copy/save progress is monotonic; missing references survive and sync API remains compatible', async t => {
  const f = await fixture(t), events = []
  const result = await f.service.createInProject({ cwd: f.dir, title: 'sync', prdPath: f.source, onProgress: event => { events.push(event) } })
  assert.deepEqual(events.map(e => e.stage), ['inspect', 'inspect', 'copy', 'copy', 'copy', 'save'])
  assert.deepEqual(events.filter(e => e.stage === 'copy').map(e => [e.completed, e.total, e.bytesCompleted, e.bytesTotal]), [[0, 2, 0, 28], [1, 2, 11, 28], [2, 2, 28, 28]])
  assert.ok(events.filter(e => e.stage !== 'copy').every(e => e.total === undefined && e.percent === undefined))
  assert.equal(result.prd.missing[0].url, 'missing.png')
  assert.equal(result.prd.missing[0].line, 5)
  assert.equal(result.prd.remote, 1)
  const check = []
  await f.service.inspectPrd(f.source, { onProgress: e => check.push(e) })
  assert.deepEqual(check.map(e => e.stage), ['inspect', 'inspect'])
})

test('start persists inputs, returns before work finishes, is idempotent, rejects conflicting request/target', async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve()) // Unblock workers before fixture.dispose(), even on assertion failure.
  const f = await fixture(t)
  const original = f.service.createInProject.bind(f.service)
  let calls = 0, binds = 0
  f.service.createInProject = async options => { calls++; entered.resolve(); await release.promise; return original(options) }
  const m = f.manager({ bind: async () => { binds++; return { ok: true } } })
  const [one, two] = await Promise.all([m.start(f.input()), m.start(f.input())])
  assert.equal(one.id, two.id)
  await entered.promise
  const persisted = JSON.parse(await fs.readFile(m.file, 'utf8')).tasks[0]
  assert.equal(persisted.requestId, 'demo')
  assert.equal(persisted.cwd, f.dir)
  assert.equal(persisted.sessionId, 'session-1')
  assert.equal(persisted.form.prdPath, f.source)
  await assert.rejects(m.start({ ...f.input(), form: { ...f.input().form, title: 'other' } }), /requestId/)
  await assert.rejects(m.start({ ...f.input(), requestId: 'different' }), /已有创建任务/)
  release.resolve()
  const done = await settled(m, one.id)
  assert.equal(done.status, 'completed'); assert.equal(done.stage, 'complete')
  assert.equal(done.inspection.missing.length, 1)
  assert.equal(calls, 1); assert.equal(binds, 1)
  assert.equal((await m.start(f.input())).id, one.id)
  assert.equal((await m.list({ sessionId: 'session-1', cwd: f.dir })).length, 1)
  assert.equal(await m.get('unknown'), null)
  const external = await m.get(one.id); external.form.title = 'bad'
  assert.equal((await m.get(one.id)).form.title, 'demo')
})

test('failed bind retries only binding and retains created view across manager replacement', async t => {
  const f = await fixture(t)
  let binds = 0, creates = 0
  const original = f.service.createInProject.bind(f.service)
  f.service.createInProject = async args => { creates++; return original(args) }
  const bind = async () => { if (++binds === 1) throw new Error('binding unavailable'); return { ok: true } }
  const first = f.manager({ bind })
  const task = await first.start(f.input())
  const failed = await settled(first, task.id)
  assert.equal(failed.status, 'failed'); assert.equal(failed.stage, 'bind', JSON.stringify(failed.error))
  assert.ok(failed.created.dataFile); assert.match(failed.error.message, /binding unavailable/)
  const before = await fs.readFile(failed.created.dataFile, 'utf8')
  const replacement = f.manager({ bind })
  await replacement.ready
  await replacement.retry(task.id)
  const done = await settled(replacement, task.id)
  assert.equal(done.status, 'completed'); assert.equal(done.attempt, 2)
  assert.equal(creates, 1); assert.equal(binds, 2)
  assert.equal(await fs.readFile(done.created.dataFile, 'utf8'), before)
  await assert.rejects(first.start(f.input('old')), /卸载/)
})

test('binding expectation is persisted once and forwarded unchanged on retries', async t => {
  const f = await fixture(t), tokens = []
  const bind = async options => { tokens.push(options.expectedBindingToken); if (tokens.length === 1) throw new Error('try later'); return {} }
  const m = f.manager({ bind }), input = { ...f.input(), expectedBindingToken: 'original-token' }
  const task = await m.start(input)
  await settled(m, task.id)
  assert.equal((await m.start({ ...input, expectedBindingToken: 'new-token' })).id, task.id)
  const persisted = JSON.parse(await fs.readFile(m.file, 'utf8')).tasks[0]
  assert.equal(persisted.expectedBindingToken, 'original-token')
  await m.retry(task.id)
  assert.equal((await settled(m, task.id)).status, 'completed')
  assert.deepEqual(tokens, ['original-token', 'original-token'])
})

test('serialized state writes persist latest concurrent bindings', async t => {
  const f = await fixture(t), state = await f.service.readState()
  const writes = []
  for (let n = 0; n < 20; n++) {
    state.sessions[`session-${n}`] = { project: null, cwd: f.dir }
    writes.push(f.service.writeState(state))
  }
  await Promise.all(writes)
  const disk = JSON.parse(await fs.readFile(f.service.stateFile, 'utf8'))
  assert.equal(Object.keys(disk.sessions).length, 20)
})

test('import retains target creation ownership and uses its canonical file lock', async t => {
  const f = await fixture(t), taskId = 'original-task'
  const entry = await f.service.createInProject({ cwd: f.dir, title: 'import', prdPath: f.source, taskId })
  const incoming = await f.service.readData(entry.dataFile)
  const source = path.join(f.dir, 'incoming.json')
  await fs.writeFile(source, JSON.stringify({ ...incoming, meta: { ...incoming.meta, creationTaskId: 'forged-task' } }))
  const lock = f.service.withLock.bind(f.service), targets = []
  f.service.withLock = async (key, fn) => { targets.push(key); return lock(key, fn) }
  await f.service.importSource({ source, dataFile: entry.dataFile })
  assert.deepEqual(targets, [entry.dataFile])
  assert.equal((await f.service.readData(entry.dataFile)).meta.creationTaskId, taskId)
})

test('failed inspect can retry after source becomes available; attempts restart progress honestly', async t => {
  const f = await fixture(t), m = f.manager(), input = f.input()
  input.form.prdPath = path.join(f.dir, 'later.md')
  const task = await m.start(input)
  const failed = await settled(m, task.id)
  assert.equal(failed.status, 'failed'); assert.equal(failed.stage, 'inspect')
  assert.equal(failed.created, undefined)
  await fs.writeFile(input.form.prdPath, '# Now available')
  await Promise.all([m.retry(task.id), m.retry(task.id)])
  const done = await settled(m, task.id)
  assert.equal(done.status, 'completed'); assert.equal(done.attempt, 2)
})

test('corrected form can replace failed uncreated task, but old retry cannot race the replacement', async t => {
  const f = await fixture(t), m = f.manager(), bad = f.input()
  bad.form.prdPath = path.join(f.dir, 'wrong.md')
  const first = await m.start(bad)
  assert.equal((await settled(m, first.id)).status, 'failed')
  const corrected = await m.start({ ...f.input(), requestId: 'corrected' })
  assert.notEqual(corrected.id, first.id)
  await assert.rejects(m.retry(first.id), /替代/)
  assert.equal((await settled(m, corrected.id)).status, 'completed')
  assert.equal((await m.get(first.id)).supersededBy, corrected.id)
})

test('missing session waits at bind and attachSession never creates a second view', async t => {
  const f = await fixture(t), m = f.manager(), input = f.input()
  delete input.sessionId
  const task = await m.start(input)
  const waiting = await settled(m, task.id)
  assert.equal(waiting.status, 'waiting-session', JSON.stringify(waiting.error)); assert.equal(waiting.stage, 'bind')
  assert.equal(waiting.progress.total, undefined)
  await m.attachSession(task.id, 'new-session')
  const done = await settled(m, task.id)
  assert.equal(done.status, 'completed'); assert.equal(done.sessionId, 'new-session')
  assert.equal(done.created.id, waiting.created.id)
  await assert.rejects(m.attachSession(task.id, 'other-session'), /其他对话/)
  assert.equal((await m.start(input)).id, task.id)
})

test('restart interrupts running/queued jobs; saved task marker recovers without copying again', async t => {
  const f = await fixture(t), first = f.manager()
  const task = await first.start(f.input())
  const done = await settled(first, task.id)
  await first.dispose()
  const saved = JSON.parse(await fs.readFile(first.file, 'utf8'))
  saved.tasks[0].status = 'running'; saved.tasks[0].stage = 'save'
  delete saved.tasks[0].created; delete saved.tasks[0].binding
  await fs.writeFile(first.file, JSON.stringify(saved))
  const original = await fs.readFile(done.created.dataFile, 'utf8')
  // Source no longer exists; retry must recover the already-created view, not inspect/copy again.
  await fs.unlink(f.source)
  const next = f.manager()
  assert.equal((await next.get(task.id)).status, 'interrupted')
  await next.retry(task.id)
  const recovered = await settled(next, task.id)
  assert.equal(recovered.status, 'completed')
  assert.equal(recovered.inspection.missing.length, 1)
  assert.equal(await fs.readFile(done.created.dataFile, 'utf8'), original)
})

test('pre-save crash resumes only explicitly owned PRD files and never adopts user files', async t => {
  const f = await fixture(t), target = f.service.creationTarget({ cwd: f.dir, title: 'pre-save' })
  const info = await inspectPrd(f.source), plan = planPrd(info), taskId = 'pre-save-crash'
  await fs.mkdir(target.viewDir, { recursive: true })
  // Reproduce disk state left between PRD swap and data-file save on process death.
  await fs.writeFile(path.join(target.viewDir, '.prd-create.json'), JSON.stringify({ version: 1, taskId, file: plan.mdName, assets: plan.assetsName }))
  await writePrd({ dir: target.viewDir, plan, info, oldMeta: null, isProtected: () => false })
  await assert.rejects(f.service.createInProject({ cwd: f.dir, title: 'pre-save', prdPath: f.source, taskId: 'other' }), /其他创建任务/)
  const resumed = await f.service.createInProject({ cwd: f.dir, title: 'pre-save', prdPath: f.source, taskId })
  assert.equal((await f.service.readData(resumed.dataFile)).meta.creationTaskId, taskId)
  await assert.rejects(fs.stat(path.join(target.viewDir, '.prd-create.json')), { code: 'ENOENT' })
  const userTarget = f.service.creationTarget({ cwd: f.dir, title: 'user-content' })
  await fs.mkdir(userTarget.viewDir, { recursive: true })
  await fs.writeFile(path.join(userTarget.viewDir, plan.mdName), 'owned by user')
  await assert.rejects(f.service.createInProject({ cwd: f.dir, title: 'user-content', prdPath: f.source, taskId: 'new' }), /未归本任务/)
  assert.equal(await fs.readFile(path.join(userTarget.viewDir, plan.mdName), 'utf8'), 'owned by user')
})

test('binding compare-and-set preserves changed user choice and accepts same-target retries', async t => {
  const f = await fixture(t)
  const first = await f.service.createInProject({ cwd: f.dir, title: 'first', prdPath: f.source })
  const second = await f.service.createInProject({ cwd: f.dir, title: 'second', prdPath: f.source })
  const before = await f.service.setBinding('cas', first.id, f.dir)
  await f.service.setBinding('cas', null, f.dir)
  await assert.rejects(f.service.setBinding('cas', second.id, f.dir, { expectedBindingToken: before.bindingToken }), /绑定已变化/)
  assert.equal((await f.service.bindingFor('cas')).project, null)
  await f.service.setBinding('cas', second.id, f.dir)
  assert.equal((await f.service.setBinding('cas', second.id, f.dir, { expectedBindingToken: before.bindingToken })).project.id, second.id)
})

test('replacement manager waits for accepted work while dispose drains; no old/new overlap', async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve()) // Unblock workers before fixture.dispose(), even on assertion failure.
  const f = await fixture(t)
  let running = 0, maxRunning = 0
  const bind = async () => { running++; maxRunning = Math.max(maxRunning, running); entered.resolve(); await release.promise; running--; return {} }
  const first = f.manager({ bind })
  const task = await first.start(f.input())
  await entered.promise
  const next = f.manager({ bind })
  let ready = false
  next.ready.then(() => { ready = true })
  await Promise.resolve()
  assert.equal(ready, false); assert.equal(first.closed, true)
  release.resolve()
  await next.ready
  assert.equal((await next.get(task.id)).status, 'completed')
  const second = await next.start(f.input('second'))
  assert.equal((await settled(next, second.id)).status, 'completed')
  assert.equal(maxRunning, 1)
})

test('Windows transient rename retries are bounded and do not hide persistent failures', async () => {
  if (process.platform !== 'win32') return
  const rename = fs.rename
  let calls = 0
  try {
    fs.rename = async () => { if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' }) }
    await renameWithRetry('unused-source', 'unused-target')
    assert.equal(calls, 3)
    calls = 0
    fs.rename = async () => { calls++; throw Object.assign(new Error('busy'), { code: 'EPERM' }) }
    await assert.rejects(renameWithRetry('unused-source', 'unused-target'), /busy/)
    assert.equal(calls, 4)
  } finally { fs.rename = rename }
})

test('live lock owner and corrupt history are rejected rather than overwritten', async t => {
  const f = await fixture(t), locked = path.join(f.dir, 'locked.json')
  const lock = `${locked}.lock`
  await fs.writeFile(lock, JSON.stringify({ pid: process.pid, token: 'foreign' }))
  const m = f.manager({ file: locked })
  await assert.rejects(m.ready, /另一 Host/)
  assert.equal(JSON.parse(await fs.readFile(lock)).token, 'foreign')
  const corrupt = path.join(f.dir, 'corrupt.json')
  await fs.writeFile(corrupt, 'not json')
  const broken = f.manager({ file: corrupt })
  await assert.rejects(broken.ready, SyntaxError)
  assert.equal(await fs.readFile(corrupt, 'utf8'), 'not json')
})

test('copy errors report only finished files and retain user files', async t => {
  const f = await fixture(t), events = []
  const info = await inspectPrd(f.source), plan = planPrd(info)
  const target = path.join(f.dir, 'copy-error')
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'user.txt'), 'keep')
  await fs.unlink(path.join(f.dir, 'b.png'))
  await assert.rejects(writePrd({ dir: target, plan, info, oldMeta: null, isProtected: () => false, onProgress: e => events.push(e) }), /写入 PRD/)
  assert.deepEqual(events.map(e => e.completed), [0, 1])
  assert.equal(events.at(-1).bytesCompleted, 11)
  assert.equal(await fs.readFile(path.join(target, 'user.txt'), 'utf8'), 'keep')
})

test('save failure does not recursively remove user content or claim rollback succeeded', async t => {
  const f = await fixture(t), target = f.service.creationTarget({ cwd: f.dir, title: 'failure' })
  const originalWrite = f.service.writeData.bind(f.service)
  const rm = fs.rm
  let mdPath
  f.service.writeData = async () => {
    await fs.writeFile(path.join(target.viewDir, 'user.txt'), 'user data')
    mdPath = path.join(target.viewDir, 'source.md')
    fs.rm = async (file, options) => { if (file === mdPath) throw new Error('rollback denied'); return rm(file, options) }
    throw new Error('save denied')
  }
  try {
    await assert.rejects(f.service.createInProject({ cwd: f.dir, title: 'failure', prdPath: f.source }), error => {
      assert.equal(error.rollbackFailed, true)
      assert.match(error.message, /save denied.*回滚未完成/s)
      return true
    })
  } finally { fs.rm = rm; f.service.writeData = originalWrite }
  assert.equal(await fs.readFile(path.join(target.viewDir, 'user.txt'), 'utf8'), 'user data')
  assert.ok(await fs.stat(mdPath))
})

test('rollback restore failure preserves backups and is visible to caller', async t => {
  const f = await fixture(t), info = await inspectPrd(f.source), plan = planPrd(info)
  const dir = path.join(f.dir, 'rollback')
  await fs.mkdir(dir)
  await fs.writeFile(path.join(dir, plan.mdName), 'old document')
  const staged = await writePrd({ dir, plan, info, oldMeta: { file: plan.mdName }, isProtected: () => false })
  const rename = fs.rename
  fs.rename = async (from, to) => { if (String(from).includes('.prd-old-')) throw new Error('restore denied'); return rename(from, to) }
  try { await assert.rejects(staged.rollback(), error => error.rollbackFailed && /回滚未完成/.test(error.message)) } finally { fs.rename = rename }
  const backup = (await fs.readdir(dir)).find(name => name.includes('.prd-old-'))
  assert.ok(backup)
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), 'old document')
})
