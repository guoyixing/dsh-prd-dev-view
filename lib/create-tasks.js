/** Host-owned durable create jobs. HTTP requests only enqueue/query; closing a page does not cancel work. */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { OpError } from './model.js'
import { renameWithRetry } from './prd-doc.js'

// Survives module reloads in one Host. A replacement drains its predecessor before opening the store.
const OWNERS = Symbol.for('dsh.prd-dev-view.create-task-owners')
const owners = globalThis[OWNERS] ??= new Map()
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const now = () => new Date().toISOString()
const keyOf = file => path.resolve(file).toLowerCase()
const stages = ['inspect', 'copy', 'save', 'bind', 'complete']

/**
 * new CreateTaskManager({ service, bind, file? })
 * bind({sessionId,cwd,created,taskId,expectedBindingToken?}) must be idempotent: crash recovery may call it again.
 * start({requestId,cwd,sessionId?,expectedBindingToken?,form:{title,branch,location,prdPath}}) => durable snapshot.
 * get(id), list({sessionId?,cwd?}), retry(id), attachSession(id,sessionId), dispose() are async.
 * status: queued/running/waiting-session/failed/interrupted/completed; progress has no estimated percent.
 */
export class CreateTaskManager {
  constructor({ service, bind, file = path.join(path.dirname(service.registryFile), 'create-tasks.json') }) {
    this.service = service
    this.bind = bind
    this.file = path.resolve(file)
    this.lockFile = `${this.file}.lock`
    this.token = randomUUID()
    this.tasks = new Map()
    this.jobs = new Map()
    this.reschedule = new Set()
    this.writes = Promise.resolve()
    this.execution = Promise.resolve()
    this.closed = false
    const key = keyOf(this.file), previous = owners.get(key)
    owners.set(key, this)
    this.ready = this.initialize(previous)
    // Consumers can await ready; don't emit an unhandled rejection before first route invocation.
    this.ready.catch(() => {})
  }

  async initialize(previous) {
    if (previous) await previous.dispose()
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await this.acquireLock()
    try {
      let stored
      try { stored = JSON.parse(await fs.readFile(this.file, 'utf8')) } catch (error) {
        if (error.code !== 'ENOENT') throw error // Never replace corrupt history with an empty list.
        stored = { version: 1, tasks: [] }
      }
      if (stored.version !== 1 || !Array.isArray(stored.tasks)) throw new OpError('创建任务状态格式不支持，原文件已保留')
      for (const task of stored.tasks) {
        if (!task.id || !task.requestId) throw new OpError('创建任务状态损坏，原文件已保留')
        if (task.status === 'running' || task.status === 'queued') {
          task.status = 'interrupted'
          task.error = { message: 'Host 在任务完成前停止；可以重试，已保存的视图不会重复创建', interrupted: true }
          task.updatedAt = now()
        }
        this.tasks.set(task.id, task)
      }
      await this.persist()
    } catch (error) {
      await this.releaseLock()
      throw error
    }
  }

  async acquireLock() {
    for (let attempt = 0; attempt < 2; attempt++) {
      let handle
      try {
        handle = await fs.open(this.lockFile, 'wx')
        await handle.writeFile(JSON.stringify({ pid: process.pid, token: this.token }))
        this.hasLock = true
        return
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        let owner
        try { owner = JSON.parse(await fs.readFile(this.lockFile, 'utf8')) } catch { throw new OpError('任务锁无法确认归属；为防并发未接管，请检查创建任务锁文件') }
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new OpError('任务锁归属无效，未冒险接管')
        try { process.kill(owner.pid, 0) } catch (probe) {
          if (probe.code === 'ESRCH') {
            // Only remove a lock whose owner is confirmed dead, never age out a live writer.
            await fs.unlink(this.lockFile)
            continue
          }
        }
        throw new OpError('另一 Host 正在管理创建任务，未启动并发实例')
      } finally { await handle?.close() }
    }
    throw new OpError('无法取得创建任务锁')
  }

  async releaseLock() {
    if (!this.hasLock) return
    const owner = JSON.parse(await fs.readFile(this.lockFile, 'utf8'))
    if (owner.token === this.token) await fs.unlink(this.lockFile)
    this.hasLock = false
  }

  async persist() {
    const tmp = `${this.file}.${this.token}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ version: 1, tasks: [...this.tasks.values()] }, null, 2), 'utf8')
    // No direct-write fallback: a partial task store is worse than a reported persistence error.
    await renameWithRetry(tmp, this.file)
  }

  async mutate(fn) {
    const op = this.writes.then(async () => {
      const before = new Map([...this.tasks].map(([id, task]) => [id, clone(task)]))
      try { const value = await fn(); await this.persist(); return clone(value) } catch (error) { this.tasks = before; throw error }
    })
    this.writes = op.catch(() => {})
    return op
  }

  async available() {
    await this.ready
    if (this.closed) throw new OpError('创建任务管理器已卸载，请刷新后重试')
  }

  async start({ requestId, cwd, sessionId, expectedBindingToken, form = {} }) {
    await this.available()
    if (typeof requestId !== 'string' || !requestId.trim()) throw new OpError('缺少创建请求编号 requestId')
    if (sessionId != null && (typeof sessionId !== 'string' || !sessionId.trim())) throw new OpError('对话编号无效')
    if (cwd != null && (typeof cwd !== 'string' || !path.isAbsolute(cwd))) throw new OpError('cwd 必须是绝对路径')
    const fields = {}
    for (const field of ['title', 'branch', 'location', 'prdPath']) {
      if (form[field] != null && typeof form[field] !== 'string') throw new OpError(`${field} 必须是字符串`)
      fields[field] = form[field] ?? ''
    }
    const input = { cwd: cwd ? path.resolve(cwd) : null, sessionId: sessionId ?? null, form: fields }
    const fingerprint = JSON.stringify(input)
    const result = await this.mutate(() => {
      if (this.closed) throw new OpError('创建任务管理器已卸载')
      const existing = [...this.tasks.values()].find(task => task.requestId === requestId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new OpError('同一 requestId 不能用于不同的创建参数')
        return existing
      }
      const target = this.service.creationTarget({ cwd: input.cwd, ...fields })
      const collisions = [...this.tasks.values()].filter(task => keyOf(task.target.dataFile) === keyOf(target.dataFile) && !task.supersededBy)
      const collision = collisions.find(task => !['failed', 'interrupted'].includes(task.status) || task.created || task.error?.rollbackFailed || existsSync(task.target.dataFile) || existsSync(path.join(task.target.viewDir, '.prd-create.json')) || this.jobs.has(task.id))
      if (collision) throw new OpError(`该目标已有创建任务 ${collision.id}，请查询或重试原任务`)
      const task = {
        id: randomUUID(), requestId, ...input, fingerprint, target, ...(expectedBindingToken !== undefined ? { expectedBindingToken: clone(expectedBindingToken) } : {}),
        status: 'queued', stage: 'inspect', progress: { stage: 'inspect' }, attempt: 1,
        createdAt: now(), updatedAt: now(),
      }
      for (const old of collisions) old.supersededBy = task.id
      this.tasks.set(task.id, task)
      return task
    })
    if (result.status === 'queued') this.launch(result.id)
    return result
  }

  async get(id) { await this.ready; await this.writes; return clone(this.tasks.get(id) ?? null) }

  async list({ sessionId, cwd } = {}) {
    await this.ready; await this.writes
    return [...this.tasks.values()].filter(t => (sessionId === undefined || t.sessionId === sessionId) && (cwd === undefined || (t.cwd && keyOf(t.cwd) === keyOf(cwd))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
  }

  async retry(id) {
    await this.available()
    const task = await this.mutate(() => {
      if (this.closed) throw new OpError('创建任务管理器已卸载')
      const t = this.require(id)
      if (t.supersededBy) throw new OpError(`任务已由修正后的请求 ${t.supersededBy} 替代，请查询新任务`)
      if (!['failed', 'interrupted'].includes(t.status)) return t
      if (this.jobs.has(id)) return t
      t.status = 'queued'; t.attempt++; t.error = null; t.updatedAt = now()
      t.stage = t.created ? 'bind' : 'inspect'; t.progress = { stage: t.stage }
      return t
    })
    if (task.status === 'queued') this.launch(id)
    return task
  }

  async attachSession(id, sessionId) {
    await this.available()
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new OpError('缺少对话编号')
    const task = await this.mutate(() => {
      if (this.closed) throw new OpError('创建任务管理器已卸载')
      const t = this.require(id)
      if (t.sessionId && t.sessionId !== sessionId) throw new OpError('任务已指定其他对话，不能重新绑定')
      t.sessionId = sessionId; t.updatedAt = now()
      if (t.status === 'waiting-session') { t.status = 'queued'; this.reschedule.add(id) }
      return t
    })
    if (task.status === 'queued') this.launch(id)
    return task
  }

  require(id) { const t = this.tasks.get(id); if (!t) throw new OpError(`找不到创建任务 ${id}`); return t }

  launch(id) {
    if (this.closed || this.jobs.has(id)) return
    // Serialize create operations, including registration, to avoid service registry/state lost updates.
    const job = this.execution.then(() => this.run(id))
    this.jobs.set(id, job)
    this.execution = job.catch(error => this.service.logger?.warn?.('PRD create task persistence failed: %s', error.message))
    job.finally(() => {
      this.jobs.delete(id)
      if (this.reschedule.delete(id) && this.tasks.get(id)?.status === 'queued') this.launch(id)
    }).catch(() => {})
  }

  async update(id, patch) {
    return this.mutate(() => { const t = this.require(id); Object.assign(t, patch, { updatedAt: now() }); return t })
  }

  async run(id) {
    try {
      let task = await this.update(id, { status: 'running' })
      if (!task.created) {
        const created = await this.service.createInProject({
          cwd: task.cwd, ...task.form, location: path.dirname(task.target.viewDir), taskId: task.id,
          onProgress: async event => {
            const current = this.require(id)
            if (!stages.includes(event.stage)) throw new OpError('未知创建阶段')
            if (stages.indexOf(event.stage) < stages.indexOf(current.stage)) throw new OpError('创建阶段发生倒退')
            const { inspection, ...progress } = event
            await this.update(id, { stage: event.stage, progress, ...(inspection ? { inspection } : {}) })
          },
        })
        task = await this.update(id, { created, stage: 'bind', progress: { stage: 'bind' } })
      } else task = await this.update(id, { stage: 'bind', progress: { stage: 'bind' } })
      if (!task.sessionId) {
        await this.update(id, { status: 'waiting-session' })
        // attachSession can race with this checkpoint; re-read before leaving the worker.
        task = this.require(id)
        if (!task.sessionId) return
        task = await this.update(id, { status: 'running' })
      }
      if (typeof this.bind !== 'function') throw new OpError('未配置对话绑定回调')
      const binding = await this.bind({ sessionId: task.sessionId, cwd: task.cwd, created: clone(task.created), taskId: id, expectedBindingToken: task.expectedBindingToken })
      await this.update(id, { status: 'completed', stage: 'complete', progress: { stage: 'complete' }, binding, error: null })
    } catch (error) {
      await this.update(id, { status: 'failed', error: { message: error.message ?? String(error), ...(error.rollbackFailed ? { rollbackFailed: true } : {}) } })
    }
  }

  /** Drain accepted jobs, then release ownership. New instances wait even if Host ignores the returned promise. */
  dispose() {
    if (this.disposing) return this.disposing
    this.closed = true
    this.disposing = (async () => {
      try { await this.ready } catch { return }
      await this.writes
      await Promise.allSettled([...this.jobs.values()])
      await this.writes
      await this.releaseLock()
      if (owners.get(keyOf(this.file)) === this) owners.delete(keyOf(this.file))
    })()
    return this.disposing
  }
}
