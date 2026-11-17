/**
 * 旧版单文件 HTML 的导入与只读快照导出。
 * 导入：取出「一、PRD 数据」脚本段，在隔离的 vm 里求值，转换成唯一数据文件。
 * 导出：把数据推导回旧模板需要的常量，嵌入插件自带模板，HTML 只是产物。
 */
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { CLOSED, LABELS, derive, normalize, SCHEMA } from './model.js'

const DATA_START = 'const PRD_META'
const APP_MARKER = /\/\*\s*=+\s*\r?\n\s*二、应用/g
const LEGACY_CONSTS = ['PRD_META', 'OBJS', 'CAPS', 'FEAT', 'QS', 'ADJ', 'GRULES', 'MODS', 'OBJ', 'CHAIN', 'LIFECYCLE', 'OBJ_MAP', 'DEEP', 'CODE_NOTE', 'NOTE_STATIC']

export const GENERATED_MARKER = 'prd-dev-view:generated'

/** 找到数据段的起止位置。 */
function dataRange(html) {
  const start = html.indexOf(DATA_START)
  if (start < 0) throw new Error('没有找到「const PRD_META」，不是 PRD 研发视图 HTML')
  let end = -1
  for (const m of html.matchAll(APP_MARKER)) if (m.index > start) { end = m.index; break }
  if (end < 0) throw new Error('没有找到「二、应用」分隔注释')
  return { start, end }
}

/** 从旧 HTML 求值出全部数据常量。 */
export function readLegacyConstants(html) {
  const { start, end } = dataRange(html)
  const code = html.slice(start, end)
  const ret = LEGACY_CONSTS.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',\n')
  const script = new vm.Script(`(function(){\n${code}\n;return {${ret}};})()`, { filename: 'prd-data.js' })
  return script.runInNewContext({}, { timeout: 5000 })
}

const uniq = list => [...new Set(list)]

/** 旧常量 → 新数据。关系合并两个方向后只保留一处。 */
export function fromLegacy(L, extraMeta = {}) {
  const feats = (L.FEAT ?? []).map(f => ({ ...f }))
  const issues = (L.QS ?? []).map(q => ({ ...q, features: [...(q.features ?? [])] }))
  const adjs = (L.ADJ ?? []).map(a => ({ ...a, features: [...(a.features ?? [])], blocked: [...(a.blocked ?? [])] }))
  const mods = (L.MODS ?? []).map(m => ({ ...m, features: [...(m.features ?? [])] }))
  const byId = list => Object.fromEntries(list.map(x => [x.id, x]))
  const qMap = byId(issues), aMap = byId(adjs), mMap = byId(mods)
  for (const f of feats) {
    for (const q of f.qs ?? []) if (qMap[q]) qMap[q].features = uniq([...qMap[q].features, f.id])
    for (const a of f.adj ?? []) if (aMap[a]) aMap[a].features = uniq([...aMap[a].features, f.id])
    for (const m of f.mods ?? []) if (mMap[m]) mMap[m].features = uniq([...mMap[m].features, f.id])
  }
  const at = new Date().toISOString()
  for (const q of issues) { q.progress = 'open'; q.history = [{ at, op: 'import', actor: 'import' }] }
  for (const a of adjs) {
    if (a.status === 'ok') {
      a.progress = 'done'
      a.history = [{ at, op: 'import', actor: 'import', from: 'todo', to: 'done', reason: '导入时性质为“无需改”' }]
    } else {
      a.progress = 'todo'
      a.history = [{ at, op: 'import', actor: 'import' }]
    }
  }
  const cards = {}
  for (const [fid, card] of Object.entries(L.DEEP ?? {})) {
    const { scenarios, mock, ...rest } = card ?? {}
    void scenarios; void mock
    cards[fid] = stripScn(rest)
  }
  const meta = { ...(L.PRD_META ?? {}), ...extraMeta }
  if (L.CODE_NOTE && !meta.codeNote) meta.codeNote = L.CODE_NOTE
  return normalize({
    schema: SCHEMA,
    revision: 0,
    meta,
    objs: L.OBJS ?? [],
    caps: L.CAPS ?? [],
    features: feats,
    issues,
    adjustments: adjs,
    rules: L.GRULES ?? [],
    modules: mods,
    objects: L.OBJ ?? [],
    chain: L.CHAIN ?? [],
    lifecycle: L.LIFECYCLE ?? undefined,
    objMap: L.OBJ_MAP ?? undefined,
    cards,
    log: [{ rev: 0, at, actor: 'import', summary: '从旧版 HTML 导入', ops: 0 }],
  })
}

/** 去掉场景演示的引用字段（scn），其余原样保留。 */
function stripScn(value) {
  if (Array.isArray(value)) return value.map(stripScn)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) if (k !== 'scn') out[k] = stripScn(v)
    return out
  }
  return value
}

export function fingerprint(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
}

/** 新数据 → 旧模板常量（只读快照）。完成项保留并加进度标签。 */
export function toLegacy(input) {
  const data = normalize(input)
  const d = derive(data)
  const tag = (kind, item) => {
    if (!CLOSED[kind].has(item.progress)) return item.title
    const labels = kind === 'issue' ? LABELS.issueProgress : LABELS.adjProgress
    return `【${labels[item.progress]}】${item.title}`
  }
  const FEAT = data.features.map(f => ({ ...f, qs: d.featureQs[f.id], adj: d.featureAdj[f.id], mods: d.featureMods[f.id] }))
  const QS = data.issues.map(q => ({ ...q, title: tag('issue', q) }))
  const ADJ = data.adjustments.map(a => ({ ...a, title: tag('adjustment', a) }))
  const DEEP = {}
  for (const [fid, card] of Object.entries(data.cards)) DEEP[fid] = { ...card, scenarios: [], mock: null }
  return {
    PRD_META: { badge: null, scopeNote: '', ...data.meta },
    OBJS: data.objs, CAPS: data.caps, FEAT, QS, ADJ,
    GRULES: data.rules, MODS: data.modules, OBJ: data.objects, CHAIN: data.chain,
    LIFECYCLE: data.lifecycle, OBJ_MAP: data.objMap, DEEP,
    CODE_NOTE: data.meta.codeNote ?? '', NOTE_STATIC: '',
  }
}

/** 用模板生成只读快照 HTML。 */
export function renderLegacyHtml(template, input) {
  const L = toLegacy(input)
  const { start, end } = dataRange(template)
  const body = Object.entries(L).map(([k, v]) => `const ${k} = ${JSON.stringify(v, null, 1)};`).join('\n\n')
  const fp = fingerprint(normalize(input))
  const head = `<!-- ${GENERATED_MARKER} revision=${input.revision ?? 0} fingerprint=${fp} — 由 PRD 研发视图插件生成，请勿直接修改；修改数据文件后重新导出 -->\n`
  return head + template.slice(0, start) + body + '\n\n\n' + template.slice(end)
}

/** HTML 是否是本插件生成的产物。 */
export function isGeneratedHtml(text) {
  return text.slice(0, 400).includes(GENERATED_MARKER)
}
