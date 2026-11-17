/** Content-generation receipts, separate from PRD business data and session bindings.
 * One instance per service/Host lifetime. Running phases describe the last report,
 * NOT a live agent heartbeat. The caller must enforce the session's binding.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { derive, OpError } from './model.js'

export const GENERATION_PHASES = ['reading', 'code', 'cards', 'checking', 'complete', 'failed', 'interrupted']
const running = new Set(['reading', 'code', 'cards', 'checking'])
const queues = new Map()
const text = value => typeof value === 'string' && Boolean(value.trim())
const now = () => new Date().toISOString()
const keyOf = project => path.resolve(project.dataFile).toLowerCase()

// Serialize the whole read/modify/write transaction, including different projects.
// Shared between instances in this process; this is not a cross-process file lock.
async function serialized(file, fn) {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(fn)
  queues.set(file, next)
  try { return await next } finally { if (queues.get(file) === next) queues.delete(file) }
}

function ids(value, name) {
  if (!Array.isArray(value) || value.some(id => !text(id) || id !== id.trim())) throw new OpError(`${name} 必须是非空字符串编号的数组`)
  if (new Set(value).size !== value.length) throw new OpError(`${name} 不允许重复编号`)
  return [...value]
}

/** Stronger than model.lint's card-exists check; no semantic-quality claim. */
export function cardProblems(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return ['缺少卡片']
  const problems = []
  if (!text(card.title)) problems.push('缺少卡片标题')
  if (!text(card.lead)) problems.push('缺少功能说明 lead')
  const stages = Array.isArray(card.stages) ? card.stages : []
  if (stages.length < 3) problems.push('至少需要 3 个阶段')
  if (stages.some(stage => !text(stage?.id) || !text(stage?.name)) || new Set(stages.map(stage => stage?.id)).size !== stages.length) problems.push('阶段编号和名称须完整且编号唯一')
  if (!Array.isArray(card.pre) || !card.pre.length || card.pre.some(item => !text(item?.id) || !text(item?.cond) || !text(item?.act))) problems.push('前置条件须包含 id、cond、act')
  if (Array.isArray(card.steps?.[stages[0]?.id]) && card.steps[stages[0].id].length) problems.push('第一个阶段只能放前置条件')
  for (const stage of stages.slice(1)) {
    const steps = card.steps?.[stage?.id]
    if (!Array.isArray(steps) || !steps.length || steps.some(step => !text(step?.id) || !text(step?.t) || !text(step?.d))) problems.push(`阶段 ${stage?.id ?? '?'} 缺少完整处理步骤 id、t、d`)
  }
  return problems
}

export class GenerationState {
  constructor(service) {
    this.service = service
    this.file = path.join(path.dirname(service.registryFile), 'generation.json')
    // Initialization is eager: Host restart interrupts all persisted running reports,
    // not only whichever project happens to be opened first.
    this.ready = serialized(this.file, async () => {
      const store = await this.read()
      let changed = false
      for (const rec of Object.values(store.projects)) {
        if (!running.has(rec.phase)) continue
        rec.previousPhase = rec.phase
        rec.phase = 'interrupted'
        rec.error = 'Host 已重启，原生成任务状态无法继续确认；请重新上报进度。'
        rec.interruptedAt = rec.updatedAt = now()
        changed = true
      }
      if (changed) await this.write(store)
    })
    // Retain the failure for get/report without an unhandled-rejection side effect.
    this.ready.catch(() => {})
  }

  async read() {
    let raw
    try { raw = JSON.parse(await fs.readFile(this.file, 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, projects: {} }
      throw new OpError(`无法读取生成进度，未覆盖原文件：${error.message}`)
    }
    if (raw?.version !== 1 || !raw.projects || typeof raw.projects !== 'object' || Array.isArray(raw.projects)) throw new OpError('生成进度文件格式不正确，未覆盖原文件')
    for (const rec of Object.values(raw.projects)) {
      if (!rec || !GENERATION_PHASES.includes(rec.phase) || !Array.isArray(rec.completedFeatureIds) || (rec.featureIds !== null && !Array.isArray(rec.featureIds))) throw new OpError('生成进度记录格式不正确，未覆盖原文件')
    }
    return raw
  }

  async write(store) {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
      await fs.rename(temporary, this.file)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {})
    }
  }

  async snapshot(project, rec) {
    const base = {
      project: project.id, projectId: project.id, sessionId: rec?.sessionId ?? null,
      phase: rec?.phase ?? 'pending', detail: rec?.detail ?? '视图已创建，内容待生成。',
      startedAt: rec?.startedAt ?? null, updatedAt: rec?.updatedAt ?? null,
      lastReportedAt: rec?.lastReportedAt ?? null, completedAt: rec?.completedAt ?? null,
      interruptedAt: rec?.interruptedAt ?? null, previousPhase: rec?.previousPhase ?? null,
      featureIds: rec?.featureIds ?? null, reportedCompletedFeatureIds: rec?.completedFeatureIds ?? [],
      completedFeatureIds: [], invalidFeatureIds: [], done: 0, total: rec?.featureIds?.length ?? null,
      error: rec?.error ?? null, counts: null, revision: null,
      lint: rec?.lint ?? null, validatedRevision: rec?.validatedRevision ?? null,
    }
    try {
      const data = await this.service.readData(project.dataFile)
      base.counts = { ...derive(data).counts, rules: data.rules.length, modules: data.modules.length, objects: data.objects.length, cards: Object.keys(data.cards).length }
      base.revision = data.revision
      const features = new Set(data.features.map(feature => feature.id))
      const plan = new Set(base.featureIds ?? [])
      for (const id of base.reportedCompletedFeatureIds) {
        if (plan.has(id) && features.has(id) && !cardProblems(data.cards[id]).length) base.completedFeatureIds.push(id)
        else base.invalidFeatureIds.push(id)
      }
      base.done = base.completedFeatureIds.length
      if (base.phase === 'complete' && (data.revision !== rec.validatedRevision || base.done !== base.total || features.size !== plan.size || [...features].some(id => !plan.has(id)))) {
        base.phase = 'interrupted'
        base.error = '完成检查后内容已变化或卡片不完整，需要重新检查并上报 complete。'
      }
    } catch (error) {
      base.error = `无法核验实际内容：${error.message}`
      if (base.phase === 'complete') base.phase = 'interrupted'
    }
    return base
  }

  async get(ref) {
    await this.ready
    const project = await this.service.resolveProject(ref)
    return serialized(this.file, async () => this.snapshot(project, (await this.read()).projects[keyOf(project)]))
  }

  /** featureIds replaces the full plan; completedFeatureIds adds a confirmed batch.
   * reading after a terminal phase starts a fresh plan and confirmation set.
   * complete rejection persists failed + error and throws OpError (never success).
   */
  async report(ref, sessionId, args) {
    if (!text(sessionId)) throw new OpError('生成进度上报缺少对话编号')
    if (!GENERATION_PHASES.includes(args?.phase)) throw new OpError(`生成阶段必须是 ${GENERATION_PHASES.join(' / ')}`)
    if (!text(args.detail)) throw new OpError('生成进度必须说明 detail')
    if (args.error !== undefined && typeof args.error !== 'string') throw new OpError('error 必须是字符串')
    const plan = args.featureIds === undefined ? undefined : ids(args.featureIds, 'featureIds')
    const completed = args.completedFeatureIds === undefined ? [] : ids(args.completedFeatureIds, 'completedFeatureIds')
    await this.ready
    const project = await this.service.resolveProject(ref)
    return serialized(this.file, async () => {
      const store = await this.read()
      const key = keyOf(project), previous = store.projects[key]
      const fresh = !previous || (args.phase === 'reading' && !running.has(previous.phase))
      const stamp = now()
      const rec = {
        ...(fresh ? {} : previous), projectId: project.id, dataFile: project.dataFile, sessionId,
        phase: args.phase, detail: args.detail.trim(), startedAt: fresh ? stamp : previous.startedAt,
        updatedAt: stamp, lastReportedAt: stamp, completedAt: null, interruptedAt: null, previousPhase: null,
        featureIds: plan ?? (fresh ? null : previous.featureIds),
        completedFeatureIds: fresh ? [] : [...previous.completedFeatureIds], error: null,
        validatedRevision: null, lint: null,
      }
      if (completed.length && rec.featureIds === null) throw new OpError('确认卡片前必须用 featureIds 上报完整功能计划')
      if (completed.some(id => !rec.featureIds.includes(id))) throw new OpError('completedFeatureIds 含计划 featureIds 之外的编号')
      rec.completedFeatureIds = [...new Set([...rec.completedFeatureIds.filter(id => rec.featureIds?.includes(id)), ...completed])]
      if (args.phase === 'failed' || args.phase === 'interrupted') rec.error = args.error?.trim() || rec.detail
      if (args.phase === 'interrupted') rec.interruptedAt = stamp
      let failure
      // Share the service's data lock so an apply cannot slip between lint and receipt.
      if (args.phase === 'complete') {
        await this.service.withLock(project.dataFile, async () => {
          try {
            const check = await this.service.lint(project)
            const data = await this.service.readData(project.dataFile)
            const errors = [...check.errors]
            const actual = data.features.map(feature => feature.id)
            if (!rec.featureIds?.length) errors.push('尚未上报非空功能计划 featureIds')
            if (!rec.featureIds || actual.length !== rec.featureIds.length || actual.some(id => !rec.featureIds.includes(id))) errors.push('功能计划 featureIds 与实际功能清单不一致')
            for (const id of rec.featureIds ?? []) {
              if (!rec.completedFeatureIds.includes(id)) errors.push(`${id} 尚未明确上报卡片已确认`)
              for (const problem of cardProblems(data.cards[id])) errors.push(`${id} ${problem}`)
            }
            if (check.revision !== data.revision) errors.push('检查过程中数据修订已变化，请重试')
            if (errors.length) throw new OpError(errors.join('；'))
            rec.validatedRevision = data.revision
            rec.completedAt = stamp
            rec.lint = { errors: 0, warnings: check.warnings.length, revision: check.revision }
          } catch (error) {
            rec.phase = 'failed'
            rec.error = `拒绝标记生成完成：${error.message}`
            failure = new OpError(rec.error)
          }
          store.projects[key] = rec
          await this.write(store)
        })
      } else {
        store.projects[key] = rec
        await this.write(store)
      }
      this.service.emit?.(project.id)
      if (failure) throw failure
      return this.snapshot(project, rec)
    })
  }
}
