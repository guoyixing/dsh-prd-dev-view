// 离线渲染测试：jsdom + React 18 加载 client.js，接到真实 Host 插件（假上下文）。
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)
const tmp = process.argv[2]
assert.ok(tmp && path.isAbsolute(tmp), 'Usage: node test/render-test.mjs <absolute fixture directory prepared by smoke and host-harness>')
const pluginDir = fileURLToPath(new URL('..', import.meta.url))

const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/' })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.FileReader = dom.window.FileReader
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true }); globalThis.HTMLElement = dom.window.HTMLElement
globalThis.CSS = { escape: s => String(s).replace(/"/g, '\\"') }; dom.window.CSS = globalThis.CSS
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = require('react')
const errors = []
const origError = console.error
console.error = (...a) => { if (String(a[0]).includes('not wrapped in act')) return; errors.push(a.map(String).join(' ').slice(0, 300)); }

// Host
const host = await import(new URL('../index.js', import.meta.url))
const routes = new Map()
const fake = { logger: console, effect(f) { f() }, on() {}, inject(n, cb) { cb({ ...fake, skills: { registerProvider() {} }, tools: { register() {}, guard() {} }, get: k => (k === 'connection' ? { fetch: { register: r => routes.set(r.path, r) } } : undefined) }) } }
host.apply(fake, { registryDir: path.join(tmp, 'registry'), autoExport: false })
const rpc = { async call(_ch, method, payload) {
  const r = routes.get('/api/' + method)
  const res = await r.fetch(new Request('http://x/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method, payload }) }))
  return (await res.json()).result
} }

// Client
let mod
window.__ModuleLoader__ = { load(m) { mod = m.factory(n => require(n)) } }
new Function(readFileSync(path.join(pluginDir, 'client.js'), 'utf8'))()
const regs = []
const disposers = []
const ctx = {
  sidebarRight: { mounted: { getSnapshot: () => 's1', subscribe: () => () => {} }, openTab() {} },
  sidebarRightTabs: { register() { return () => {} } }, uiWorkspace: {},
  effect(f) { const dispose = f(); if (typeof dispose === 'function') disposers.push(dispose) }, locale: { register() { return () => {} }, bind: () => undefined },
  get: k => (k === 'connection' ? { rpc } : undefined),
  slots: { inject(_n, cb) { cb() }, register(opts, C) { regs.push({ opts, C }) } },
}
mod.apply(ctx)
console.log = (...a) => process.stdout.write(a.join(' ') + '\n')
const tab = regs.find(r => r.opts.name === 'conversation.view')
const settings = regs.find(r => r.opts.name === 'settings.section')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const root = createRoot(document.getElementById('root'))
const props = { ...tab.opts.inject('s1'), viewRequest: null, completeViewRequest() {}, openView() {} }
// Start explicitly unbound even when the Host regression fixture retains an earlier binding.
await props.store.bind('s1', null)
await act(async () => { root.render(React.createElement(tab.C, props)) })
await act(async () => { await sleep(300) })
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const click = async (el, type = 'click') => { assert.ok(el, `Missing target for ${type}`); await act(async () => { el.dispatchEvent(new window.MouseEvent(type, { bubbles: true })); await sleep(120) }) }
await act(async () => { await sleep(800) })
// 未绑定：显示绑定/新建面板
console.log('unbound', $('.pdv-unbound h3')?.textContent, 'candidates', $$('.pdv-unbound .opt').length, 'create disabled', $('.pdv-unbound .pdv-btn.pri')?.disabled)
await click($$('.pdv-mode button').find(b => b.textContent === '新建'))
// 新建表单：填 PRD 路径（只接受 md，自动检查图片）、名称自动带出、保存位置可改
const setVal = async (el, v, wait = 50) => { await act(async () => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })); await sleep(wait) }) }
const { mkdirSync, writeFileSync } = await import('node:fs')
mkdirSync(path.join(tmp, 'prd-src', 'media'), { recursive: true }); writeFileSync(path.join(tmp, 'prd-src', 'media', 'a.png'), 'PNG')
writeFileSync(path.join(tmp, 'prd-src', '产品架构PRD.md'), '# 产品架构\n![图](media/a.png)\n![缺](media/b.png)\n')
writeFileSync(path.join(tmp, 'prd-src', 'spec.docx'), 'x')
const pathInput = $('.pdv-unbound .prd-path input')
await setVal(pathInput, path.join(tmp, 'prd-src', 'spec.docx'), 900)
console.log('docx rejected', $('.pdv-unbound .prd-res.err')?.textContent)
await setVal(pathInput, `"${path.join(tmp, 'prd-src', '产品架构PRD.md')}"`, 900)
const nameInput = $$('.pdv-unbound .field input.pdv-input')[1], locInput = $('.pdv-unbound .loc input')
console.log('md checked', $('.pdv-unbound .prd-res.ok')?.textContent, 'name', nameInput?.value, 'loc', locInput?.value)
await setVal(locInput, path.join(tmp, 'custom-views'))
console.log('custom loc create enabled', !$('.pdv-unbound .pdv-btn.pri').disabled, 'reset shown', $$('.pdv-unbound .loc .pdv-btn').length)
await click($$('.pdv-mode button').find(b => b.textContent === '已有视图'))
// Select the registered smoke fixture, not the first (project-local) candidate.
// Host reopened its adjustment; the project-local imported copy remains fully closed.
const fixtureOption = $$('.pdv-unbound .opt').find(el => el.querySelector('small')?.textContent === path.join(tmp, 'demo.prdview.json'))
assert.ok(fixtureOption, 'The registered fictional smoke fixture must be available')
await click(fixtureOption.querySelector('.pdv-btn'))
await act(async () => { await sleep(800) })
// 头部绑定选择器（同一份状态）
const pick = regs.find(r => r.opts.name === 'conversation.session.header.utilities')
const pickHost = document.createElement('div'); document.body.appendChild(pickHost)
const pickRoot = createRoot(pickHost)
await act(async () => { pickRoot.render(React.createElement(pick.C, pick.opts.inject('s1'))); await sleep(300) })
console.log('picker', pickHost.querySelector('select')?.value, 'options', [...pickHost.querySelectorAll('option')].map(o => o.textContent).join('|'))
console.log('title', $('.pdv-title-text')?.textContent)
console.log('summary prd', $('.pdv-prdbar .prd')?.textContent, 'prd buttons', $$('.pdv-prdbar .pdv-btn').map(b => b.textContent).join('|'))
await click($$('.pdv-prdbar .pdv-btn').at(-1))
console.log('prd form open', Boolean($('.pdv-prdform .prd-path input')), 'submit disabled', $('.pdv-prdform .pdv-btn.pri')?.disabled)
await click($$('.pdv-prdform .pdv-btn')[1])
console.log('summary kpis', $$('.pdv-kpi').length, 'rows', $$('.pdv-lrow').length, 'tabs', $$('.pdv-tab').map(b => b.textContent).join('|'))
await click($$('.pdv-tab')[1])
if (!$$('.pdv-chip').length) { console.log(document.getElementById('root').textContent.slice(0, 600)); console.log(errors.join('\n').slice(0, 2000)); process.exit(1) }
console.log('chips', $$('.pdv-chip').length, 'stats', $('.pdv-stats')?.textContent)
await click($('.pdv-chip'))
console.log('selected drawer', $('.pdv-drawer .t')?.textContent?.slice(0, 40), 'dimmed root', $('.pdv').className)
await click($('.pdv-chip'), 'dblclick')
console.log('card stages', $$('.pdv-cgrid .sh').length, 'nodes', $$('.pdv-node').length, 'spans', $$('.pdv-span').length)
const step = $$('.pdv-node')[2]; await click(step)
console.log('step sel drawer', $('.pdv-drawer .t')?.textContent?.slice(0, 40), 'rel', $$('.is-rel').length)
const span = $$('.pdv-span')[0]; if (span) { await click(span); console.log('span sel', $('.pdv-drawer .t')?.textContent?.slice(0, 40)) }
const segBtns = $$('.pdv-crumb .pdv-seg button'); await click(segBtns[1]); console.log('simple boxes', $$('.pdv-box').length)
for (const [i, name] of ['list', 'overview', 'rules'].entries()) {
  await click($$('.pdv-tab')[i + 2])
  console.log(name, 'rows', $$('.pdv-table tr.row').length, 'states', $$('.pdv-state').length, 'svg g', $$('.pdv-map g').length)
  if (name === 'rules') {
    await click($('.pdv-rtable th.fh'))
    console.log('rules col focus', $('.pdv-focus')?.textContent, 'col-on cells', $$('.pdv-rtable td.col-on').length, 'faded rows', $$('.pdv-rtable tr.fade').length, 'drawer', $('.pdv-drawer .t')?.textContent?.slice(0, 20))
    await click($$('.pdv-rtable tr.row')[0])
    console.log('rules row focus', $('.pdv-focus')?.textContent, 'row-sel', $$('.pdv-rtable tr.row-sel').length, 'cols on', $$('.pdv-rtable th.col-on').length)
    await click($('.pdv-focus .pdv-x'))
    console.log('rules cleared', !$('.pdv-focus'), 'drawer', !$('.pdv-drawer'))
  }
}
await click($$('.pdv-tab')[2])
await click($$('.pdv-table tr.row')[0])
console.log('list drawer', $('.pdv-drawer .t')?.textContent?.slice(0, 50), 'buttons', $$('.pdv-drawer .pdv-actions button').map(b => b.textContent).join('|'))
// 标记进行中（不需要说明）
const startBtn = $$('.pdv-drawer .pdv-actions button').find(b => b.textContent === '已答复' || b.textContent === '开始处理')
if (startBtn) { await click(startBtn); await act(async () => { await sleep(400) }); console.log('after action toast', $('.pdv-toast')?.textContent?.slice(0, 80)) }
// 已完成分组
const fold = $$('.pdv-table tr.grp').find(r => r.textContent.includes('已完成')); console.log('closed fold', fold?.textContent)
// 头部选「无」：页签回到未绑定面板
const sel0 = pickHost.querySelector('select')
await act(async () => { sel0.value = ''; sel0.dispatchEvent(new window.Event('change', { bubbles: true })); await sleep(500) })
console.log('after none: picker', JSON.stringify(sel0.value), 'tab unbound', Boolean($('.pdv-unbound')))
pickRoot.unmount()
await act(async () => { root.render(React.createElement(settings.C, { ...settings.opts.inject(), close() {} })) })
await act(async () => { await sleep(300) })
console.log('settings cards', $$('.pdvs .card').length, 'switches', $$('.pdv-switch').length, $('.pdvs h2')?.textContent)
console.log('ERRORS', errors.length); for (const e of errors.slice(0, 8)) console.log(' -', e)
root.unmount()
disposers.reverse().forEach(dispose => dispose())
process.exit(errors.length ? 1 : 0)
