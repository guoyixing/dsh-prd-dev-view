/**
 * PRD 研发视图插件 · Host 端。
 * - skill：分析方法随插件发布（prd-dev-view）
 * - 模型工具：prd_view（查询/检查/同步/导入/导出）与 prd_view_edit（编辑操作）
 * - HTTP 路由：页签与配置页调用同一组操作
 * - 守卫：拒绝用 write/edit 直接改数据文件与生成的 HTML
 * - 提醒：会话里改了登记仓库的代码时，提示模型先同步研发视图
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_CONFIG, PrdViewService } from './lib/service.js'
import { LABELS, OpError } from './lib/model.js'
import { CreateTaskManager } from './lib/create-tasks.js'
import { GenerationState } from './lib/generation-state.js'

export const name = 'prd-dev-view'

const SKILL_URL = new URL('./assets/skill/SKILL.md', import.meta.url)
const SKILL_DIR = fileURLToPath(new URL('./assets/skill/', import.meta.url))
const ROUTE_PREFIX = 'prd-view.'

export function apply(ctx, config) {
  const service = new PrdViewService(config, ctx.logger)
  void service.refreshProtected()
  ctx.effect(() => service.onChange(() => { void service.refreshProtected() }), 'prd-dev-view: protected paths')

  // 可选服务：按对话编号找到正在运行的 agent，读取对话的当前工作目录
  const refs = { agents: undefined, workingDirectory: undefined }
  ctx.inject(['agents'], (c) => { c.effect(() => { refs.agents = c.get('agents'); return () => { refs.agents = undefined } }, 'prd-dev-view: agents') })
  ctx.inject(['workingDirectory'], (c) => { c.effect(() => { refs.workingDirectory = c.get('workingDirectory'); return () => { refs.workingDirectory = undefined } }, 'prd-dev-view: working directory') })
  const sessions = makeSessionHelpers(ctx, refs, service)

  const creation = new CreateTaskManager({ service, bind: async ({ sessionId, cwd, created, expectedBindingToken }) => {
    const binding = await service.setBinding(sessionId, created.id, sessions.cwdOf(sessions.agentOf(sessionId)) ?? cwd, { expectedBindingToken })
    sessions.tellAgent(sessionId, binding)
    return binding
  } })
  const generation = new GenerationState(service)
  ctx.effect(() => () => { void creation.dispose().catch(error => ctx.logger?.warn?.('prd-dev-view tasks disposal: %s', error.message)) }, 'prd-dev-view: creation tasks')
  registerSkill(ctx)
  registerRoutes(ctx, service, sessions, creation, generation)
  registerTools(ctx, service, sessions, generation)
}

// ---------------------------------------------------------------- 对话绑定

function makeSessionHelpers(ctx, refs, service) {
  const cwdOf = (agent) => {
    const session = agent?.session
    if (!session) return undefined
    try { return refs.workingDirectory?.get?.(session) ?? session.header?.cwd ?? undefined } catch { return session.header?.cwd ?? undefined }
  }
  const agentOf = (sessionId) => { try { return refs.agents?.get?.(sessionId) } catch { return undefined } }
  const bindingOfAgent = async (agent) => (agent?.id ? service.bindingFor(agent.id, cwdOf(agent)) : null)
  const brief = (b) => b && {
    project: b.project ? { id: b.project.id, title: b.project.title, dataFile: b.project.dataFile, prdFile: b.project.prdFile ?? null, scope: b.project.scope ?? 'registered' } : null,
    source: b.source, viewsDir: b.viewsDir, cwd: b.cwd,
    candidates: b.candidates.map(p => ({ id: p.id, title: p.title, scope: p.scope, relPath: p.relPath, dataFile: p.dataFile })),
  }
  /** 绑定变化写一条提示给模型，让它知道本对话负责哪份研发视图。 */
  const tellAgent = (sessionId, b) => {
    const agent = agentOf(sessionId)
    if (!agent?.inject) return
    const text = b.project
      ? `[PRD 研发视图] 本对话已绑定研发视图「${b.project.title}」(${b.project.id}，${b.project.dataFile})${b.project.prdFile ? `，PRD 文档：${b.project.prdFile}` : ''}。查询和修改这份视图时 prd_view / prd_view_edit 可省略 project；不要修改其他研发视图。`
      : '[PRD 研发视图] 本对话已取消绑定研发视图，不再修改任何研发视图，也不再需要同步。'
    try {
      agent.inject({ id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'prd-dev-view', form: 'notice', summary: b.project ? `绑定研发视图「${b.project.title}」` : '取消绑定研发视图' } })
    } catch (error) { ctx.logger?.warn?.('prd-dev-view notice failed: %s', error?.message ?? error) }
  }
  return { cwdOf, agentOf, bindingOfAgent, brief, tellAgent }
}

// ---------------------------------------------------------------- skill

function registerSkill(ctx) {
  const candidate = {
    name: 'prd-dev-view',
    description: '把业务 PRD 结合现有代码整理成面向研发的 PRD 研发视图（功能矩阵、完整功能卡片、冲突与改造总清单、业务全貌、影响地图、共用规则），并在代码调整后同步更新进度。用于整理/转换 PRD、梳理业务规则、分析需要改哪些代码、生成或更新研发视图、标记冲突和改造项完成时。',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'prd-dev-view',
    source: 'bundled',
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    rank: 600,
    locator: SKILL_URL,
  }
  const provider = {
    name: 'prd-dev-view',
    list: () => Promise.resolve([candidate]),
    async get() {
      const { locator, rank, ...rest } = candidate
      void locator; void rank
      return { ...rest, content: await readFile(SKILL_URL, 'utf8') }
    },
  }
  ctx.inject(['skills'], (c) => { c.skills.registerProvider(() => provider) })
}

// ---------------------------------------------------------------- HTTP 路由

function registerRoutes(ctx, service, sessions, creation, generation) {
  const root = ctx
  const cwdFor = sessionId => sessions.cwdOf(sessions.agentOf(sessionId))
  // A newly opened, unsent session may not have a live agent yet. The Client
  // supplies its selected workspace cwd until an authoritative agent is present.
  const clientCwd = p => {
    const live = cwdFor(p.sessionId)
    if (live) return live
    if (p.cwd === undefined || p.cwd === null || p.cwd === '') return undefined
    if (typeof p.cwd !== 'string' || !path.isAbsolute(p.cwd)) throw new OpError('cwd 必须是绝对路径')
    return path.resolve(p.cwd)
  }
  const handlers = {
    binding: p => service.bindingFor(req(p, 'sessionId'), clientCwd(p)),
    createTask: async p => {
      const sessionId = req(p, 'sessionId')
      const before = await service.bindingFor(sessionId, clientCwd(p))
      return creation.start({ requestId: req(p, 'requestId'), sessionId, cwd: before.cwd, expectedBindingToken: before.bindingToken, form: { title: p.title, branch: p.branch, location: p.location, prdPath: p.prdPath } })
    },
    creationTasks: p => creation.list({ sessionId: req(p, 'sessionId') }),
    creationTask: p => creation.get(req(p, 'id')),
    retryCreation: p => creation.retry(req(p, 'id')),
    getGeneration: async p => generation.get(await service.resolveProject(req(p, 'project'))),
    bind: async (p) => {
      const b = await service.setBinding(req(p, 'sessionId'), p.project || null, clientCwd(p))
      sessions.tellAgent(p.sessionId, b)
      return b
    },
    createView: async (p) => {
      const sessionId = req(p, 'sessionId')
      const entry = await service.createInProject({ cwd: cwdFor(sessionId) ?? (await service.bindingFor(sessionId)).cwd, title: p.title, branch: p.branch, location: p.location, prdPath: p.prdPath })
      const b = await service.setBinding(sessionId, entry.id, cwdFor(sessionId))
      sessions.tellAgent(sessionId, b)
      return { created: entry, binding: b }
    },
    inspectPrd: p => service.inspectPrd(req(p, 'path')),
    setPrd: p => service.setPrd(req(p, 'project'), p.path || undefined),
    projects: () => service.listProjects(),
    register: p => service.registerProject(p),
    updateProject: p => service.updateProject(req(p, 'id'), p),
    unregister: p => service.unregisterProject(req(p, 'id')),
    create: p => service.create(p),
    import: p => service.importSource(p),
    load: p => service.load(p.project),
    status: p => service.status(p.project),
    apply: p => service.apply(p.project, p.ops, { actor: 'user', reason: p.reason, expectRevision: p.expectRevision }),
    lint: p => service.lint(p.project),
    export: p => service.exportHtml(p.project).then(file => ({ file })),
    sync: p => service.sync(p.project, { dryRun: p.dryRun === true }),
    baseline: p => service.advanceBaseline(p.project, { force: p.force === true, actor: 'user' }),
    codeStatus: p => service.codeStatus(p.project),
    configGet: () => ({ config: service.config, defaults: DEFAULT_CONFIG, registryFile: service.registryFile }),
    configSet: async (p) => {
      const entry = root.fiber?.entry
      const editor = root.get?.('configEditor')
      if (entry === undefined || editor === undefined) throw new OpError('当前配置档不支持保存插件配置')
      const patch = {}
      for (const k of Object.keys(DEFAULT_CONFIG)) if (p.config?.[k] !== undefined) patch[k] = p.config[k]
      await editor.edit(entry, current => ({ ...(current ?? {}), ...patch }))
      return { saved: Object.keys(patch) }
    },
  }
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection')
    for (const [endpoint, handler] of Object.entries(handlers)) {
      const method = ROUTE_PREFIX + endpoint
      c.effect(() => connection.fetch.register({
        path: `/api/${method}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body
          try { body = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
          const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
          let result
          try {
            result = { ok: true, value: await handler(body?.payload ?? {}) }
          } catch (error) {
            const known = error instanceof OpError
            if (!known) ctx.logger?.warn?.('prd-dev-view %s failed: %s', endpoint, error?.stack ?? error)
            result = { ok: false, error: { code: known ? 'bad-request' : 'internal', message: error?.message ?? String(error), details: {} } }
          }
          return Response.json({ type: 'server-response', rpcId, result })
        },
      }), `prd-dev-view: /api/${method}`)
    }
  })
}

function req(p, key) {
  if (!p || typeof p[key] !== 'string' || !p[key]) throw new OpError(`缺少参数 ${key}`)
  return p[key]
}

// ---------------------------------------------------------------- 工具

const textOutput = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }

function json(value) { return JSON.stringify(value, null, 1) }

function compactItem(data, derived, id) {
  const f = data.features.find(x => x.id === id)
  if (f) return { ...f, qs: derived.featureQs[id], adj: derived.featureAdj[id], mods: derived.featureMods[id], hasCard: Boolean(data.cards[id]) }
  const q = data.issues.find(x => x.id === id)
  if (q) return { ...q, progressLabel: LABELS.issueProgress[q.progress], history: q.history.slice(-5), blocksAdjustments: derived.issueAdj[id] }
  const a = data.adjustments.find(x => x.id === id)
  if (a) return { ...a, progressLabel: LABELS.adjProgress[a.progress], history: a.history.slice(-5), openBlockers: derived.blockedBy[id] }
  for (const key of ['rules', 'modules', 'objects']) { const x = data[key].find(y => y.id === id); if (x) return x }
  return undefined
}

function registerTools(ctx, service, sessions, generation) {
  /** 读操作：指明的视图或本对话绑定的视图。 */
  const readTarget = (a, b) => {
    const ref = a.project || b?.project
    if (!ref) throw new OpError('本对话未绑定研发视图。请用户在会话头部右侧的「研发视图」选择器绑定，或在研发视图页签新建；只读查询可用 project 指明视图。')
    return ref
  }
  /** 写操作：只能作用于本对话绑定的视图。 */
  const writeTarget = async (a, b) => {
    if (!b?.project) throw new OpError('本对话未绑定研发视图，不能修改。只有绑定了研发视图的对话才能修改它；如需修改，请用户在会话头部右侧的「研发视图」选择器绑定这份视图。')
    if (a.project) {
      const want = await service.resolveProject(a.project)
      if (want.id !== b.project.id) throw new OpError(`本对话绑定的是「${b.project.title}」(${b.project.id})，不能修改其他研发视图「${want.title}」。`)
    }
    return b.project
  }
  const viewTool = {
    name: 'prd_view',
    description: 'PRD 研发视图的查询与维护：查看本对话绑定的视图与可选视图、查看总清单或条目、数据检查、代码同步、导入旧版 HTML/JSON、导出只读 HTML。每个对话只负责一份研发视图（用户在会话头部右侧选择或在研发视图页签新建，模型不能自行绑定）；修改类操作只作用于本对话绑定的视图。研发视图的数据只能通过本工具和 prd_view_edit 修改。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['projects', 'summary', 'items', 'card', 'lint', 'sync', 'baseline', 'import', 'export', 'generation'],
          description: 'projects 查看本对话绑定的视图与可选视图；summary 返回计数与未完成清单；items 返回指定编号的完整内容；card 返回某功能的完整卡片；lint 数据检查；sync 比对代码基线并把证据命中的条目标为待复核；baseline 复核完成后把基线推进到当前提交；import 导入；export 重新生成只读 HTML；generation 查询或上报内容生成阶段（phase），总量只用已确定的功能计划。',
        },
        project: { type: 'string', description: '视图编号、数据文件绝对路径或标题；省略时使用本对话绑定的视图' },
        ids: { type: 'array', items: { type: 'string' }, description: 'items 用：功能/问题/调整/规则/模块编号' },
        feature: { type: 'string', description: 'card 用：功能编号' },
        filter: { type: 'string', enum: ['open', 'closed', 'all', 'review', 'block'], description: 'summary 用，默认 open' },
        source: { type: 'string', description: 'import 用：旧版 HTML 或 JSON 的绝对路径' },
        dataFile: { type: 'string', description: 'import 用（必填）：目标 .prdview.json 绝对路径；已存在的文件只能是本对话绑定的视图' },
        repo: { type: 'string', description: 'import 用：代码仓库绝对路径' },
        branch: { type: 'string', description: 'import 用：代码分支说明' },
        dryRun: { type: 'boolean', description: 'sync 用：只报告不标记' },
        phase: { type: 'string', enum: ['reading', 'code', 'cards', 'checking', 'complete', 'failed', 'interrupted'], description: 'generation 用：上报真实生成阶段；省略则查询。complete 需卡片完整且 lint 无错误。' },
        detail: { type: 'string', description: 'generation 用：当前实际工作说明，不虚构进度。' },
        featureIds: { type: 'array', items: { type: 'string' }, description: 'generation 用：已确定的完整功能计划；未确定时省略，不猜总量。' },
        completedFeatureIds: { type: 'array', items: { type: 'string' }, description: 'generation 用：本批已保存并确认完整的功能卡片编号，累计去重。' },
        error: { type: 'string', description: 'generation 失败或中断原因。' },
      },
      required: ['action'],
    },
    output: textOutput,
    async execute(args, exec) {
      const a = args ?? {}
      const agent = exec?.agent
      const b = await sessions.bindingOfAgent(agent)
      switch (a.action) {
        case 'projects': return json(b ? sessions.brief(b) : await service.listProjects())
        case 'generation': {
          if (!a.phase) return json(await generation.get(await service.resolveProject(readTarget(a, b))))
          const project = await writeTarget(a, b)
          return json(await generation.report(project, agent.id, { phase: a.phase, detail: a.detail, featureIds: a.featureIds, completedFeatureIds: a.completedFeatureIds, error: a.error }))
        }

        case 'summary': {
          const { project, data, derived, prdFile, prdAssets } = await service.load(readTarget(a, b))
          const filter = a.filter ?? 'open'
          const rows = derived.rows.filter(r => filter === 'all' ? true
            : filter === 'closed' ? r.closed
              : filter === 'review' ? r.review
                : filter === 'block' ? (r.sev === 'block' && !r.closed)
                  : !r.closed)
          return json({
            project: project.id, title: data.meta.title, revision: data.revision, baseline: data.meta.baseline ?? null,
            prdFile: prdFile && existsSync(prdFile) ? prdFile : (prdFile ? `PRD 文档不存在：${prdFile}（请用户在研发视图页签总览中重新关联）` : '未关联 PRD 文档（请用户在研发视图页签总览中关联）'),
            prdImages: prdAssets ? `${prdAssets}（PRD 中的图片链接已指向这里，需要看图时用读图工具打开）` : undefined,
            counts: derived.counts, filter,
            rows: rows.map(r => [r.id, r.title, r.kind === 'issue' ? `${r.type}/${r.sev}` : r.nature, r.progress, r.features.join(','), r.review ? '待复核' : ''].join(' | ')),
            featuresWithReview: data.features.filter(f => f.review?.state === 'pending').map(f => f.id),
          })
        }
        case 'items': {
          const { data, derived } = await service.load(readTarget(a, b))
          const ids = a.ids ?? []
          if (!ids.length) throw new OpError('items 需要 ids')
          return json(Object.fromEntries(ids.map(id => [id, compactItem(data, derived, id) ?? '不存在'])))
        }
        case 'card': {
          const { data } = await service.load(readTarget(a, b))
          if (!a.feature) throw new OpError('card 需要 feature')
          return json(data.cards[a.feature] ?? '该功能还没有完整卡片')
        }
        case 'lint': return json(await service.lint(readTarget(a, b)))
        case 'sync': return json(await service.sync(a.dryRun === true ? readTarget(a, b) : await writeTarget(a, b), { dryRun: a.dryRun === true }))
        case 'baseline': return json(await service.advanceBaseline(await writeTarget(a, b), { actor: 'model' }))
        case 'import': {
          // Model imports fill the user-created bound view; file absence is not
          // permission to create another view outside this conversation's scope.
          const own = await writeTarget(a, b)
          const target = a.dataFile && path.isAbsolute(a.dataFile) ? path.resolve(a.dataFile) : undefined
          if (!target) throw new OpError(`请用 dataFile 指明绑定视图的绝对路径：${own.dataFile}`)
          if (path.resolve(own.dataFile).toLowerCase() !== target.toLowerCase()) throw new OpError(`本对话绑定的是「${own.title}」，不能导入覆盖或新建其他研发视图。`)
          return json(await service.importSource({ source: a.source, dataFile: own.dataFile, repo: a.repo, branch: a.branch }))
        }
        case 'export': return json({ file: await service.exportHtml(await writeTarget(a, b)) })
        default: throw new OpError(`未知 action ${a.action}`)
      }
    },
  }

  const editTool = {
    name: 'prd_view_edit',
    description: '修改本对话绑定的 PRD 研发视图数据（只有绑定了研发视图的对话才提供本工具）。一批操作整体生效或整体拒绝；条目不能删除，完成项用 progress 关闭并保留。关联只需改一处，功能侧的问题/调整/模块列表、计数、卡片引用会自动连带更新。保存后自动检查并重新导出 HTML，返回变更回执。',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: '可省略，默认本对话绑定的视图；指明其他视图会被拒绝' },
        reason: { type: 'string', description: '本批修改的原因，写进变更历史' },
        ops: {
          type: 'array',
          description: [
            '操作列表，kind 取 feature / issue / adjustment / rule / module / object：',
            '{op:"progress",kind:"issue"|"adjustment",id,to,reason,commit?,answer?,by?} 改进度；问题 open/answered/resolved/wontfix/superseded，改造 todo/doing/done/verified/dropped/superseded；关闭时 reason 必填，superseded 需 by；',
            '{op:"set",kind,id,fields:{...}} 改普通字段（不含进度、关联、证据）；kind 为 meta 时改 PRD 信息（标题、分支、说明等；托管的 PRD 文档不能改）；',
            '{op:"link"|"unlink",kind,id,field?,target} 改关联，field 默认 features，改造的前置问题用 blocked；',
            '{op:"add",kind,item} 新增条目（问题/改造编号可省略自动分配）；',
            '{op:"card",feature,patch:{stages|pre|rules|steps|stepCode|adj|qs|compat|related|title|lead|banner|meta|note|codeNote}} 改完整卡片的栏目；',
            '{op:"evidence",kind,id,evidence:[{path,symbol?,lines?}]} 设置代码证据锚点；',
            '{op:"review",kind,id,note} 复核代码变化后确认结论。',
          ].join(''),
          items: { type: 'object' },
        },
      },
      required: ['ops'],
    },
    output: textOutput,
    async execute(args, exec) {
      const b = await sessions.bindingOfAgent(exec?.agent)
      const target = await writeTarget(args ?? {}, b)
      const result = await service.apply(target, args?.ops, { actor: 'model', reason: args?.reason })
      return json(result)
    },
  }

  // 编辑工具只在绑定了研发视图的对话中提供：其他对话看不到，也就不会去改。
  const isBound = async ({ agent }) => {
    try { return Boolean((await sessions.bindingOfAgent(agent))?.project) } catch { return false }
  }

  ctx.inject(['tools'], (c) => {
    c.tools.register(viewTool)
    c.tools.register(editTool, { when: isBound })
    c.tools.guard((exec) => {
      if (!service.config.guardFiles) return undefined
      for (const target of filePathsOf(exec, sessions.cwdOf)) {
        const abs = path.resolve(target).toLowerCase()
        if (abs.endsWith('.prdview.json') || service.protectedPaths().includes(abs)) {
          return `这是 PRD 研发视图的数据文件或生成的 HTML，不能直接修改。请用 prd_view_edit 修改数据（完成项用 progress 关闭，不要删除），HTML 会自动重新生成。`
        }
        if (service.isManagedPrd(abs)) {
          return `这是研发视图托管的 PRD 文档或其图片，是业务原文，不能直接修改。PRD 有新版本时请用户在研发视图页签「总览」中「从原文件更新」或更换 PRD 文档。`
        }
      }
      return undefined
    })
  })

  // 改代码时提醒同步：只提醒绑定了该视图的对话；每个 agent 每个项目提醒一次，直到同步过。
  const reminded = new Map()
  ctx.on('tools/result', async (exec, result) => {
    try {
      if (!service.config.codeChangeReminder) return
      if (!WRITE_TOOLS.has(exec?.name) || result?.kind === 'error' || result?.isError) return
      const target = filePathOf(exec, sessions.cwdOf)
      if (!target || !exec.agent) return
      const bound = (await sessions.bindingOfAgent(exec.agent))?.project
      if (!bound) return
      const projects = service.projectsForFile(target).filter(p => p.id === bound.id)
      if (!projects.length) return
      let seen = reminded.get(exec.agent)
      if (!seen) { seen = new Set(); reminded.set(exec.agent, seen) }
      for (const p of projects) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        const text = `[PRD 研发视图] 刚修改的文件属于「${p.title}」(${p.id}) 登记的代码仓库。完成这批代码修改后，请调用 prd_view action=sync 找出受影响的冲突与改造项，逐条复核并用 prd_view_edit 更新进度（完成项标记完成，不要删除）。`
        exec.agent.inject?.({
          id: randomUUID(), role: 'user', content: [{ type: 'text', text }],
          source: { kind: 'prd-dev-view', form: 'notice', summary: `研发视图「${p.title}」可能需要同步` },
        })
      }
    } catch (error) {
      ctx.logger?.warn?.('prd-dev-view reminder failed: %s', error?.message ?? error)
    }
  })
  ctx.effect(() => service.onChange(() => reminded.clear()), 'prd-dev-view: reset reminders')
}

const WRITE_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'apply_patch', 'create_file'])

/** 写类工具要改的文件（绝对路径）；相对路径按对话工作目录解析，apply_patch 解析补丁里的文件头。 */
function filePathsOf(exec, cwdOf) {
  if (!exec || !WRITE_TOOLS.has(exec.name)) return []
  const a = exec.arguments ?? {}
  const raw = []
  for (const k of ['file_path', 'path', 'filePath']) if (typeof a[k] === 'string') raw.push(a[k])
  const patch = typeof a.patch === 'string' ? a.patch : typeof a.input === 'string' ? a.input : ''
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) raw.push(m[1].trim())
  for (const m of patch.matchAll(/^\*\*\* Move to:\s*(.+)$/gm)) raw.push(m[1].trim())
  for (const m of patch.matchAll(/^(?:\+\+\+|---) (?:[ab]\/)?(\S.*)$/gm)) if (m[1] !== '/dev/null') raw.push(m[1].trim())
  let cwd
  const out = []
  for (const p of raw) {
    if (path.isAbsolute(p)) { out.push(p); continue }
    if (cwd === undefined) cwd = cwdOf?.(exec.agent) ?? null
    if (cwd) out.push(path.resolve(cwd, p))
  }
  return out
}

function filePathOf(exec, cwdOf) { return filePathsOf(exec, cwdOf)[0] }
