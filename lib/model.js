/**
 * PRD 研发视图数据模型：唯一数据文件的结构、推导、编辑操作与检查。
 * 关系只存一处：问题/调整/模块的 features 字段是“功能↔条目”的唯一来源，
 * 功能上的 qs/adj/mods 全部在推导时生成。条目只能关闭或标记被取代，不能删除。
 */

export const SCHEMA = 'prd-dev-view/2'

export const ENUMS = {
  featureStatus: ['new', 'change', 'minor', 'ok', 'pending'],
  issueType: ['冲突', '缺失', '笔误'],
  issueSev: ['block', 'impact', 'low'],
  adjNature: ['merge', 'new', 'change', 'pending', 'confirm', 'defer', 'ok'],
  modNeed: ['ok', 'new', 'change', 'confirm', 'pending'],
  ruleUse: ['ok', 'miss', 'q', 'new'],
  issueProgress: ['open', 'answered', 'resolved', 'wontfix', 'superseded'],
  adjProgress: ['todo', 'doing', 'done', 'verified', 'dropped', 'superseded'],
}

export const CLOSED = {
  issue: new Set(['resolved', 'wontfix', 'superseded']),
  adjustment: new Set(['done', 'verified', 'dropped', 'superseded']),
}

export const LABELS = {
  featureStatus: { new: '新增', change: '改造', minor: '小改', ok: '无需改', pending: '待定' },
  issueSev: { block: '阻塞开发', impact: '影响行为', low: '文档问题' },
  adjNature: { merge: '合并', new: '新增', change: '改造', pending: '待定', confirm: '需确认', defer: '延期', ok: '无需改' },
  modNeed: { ok: '无需改', new: '新增', change: '需改动', confirm: '需确认', pending: '待定' },
  issueProgress: { open: '待确认', answered: '已答复', resolved: '已解决', wontfix: '不处理', superseded: '被取代' },
  adjProgress: { todo: '待处理', doing: '进行中', done: '已完成', verified: '已验证', dropped: '放弃', superseded: '被取代' },
}

/** 集合名 ↔ 操作里使用的 kind。 */
export const KINDS = {
  feature: 'features',
  issue: 'issues',
  adjustment: 'adjustments',
  rule: 'rules',
  module: 'modules',
  object: 'objects',
}

const ID_PREFIX = { issue: 'Q', adjustment: 'A', rule: 'G', module: 'M', object: 'O' }

/** 不允许通过 set 修改的字段（各有专门操作）。 */
const PROTECTED_FIELDS = new Set(['id', 'progress', 'history', 'features', 'blocked', 'review', 'evidence', 'answer', 'supersededBy'])

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))
const arr = value => (Array.isArray(value) ? value : [])
const nowIso = () => new Date().toISOString()

/** 新建一份空数据。 */
export function emptyData(meta = {}) {
  return normalize({ schema: SCHEMA, revision: 0, meta })
}

/** 补齐缺省字段，保证后续代码可直接访问。不改变已有内容。 */
export function normalize(input) {
  const d = clone(input) ?? {}
  d.schema = SCHEMA
  d.revision = Number.isInteger(d.revision) ? d.revision : 0
  d.meta = d.meta ?? {}
  d.meta.title = d.meta.title ?? '未命名 PRD'
  for (const key of ['objs', 'caps', 'features', 'issues', 'adjustments', 'rules', 'modules', 'objects', 'chain', 'log']) {
    d[key] = arr(d[key])
  }
  d.lifecycle = d.lifecycle ?? { title: '', start: [], states: [], gaps: [], loops: [], always: [] }
  d.objMap = d.objMap ?? { width: 1000, height: 400, nodes: {}, edges: [] }
  d.cards = d.cards ?? {}
  for (const f of d.features) {
    delete f.qs; delete f.adj; delete f.mods
    f.rel = arr(f.rel)
    f.review = f.review ?? null
  }
  for (const q of d.issues) {
    q.features = arr(q.features)
    q.progress = ENUMS.issueProgress.includes(q.progress) ? q.progress : 'open'
    q.history = arr(q.history)
    q.evidence = arr(q.evidence)
    q.review = q.review ?? null
  }
  for (const a of d.adjustments) {
    a.features = arr(a.features)
    a.blocked = arr(a.blocked)
    a.progress = ENUMS.adjProgress.includes(a.progress) ? a.progress : 'todo'
    a.history = arr(a.history)
    a.evidence = arr(a.evidence)
    a.review = a.review ?? null
  }
  for (const m of d.modules) { m.features = arr(m.features); m.adj = arr(m.adj); m.q = arr(m.q) }
  for (const g of d.rules) { g.uses = g.uses ?? {}; g.q = arr(g.q); g.adj = arr(g.adj) }
  for (const o of d.objects) o.features = arr(o.features)
  return d
}

function collectionOf(data, kind) {
  const key = KINDS[kind]
  if (key === undefined) throw new OpError(`未知类型 "${kind}"，可用：${Object.keys(KINDS).join(' / ')}`)
  return data[key]
}

function findItem(data, kind, id) {
  return collectionOf(data, kind).find(item => item.id === id)
}

/** 由编号前缀判断条目类型。 */
export function kindOfId(data, id) {
  for (const kind of Object.keys(KINDS)) if (findItem(data, kind, id)) return kind
  return undefined
}

export class OpError extends Error {}

/** 推导：反向关系、计数、清单行、阻塞关系。客户端和导出共用。 */
export function derive(data) {
  const featureQs = {}, featureAdj = {}, featureMods = {}, featureRules = {}, featureObjects = {}
  for (const f of data.features) { featureQs[f.id] = []; featureAdj[f.id] = []; featureMods[f.id] = []; featureRules[f.id] = {}; featureObjects[f.id] = [] }
  const push = (map, f, id) => { if (map[f] && !map[f].includes(id)) map[f].push(id) }
  for (const q of data.issues) for (const f of q.features) push(featureQs, f, q.id)
  for (const a of data.adjustments) for (const f of a.features) push(featureAdj, f, a.id)
  for (const m of data.modules) for (const f of m.features) push(featureMods, f, m.id)
  for (const o of data.objects) for (const f of o.features) push(featureObjects, f, o.id)
  for (const g of data.rules) for (const [f, use] of Object.entries(g.uses)) if (featureRules[f]) featureRules[f][g.id] = use

  const issueAdj = {}
  for (const q of data.issues) issueAdj[q.id] = []
  for (const a of data.adjustments) for (const q of a.blocked) if (issueAdj[q]) issueAdj[q].push(a.id)

  const isClosed = (kind, item) => CLOSED[kind].has(item.progress)
  const openIssues = new Set(data.issues.filter(q => !isClosed('issue', q)).map(q => q.id))
  const blockedBy = {}
  for (const a of data.adjustments) blockedBy[a.id] = a.blocked.filter(q => openIssues.has(q))

  const counts = {
    features: data.features.length,
    issues: data.issues.length,
    issuesOpen: data.issues.filter(q => !isClosed('issue', q)).length,
    issuesBlockOpen: data.issues.filter(q => q.sev === 'block' && !isClosed('issue', q)).length,
    adjustments: data.adjustments.length,
    adjustmentsOpen: data.adjustments.filter(a => !isClosed('adjustment', a)).length,
    review: [...data.issues, ...data.adjustments, ...data.features].filter(x => x.review?.state === 'pending').length,
    cardsMissing: data.features.filter(f => !data.cards[f.id]).length,
  }
  counts.closed = counts.issues - counts.issuesOpen + counts.adjustments - counts.adjustmentsOpen

  const featureRemaining = {}
  for (const f of data.features) {
    featureRemaining[f.id] = {
      qs: featureQs[f.id].filter(id => openIssues.has(id)).length,
      adj: featureAdj[f.id].filter(id => { const a = data.adjustments.find(x => x.id === id); return a && !isClosed('adjustment', a) }).length,
    }
  }

  const lastChange = item => item.history.length ? item.history[item.history.length - 1].at : undefined
  const rows = [
    ...data.issues.map(q => ({
      id: q.id, kind: 'issue', title: q.title, type: q.type, sev: q.sev, nature: undefined,
      progress: q.progress, closed: isClosed('issue', q), features: q.features,
      review: q.review?.state === 'pending', lastChange: lastChange(q), related: issueAdj[q.id],
    })),
    ...data.adjustments.map(a => ({
      id: a.id, kind: 'adjustment', title: a.title, type: '改造', sev: undefined, nature: a.status,
      progress: a.progress, closed: isClosed('adjustment', a), features: a.features,
      review: a.review?.state === 'pending', lastChange: lastChange(a), related: a.blocked, blockedBy: blockedBy[a.id],
    })),
  ]
  return { featureQs, featureAdj, featureMods, featureRules, featureObjects, issueAdj, blockedBy, counts, featureRemaining, rows }
}

// ---------------------------------------------------------------------------
// 编辑操作

function record(item, entry) {
  item.history = arr(item.history)
  item.history.push({ at: nowIso(), ...entry })
}

function ensureId(data, kind, id) {
  const item = findItem(data, kind, id)
  if (!item) throw new OpError(`${kind} ${id} 不存在`)
  return item
}

function nextId(data, kind) {
  const prefix = ID_PREFIX[kind]
  let max = 0
  for (const item of collectionOf(data, kind)) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(item.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

const featureExists = (data, id) => data.features.some(f => f.id === id)

/**
 * 应用一批操作。整批成功才返回新数据；任何一步失败都抛 OpError，原数据不变。
 * @returns {{data, changes: string[], cascades: string[]}}
 */
export function applyOps(input, ops, { actor = 'model', reason } = {}) {
  if (!Array.isArray(ops) || ops.length === 0) throw new OpError('ops 至少包含一个操作')
  const before = normalize(input)
  const data = normalize(input)
  const changes = []
  const touched = new Set()
  const by = { actor, ...(reason ? { reason } : {}) }

  ops.forEach((op, index) => {
    const at = `第 ${index + 1} 个操作（${op?.op ?? '?'}）`
    try {
      applyOne(data, op, by, changes, touched)
    } catch (error) {
      throw new OpError(`${at}失败：${error.message}`)
    }
  })

  assertNothingRemoved(before, data)
  const cascades = describeCascades(before, data, touched)
  data.revision = before.revision + 1
  data.updatedAt = nowIso()
  data.log.push({ rev: data.revision, at: data.updatedAt, actor, summary: reason ?? changes.slice(0, 3).join('；'), ops: ops.length })
  if (data.log.length > 500) data.log = data.log.slice(-500)
  return { data, changes, cascades }
}

function applyOne(data, op, by, changes, touched) {
  if (!op || typeof op !== 'object') throw new OpError('操作必须是对象')
  switch (op.op) {
    case 'set': {
      if (op.kind === 'meta') {
        for (const [k, v] of Object.entries(op.fields ?? {})) {
          if (k === 'baseline') throw new OpError('基线请用 baseline 操作推进')
          if (k === 'prd' && by.actor !== 'prd-manager') throw new OpError('PRD 文档由研发视图托管，只能由用户在页签「总览」中关联或更换')
          data.meta[k] = v
        }
        changes.push(`更新 PRD 信息：${Object.keys(op.fields ?? {}).join('、')}`)
        return
      }
      const item = ensureId(data, op.kind, op.id)
      const fields = op.fields ?? {}
      const keys = Object.keys(fields)
      if (keys.length === 0) throw new OpError('fields 为空')
      for (const k of keys) {
        if (PROTECTED_FIELDS.has(k)) throw new OpError(`字段 ${k} 不能用 set 修改（进度用 progress，关联用 link/unlink，证据用 evidence）`)
        if (k === 'status') validateEnum(op.kind, fields[k])
        item[k] = fields[k]
      }
      if ('history' in item) record(item, { op: 'set', fields: keys, ...by })
      touched.add(op.id)
      changes.push(`${op.id} 修改 ${keys.join('、')}`)
      return
    }
    case 'progress': {
      if (op.kind !== 'issue' && op.kind !== 'adjustment') throw new OpError('只有 issue / adjustment 有进度')
      const item = ensureId(data, op.kind, op.id)
      const allowed = op.kind === 'issue' ? ENUMS.issueProgress : ENUMS.adjProgress
      if (!allowed.includes(op.to)) throw new OpError(`进度 ${op.to} 不合法，可用：${allowed.join(' / ')}`)
      if (op.to === 'superseded') {
        if (!op.by) throw new OpError('标记被取代时必须给出 by（取代它的条目编号）')
        if (!kindOfId(data, op.by)) throw new OpError(`取代条目 ${op.by} 不存在`)
        item.supersededBy = op.by
      }
      if (op.answer !== undefined) item.answer = op.answer
      if (!op.reason && CLOSED[op.kind].has(op.to)) throw new OpError('关闭条目时必须写 reason（完成依据或处理说明）')
      const from = item.progress
      item.progress = op.to
      if (item.review?.state === 'pending') item.review = { state: 'ok', at: nowIso(), ...by }
      record(item, { op: 'progress', from, to: op.to, ...(op.commit ? { commit: op.commit } : {}), ...(op.answer ? { answer: op.answer } : {}), actor: by.actor, reason: op.reason ?? by.reason })
      touched.add(op.id)
      const labels = op.kind === 'issue' ? LABELS.issueProgress : LABELS.adjProgress
      changes.push(`${op.id} ${labels[from]} → ${labels[op.to]}`)
      return
    }
    case 'link':
    case 'unlink': {
      const field = op.field ?? 'features'
      const item = ensureId(data, op.kind, op.id)
      const targets = Array.isArray(op.target) ? op.target : [op.target]
      const valid = {
        features: id => featureExists(data, id),
        blocked: id => data.issues.some(q => q.id === id),
        adj: id => data.adjustments.some(a => a.id === id),
        q: id => data.issues.some(q => q.id === id),
        rel: id => featureExists(data, id),
      }[field]
      if (!valid) throw new OpError(`字段 ${field} 不支持关联操作`)
      item[field] = arr(item[field])
      for (const t of targets) {
        if (op.op === 'link') {
          if (!valid(t)) throw new OpError(`关联目标 ${t} 不存在`)
          if (!item[field].includes(t)) item[field].push(t)
        } else {
          item[field] = item[field].filter(x => x !== t)
        }
        touched.add(t)
      }
      if ('history' in item) record(item, { op: op.op, field, target: targets, ...by })
      touched.add(op.id)
      changes.push(`${op.id} ${op.op === 'link' ? '关联' : '解除关联'} ${targets.join('、')}`)
      return
    }
    case 'add': {
      const kind = op.kind
      const list = collectionOf(data, kind)
      const item = clone(op.item ?? {})
      if (!item.id) item.id = kind === 'feature' ? undefined : nextId(data, kind)
      if (!item.id) throw new OpError('新增功能必须给出编号')
      if (kindOfId(data, item.id)) throw new OpError(`编号 ${item.id} 已存在`)
      if (kind === 'feature') {
        for (const k of ['name', 'obj', 'cap']) if (!item[k]) throw new OpError(`新增功能缺少 ${k}`)
        if (item.status) validateEnum(kind, item.status)
        delete item.qs; delete item.adj; delete item.mods
        item.rel = arr(item.rel)
      }
      if (kind === 'issue' || kind === 'adjustment') {
        if (!item.title) throw new OpError('缺少 title')
        if (item.status) validateEnum(kind, item.status)
        if (kind === 'issue') { validateEnum('issueType', item.type); validateEnum('issueSev', item.sev) }
        item.features = arr(item.features)
        for (const f of item.features) if (!featureExists(data, f)) throw new OpError(`关联功能 ${f} 不存在`)
        item.progress = kind === 'issue' ? 'open' : 'todo'
        item.history = [{ at: nowIso(), op: 'add', ...by }]
        item.evidence = arr(item.evidence)
        if (kind === 'adjustment') item.blocked = arr(item.blocked)
      }
      list.push(item)
      touched.add(item.id)
      changes.push(`新增 ${item.id}${item.title ? ' ' + item.title : item.name ? ' ' + item.name : ''}`)
      return
    }
    case 'card': {
      if (!featureExists(data, op.feature)) throw new OpError(`功能 ${op.feature} 不存在`)
      const card = data.cards[op.feature] ?? {}
      const patch = op.patch ?? {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'scenarios' || k === 'mock') continue
        card[k] = v
      }
      data.cards[op.feature] = card
      touched.add(op.feature)
      changes.push(`${op.feature} 卡片更新 ${Object.keys(patch).join('、')}`)
      return
    }
    case 'evidence': {
      const item = ensureId(data, op.kind, op.id)
      if (!Array.isArray(op.evidence)) throw new OpError('evidence 必须是数组')
      for (const e of op.evidence) if (!e || typeof e.path !== 'string') throw new OpError('每条证据需要 path')
      item.evidence = op.evidence
      touched.add(op.id)
      changes.push(`${op.id} 更新证据 ${op.evidence.length} 条`)
      return
    }
    case 'review': {
      const item = ensureId(data, op.kind, op.id)
      if (!op.note) throw new OpError('复核需要 note，说明代码变化后结论为何仍成立或已如何更新')
      item.review = { state: 'ok', at: nowIso(), note: op.note, ...by }
      if ('history' in item) record(item, { op: 'review', note: op.note, ...by })
      touched.add(op.id)
      changes.push(`${op.id} 已复核`)
      return
    }
    case 'baseline': {
      if (!op.commit) throw new OpError('baseline 需要 commit')
      const pending = [...data.features, ...data.issues, ...data.adjustments].filter(x => x.review?.state === 'pending')
      if (pending.length && !op.force) throw new OpError(`还有 ${pending.length} 项待复核（${pending.slice(0, 6).map(x => x.id).join('、')}…），复核后再推进基线`)
      const from = data.meta.baseline
      data.meta.baseline = op.commit
      data.meta.baselineAt = nowIso()
      changes.push(`代码基线 ${short(from)} → ${short(op.commit)}`)
      return
    }
    case 'delete':
    case 'remove':
      throw new OpError('条目不允许删除：完成用 progress 关闭，误录或重复用 progress superseded/wontfix 并写明原因')
    default:
      throw new OpError(`未知操作 ${op.op}`)
  }
}

const short = c => (c ? String(c).slice(0, 10) : '无')

function validateEnum(kind, value) {
  const map = {
    feature: ENUMS.featureStatus, adjustment: ENUMS.adjNature, module: ENUMS.modNeed,
    issueType: ENUMS.issueType, issueSev: ENUMS.issueSev,
  }
  const allowed = map[kind]
  if (allowed && !allowed.includes(value)) throw new OpError(`取值 ${value} 不合法，可用：${allowed.join(' / ')}`)
}

/** 守卫：上一版存在的任何编号都必须仍然存在。 */
export function assertNothingRemoved(before, after) {
  const missing = []
  for (const key of Object.values(KINDS)) {
    const ids = new Set(after[key].map(x => x.id))
    for (const item of before[key]) if (!ids.has(item.id)) missing.push(item.id)
  }
  for (const f of Object.keys(before.cards)) if (!after.cards[f]) missing.push(`卡片 ${f}`)
  if (missing.length) throw new OpError(`拒绝保存：以下条目在新数据中消失了：${missing.join('、')}。条目只能关闭或标记被取代，不能删除。`)
}

function describeCascades(before, after, touched) {
  const b = derive(before), a = derive(after)
  const out = []
  for (const f of after.features) {
    const x = b.featureRemaining[f.id], y = a.featureRemaining[f.id]
    if (!x || !y) continue
    if (x.qs !== y.qs || x.adj !== y.adj) out.push(`${f.id} 剩余问题 ${x.qs}→${y.qs}，剩余改造 ${x.adj}→${y.adj}`)
  }
  for (const adj of after.adjustments) {
    const x = (b.blockedBy[adj.id] ?? []).length, y = a.blockedBy[adj.id].length
    if (x > 0 && y === 0) out.push(`${adj.id} 解除阻塞`)
    if (x === 0 && y > 0) out.push(`${adj.id} 被 ${a.blockedBy[adj.id].join('、')} 阻塞`)
  }
  const keys = ['issuesOpen', 'adjustmentsOpen', 'issuesBlockOpen', 'review']
  const names = { issuesOpen: '未关闭问题', adjustmentsOpen: '未完成改造', issuesBlockOpen: '阻塞问题', review: '待复核' }
  for (const k of keys) if (b.counts[k] !== a.counts[k]) out.push(`${names[k]} ${b.counts[k]}→${a.counts[k]}`)
  void touched
  return out
}

// ---------------------------------------------------------------------------
// 检查

/** 返回 { errors: string[], warnings: string[] }。 */
export function lint(input) {
  const data = normalize(input)
  const errors = [], warnings = []
  const ids = new Map()
  for (const [kind, key] of Object.entries(KINDS)) {
    for (const item of data[key]) {
      if (!item.id) { errors.push(`${kind} 缺少编号`); continue }
      if (ids.has(item.id)) errors.push(`编号重复：${item.id}`)
      ids.set(item.id, kind)
    }
  }
  const feat = new Set(data.features.map(f => f.id))
  const objIds = new Set(data.objs.map(o => o.id ?? o))
  const capIds = new Set(data.caps.map(c => c.id ?? c))
  for (const f of data.features) {
    if (!ENUMS.featureStatus.includes(f.status)) errors.push(`${f.id} 性质 ${f.status} 不合法`)
    if (objIds.size && !objIds.has(f.obj)) errors.push(`${f.id} 的业务对象 ${f.obj} 不在矩阵行里`)
    if (capIds.size && !capIds.has(f.cap)) errors.push(`${f.id} 的能力 ${f.cap} 不在矩阵列里`)
    for (const r of f.rel) if (!feat.has(r)) errors.push(`${f.id} 的相关功能 ${r} 不存在`)
    if (!data.cards[f.id]) errors.push(`${f.id} 没有完整卡片`)
  }
  for (const q of data.issues) {
    if (!ENUMS.issueType.includes(q.type)) errors.push(`${q.id} 类型 ${q.type} 不合法`)
    if (!ENUMS.issueSev.includes(q.sev)) errors.push(`${q.id} 严重度 ${q.sev} 不合法`)
    for (const f of q.features) if (!feat.has(f)) errors.push(`${q.id} 关联的功能 ${f} 不存在`)
    if (!q.features.length) warnings.push(`${q.id} 没有关联功能`)
    if (q.progress === 'superseded' && !ids.has(q.supersededBy)) errors.push(`${q.id} 被取代但取代者不存在`)
  }
  for (const a of data.adjustments) {
    if (!ENUMS.adjNature.includes(a.status)) errors.push(`${a.id} 性质 ${a.status} 不合法`)
    for (const f of a.features) if (!feat.has(f)) errors.push(`${a.id} 关联的功能 ${f} 不存在`)
    for (const q of a.blocked) if (ids.get(q) !== 'issue') errors.push(`${a.id} 的前置问题 ${q} 不存在`)
    if (!a.features.length) warnings.push(`${a.id} 没有关联功能`)
  }
  for (const m of data.modules) {
    if (!ENUMS.modNeed.includes(m.need)) errors.push(`${m.id} 改动程度 ${m.need} 不合法`)
    for (const f of m.features) if (!feat.has(f)) errors.push(`${m.id} 涉及的功能 ${f} 不存在`)
  }
  for (const g of data.rules) {
    for (const [f, use] of Object.entries(g.uses)) {
      if (!feat.has(f)) errors.push(`${g.id} 的使用表里 ${f} 不存在`)
      if (!ENUMS.ruleUse.includes(use)) errors.push(`${g.id} 对 ${f} 的使用情况 ${use} 不合法`)
    }
  }
  // 状态主线覆盖
  const lc = data.lifecycle
  const placed = new Set()
  for (const s of arr(lc.start)) placed.add(s.f)
  for (const st of arr(lc.states)) for (const it of arr(st.items)) if (it.f) placed.add(it.f)
  for (const g of arr(lc.gaps)) for (const side of ['fwd', 'back', 'extra']) for (const it of arr(g?.[side])) if (it.f) placed.add(it.f)
  for (const l of arr(lc.loops)) if (l.f) placed.add(l.f)
  for (const s of arr(lc.always)) placed.add(s.f)
  for (const p of placed) if (p && !feat.has(p)) errors.push(`状态主线引用了不存在的功能 ${p}`)
  if (arr(lc.states).length && arr(lc.gaps).length !== arr(lc.states).length - 1) errors.push('状态主线的箭头数量应等于状态数减一')
  for (const f of data.features) if (arr(lc.states).length && !placed.has(f.id)) warnings.push(`${f.id} 没有出现在状态主线上`)
  // 卡片
  const d = derive(data)
  for (const [fid, card] of Object.entries(data.cards)) {
    if (!feat.has(fid)) { errors.push(`卡片 ${fid} 对应的功能不存在`); continue }
    const stages = arr(card.stages)
    if (stages.length < 2) errors.push(`${fid} 卡片阶段少于 2 个`)
    const local = new Set()
    for (const p of arr(card.pre)) local.add(p.id)
    for (const r of arr(card.rules)) local.add(r.id)
    for (const c of arr(card.compat)) local.add(c.id)
    for (const st of stages.slice(1)) for (const s of arr(card.steps?.[st.id])) local.add(s.id)
    for (const x of arr(card.adj)) local.add(x.id)
    for (const x of arr(card.qs)) local.add(x.id)
    for (const r of arr(card.related)) local.add(r.id)
    const stageIds = new Set(stages.map(s => s.id))
    for (const sid of Object.keys(card.steps ?? {})) if (!stageIds.has(sid)) errors.push(`${fid} 卡片的步骤挂在不存在的阶段 ${sid}`)
    if (stages[0] && arr(card.steps?.[stages[0].id]).length) warnings.push(`${fid} 第 1 个阶段放了处理步骤（第 1 阶段只放前置条件）`)
    const ruleIds = new Set(arr(card.rules).map(r => r.id))
    const attached = new Set()
    for (const st of stages) for (const s of arr(card.steps?.[st.id])) {
      for (const r of arr(s.rules)) { attached.add(r); if (!ruleIds.has(r)) errors.push(`${fid} 步骤 ${s.id} 引用了不存在的规则 ${r}`) }
      for (const l of arr(s.links)) if (!local.has(l) && !ids.has(l)) warnings.push(`${fid} 步骤 ${s.id} 的关联 ${l} 无法解析`)
    }
    for (const r of ruleIds) if (!attached.has(r)) warnings.push(`${fid} 规则 ${r} 没有挂在任何步骤上`)
    const cardQs = new Set(arr(card.qs).map(x => x.id))
    const cardAdj = new Set(arr(card.adj).map(x => x.id))
    if (card.banner?.adj) cardAdj.add(card.banner.adj)
    for (const q of d.featureQs[fid]) if (!cardQs.has(q)) warnings.push(`${fid} 卡片里缺少问题 ${q} 的位置`)
    for (const a of d.featureAdj[fid]) if (!cardAdj.has(a)) warnings.push(`${fid} 卡片里缺少调整 ${a} 的位置`)
    for (const x of [...arr(card.qs), ...arr(card.adj), ...arr(card.compat)]) {
      const span = arr(x.span)
      if (span.length === 2 && (span[0] < 0 || span[1] >= stages.length || span[0] > span[1])) errors.push(`${fid} 中 ${x.id} 的跨度 [${span}] 超出阶段范围`)
    }
    for (const x of arr(card.qs)) if (ids.get(x.id) !== 'issue') errors.push(`${fid} 卡片引用了不存在的问题 ${x.id}`)
    for (const x of arr(card.adj)) if (ids.get(x.id) !== 'adjustment') errors.push(`${fid} 卡片引用了不存在的调整 ${x.id}`)
  }
  return { errors, warnings }
}

/** 由变更文件列表找出证据命中的条目。 */
export function matchEvidence(data, changedFiles) {
  const files = changedFiles.map(f => f.replace(/\\/g, '/'))
  const bases = files.map(f => ({ file: f, base: f.split('/').pop() }))
  const hits = []
  const textOf = item => {
    const parts = []
    if (typeof item.code === 'string') parts.push(item.code)
    if (Array.isArray(item.code)) parts.push(item.code.join(' '))
    for (const e of arr(item.evidence)) parts.push(e.path)
    return parts.join(' ').replace(/\\/g, '/')
  }
  const check = (kind, item, extra = '') => {
    const text = textOf(item) + ' ' + extra
    if (!text.trim()) return
    const matched = bases.filter(({ file, base }) => base.length > 3 && (text.includes(file) || new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(base)}`).test(text)))
    if (matched.length) hits.push({ kind, id: item.id, files: matched.map(m => m.file) })
  }
  for (const q of data.issues) check('issue', q)
  for (const a of data.adjustments) check('adjustment', a)
  for (const f of data.features) {
    const card = data.cards[f.id]
    const cardCode = card ? JSON.stringify([card.codeNote, card.stepCode, arr(card.pre).map(p => p.code), arr(card.rules).map(r => r.code), arr(card.compat).map(c => c.code)]) : ''
    check('feature', f, cardCode)
  }
  return hits
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 把命中结果写成待复核标记（不改进度、不删除）。 */
export function markReview(input, hits, { baseline, head }) {
  const data = normalize(input)
  for (const h of hits) {
    const item = findItem(data, h.kind, h.id)
    if (!item) continue
    item.review = { state: 'pending', files: h.files, since: baseline, head, at: nowIso() }
  }
  data.revision += 1
  data.updatedAt = nowIso()
  data.log.push({ rev: data.revision, at: data.updatedAt, actor: 'sync', summary: `代码同步：${hits.length} 项待复核`, ops: 0 })
  return data
}
