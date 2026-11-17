// 用假的 Cordis 上下文加载 Host 插件：检查工具、对话绑定、守卫、提醒、路由与 skill 注册。
// 用法：node test/host-harness.mjs <临时目录>（需先运行 smoke.mjs 生成登记表与 demo 视图）
import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import * as plugin from '../index.js'

const tmp = process.argv[2]
assert.ok(tmp && path.isAbsolute(tmp), 'Usage: node test/host-harness.mjs <absolute fixture directory prepared by smoke>')
const tools = [], toolOpts = [], guards = [], routes = new Map(), providers = [], listeners = {}

// 假 agent：对话编号 = agent.id，工作目录来自 session.header.cwd
const injected = []
const makeAgent = (id, cwd) => ({ id, session: { header: { cwd } }, inject: m => injected.push({ id, text: m.content[0].text }) })
const proj = path.join(tmp, 'proj'), other = path.join(tmp, 'other')
mkdirSync(path.join(proj, '.git'), { recursive: true }); mkdirSync(path.join(proj, 'src'), { recursive: true }); mkdirSync(path.join(other, '.git'), { recursive: true })
const agents = new Map([['s1', makeAgent('s1', path.join(proj, 'src'))], ['s2', makeAgent('s2', other)], ['s3', makeAgent('s3', proj)]])

const fakeCtx = {
  logger: console,
  effect(fn) { fn() },
  on(name, fn) { listeners[name] = fn },
  inject(names, cb) {
    cb({
      ...fakeCtx,
      skills: { registerProvider: f => providers.push(f()) },
      tools: { register: (d, o) => { tools.push(d); toolOpts.push(o) }, guard: g => guards.push(g) },
      get: n => (n === 'connection' ? { fetch: { register: r => routes.set(r.path, r) } } : n === 'agents' ? { get: id => agents.get(id) } : undefined),
      effect(fn) { fn() },
    })
  },
}
plugin.apply(fakeCtx, { registryDir: path.join(tmp, 'registry'), autoExport: false })
assert.deepEqual(tools.map(t => t.name), ['prd_view', 'prd_view_edit'])
assert.equal(typeof toolOpts[1]?.when, 'function', '编辑工具应按绑定条件提供')
assert.equal(providers[0].name, 'prd-dev-view')
assert.ok((await providers[0].get()).content.includes('prd_view_edit'))
console.log('routes', routes.size)

const view = tools[0], edit = tools[1], when = toolOpts[1].when
const out = s => JSON.parse(s)
const ex = id => ({ agent: agents.get(id) })
const call = async (method, payload) => {
  const route = routes.get('/api/prd-view.' + method)
  const res = await route.fetch(new Request('http://x/api/prd-view.' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'prd-view.' + method, payload }) }))
  return (await res.json()).result
}

// 1. 项目里还没有视图：未绑定，编辑工具不提供，修改被拒绝
let b = (await call('binding', { sessionId: 's1' })).value
assert.equal(b.project, null); assert.equal(b.source, 'none')
assert.ok(b.viewsDir.endsWith(path.join('proj', '.dsh', 'prd-views')), b.viewsDir)
const registered = b.candidates.find(p => p.scope === 'registered')
assert.ok(registered, '已登记的外部视图应可选')
assert.equal(await when(ex('s1')), false)
await assert.rejects(view.execute({ action: 'summary' }, ex('s1')), /未绑定/)
await assert.rejects(edit.execute({ ops: [] }, ex('s1')), /未绑定/)
console.log('unbound ok')

// 2. 新建项目视图并绑定：PRD 按路径读取，只支持 md；引用的本地图片复制到 <名>.assets 并改写链接
const fsx = await import('node:fs')
const src = path.join(tmp, 'prd-src'); fsx.mkdirSync(path.join(src, 'doc', 'media'), { recursive: true }); fsx.mkdirSync(path.join(src, 'shared'), { recursive: true })
fsx.writeFileSync(path.join(src, 'doc', 'media', 'image1.png'), 'PNG1')
fsx.writeFileSync(path.join(src, 'shared', 'flow chart.png'), 'PNG2')
const md = [
  '# 产品架构 PRD', '', '![流程](media/image1.png)', '![共享](<../shared/flow chart.png> "标题")',
  '<img src="media/image1.png" width="300">', '![网络](https://example.com/a.png)', '![缺失](media/none.png)',
  '```', '![代码块里](media/skip.png)', '```', '![引用式][r1]', '', '[r1]: media/image1.png', '',
].join('\n')
const mdPath = path.join(src, 'doc', '产品架构PRD.md')
fsx.writeFileSync(mdPath, md)
const docxPath = path.join(src, 'doc', 'a.docx'); fsx.writeFileSync(docxPath, 'x')
const noPrd = await call('createView', { sessionId: 's1', title: '演示视图' })
assert.equal(noPrd.ok, false); assert.match(noPrd.error.message, /PRD/)
const docx = await call('createView', { sessionId: 's1', title: '演示视图', prdPath: docxPath })
assert.equal(docx.ok, false); assert.match(docx.error.message, /Markdown/)
const insp = (await call('inspectPrd', { path: `"${mdPath}"` })).value
assert.equal(insp.images, 2); assert.equal(insp.remote, 1); assert.equal(insp.missing.length, 1); assert.equal(insp.missing[0].line, 7)
console.log('inspect', JSON.stringify({ images: insp.images, remote: insp.remote, missing: insp.missing }))
const createdRes = await call('createView', { sessionId: 's1', title: '演示视图', prdPath: mdPath })
assert.ok(createdRes.ok, JSON.stringify(createdRes))
const created = createdRes.value
const viewDir = path.join(proj, '.dsh', 'prd-views', '演示视图')
assert.ok(existsSync(path.join(viewDir, '演示视图.prdview.json')))
const copied = fsx.readFileSync(path.join(viewDir, '产品架构PRD.md'), 'utf8')
assert.equal(copied.split('\n').length, md.split('\n').length, '行数不变')
assert.ok(copied.includes('![流程](产品架构PRD.assets/image1.png)'))
assert.ok(copied.includes('![共享](<产品架构PRD.assets/flow_chart.png> "标题")'), copied)
assert.ok(copied.includes('<img src="产品架构PRD.assets/image1.png"'))
assert.ok(copied.includes('[r1]: 产品架构PRD.assets/image1.png'))
assert.ok(copied.includes('https://example.com/a.png') && copied.includes('media/none.png') && copied.includes('media/skip.png'))
assert.deepEqual(fsx.readdirSync(path.join(viewDir, '产品架构PRD.assets')).sort(), ['flow_chart.png', 'image1.png'])
assert.equal(created.created.prdFile, path.join(viewDir, '产品架构PRD.md'))
assert.equal(created.binding.source, 'explicit'); assert.equal(created.binding.project.relPath, '.dsh/prd-views/演示视图/演示视图.prdview.json')
// 自定义位置（项目视图目录以外）：登记到本机，仍可绑定
const custom = (await call('createView', { sessionId: 's2', title: '外部视图', location: 'docs/views', prdPath: mdPath })).value
assert.ok(existsSync(path.join(other, 'docs', 'views', '外部视图', '外部视图.prdview.json')))
assert.equal(custom.binding.project.id, custom.created.id)
await call('bind', { sessionId: 's2', project: null })
// PRD 文档与图片受保护
await new Promise(r => setTimeout(r, 100))
assert.ok(guards[0]({ name: 'edit', arguments: { file_path: path.join(viewDir, '产品架构PRD.md') } })?.includes('PRD'))
assert.ok(guards[0]({ name: 'write', arguments: { file_path: path.join(viewDir, '产品架构PRD.assets', 'image1.png') } })?.includes('PRD'))
// 从原文件更新：没变化时不产生修订；原文改动后重新复制
const same = (await call('setPrd', { project: created.created.id })).value
assert.equal(same.unchanged, true)
fsx.writeFileSync(path.join(src, 'doc', 'media', 'none.png'), 'PNG3')
const upd = (await call('setPrd', { project: created.created.id })).value
assert.equal(upd.unchanged, false); assert.equal(upd.verb, '更新'); assert.equal(upd.prd.images, 3)
assert.ok(existsSync(path.join(viewDir, '产品架构PRD.assets', 'none.png')))
// 更换为另一份 PRD：旧文档与旧图片目录移除
const md2 = path.join(src, 'doc', '产品架构PRD-v2.md'); fsx.writeFileSync(md2, '# v2\n![x](media/image1.png)\n')
const swapped = await call('setPrd', { project: created.created.id, path: md2 })
assert.ok(swapped.ok, JSON.stringify(swapped))
assert.ok(!existsSync(path.join(viewDir, '产品架构PRD.md')) && !existsSync(path.join(viewDir, '产品架构PRD.assets')))
assert.ok(existsSync(path.join(viewDir, '产品架构PRD-v2.md')) && existsSync(path.join(viewDir, '产品架构PRD-v2.assets', 'image1.png')))
assert.ok(!fsx.readdirSync(viewDir).some(n => n.startsWith('.')), '不留临时目录')
const sumPrd = out(await view.execute({ action: 'summary' }, ex('s1')))
assert.equal(sumPrd.prdFile, path.join(viewDir, '产品架构PRD-v2.md'))
assert.ok(sumPrd.prdImages.startsWith(path.join(viewDir, '产品架构PRD-v2.assets')))
// 换成同内容但不同名的 md：不能被当成"无变化"而删掉
const md3 = path.join(src, 'doc', '另一份.md'); fsx.writeFileSync(md3, fsx.readFileSync(md2))
const swap2 = (await call('setPrd', { project: created.created.id, path: md3 })).value
assert.equal(swap2.unchanged, false)
assert.ok(existsSync(path.join(viewDir, '另一份.md')) && !existsSync(path.join(viewDir, '产品架构PRD-v2.md')))
// 识别边界：括号文件名、data-src、无引号 src、嵌套方括号、双反引号代码、转义
const { findImageRefs, planPrd, inspectPrd: insp2 } = await import('../lib/prd-doc.js')
const urls = findImageRefs([
  '![a](img/a(1).png)', '<img data-src="d.png" src="s.png">', '<img src=z.png>', '![a [b] c](n.png)',
  '``x ![no](c.png) y``', '\\![esc](e.png)', '![r][Foo  Bar]', '[foo bar]: ref.png', '', '    ![ind](i.png)',
].join('\n')).map(r => r.url)
assert.deepEqual(urls, ['img/a(1).png', 's.png', 'z.png', 'n.png', 'ref.png'], JSON.stringify(urls))
// 特殊字符的 PRD 名：生成的目录名与链接不含 # % '
fsx.writeFileSync(path.join(src, 'doc', "需求#2 (v1)'.md"), '![x](media/image1.png)\n')
const plan = planPrd(await insp2(path.join(src, 'doc', "需求#2 (v1)'.md")))
assert.ok(!/[#%'()]/.test(plan.mdName + plan.assetsName), plan.mdName)
assert.ok(plan.text.includes(`${plan.assetsName}/image1.png`), plan.text)
// 写入失败时恢复原状：目标 md 被一个目录占住，写入失败后视图目录不变、无临时文件
const before = fsx.readdirSync(viewDir).sort()
const blocker = path.join(src, 'doc', 'blocked.md'); fsx.writeFileSync(blocker, '# b\n![x](media/image1.png)\n')
fsx.mkdirSync(path.join(viewDir, 'blocked.md'))
const failed = await call('setPrd', { project: created.created.id, path: blocker })
assert.equal(failed.ok, false)
fsx.rmdirSync(path.join(viewDir, 'blocked.md'))
assert.deepEqual(fsx.readdirSync(viewDir).sort(), before.filter(n => n !== 'blocked.md'), '失败后目录保持原状')
// 相对路径写入也被守卫拦住
assert.ok(guards[0]({ name: 'write', arguments: { file_path: '.dsh/prd-views/演示视图/另一份.md' }, agent: agents.get('s3') })?.includes('PRD'))
assert.ok(guards[0]({ name: 'apply_patch', arguments: { patch: '*** Begin Patch\n*** Update File: .dsh/prd-views/演示视图/另一份.md\n' }, agent: agents.get('s3') })?.includes('PRD'))
// 性能：1 MB、3000 处引用
const big = Array.from({ length: 3000 }, (_, i) => `第 ${i} 段 ${'文字'.repeat(150)} ![x](media/image1.png)`).join('\n')
fsx.writeFileSync(path.join(src, 'doc', 'big.md'), big)
const t0 = Date.now(); await insp2(path.join(src, 'doc', 'big.md')); const dt = Date.now() - t0
assert.ok(dt < 1500, `检查大文档用时 ${dt}ms`)
console.log('edge cases ok', `big ${dt}ms`)
// GBK 编码
const gbk = path.join(src, 'doc', 'gbk.md'); fsx.writeFileSync(gbk, Buffer.from([0x23, 0x20, 0xb2, 0xfa, 0xc6, 0xb7, 0x0a]))
const gi = (await call('inspectPrd', { path: gbk })).value
assert.equal(gi.encoding, 'gbk')
await assert.rejects(edit.execute({ ops: [{ op: 'set', kind: 'meta', fields: { prd: { file: 'x.prdview.json' } } }] }, ex('s1')), /托管/)
const dotName = await call('createView', { sessionId: 's3', title: '..', prdPath: mdPath })
assert.equal(dotName.ok, false)
console.log('prd ok')
assert.ok(injected.some(x => x.id === 's1' && x.text.includes('已绑定')), '绑定后应提示模型')
assert.equal(await when(ex('s1')), true)
const r1 = out(await edit.execute({ ops: [{ op: 'set', kind: 'meta', fields: { branch: 'feature-x' } }], reason: 'harness' }, ex('s1')))
assert.equal(r1.project, created.created.id)
await assert.rejects(edit.execute({ project: registered.id, ops: [] }, ex('s1')), /不能修改其他研发视图/)
const sum1 = out(await view.execute({ action: 'summary' }, ex('s1')))
assert.equal(sum1.project, created.created.id)
console.log('create+edit ok', r1.changes)
// 导入到项目内视图：不写入全局登记，不写本机仓库路径
const imp = out(await view.execute({ action: 'import', source: path.join(tmp, 'demo.prdview.json'), dataFile: created.created.dataFile, repo: 'D:/x' }, ex('s1')))
assert.equal(imp.project, created.created.id)
const regAfter = (await call('projects', {})).value.projects
assert.ok(!regAfter.some(p => p.id === created.created.id), '项目内视图不应写入全局登记')
const projData = JSON.parse((await import('node:fs')).readFileSync(created.created.dataFile, 'utf8'))
assert.equal(projData.meta.repo, undefined)
assert.equal(projData.meta.prd?.file, '另一份.md', '导入后保留托管的 PRD 文档')
console.log('import into project ok', JSON.stringify(imp.counts))

// 3. 同项目另一个对话：没选过时默认绑定第一份；选「无」后取消
b = (await call('binding', { sessionId: 's3' })).value
assert.equal(b.source, 'default'); assert.equal(b.project.id, created.created.id)
await assert.rejects(view.execute({ action: 'bind', project: 'none' }, ex('s3')), /未知 action/)
b = (await call('bind', { sessionId: 's3', project: null })).value
assert.equal(b.source, 'none'); assert.equal(b.project, null)
assert.equal(await when(ex('s3')), false)
b = (await call('binding', { sessionId: 's3' })).value
assert.equal(b.source, 'none', '选了「无」之后不再自动绑定')
await assert.rejects(view.execute({ action: 'import', source: path.join(tmp, 'demo.prdview.json'), dataFile: created.created.dataFile }, ex('s3')), /未绑定/)
await assert.rejects(view.execute({ action: 'import', source: path.join(tmp, 'demo.prdview.json') }, ex('s3')), /未绑定/)
await assert.rejects(view.execute({ action: 'import', source: path.join(tmp, 'demo.prdview.json'), dataFile: path.join(tmp, 'not-authorized.prdview.json') }, ex('s3')), /未绑定/)
console.log('default+none ok')

// 4. 其他项目的对话绑定已登记的外部视图
b = (await call('bind', { sessionId: 's2', project: registered.id })).value
assert.equal(b.project.id, registered.id)
// The fictional template has one adjustment, already closed by smoke; reopen it explicitly.
const sum2 = out(await view.execute({ action: 'summary', filter: 'all' }, ex('s2')))
assert.equal(sum2.project, registered.id)
const firstAdj = sum2.rows.find(r => r.startsWith('A'))?.split(' | ')[0]
assert.ok(firstAdj, 'The imported fixture must contain an adjustment')
const r2 = out(await edit.execute({ ops: [{ op: 'progress', kind: 'adjustment', id: firstAdj, to: 'doing' }], reason: 'harness' }, ex('s2')))
console.log('registered edit', r2.changes)
await assert.rejects(edit.execute({ ops: [{ op: 'delete', kind: 'issue', id: 'Q1' }] }, ex('s2')), /不允许删除/)

// 5. 代码改动提醒只发给绑定了该视图的对话
injected.length = 0
const codeFile = path.join(proj, 'src', 'a.js')
await listeners['tools/result']({ name: 'write', arguments: { file_path: codeFile }, agent: agents.get('s3') }, { kind: 'success' })
assert.equal(injected.length, 0, '未绑定的对话不应收到提醒')
await listeners['tools/result']({ name: 'write', arguments: { file_path: codeFile }, agent: agents.get('s1') }, { kind: 'success' })
assert.ok(injected.some(x => x.id === 's1' && x.text.includes('prd_view action=sync')), '绑定的对话应收到提醒')
console.log('reminder ok')

// 6. 守卫：项目视图与登记视图的数据文件都受保护
await new Promise(r => setTimeout(r, 200))
assert.ok(guards[0]({ name: 'write', arguments: { file_path: created.created.dataFile } })?.includes('prd_view_edit'))
assert.ok(guards[0]({ name: 'write', arguments: { file_path: path.join(tmp, 'demo.prdview.json') } }))
assert.equal(guards[0]({ name: 'write', arguments: { file_path: path.join(tmp, 'other.txt') } }), undefined)

// 7. 路由：指明视图加载；未指明报错
const loaded = await call('load', { project: registered.id })
assert.ok(loaded.ok, JSON.stringify(loaded))
const missing = await call('load', {})
assert.equal(missing.ok, false)
console.log('route load rev', loaded.value.data.revision)
console.log('OK')
