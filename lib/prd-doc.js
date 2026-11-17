/**
 * PRD 文档（Markdown）托管：按路径读取原文，找出引用的本地图片，
 * 复制到视图目录的 <PRD名>.assets/ 并改写链接。只改链接本身，不增删行，PRD 行号引用保持有效。
 */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { OpError } from './model.js'
import { setTimeout as delay } from 'node:timers/promises'

/** Windows virus scanners can briefly hold a newly closed file; never fall back to destructive copying. */
export async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try { return await fs.rename(from, to) } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code) || attempt >= 3) throw error
      await delay(20 * (attempt + 1))
    }
  }
}

export const PRD_MAX = 8 * 1024 * 1024
export const IMAGE_MAX = 20 * 1024 * 1024
export const ASSETS_MAX = 200 * 1024 * 1024
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|avif)$/i
/** 生成的文件名中不保留的字符（Windows 非法字符，以及会破坏 Markdown/URL 链接的字符）。 */
const UNSAFE = /[\\/:*?"<>|#%'`()[\]{}^]+/g

/** 清理用户粘贴的路径："复制文件地址" 带引号、file:// 地址。 */
export function cleanPath(input) {
  let s = String(input ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
  if (/^file:\/\//i.test(s)) { try { s = fileURLToPath(s) } catch { /* 保持原样 */ } }
  return s
}

/** 读取 Markdown：优先 UTF-8（去 BOM），不是合法 UTF-8 时按 GBK 解码。 */
export async function readMarkdown(file, size) {
  if (size > PRD_MAX) throw new OpError('PRD 文档过大（上限 8 MB）')
  const buf = await fs.readFile(file)
  let text, encoding = 'utf-8'
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try { text = new TextDecoder('gbk').decode(buf); encoding = 'gbk' } catch { text = buf.toString('utf8') }
  }
  text = text.replace(/^\uFEFF/, '')
  if (!text.trim()) throw new OpError('PRD 文档是空的')
  return { text, encoding, bytes: buf.length }
}

/** 校验来源路径：绝对路径、存在、是 .md 文件。 */
export async function checkSource(input) {
  const src = cleanPath(input)
  if (!src) throw new OpError('请填写 PRD 文档的路径（.md 文件）')
  if (!path.isAbsolute(src)) throw new OpError(`请填写完整路径（例如 D:\\文档\\产品PRD.md）：${src}`)
  if (!/\.(md|markdown)$/i.test(src)) throw new OpError(`PRD 文档只支持 Markdown（.md）文件：${path.basename(src)}`)
  const st = await fs.stat(src).catch(() => null)
  if (!st) throw new OpError(`找不到文件：${src}`)
  if (!st.isFile()) throw new OpError(`不是文件：${src}`)
  return { source: path.resolve(src), size: st.size }
}

// ---------------------------------------------------------------- 图片引用

/** 有序区间集合，二分查找是否命中。 */
function rangeSet(ranges) {
  const r = ranges.sort((a, b) => a[0] - b[0])
  return (i) => {
    let lo = 0, hi = r.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (r[mid][1] <= i) lo = mid + 1
      else if (r[mid][0] > i) hi = mid - 1
      else return true
    }
    return false
  }
}

/** 围栏代码块、缩进代码块与行内代码的范围。 */
function codeRanges(text) {
  const out = []
  const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm
  for (const m of text.matchAll(fence)) out.push([m.index, m.index + m[0].length])
  // 缩进代码块：空行之后、以 4 个空格或制表符开头的连续行
  const indented = /(?:^|\n[ \t]*\n)((?:(?: {4}|\t)[^\n]*(?:\n|$))+)/g
  for (const m of text.matchAll(indented)) { const s = m.index + m[0].length - m[1].length; out.push([s, s + m[1].length]) }
  // 行内代码：任意长度的反引号串，配对相同长度
  const inline = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g
  for (const m of text.matchAll(inline)) { if (!m[0].includes('\n\n')) out.push([m.index, m.index + m[0].length]) }
  return out
}

/** 从 i 开始读一个平衡的方括号段，返回结束位置（不含）或 -1。 */
function readBracket(text, i) {
  if (text[i] !== '[') return -1
  let depth = 0
  for (let j = i; j < text.length; j++) {
    const c = text[j]
    if (c === '\\') { j++; continue }
    if (c === '\n' && text[j + 1] === '\n') return -1
    if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) return j + 1 }
  }
  return -1
}

/** 读行内链接目标：<...> 或允许配对括号的裸地址。返回 { start, end, angle } 或 null。 */
function readDest(text, i) {
  let j = i
  while (text[j] === ' ' || text[j] === '\t') j++
  if (text[j] === '<') {
    const k = text.indexOf('>', j + 1)
    if (k < 0 || text.slice(j + 1, k).includes('\n')) return null
    return { start: j + 1, end: k, angle: true }
  }
  let depth = 0, k = j
  for (; k < text.length; k++) {
    const c = text[k]
    if (c === '\\') { k++; continue }
    if (/\s/.test(c)) break
    if (c === '(') depth++
    else if (c === ')') { if (depth === 0) break; depth-- }
  }
  return k > j ? { start: j, end: k, angle: false } : null
}

const normLabel = s => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * 找出 Markdown 中的图片引用位置。返回 { start, end, url, angle?, html? }，start/end 是 url 在全文中的位置。
 * 覆盖：![alt](url "title")、![alt](<url>)、引用式 ![alt][id] 与 [id]: url、HTML <img src>。代码内的内容跳过。
 */
export function findImageRefs(text) {
  const refs = []
  const inCode = rangeSet(codeRanges(text))
  const used = new Set()
  for (let i = text.indexOf('!['); i >= 0; i = text.indexOf('![', i + 1)) {
    if (inCode(i) || (i > 0 && text[i - 1] === '\\')) continue
    const close = readBracket(text, i + 1)
    if (close < 0) continue
    if (text[close] === '(') {
      const d = readDest(text, close + 1)
      if (d) refs.push({ start: d.start, end: d.end, url: text.slice(d.start, d.end), angle: d.angle })
    } else if (text[close] === '[') {
      const c2 = readBracket(text, close)
      if (c2 > 0) used.add(normLabel(text.slice(close + 1, c2 - 1) || text.slice(i + 2, close - 1)))
    } else {
      used.add(normLabel(text.slice(i + 2, close - 1)))
    }
  }
  // 引用式定义：目标与标签在同一行
  const def = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]*>|[^\s]+)/gm
  for (let m; (m = def.exec(text));) {
    if (inCode(m.index) || !used.has(normLabel(m[1]))) continue
    let raw = m[2], start = m.index + m[0].length - raw.length
    const angle = raw.startsWith('<')
    if (angle) { raw = raw.slice(1, -1); start += 1 }
    refs.push({ start, end: start + raw.length, url: raw, angle })
  }
  // HTML img：只认 src 属性本身（不含 data-src 等），支持单引号、双引号、无引号
  const img = /<img\b[^>]*?(?<![\w-])src\s*=\s*(?:(["'])([^"'>]*?)\1|([^\s"'=<>`]+))/gi
  for (let m; (m = img.exec(text));) {
    if (inCode(m.index)) continue
    const raw = m[2] ?? m[3]
    const end = m.index + m[0].length - (m[1] ? 1 : 0)
    refs.push({ start: end - raw.length, end, url: raw, html: true, quote: m[1] ?? '' })
  }
  return refs.sort((a, b) => a.start - b.start)
}

/** 判断引用类型：remote 网络图片、data 内嵌、local 本地文件（返回候选绝对路径，按优先级）。 */
export function classify(url, baseDir) {
  const u = url.trim()
  if (!u || u.startsWith('#')) return { kind: 'skip' }
  if (/^data:/i.test(u)) return { kind: 'data' }
  const winAbs = /^[a-zA-Z]:[\\/]/.test(u)
  if (!winAbs && !/^file:/i.test(u) && (/^\/\//.test(u) || /^[a-z][a-z0-9+.-]*:/i.test(u))) return { kind: 'remote' }
  const toAbs = (p) => {
    if (/^file:/i.test(p)) { try { p = fileURLToPath(p) } catch { return undefined } }
    try { p = decodeURI(p) } catch { /* 保持原样 */ }
    if (/^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p)) return path.resolve(p)
    // 以 / 开头：按 md 所在盘的根目录解析
    if (/^[\\/]/.test(p)) return path.resolve(path.parse(baseDir).root, p.replace(/^[\\/]+/, ''))
    return path.resolve(baseDir, p)
  }
  // 先按原样（文件名里可能真有 # 或 ?），再去掉 ?query / #hash
  const cands = [...new Set([toAbs(u), toAbs(u.replace(/[?#].*$/, ''))].filter(Boolean))]
  return cands.length ? { kind: 'local', cands } : { kind: 'skip' }
}

/** 行号查询：预先算好每行起点，二分查找。 */
function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return (pos) => {
    let lo = 0, hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
}

/**
 * 分析 PRD：读原文、找图片、检查是否存在。
 * @returns {{ source, name, text, encoding, bytes, images:[{abs,size,mtimeMs,refs}], missing, notImage, remote, inline, totalBytes }}
 */
export async function inspectPrd(input, { onProgress } = {}) {
  await onProgress?.({ stage: 'inspect' })
  const { source, size } = await checkSource(input)
  const { text, encoding, bytes } = await readMarkdown(source, size)
  const baseDir = path.dirname(source)
  const refs = findImageRefs(text)
  const lineOf = lineIndex(text)
  const images = new Map(), missing = new Map(), notImage = new Map()
  const statCache = new Map()
  const stat = async (p) => { if (!statCache.has(p)) statCache.set(p, await fs.stat(p).catch(() => null)); return statCache.get(p) }
  const note = (map, r, reason) => {
    const prev = map.get(r.url)
    if (prev) prev.count++
    else map.set(r.url, { url: r.url, line: lineOf(r.start), count: 1, ...(reason ? { reason } : {}) })
  }
  let remote = 0, inline = 0
  for (const r of refs) {
    const c = classify(r.url, baseDir)
    if (c.kind === 'remote') { remote++; continue }
    if (c.kind === 'data') { inline++; continue }
    if (c.kind !== 'local') continue
    let hit
    for (const p of c.cands) { const st = await stat(p); if (st?.isFile()) { hit = { abs: p, st }; break } }
    if (!hit) { note(missing, r); continue }
    const key = hit.abs.toLowerCase()
    if (images.has(key)) { images.get(key).refs.push(r); continue }
    if (!IMAGE_EXT.test(hit.abs)) { note(notImage, r); continue }
    if (hit.st.size > IMAGE_MAX) { note(missing, r, '超过 20 MB'); continue }
    images.set(key, { abs: hit.abs, size: hit.st.size, mtimeMs: hit.st.mtimeMs, refs: [r] })
  }
  const list = [...images.values()]
  const totalBytes = list.reduce((s, x) => s + x.size, 0)
  if (totalBytes > ASSETS_MAX) throw new OpError(`引用的图片合计 ${Math.round(totalBytes / 1048576)} MB，超过上限 200 MB`)
  const info = { source, name: path.basename(source), text, encoding, bytes, images: list, missing: [...missing.values()], notImage: [...notImage.values()], remote, inline, totalBytes }
  await onProgress?.({ stage: 'inspect', inspection: summarize(info) })
  return info
}

/** 给外部使用的检查结果（不含全文）。 */
export function summarize(info) {
  return {
    source: info.source, name: info.name, encoding: info.encoding, bytes: info.bytes,
    images: info.images.length, imageBytes: info.totalBytes, remote: info.remote, inline: info.inline,
    missing: info.missing, notImage: info.notImage,
  }
}

// ---------------------------------------------------------------- 写入视图目录

/** 规划写入：目标文件名、改写后的正文、图片清单与内容签名。不碰磁盘。 */
export function planPrd(info) {
  const base = safeBase(info.name)
  const mdName = `${base}.md`
  const assetsName = `${base}.assets`
  const used = new Set()
  const files = [], edits = []
  for (const img of info.images) {
    const fname = uniqueName(img.abs, used)
    files.push({ from: img.abs, name: fname, size: img.size, mtimeMs: img.mtimeMs })
    const rel = `${assetsName}/${fname}`
    for (const r of img.refs) edits.push({ ...r, to: linkText(rel, r) })
  }
  let text = info.text
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    const s = e.angle ? e.start - 1 : e.start
    const t = e.angle ? e.end + 1 : e.end
    text = text.slice(0, s) + e.to + text.slice(t)
  }
  if (text.split('\n').length !== info.text.split('\n').length) throw new OpError('改写图片链接时行数发生变化，已取消')
  const sig = createHash('sha1').update(text)
  for (const f of files) sig.update(`\0${f.name}\0${f.size}\0${f.mtimeMs}`)
  return { mdName, assetsName: files.length ? assetsName : undefined, text, files, sig: sig.digest('hex').slice(0, 12) }
}

/** 与旧的托管内容相同（文件名、图片目录、正文与图片都没变）。 */
export function samePrd(plan, oldMeta) {
  return Boolean(oldMeta && oldMeta.file === plan.mdName && (oldMeta.assets ?? undefined) === plan.assetsName && oldMeta.sig === plan.sig)
}

/**
 * 写入视图目录：先在临时目录准备好 md 与图片，再整体替换。失败时尝试恢复；恢复失败保留备份并明确报错。
 * 返回 { meta, mdPath, commit(), rollback() }：元数据保存成功后调用 commit 移除旧文件，失败则调用 rollback。
 */
export async function writePrd({ dir, plan, info, oldMeta, isProtected, onProgress }) {
  const mdPath = path.join(dir, plan.mdName)
  const assetsPath = plan.assetsName ? path.join(dir, plan.assetsName) : null
  const oldMd = oldMeta?.file ? path.join(dir, oldMeta.file) : null
  const oldAssets = oldMeta?.assets ? path.join(dir, oldMeta.assets) : null
  const ownMd = oldMd && oldMd.toLowerCase() === mdPath.toLowerCase()
  const ownAssets = oldAssets && assetsPath && oldAssets.toLowerCase() === assetsPath.toLowerCase()
  if (existsSync(mdPath) && !ownMd) throw new OpError(`视图目录中已有不归本视图管理的同名文件「${plan.mdName}」，请把原文件改名后再试`)
  if (assetsPath && existsSync(assetsPath) && !ownAssets) throw new OpError(`视图目录中已有不归本视图管理的同名目录「${plan.assetsName}」，请把原文件改名后再试`)

  const tag = randomUUID().slice(0, 8)
  const stage = path.join(dir, `.prd-stage-${tag}`)
  const done = [] // 已执行的替换，用于恢复：{ target, backup }
  const cleanupStage = () => fs.rm(stage, { recursive: true, force: true }).catch(() => {})
  try {
    // 1. 准备
    await fs.mkdir(stage, { recursive: true })
    let completed = 0, bytesCompleted = 0
    const total = plan.files.length, bytesTotal = plan.files.reduce((sum, f) => sum + f.size, 0)
    await onProgress?.({ stage: 'copy', completed, total, bytesCompleted, bytesTotal })
    if (plan.files.length) {
      await fs.mkdir(path.join(stage, 'assets'))
      for (const f of plan.files) {
        const target = path.join(stage, 'assets', f.name)
        await fs.copyFile(f.from, target)
        const copied = await fs.stat(target)
        // 来源在预检后变化时不能继续把旧总量当作可靠分母。
        if (copied.size !== f.size) throw new OpError(`图片在检查后发生变化，请重试：${f.from}`)
        completed++; bytesCompleted += copied.size
        await onProgress?.({ stage: 'copy', completed, total, bytesCompleted, bytesTotal, currentFile: f.name })
      }
    }
    await fs.writeFile(path.join(stage, 'doc.md'), plan.text, 'utf8')
    // 2. 替换：已有的目标先移到备份名，再把准备好的放上去
    const swap = async (staged, target) => {
      let backup = null
      if (existsSync(target)) { backup = `${target}.prd-old-${tag}`; await renameWithRetry(target, backup) }
      done.push({ target, backup })
      await renameWithRetry(staged, target)
    }
    if (assetsPath) await swap(path.join(stage, 'assets'), assetsPath)
    await swap(path.join(stage, 'doc.md'), mdPath)
  } catch (error) {
    try { await restore(done) } catch (rollbackError) {
      throw rollbackFailure(error, rollbackError)
    }
    await cleanupStage()
    throw error instanceof OpError ? error : new OpError(`写入 PRD 文档失败（文件可能被占用）：${error.message}`)
  }
  await cleanupStage()
  // 名字不同的旧托管文件，在元数据保存成功后移除（只删本视图目录下的 .md / .assets）
  const stale = []
  if (oldMd && !ownMd && /\.md$/i.test(oldMd) && path.dirname(oldMd) === dir && !isProtected(oldMd)) stale.push(oldMd)
  if (oldAssets && !ownAssets && /\.assets$/i.test(oldAssets) && path.dirname(oldAssets) === dir) stale.push(oldAssets)
  const meta = {
    file: plan.mdName, ...(plan.assetsName ? { assets: plan.assetsName } : {}), source: info.name,
    images: plan.files.length, missing: info.missing.length, remote: info.remote, sig: plan.sig, updatedAt: new Date().toISOString(),
  }
  return {
    meta, mdPath, assetsPath,
    async commit() {
      for (const d of done) if (d.backup) await fs.rm(d.backup, { recursive: true, force: true }).catch(() => {})
      for (const p of stale) await fs.rm(p, { recursive: true, force: true }).catch(() => {})
    },
    async rollback() { await restore(done) },
  }
}

/** 撤销替换：删除新放上的目标，备份改回原名。 */
async function restore(done) {
  const failures = []
  for (const d of [...done].reverse()) {
    try {
      await fs.rm(d.target, { recursive: true, force: true })
      if (d.backup) await renameWithRetry(d.backup, d.target)
      done.splice(done.indexOf(d), 1)
    } catch (error) { failures.push(`${d.target}${d.backup ? `（备份：${d.backup}）` : ''}：${error.message}`) }
  }
  if (failures.length) {
    const error = new OpError(`回滚未完成，已保留恢复所需文件，请检查后再操作：${failures.join('；')}`)
    error.rollbackFailed = true
    throw error
  }
}

export function rollbackFailure(error, rollbackError) {
  const failure = new OpError(`${error.message}；${rollbackError.message}`)
  failure.rollbackFailed = true
  failure.cause = error
  return failure
}

function safeBase(name) {
  const b = path.basename(String(name)).replace(/\.(md|markdown)$/i, '').replace(UNSAFE, '_').replace(/_+/g, '_').trim()
  return b && !/^[._]+$/.test(b) ? b : 'PRD'
}

/** 图片文件名：保留原名，空白与会破坏链接的字符换成下划线，重名加序号。 */
function uniqueName(abs, used) {
  const ext = path.extname(abs).toLowerCase()
  const stem = path.basename(abs, path.extname(abs)).replace(/\s+/g, '_').replace(UNSAFE, '_').replace(/_+/g, '_') || 'image'
  let name = `${stem}${ext}`, i = 2
  while (used.has(name.toLowerCase())) name = `${stem}-${i++}${ext}`
  used.add(name.toLowerCase())
  return name
}

/** 新链接文本：md 里含空格时用尖括号；HTML 无引号属性含空格时补双引号。 */
function linkText(rel, ref) {
  if (ref.html) return !ref.quote && /\s/.test(rel) ? `"${rel}"` : rel
  return ref.angle || /\s/.test(rel) ? `<${rel}>` : rel
}
