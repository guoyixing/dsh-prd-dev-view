// 离线冒烟测试：导入旧 HTML → 检查 → 编辑（含删除守卫）→ 导出。
// 用法：node test/smoke.mjs <旧版 HTML 绝对路径> <临时目录>
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PrdViewService } from '../lib/service.js'
import { applyOps, derive, normalize } from '../lib/model.js'

const [source, tmp] = process.argv.slice(2)
assert.ok(source && tmp && path.isAbsolute(source) && path.isAbsolute(tmp), 'Usage: node test/smoke.mjs <absolute HTML path> <empty absolute temporary directory>')
await fs.mkdir(tmp, { recursive: true })
assert.deepEqual(await fs.readdir(tmp), [], 'Refuse to reuse a nonempty directory; no existing files will be deleted')
const svc = new PrdViewService({ registryDir: path.join(tmp, 'registry'), autoExport: true }, console)
const dataFile = path.join(tmp, 'demo.prdview.json')

const imported = await svc.importSource({ source, dataFile, htmlFile: path.join(tmp, 'demo-研发视图.html') })
console.log('import', JSON.stringify(imported.counts), 'lint', JSON.stringify(imported.lint))

const pid = imported.project
const { data, derived } = await svc.load(pid)
const q = data.issues[0], a = data.adjustments.find(x => x.progress === 'todo')
console.log('first issue', q.id, q.features, 'first adj', a.id)

// 删除守卫：直接去掉一个条目必须被拒绝
const broken = normalize(data); broken.issues = broken.issues.slice(1)
const { assertNothingRemoved } = await import('../lib/model.js')
assert.throws(() => assertNothingRemoved(data, broken), /消失/)
assert.throws(() => applyOps(data, [{ op: 'delete', kind: 'issue', id: q.id }]), /不允许删除/)
assert.throws(() => applyOps(data, [{ op: 'progress', kind: 'adjustment', id: a.id, to: 'done' }]), /reason/)

const receipt = await svc.apply(pid, [
  { op: 'progress', kind: 'adjustment', id: a.id, to: 'done', reason: '冒烟测试', commit: 'abc123' },
  { op: 'progress', kind: 'issue', id: q.id, to: 'resolved', reason: '业务已确认' },
], { actor: 'test', reason: 'smoke' })
console.log('receipt', JSON.stringify(receipt, null, 1))
const after = await svc.load(pid)
assert.equal(after.data.issues.length, data.issues.length)
assert.equal(after.derived.counts.issuesOpen, derived.counts.issuesOpen - 1)
const html = await fs.readFile(receipt.exported, 'utf8')
assert.ok(html.startsWith('<!-- prd-dev-view:generated'))
assert.ok(html.includes('【已完成】'))
console.log('lint', JSON.stringify((await svc.lint(pid)).errors.slice(0, 5)), 'warnings', (await svc.lint(pid)).warnings.length)
console.log('OK')
