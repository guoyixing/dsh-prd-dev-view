/**
 * 唯一的操作实现：项目登记、读取、编辑、检查、导入、导出、代码同步。
 * 页签界面（经 HTTP 路由）和模型工具调用的是同一组方法。
 */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  applyOps, assertNothingRemoved, derive, emptyData, lint, markReview, matchEvidence, normalize, OpError, SCHEMA,
} from './model.js'
import { fromLegacy, isGeneratedHtml, readLegacyConstants, renderLegacyHtml } from './legacy.js'
import { inspectPrd, planPrd, rollbackFailure, samePrd, summarize, writePrd } from './prd-doc.js'

const TEMPLATE_URL = new URL('../assets/template/snapshot-template.html', import.meta.url)
/** 项目内研发视图目录，相对项目根目录。 */
export const DEFAULT_VIEWS_DIR = '.dsh/prd-views'

export const DEFAULT_CONFIG = {
  autoExport: true,
  guardFiles: true,
  codeChangeReminder: true,
  gitPath: 'git',
  registryDir: '',
  viewsDir: DEFAULT_VIEWS_DIR,
}

export class PrdViewService {
  constructor(config, logger) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) }
    this.logger = logger
    this.cache = new Map() // dataFile -> { mtimeMs, data }
    this.locks = new Map()
    this.codeCache = new Map()
    this.listeners = new Set()
    this.prdBusy = new Set()
  }

  get registryFile() {
    const base = this.config.registryDir || path.join(process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh'), 'prd-dev-view')
    return path.join(base, 'projects.json')
  }

  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  emit(project) { this.viewCache = null; for (const l of this.listeners) { try { l(project) } catch { /* 监听失败不影响操作 */ } } }

  // ---------------------------------------------------------------- 登记

  async readRegistry() {
    try {
      const raw = JSON.parse(await fs.readFile(this.registryFile, 'utf8'))
      return { projects: Array.isArray(raw.projects) ? raw.projects : [], lastUsed: raw.lastUsed }
    } catch {
      return { projects: [], lastUsed: undefined }
    }
  }

  async writeRegistry(reg) {
    await fs.mkdir(path.dirname(this.registryFile), { recursive: true })
    await atomicWrite(this.registryFile, JSON.stringify(reg, null, 2))
  }

  async listProjects() {
    const reg = await this.readRegistry()
    const out = []
    for (const p of reg.projects) {
      let info = { exists: existsSync(p.dataFile) }
      if (info.exists) {
        try {
          const data = await this.readData(p.dataFile)
          const d = derive(data)
          info = { ...info, title: data.meta.title, revision: data.revision, updatedAt: data.updatedAt, counts: d.counts, baseline: data.meta.baseline, prdFile: prdPathOf(p.dataFile, data) }
        } catch (error) {
          info = { ...info, error: error.message }
        }
      }
      out.push({ ...p, ...info, title: info.title ?? p.title })
    }
    return { projects: out, lastUsed: reg.lastUsed, registryFile: this.registryFile }
  }

  /**
   * 按编号、数据文件路径或标题找到研发视图：先查全局登记，再查项目目录 .dsh/prd-views 中发现的视图。
   * 不再有全局"最近使用"兜底：省略 ref 时由调用方传入本对话绑定的视图。
   */
  async resolveProject(ref) {
    if (ref && typeof ref === 'object') return ref
    if (!ref) throw new OpError('没有指明研发视图。本对话未绑定研发视图时请在研发视图页签绑定或新建，或用 project 指明。')
    const reg = await this.readRegistry()
    const views = await this.knownProjectViews()
    const all = [...reg.projects, ...views]
    const abs = path.isAbsolute(ref) ? path.resolve(ref) : undefined
    const project = all.find(p => p.id === ref)
      ?? (abs && all.find(p => samePath(p.dataFile, abs) || samePath(p.htmlFile, abs)))
      ?? all.find(p => p.title === ref)
    if (!project) throw new OpError(`找不到研发视图 "${ref}"。可用：${all.map(p => `${p.id}（${p.title}）`).join('、') || '无'}`)
    return project
  }

  // ---------------------------------------------------------------- 项目目录中的视图（默认 .dsh/prd-views，可在设置中修改）

  /** 新建视图的默认位置：相对项目根目录的路径，或绝对路径。 */
  get viewsRel() {
    const raw = String(this.config.viewsDir || '').trim().replace(/[\\/]+$/, '')
    if (!raw) return DEFAULT_VIEWS_DIR
    return path.isAbsolute(raw) ? path.resolve(raw) : path.normalize(raw).split(path.sep).join('/')
  }

  /** 从工作目录向上找项目根目录（含视图目录或 .git 的目录）与视图目录。 */
  locateViews(cwd) {
    if (!cwd) return undefined
    const rel = this.viewsRel
    const absViews = path.isAbsolute(rel) ? path.resolve(rel) : undefined
    let dir = path.resolve(cwd)
    for (;;) {
      const views = absViews ?? path.join(dir, rel)
      if (!absViews && existsSync(views)) return { root: dir, viewsDir: views, exists: true }
      if (existsSync(path.join(dir, '.git'))) return { root: dir, viewsDir: views, exists: existsSync(views) }
      const up = path.dirname(dir)
      if (up === dir) break
      dir = up
    }
    const root = path.resolve(cwd)
    const views = absViews ?? path.join(root, rel)
    return { root, viewsDir: views, exists: existsSync(views) }
  }

  /** 列出项目视图目录中的视图（目录下或其一级子目录中的 .prdview.json），按路径排序。 */
  async discoverViews(cwd) {
    const loc = this.locateViews(cwd)
    if (!loc?.exists) return { ...loc, views: [] }
    const files = []
    for (const entry of await fs.readdir(loc.viewsDir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(loc.viewsDir, entry.name)
      if (entry.isFile() && entry.name.endsWith('.prdview.json')) files.push(full)
      else if (entry.isDirectory()) {
        for (const sub of await fs.readdir(full).catch(() => [])) if (sub.endsWith('.prdview.json')) files.push(path.join(full, sub))
      }
    }
    files.sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
    const views = []
    for (const dataFile of files) views.push(await this.projectViewEntry(dataFile, loc.root, { light: true }))
    await this.rememberViews(views)
    return { ...loc, views }
  }

  async projectViewEntry(dataFile, root, { light = false } = {}) {
    let title = path.basename(dataFile, '.prdview.json'), error, counts, prdFile
    let htmlFile = defaultHtmlPath(dataFile, undefined)
    try {
      const data = await this.readData(dataFile)
      title = data.meta.title || title
      htmlFile = defaultHtmlPath(dataFile, data)
      prdFile = prdPathOf(dataFile, data)
      if (!light) counts = derive(data).counts
    } catch (e) { error = e.message }
    return stripUndefined({
      id: projectId(dataFile), title, dataFile, htmlFile, prdFile, repo: root, scope: 'project',
      relPath: path.relative(root, dataFile).split(path.sep).join('/'), error, counts,
    })
  }

  /** 发现过的项目视图记在本机状态里，重启后仍能按编号找到。 */
  async rememberViews(views) {
    if (!views.length) return
    const state = await this.readState()
    let changed = false
    for (const v of views) {
      const prev = state.views[v.id]
      if (!prev || !samePath(prev.dataFile, v.dataFile) || !samePath(prev.root, v.repo)) { state.views[v.id] = { dataFile: v.dataFile, root: v.repo }; changed = true }
    }
    if (changed) { await this.writeState(state); this.viewCache = null }
  }

  async knownProjectViews() {
    if (this.viewCache) return this.viewCache
    const state = await this.readState()
    const out = []
    for (const v of Object.values(state.views)) {
      if (!v?.dataFile || !existsSync(v.dataFile)) continue
      out.push(await this.projectViewEntry(v.dataFile, v.root, { light: true }))
    }
    this.viewCache = out
    return out
  }

  /** 数据文件是否在项目视图目录内；是则返回项目根目录。 */
  projectRootOf(dataFile) {
    const target = path.resolve(dataFile)
    const rel = this.viewsRel
    if (path.isAbsolute(rel)) {
      if (!isInside(target, path.resolve(rel))) return undefined
      return this.locateViews(path.dirname(target))?.root
    }
    // 数据文件在 <根>/<rel>/ 或 <根>/<rel>/<子目录>/ 下
    for (const dir of [path.dirname(target), path.dirname(path.dirname(target))]) {
      const tail = path.normalize(rel)
      if (dir.toLowerCase().endsWith(path.sep + tail.toLowerCase())) return dir.slice(0, dir.length - tail.length - 1) || path.sep
    }
    return undefined
  }

  // ---------------------------------------------------------------- PRD 文档托管

  /** 新建前预检：读取 PRD，列出图片、缺失与网络图片。 */
  async inspectPrd(prdPath, options) { return summarize(await inspectPrd(prdPath, options)) }

  /** 创建任务在检查前固定目标；重试不受工作目录发现结果变化影响。 */
  creationTarget({ cwd, title, location }) {
    const name = String(title ?? '').trim()
    if (!name) throw new OpError('请填写视图名称')
    if (/^\.+$/.test(safeName(name))) throw new OpError('视图名称不能只由点号组成')
    const loc = this.locateViews(cwd)
    if (!loc && !(location && path.isAbsolute(location))) throw new OpError('当前对话没有工作目录，无法确定项目位置；请填写绝对路径作为保存位置')
    const base = location && String(location).trim()
      ? (path.isAbsolute(location) ? path.resolve(location) : path.resolve(loc.root, String(location).trim()))
      : loc.viewsDir
    const viewDir = path.join(base, safeName(name))
    return { name, root: loc?.root, viewDir, dataFile: path.join(viewDir, `${safeName(name)}.prdview.json`) }
  }

  /**
   * 新建一份视图：<位置>/<名称>/ 下写数据文件，并把 PRD 文档与引用的图片复制进来统一管理。
   * 位置默认是项目视图目录；放在项目视图目录以外时登记到本机，便于绑定。
   */
  async createInProject({ cwd, title, branch, location, prdPath, taskId, onProgress }, options = {}) {
    onProgress = options.onProgress ?? onProgress
    const { name, root: repo, viewDir, dataFile } = this.creationTarget({ cwd, title, location })
    const key = dataFile.toLowerCase()
    if (this.prdBusy.has(key)) throw new OpError('正在创建同名视图，请稍候')
    this.prdBusy.add(key)
    try {
      let info, summary
      if (existsSync(dataFile)) {
        const existing = await this.readData(dataFile)
        if (!taskId || existing.meta.creationTaskId !== taskId) throw new OpError(`已存在同名视图：${dataFile}`)
        // 保存已成功而任务检查点尚未落盘：只恢复登记，不重新复制或覆盖。
        await onProgress?.({ stage: 'save' })
      } else {
        info = await inspectPrd(prdPath, { onProgress })
        summary = summarize(info)
        await fs.mkdir(viewDir, { recursive: true })
        const plan = planPrd(info)
        const ownership = await reserveCreation(viewDir, taskId, plan)
        let staged
        try {
          staged = await writePrd({ dir: viewDir, plan, info, oldMeta: ownership, isProtected: p => this.isProtectedFile(p), onProgress })
        } catch (error) {
          if (taskId && !ownership && !error.rollbackFailed) await releaseCreation(viewDir, taskId)
          throw error
        }
        try {
          await onProgress?.({ stage: 'save' })
          await this.writeData(dataFile, emptyData({ title: name, branch, prd: staged.meta, ...(taskId ? { creationTaskId: taskId } : {}) }))
        } catch (error) {
          // 写入可能已经成功、后续 stat 却失败；不能把有效元数据引用的 PRD 回滚掉。
          if (!existsSync(dataFile)) {
            try {
              await staged.rollback()
              // A clean rollback releases only this task's reservation; failed rollback keeps recovery ownership.
              if (taskId && !ownership) await releaseCreation(viewDir, taskId)
            } catch (rollbackError) { throw rollbackFailure(error, rollbackError) }
          }
          throw new OpError(`保存视图失败：${error.message}；请检查目标文件，未删除视图目录`)
        }
        await staged.commit()
      }
      if (taskId) await releaseCreation(viewDir, taskId)
      const root = this.projectRootOf(dataFile)
      let entry
      if (root) {
        entry = await this.projectViewEntry(dataFile, root)
        await this.rememberViews([entry])
      } else {
        const reg = await this.registerProject({ dataFile, repo })
        entry = { ...reg, scope: 'registered', prdFile: prdPathOf(dataFile, await this.readData(dataFile)) }
      }
      await this.rememberPrdSource(entry.id, info?.source ?? prdPath)
      await this.refreshProtected()
      this.emit(entry.id)
      return { ...entry, ...(summary ? { prd: summary } : {}) }
    } finally {
      this.prdBusy.delete(key)
    }
  }

  /**
   * 关联、更换或从原文件更新 PRD 文档。prdPath 省略时使用本机记住的原文件位置。
   * 先写新文件并更新元数据，成功后才移除旧的托管文件。
   */
  async setPrd(ref, prdPath) {
    const project = await this.resolveProject(ref)
    const remembered = (await this.readState()).prdSources?.[project.id]
    const src = prdPath ? prdPath : remembered
    if (!src) throw new OpError('没有记录 PRD 原文件位置，请填写 PRD 文档路径')
    if (this.prdBusy.has(project.dataFile)) throw new OpError('正在更新 PRD 文档，请稍后再试')
    this.prdBusy.add(project.dataFile)
    try {
      const info = await inspectPrd(src)
      const dir = path.dirname(project.dataFile)
      const data = await this.readData(project.dataFile)
      const oldMeta = data.meta.prd ?? null
      const verb = !oldMeta ? '关联' : (oldMeta.source === info.name ? '更新' : '更换')
      const plan = planPrd(info)
      const mdPath = path.join(dir, plan.mdName)
      // 文件名、图片目录、正文和图片都没变，且文件还在：什么都不做
      if (samePrd(plan, oldMeta) && existsSync(mdPath)) {
        await this.rememberPrdSource(project.id, info.source)
        return { project: project.id, revision: data.revision, changes: [], unchanged: true, verb, prdFile: mdPath, prd: summarize(info) }
      }
      const staged = await writePrd({ dir, plan, info, oldMeta, isProtected: p => this.isProtectedFile(p) })
      let result
      try {
        result = await this.apply(project, [{ op: 'set', kind: 'meta', fields: { prd: staged.meta } }],
          { actor: 'prd-manager', reason: `${verb} PRD 文档：${staged.meta.file}${plan.files.length ? `（含 ${plan.files.length} 张图片）` : ''}` })
      } catch (error) {
        await staged.rollback()
        throw error
      }
      await staged.commit()
      await this.rememberPrdSource(project.id, info.source)
      await this.refreshProtected()
      return { ...result, unchanged: false, verb, prdFile: staged.mdPath, prd: summarize(info) }
    } finally {
      this.prdBusy.delete(project.dataFile)
    }
  }

  /** 本机记住 PRD 原文件位置（不写进项目文件）。 */
  async rememberPrdSource(id, source) {
    const state = await this.readState()
    state.prdSources = state.prdSources ?? {}
    if (state.prdSources[id] === source) return
    state.prdSources[id] = source
    await this.writeState(state)
  }

  async prdSourceOf(id) {
    const src = (await this.readState()).prdSources?.[id]
    return src ? { path: src, exists: existsSync(src) } : null
  }

  isProtectedFile(p) {
    const abs = path.resolve(p).toLowerCase()
    return this.protectedPaths().includes(abs)
  }


  // ---------------------------------------------------------------- 对话绑定（本机状态，不进项目仓库）

  get stateFile() { return path.join(path.dirname(this.registryFile), 'sessions.json') }

  async readState() {
    if (this.stateMem) return this.stateMem
    // 启动保护路径刷新与首个绑定请求会并发进入；只能初始化一次，否则后到的读会覆盖刚写的绑定。
    if (!this.stateLoading) this.stateLoading = (async () => {
      let state
      try {
        const raw = JSON.parse(await fs.readFile(this.stateFile, 'utf8'))
        const obj = v => (v && typeof v === 'object' ? v : {})
        state = { sessions: obj(raw.sessions), views: obj(raw.views), prdSources: obj(raw.prdSources) }
      } catch {
        state = { sessions: {}, views: {}, prdSources: {} }
      }
      this.stateMem ??= state
      return this.stateMem
    })()
    return this.stateLoading
  }

  async writeState(state) {
    this.stateMem = state
    const write = (this.stateWrites ?? Promise.resolve()).then(async () => {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true })
      // 在队列执行时取最新共享状态，不能让先排队的旧快照覆盖后来的对话绑定。
      await atomicWrite(this.stateFile, JSON.stringify(this.stateMem, null, 1))
    })
    this.stateWrites = write.catch(() => {})
    return write
  }

  /**
   * 本对话的绑定：明确选择（含"无"）优先；没有选择过时，默认绑定项目 .dsh/prd-views 中的第一份。
   * @returns {{ project, source: 'explicit'|'default'|'none'|'missing', root, viewsDir, cwd, candidates }}
   */
  async bindingFor(sessionId, cwd) {
    if (!sessionId) throw new OpError('缺少对话编号')
    const state = await this.readState()
    let rec = state.sessions[sessionId] ?? {}
    const where = cwd ?? rec.cwd
    if (cwd && rec.cwd !== cwd) { state.sessions[sessionId] = { ...rec, cwd }; await this.writeState(state) }
    const found = where ? await this.discoverViews(where) : { views: [] }
    const reg = await this.readRegistry()
    const registered = reg.projects.filter(p => p.dataFile && existsSync(p.dataFile)).map(p => ({ ...p, scope: 'registered' }))
    const candidates = [...found.views, ...registered.filter(p => !found.views.some(v => v.id === p.id))]
    const known = await this.knownProjectViews()
    rec = state.sessions[sessionId] ?? {}
    // 没选择过时默认绑定项目里的第一份，并记下来：之后新增或删除视图不会让对话悄悄换绑
    if (!Object.prototype.hasOwnProperty.call(rec, 'project') && found.views.length) {
      rec.project = found.views[0].id
      rec.auto = true
      state.sessions[sessionId] = { ...state.sessions[sessionId], ...rec, ...(where ? { cwd: where } : {}) }
      await this.writeState(state)
    }
    rec = state.sessions[sessionId] ?? {}
    let project = null, source = 'none'
    if (rec.project) {
      project = candidates.find(p => p.id === rec.project) ?? known.find(p => p.id === rec.project) ?? null
      source = project ? (rec.auto ? 'default' : 'explicit') : 'missing'
      // 绑定的视图不在当前候选里（例如对话换了工作目录）也要能在选择器里显示
      if (project && !candidates.some(p => p.id === project.id)) candidates.push(project)
    }
    return { project, source, bindingToken: bindingToken(state.sessions[sessionId]), missingId: source === 'missing' ? rec.project : undefined, root: found.root, viewsDir: found.viewsDir, viewsRel: this.viewsRel, viewsExist: Boolean(found.exists), cwd: where ?? null, candidates }
  }

  /** 设置本对话的绑定；projectRef 为 null 表示明确选择"无"。 */
  async setBinding(sessionId, projectRef, cwd, { expectedBindingToken } = {}) {
    if (!sessionId) throw new OpError('缺少对话编号')
    let id = null
    if (projectRef) {
      if (cwd) await this.discoverViews(cwd)
      id = (await this.resolveProject(projectRef)).id
    }
    const state = await this.readState()
    const rec = state.sessions[sessionId] ?? {}
    if (expectedBindingToken !== undefined && bindingToken(rec) !== expectedBindingToken) {
      if (rec.project === id) return this.bindingFor(sessionId, cwd)
      throw new OpError('绑定已变化，未覆盖用户选择；请在已有视图列表明确绑定后重试')
    }
    const { auto, ...keep } = rec
    void auto
    state.sessions[sessionId] = { ...keep, ...(cwd ? { cwd } : {}), project: id, at: new Date().toISOString(), bindingRevision: randomUUID() }
    await this.writeState(state)
    return this.bindingFor(sessionId, cwd)
  }

  /** 已绑定到某视图的对话（供代码改动提醒判断）。 */
  async boundProjectId(sessionId, cwd) {
    const b = await this.bindingFor(sessionId, cwd)
    return b.project?.id ?? null
  }

  async registerProject({ dataFile, htmlFile, repo, title }) {
    if (!dataFile || !path.isAbsolute(dataFile)) throw new OpError('dataFile 必须是绝对路径')
    dataFile = path.resolve(dataFile)
    if (!dataFile.endsWith('.prdview.json')) throw new OpError('数据文件名必须以 .prdview.json 结尾')
    if (!existsSync(dataFile)) throw new OpError(`数据文件不存在：${dataFile}`)
    const data = await this.readData(dataFile)
    const reg = await this.readRegistry()
    const id = projectId(dataFile)
    const entry = {
      id,
      title: title ?? data.meta.title,
      dataFile,
      htmlFile: htmlFile ? path.resolve(htmlFile) : defaultHtmlPath(dataFile, data),
      repo: repo ? path.resolve(repo) : (data.meta.repo ? path.resolve(data.meta.repo) : undefined),
      addedAt: new Date().toISOString(),
    }
    const existing = reg.projects.findIndex(p => p.id === id)
    if (existing >= 0) reg.projects[existing] = { ...reg.projects[existing], ...stripUndefined(entry), addedAt: reg.projects[existing].addedAt }
    else reg.projects.push(entry)
    reg.lastUsed = id
    await this.writeRegistry(reg)
    this.emit(id)
    return reg.projects.find(p => p.id === id)
  }

  async updateProject(id, patch) {
    const reg = await this.readRegistry()
    const p = reg.projects.find(x => x.id === id)
    if (!p) throw new OpError(`找不到研发视图 ${id}`)
    for (const k of ['title', 'htmlFile', 'repo']) {
      if (patch[k] === undefined) continue
      p[k] = patch[k] === '' ? undefined : (k === 'title' ? patch[k] : path.resolve(patch[k]))
    }
    await this.writeRegistry(reg)
    this.emit(id)
    return p
  }

  async unregisterProject(id) {
    const reg = await this.readRegistry()
    const before = reg.projects.length
    reg.projects = reg.projects.filter(p => p.id !== id)
    if (reg.projects.length === before) throw new OpError(`找不到研发视图 ${id}`)
    if (reg.lastUsed === id) reg.lastUsed = reg.projects[0]?.id
    await this.writeRegistry(reg)
    this.emit(id)
    return { removed: id, note: '只取消登记，数据文件与 HTML 保留在原处' }
  }

  /** 路径是否属于某个登记的数据文件或生成的 HTML（供守卫使用，同步读取缓存）。 */
  protectedPaths() { return this.protectedCache ?? [] }
  protectedPrds() { return this.prdCache ?? [] }
  /** 托管的 PRD 文档或其图片目录中的文件。 */
  isManagedPrd(file) {
    const abs = path.resolve(file).toLowerCase()
    return this.protectedPrds().includes(abs) || (this.assetsCache ?? []).some(d => abs.startsWith(d + path.sep))
  }

  async refreshProtected() {
    const reg = await this.readRegistry()
    const all = [...reg.projects, ...await this.knownProjectViews()]
    this.protectedCache = all.flatMap(p => [p.dataFile, p.htmlFile].filter(Boolean).map(x => path.resolve(x).toLowerCase()))
    // 托管的 PRD 文档：只能在研发视图页签更换
    const prds = [], assets = []
    for (const p of all) {
      if (!p.dataFile || !existsSync(p.dataFile)) continue
      const data = await this.readData(p.dataFile).catch(() => null)
      const file = prdPathOf(p.dataFile, data), dir = prdAssetsOf(p.dataFile, data)
      if (file) prds.push(path.resolve(file).toLowerCase())
      if (dir) assets.push(path.resolve(dir).toLowerCase())
    }
    this.prdCache = prds
    this.assetsCache = assets
    this.repoCache = all.filter(p => p.repo).map(p => ({ id: p.id, title: p.title, repo: path.resolve(p.repo).toLowerCase() }))
  }

  // ---------------------------------------------------------------- 读写

  async readData(dataFile) {
    const stat = await fs.stat(dataFile)
    const cached = this.cache.get(dataFile)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data
    const raw = JSON.parse(await fs.readFile(dataFile, 'utf8'))
    if (raw.schema !== SCHEMA) throw new OpError(`${dataFile} 不是 ${SCHEMA} 格式的数据文件`)
    const data = normalize(raw)
    this.cache.set(dataFile, { mtimeMs: stat.mtimeMs, data })
    return data
  }

  async writeData(dataFile, data) {
    await atomicWrite(dataFile, JSON.stringify(data, null, 1))
    const stat = await fs.stat(dataFile)
    this.cache.set(dataFile, { mtimeMs: stat.mtimeMs, data })
  }

  /** 同一数据文件的写操作串行执行。 */
  async withLock(key, fn) {
    key = path.resolve(key)
    if (process.platform === 'win32') key = key.toLowerCase()
    const prev = this.locks.get(key) ?? Promise.resolve()
    let release
    const next = new Promise(r => { release = r })
    const queued = prev.then(() => next)
    this.locks.set(key, queued)
    await prev
    try { return await fn() } finally { release(); if (this.locks.get(key) === queued) this.locks.delete(key) }
  }

  async load(ref) {
    const project = await this.resolveProject(ref)
    const data = await this.readData(project.dataFile)
    const prdFile = prdPathOf(project.dataFile, data) ?? null
    return {
      project, data, derived: derive(data), prdFile, prdAssets: prdAssetsOf(project.dataFile, data) ?? null,
      prdMissing: Boolean(data.meta.prd && (!prdFile || !existsSync(prdFile))), prdSource: await this.prdSourceOf(project.id),
    }
  }

  async status(ref) {
    const project = await this.resolveProject(ref)
    const data = await this.readData(project.dataFile)
    return { project: project.id, revision: data.revision, updatedAt: data.updatedAt, counts: derive(data).counts }
  }

  async apply(ref, ops, { actor = 'model', reason, expectRevision } = {}) {
    const project = await this.resolveProject(ref)
    return this.withLock(project.dataFile, async () => {
      const current = await this.readData(project.dataFile)
      if (expectRevision !== undefined && expectRevision !== current.revision) {
        throw new OpError(`数据已被修改（当前修订 ${current.revision}，你基于 ${expectRevision}），请刷新后重试`)
      }
      const { data, changes, cascades } = applyOps(current, ops, { actor, reason })
      await this.writeData(project.dataFile, data)
      const result = { project: project.id, title: data.meta.title, revision: data.revision, changes, cascades, counts: derive(data).counts }
      const check = lint(data)
      result.lint = { errors: check.errors.length, warnings: check.warnings.length, firstErrors: check.errors.slice(0, 5) }
      if (this.config.autoExport) {
        try { result.exported = await this.exportHtml(project, data) } catch (error) { result.exportError = error.message }
      }
      this.emit(project.id)
      return result
    })
  }

  async lint(ref) {
    const project = await this.resolveProject(ref)
    const data = await this.readData(project.dataFile)
    return { project: project.id, revision: data.revision, ...lint(data) }
  }

  async exportHtml(projectOrRef, given) {
    const project = typeof projectOrRef === 'object' ? projectOrRef : await this.resolveProject(projectOrRef)
    const data = given ?? await this.readData(project.dataFile)
    const target = project.htmlFile ?? defaultHtmlPath(project.dataFile, data)
    if (existsSync(target)) {
      const head = (await fs.readFile(target, 'utf8')).slice(0, 400)
      if (!isGeneratedHtml(head) && !this.allowOverwriteLegacy?.has(target)) {
        throw new OpError(`目标 HTML 不是插件生成的产物，不覆盖：${target}。请在配置页把导出路径改到新文件。`)
      }
    }
    const template = await fs.readFile(fileURLToPath(TEMPLATE_URL), 'utf8')
    await atomicWrite(target, renderLegacyHtml(template, data))
    return target
  }

  /**
   * 导入：旧版 HTML 或 JSON（v2 数据，或含 FEAT/QS 等旧常量的草稿）。
   * 目标数据文件已存在时，只有新数据保留了全部旧编号才会覆盖。
   */
  async importSource({ source, dataFile, htmlFile, repo, branch, title }) {
    if (!source || !path.isAbsolute(source)) throw new OpError('source 必须是绝对路径')
    const text = await fs.readFile(source, 'utf8')
    let data
    let legacyHtml = false
    if (/\.html?$/i.test(source)) {
      data = fromLegacy(readLegacyConstants(text))
      legacyHtml = !isGeneratedHtml(text)
    } else {
      const raw = JSON.parse(text)
      data = raw.schema === SCHEMA ? normalize(raw) : fromLegacy(raw)
    }
    if (repo) data.meta.repo = path.resolve(repo)
    if (branch) data.meta.branch = branch
    if (title) data.meta.title = title
    const target = path.resolve(dataFile ?? defaultDataPath(source, data))
    return this.withLock(target, async () => {
      if (!target.endsWith('.prdview.json')) throw new OpError('数据文件名必须以 .prdview.json 结尾')
      // 项目内视图的代码仓库就是项目本身，不在共享文件里写本机绝对路径
      if (this.projectRootOf(target)) delete data.meta.repo
      // PRD 文档与创建任务归属不能由导入文件冒认，只沿用当前视图已托管的记录。
      delete data.meta.prd
      delete data.meta.creationTaskId
      if (existsSync(target)) {
        const old = await this.readData(target)
        if (old.meta?.prd) data.meta.prd = old.meta.prd
        if (old.meta?.creationTaskId) data.meta.creationTaskId = old.meta.creationTaskId
        assertNothingRemoved(old, data)
        data.revision = old.revision + 1
        data.log = [...old.log, ...data.log]
      }
      await fs.mkdir(path.dirname(target), { recursive: true })
      await this.writeData(target, data)
      // 旧版 HTML 不是插件产物，导出改为同目录的新文件，原文件保持不动。
      let html = htmlFile ? path.resolve(htmlFile) : (legacyHtml ? defaultHtmlPath(target, data) : (/\.html?$/i.test(source) ? source : undefined))
      if (!htmlFile && legacyHtml && samePath(html, source)) html = html.replace(/\.html?$/i, '（快照）.html')
      // 目标在项目的 .dsh/prd-views 里：跟随项目，不写入全局登记
      const viewsRoot = this.projectRootOf(target)
      let project
      if (viewsRoot) {
        project = await this.projectViewEntry(target, viewsRoot)
        await this.rememberViews([project])
        await this.refreshProtected()
        this.emit(project.id)
      } else {
        project = await this.registerProject({ dataFile: target, htmlFile: html, repo: data.meta.repo })
      }
      const check = lint(data)
      return {
        project: project.id, dataFile: target, htmlFile: project.htmlFile,
        counts: derive(data).counts, lint: { errors: check.errors.length, warnings: check.warnings.length, firstErrors: check.errors.slice(0, 8) },
      }
    })
  }

  async create({ dataFile, title, repo, branch }) {
    if (!dataFile || !path.isAbsolute(dataFile)) throw new OpError('dataFile 必须是绝对路径')
    if (existsSync(dataFile)) throw new OpError(`已存在：${dataFile}`)
    const data = emptyData({ title, repo: repo ? path.resolve(repo) : undefined, branch })
    await fs.mkdir(path.dirname(dataFile), { recursive: true })
    await this.writeData(path.resolve(dataFile), data)
    return this.registerProject({ dataFile, repo })
  }

  // ---------------------------------------------------------------- 代码同步

  async git(repo, args) {
    return new Promise((resolve, reject) => {
      execFile(this.config.gitPath || 'git', ['-C', repo, ...args], { windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) reject(new OpError(`git ${args.join(' ')} 失败：${(stderr || error.message).trim()}`))
        else resolve(stdout)
      })
    })
  }

  async changedFiles(repo, baseline) {
    const diff = await this.git(repo, ['-c', 'core.quotepath=false', 'diff', '--name-only', baseline])
    const untracked = await this.git(repo, ['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'])
    return [...new Set([...diff.split(/\r?\n/), ...untracked.split(/\r?\n/)].map(s => s.trim()).filter(Boolean))]
  }

  /** 页签顶栏用的轻量状态：自基线以来改动的文件数（缓存 20 秒）。 */
  async codeStatus(ref) {
    const project = await this.resolveProject(ref)
    const data = await this.readData(project.dataFile)
    const repo = project.repo ?? data.meta.repo
    if (!repo) return { configured: false }
    if (!data.meta.baseline) return { configured: true, baseline: null }
    const key = `${repo}@${data.meta.baseline}`
    const hit = this.codeCache.get(key)
    if (hit && Date.now() - hit.at < 20000) return hit.value
    let value
    try {
      const [head, files] = await Promise.all([this.git(repo, ['rev-parse', 'HEAD']), this.changedFiles(repo, data.meta.baseline)])
      value = { configured: true, baseline: data.meta.baseline, head: head.trim(), changedFiles: files.length, pendingReview: derive(data).counts.review }
    } catch (error) {
      value = { configured: true, baseline: data.meta.baseline, error: error.message }
    }
    this.codeCache.set(key, { at: Date.now(), value })
    return value
  }

  /**
   * 比对基线与当前代码，把证据命中的条目标为待复核。
   * 没有基线时只记录当前提交作为基线。
   */
  async sync(ref, { dryRun = false } = {}) {
    const project = await this.resolveProject(ref)
    return this.withLock(project.dataFile, async () => {
      const data = await this.readData(project.dataFile)
      const repo = project.repo ?? data.meta.repo
      if (!repo) throw new OpError('这份研发视图没有配置代码仓库，请在配置页填写仓库路径')
      const head = (await this.git(repo, ['rev-parse', 'HEAD'])).trim()
      if (!data.meta.baseline) {
        if (dryRun) return { project: project.id, baseline: null, head, note: '尚无基线，执行同步会把当前提交设为基线' }
        const next = applyOps(data, [{ op: 'baseline', commit: head }], { actor: 'sync', reason: '首次同步：设定代码基线' }).data
        await this.writeData(project.dataFile, next)
        this.emit(project.id)
        return { project: project.id, baseline: head, head, files: [], hits: [], note: '首次同步：已把当前提交设为基线' }
      }
      const files = await this.changedFiles(repo, data.meta.baseline)
      const hits = matchEvidence(data, files)
      const fresh = hits.filter(h => {
        const item = findAny(data, h)
        return !(item?.review?.state === 'pending' && sameSet(item.review.files, h.files))
      })
      if (!dryRun && fresh.length) {
        const next = markReview(data, fresh, { baseline: data.meta.baseline, head })
        await this.writeData(project.dataFile, next)
        this.emit(project.id)
      }
      this.codeCache.clear()
      const unmatched = files.filter(f => !hits.some(h => h.files.includes(f)))
      return {
        project: project.id, baseline: data.meta.baseline, head, files: files.length,
        hits: hits.map(h => ({ ...h, title: titleOf(data, h) })), newlyMarked: dryRun ? 0 : fresh.length,
        unmatchedFiles: unmatched.slice(0, 40), unmatchedTotal: unmatched.length,
      }
    })
  }

  async advanceBaseline(ref, { force = false, actor = 'model' } = {}) {
    const project = await this.resolveProject(ref)
    const data = await this.readData(project.dataFile)
    const repo = project.repo ?? data.meta.repo
    if (!repo) throw new OpError('没有配置代码仓库')
    const head = (await this.git(repo, ['rev-parse', 'HEAD'])).trim()
    const result = await this.apply(project.id, [{ op: 'baseline', commit: head, force }], { actor, reason: '推进代码基线' })
    this.codeCache.clear()
    return result
  }

  /** 改动的文件属于哪些登记项目的仓库（供提醒使用）。 */
  projectsForFile(file) {
    const abs = path.resolve(file).toLowerCase()
    const own = this.protectedPaths()
    if (own.includes(abs) || this.isManagedPrd(abs)) return []
    return (this.repoCache ?? []).filter(p => abs.startsWith(p.repo + path.sep) || abs === p.repo)
  }
}

// ---------------------------------------------------------------- 工具函数

function findAny(data, h) {
  const key = { issue: 'issues', adjustment: 'adjustments', feature: 'features' }[h.kind]
  return data[key]?.find(x => x.id === h.id)
}
function titleOf(data, h) { const x = findAny(data, h); return x?.title ?? x?.name }
const sameSet = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x))
const stripUndefined = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

export function projectId(dataFile) {
  return 'pv-' + createHash('sha1').update(path.resolve(dataFile).toLowerCase()).digest('hex').slice(0, 8)
}

function isInside(file, dir) {
  const rel = path.relative(path.resolve(dir), path.resolve(file))
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** 视图托管的 PRD 文档的绝对路径（相对数据文件所在目录保存）。 */
export function prdPathOf(dataFile, data) {
  const file = data?.meta?.prd?.file
  // 只认数据文件同目录下的 .md 文件名，防止指向目录外或其他文件
  if (typeof file !== 'string' || file !== path.basename(file) || !/\.md$/i.test(file) || /^\.+$/.test(file)) return undefined
  return path.join(path.dirname(dataFile), file)
}

/** 视图托管的 PRD 图片目录（数据文件同目录下的 <名>.assets）。 */
export function prdAssetsOf(dataFile, data) {
  const dir = data?.meta?.prd?.assets
  if (typeof dir !== 'string' || dir !== path.basename(dir) || !/\.assets$/i.test(dir) || /^\.+/.test(dir)) return undefined
  return path.join(path.dirname(dataFile), dir)
}

/** Only a durable, exclusive ownership record allows a task to resume pre-save PRD swaps. */
async function reserveCreation(dir, taskId, plan) {
  const marker = path.join(dir, '.prd-create.json')
  let owned
  try { owned = JSON.parse(await fs.readFile(marker, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw new OpError(`创建恢复记录无法读取，未覆盖文件：${marker}；${error.message}`)
  }
  if (owned) {
    if (!taskId || owned.taskId !== taskId) throw new OpError('此目录仍有其他创建任务的恢复文件，请先恢复原任务')
    if (owned.file !== plan.mdName || (owned.assets ?? null) !== (plan.assetsName ?? null)) throw new OpError('PRD 来源文件名或图片目录已变化，保留原创建恢复文件，请检查后重试')
    return { file: owned.file, ...(owned.assets ? { assets: owned.assets } : {}) }
  }
  if (!taskId) return null
  // Never acquire ownership over pre-existing user content, even when filenames match the plan.
  if (existsSync(path.join(dir, plan.mdName)) || (plan.assetsName && existsSync(path.join(dir, plan.assetsName)))) {
    throw new OpError('创建目录已有未归本任务管理的 PRD 或图片，未覆盖')
  }
  await fs.writeFile(marker, JSON.stringify({ version: 1, taskId, file: plan.mdName, assets: plan.assetsName ?? null }), { encoding: 'utf8', flag: 'wx' })
  return null
}

async function releaseCreation(dir, taskId) {
  const marker = path.join(dir, '.prd-create.json')
  let owned
  try { owned = JSON.parse(await fs.readFile(marker, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  if (owned.taskId === taskId) await fs.unlink(marker)
}

function bindingToken(rec = {}) { return JSON.stringify([rec.project ?? null, rec.at ?? null, rec.auto ?? false, rec.bindingRevision ?? null]) }

function samePath(a, b) { return Boolean(a && b) && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() }

function safeName(s) { return String(s ?? 'PRD').replace(/[\\/:*?"<>|]/g, '').trim() || 'PRD' }

export function defaultDataPath(source, data) {
  return path.join(path.dirname(source), `${safeName(data.meta.title)}.prdview.json`)
}

export function defaultHtmlPath(dataFile, data) {
  return path.join(path.dirname(dataFile), `${safeName(data?.meta?.title ?? path.basename(dataFile, '.prdview.json'))}-研发视图.html`)
}

async function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, text, 'utf8')
  try {
    await fs.rename(tmp, file)
  } catch (error) {
    // Windows 上目标被占用（例如 OneDrive 同步）时退回直接写入。
    await fs.writeFile(file, text, 'utf8')
    await fs.rm(tmp, { force: true })
    void error
  }
}
