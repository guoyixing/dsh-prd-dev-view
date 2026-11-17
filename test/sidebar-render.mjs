// Run with react/react-dom 18.3.1 and jsdom installed as project devDependencies.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)
const pluginDir = fileURLToPath(new URL('..', import.meta.url))
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
globalThis.window = dom.window; globalThis.document = dom.window.document; Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
const errors = [], originalError = console.error
console.error = (...args) => { if (!String(args[0]).includes('not wrapped in act')) errors.push(args.join(' ')) }
let plugin, language = 'zh', current, opens = 0, creations = 0, draft = 'existing draft', tasks = []
const listeners = new Set(), calls = [], regs = [], cleanup = []
const binding = { source: 'none', root: 'E:/Project', viewsRel: '.dsh/prd-views', candidates: [] }
const translations = {}
const sidebar = { mounted: { getSnapshot: () => current, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) } }, openTab: kind => { assert.equal(kind, 'prd-dev-view'); assert.ok(current); opens++ } }
const workspace = { openWorkspace: async (id, before) => { assert.equal(id, 'w1'); creations++; before('s1'); current = 's1'; for (const fn of listeners) fn() } }
const conversation = { input: { requestDraftInitialization: (_binding, opts) => {
  calls.push(['draft', opts]); if (draft && opts.whenDraftExists === 'keep') return 'preserved'
  draft = draft ? draft + '\n\n' + opts.prompt : opts.prompt; return 'applied'
} } }
const api = async (method, args) => {
  method = method.replace(/^prd-view\./, ''); calls.push([method, args])
  if (method === 'binding') return binding
  if (method === 'creationTasks') return tasks
  if (method === 'createTask') { tasks = [{ id: 'task1', form: args, status: 'running', stage: 'copy', progress: { completed: 1, total: 3, bytesCompleted: 100, bytesTotal: 300 }, updatedAt: new Date().toISOString() }]; return tasks[0] }
  if (method === 'getGeneration') return { phase: 'cards', detail: 'reported', done: 2, total: 4, updatedAt: new Date().toISOString() }
  if (method === 'retryCreation') { tasks[0] = { ...tasks[0], status: 'completed', stage: 'complete' }; return tasks[0] }
  if (method === 'bind') return { ...binding, project: { id: args.project } }
  throw Error('Unexpected route ' + method)
}
const ctx = {
  sidebarRight: sidebar, uiWorkspace: workspace, sidebarRightTabs: { register: definition => { assert.equal(definition.keepMounted, true); return () => {} } },
  effect(fn) { const stop = fn(); if (typeof stop === 'function') cleanup.push(stop) },
  locale: { register(_ns, values) { Object.assign(translations, values); return () => {} }, bind: () => key => translations[language]?.[key] ?? key },
  get: key => ({ connection: { rpc: { call: async (_channel, method, args) => ({ ok: true, value: await api(method, args) }) } }, conversation, sessions: { binding: id => ({ sessionId: id }), list: { getSnapshot: () => ({ ids: ['cold'], byId: { cold: { cwd: 'E:/SelectedWorkspace', blank: true } } }), subscribe: () => () => {} } } })[key],
  slots: { inject(_name, fn) { fn() }, register(opts, C) { regs.push({ opts, C }); return () => {} } },
}
window.__ModuleLoader__ = { load: mod => { plugin = mod.factory(require) } }
new Function(readFileSync(path.join(pluginDir, 'client.js'), 'utf8'))(); plugin.apply(ctx)
const home = regs.find(r => r.opts.name === 'conversation.hero.options')
assert.ok(!regs.some(r => r.opts.name === 'conversation.hero.frame'), 'No wrapper around native chat/composer')
assert.ok(!regs.some(r => r.opts.name === 'conversation.hero.agentPreset'), 'Native preset single seat stays untouched')
const dock = regs.find(r => r.opts.name === 'sidebar.right.pane.tab')
const tab = regs.find(r => r.opts.name === 'conversation.view')
assert.ok(home && dock && tab)
const props = { ...home.opts.inject('s1'), t: ctx.locale.bind() }
assert.equal(home.opts.order, 10)
const root = createRoot(document.getElementById('root'))
const flush = () => new Promise(resolve => setTimeout(resolve, 20))
const render = async node => act(async () => { root.render(node); await flush() })
const click = async node => act(async () => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await flush() })
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.includes(text))
// Model only the outlet lifecycle, not host geometry or a visual acceptance shell.
const nativeWithEntry = shown => React.createElement('div', null,
  shown ? React.createElement(home.C, props) : null,
  React.createElement('textarea', { defaultValue: 'untouched', 'data-native': true }))
await render(React.createElement(home.C, { ...props, sessionId: undefined }))
assert.equal(document.querySelector('button'), null, 'True sessionless home has no supported options outlet')
current = 's1'
await render(nativeWithEntry(true))
const textarea = document.querySelector('[data-native]')
assert.equal(button('研发视图').type, 'button', 'Entry never submits the composer')
assert.equal(document.querySelector('.pdv-home-entry').tagName, 'SPAN')
assert.ok(!document.querySelector('style').textContent.includes('.pdv{'), 'Entry loads only its own CSS')
await click(button('研发视图')); assert.equal(creations, 0); assert.equal(opens, 1); assert.equal(draft, 'existing draft')
await click(button('研发视图')); assert.equal(creations, 0); assert.equal(opens, 2)
Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true }); await click(button('研发视图')); assert.equal(opens, 2); assert.match(document.body.textContent, /768px/)
Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
textarea.value = 'unsent draft survives phase changes'
textarea.focus(); textarea.setSelectionRange(7, 12)
for (const shown of [false, true, false]) {
  await render(nativeWithEntry(shown))
  assert.equal(document.querySelector('.pdv-home-frame'), null)
  if (!shown) assert.equal(document.querySelectorAll('style').length, 0)
  assert.equal(document.querySelector('[data-native]'), textarea, 'Entry unmount must not remount native input')
  assert.equal(textarea.value, 'unsent draft survives phase changes')
  assert.equal(document.activeElement, textarea)
  assert.equal(textarea.selectionStart, 7); assert.equal(textarea.selectionEnd, 12)
}
// An already-selected cold Session has no live agent or prior Host cwd.
const cold = { ...dock.opts.inject('cold'), t: ctx.locale.bind() }
await render(React.createElement(dock.C, cold))
assert.equal(calls.filter(([method, args]) => method === 'binding' && args.sessionId === 'cold').at(-1)[1].cwd, 'E:/SelectedWorkspace')
assert.equal(cold.store.get('cold').cwd, 'E:/SelectedWorkspace')
const injected = { ...dock.opts.inject('s1'), t: ctx.locale.bind() }, store = injected.store
store.patchForm('s1', { title: 'View', prdPath: 'E:/prd.md', prd: { name: 'prd.md' } })
await render(React.createElement(dock.C, injected)); assert.match(document.body.textContent, /新建/)
await act(async () => { await store.create('s1', { title: 'View', prdPath: 'E:/prd.md' }); await flush() })
assert.match(document.body.textContent, /1 \/ 3/); assert.match(document.body.textContent, /100 \/ 300/)
const requestId = calls.find(([method]) => method === 'createTask')[1].requestId
await act(async () => { await store.create('s1', { title: 'View', prdPath: 'E:/prd.md' }); await flush() })
assert.equal(calls.filter(([method]) => method === 'createTask').at(-1)[1].requestId, requestId)
await render(React.createElement('div')); assert.equal(store.get('s1').form.title, 'View'); assert.equal(store.get('s1').task.id, 'task1')
tasks[0] = { ...tasks[0], status: 'completed', stage: 'complete', created: { title: 'View', prdFile: 'prd.md' } }
store.get('s1').task = tasks[0]
await render(React.createElement(dock.C, injected)); assert.equal(draft, 'existing draft'); await click(button('查看详情')); assert.match(document.body.textContent, /未被覆盖/)
await click(button('插入生成请求')); assert.match(draft, /^existing draft\n\n/); assert.equal(calls.filter(([method]) => method === 'draft').at(-1)[1].whenDraftExists, 'append')
await render(React.createElement('div')); store.get('s1').task = { ...tasks[0], status: 'failed', stage: 'bind' }; tasks = [store.get('s1').task]
await render(React.createElement(dock.C, injected)); assert.ok(button('绑定这份')); await click(button('绑定这份')); assert.ok(calls.some(([method]) => method === 'retryCreation'))
// Pending intent survives entry replacement, but never opens a stale mounted session.
current = 'previous'
await render(React.createElement(home.C, { ...props, key: 'first' }))
await click(button('研发视图')); assert.equal(opens, 2)
assert.equal(props.services.pending, 's1')
await render(React.createElement(home.C, { ...props, key: 'replacement' }))
await act(async () => { current = 's1'; for (const fn of listeners) fn(); await flush() })
assert.equal(opens, 3); assert.equal(creations, 0); assert.equal(props.services.pending, null)
// Navigating to a different session cancels the old intent instead of opening there.
await act(async () => { current = undefined; for (const fn of listeners) fn(); await flush() })
await click(button('研发视图'))
await render(React.createElement(home.C, { ...props, ...home.opts.inject('other') }))
assert.equal(props.services.pending, null)
await act(async () => { current = 'other'; for (const fn of listeners) fn(); await flush() })
assert.equal(opens, 3)
// Native open failures are visible, clear the intent, and can be retried.
const openTab = sidebar.openTab
sidebar.openTab = () => { throw Error('seat unavailable') }
await click(button('研发视图')); assert.match(document.body.textContent, /seat unavailable/)
assert.equal(props.services.pending, null)
sidebar.openTab = openTab
await click(button('研发视图')); assert.equal(opens, 4)
// A width change while waiting must still block fullscreen opening at resolution.
await act(async () => { current = undefined; for (const fn of listeners) fn(); await flush() })
await click(button('研发视图'))
Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })
await act(async () => { current = 'other'; for (const fn of listeners) fn(); await flush() })
assert.equal(opens, 4); assert.equal(props.services.pending, null); assert.match(document.body.textContent, /768px/)
Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
language = 'en'; await render(React.createElement('div')); await render(React.createElement(home.C, { ...props, ...home.opts.inject('other') }))
assert.ok(button('Dev view'))
await render(React.createElement(dock.C, injected)); assert.match(document.body.textContent, /New/)
assert.ok(!calls.some(([method]) => /send|worktree|agent.status/.test(method)))
props.services.pending = 'pending-at-disposal'
await act(async () => root.unmount()); cleanup.reverse().forEach(fn => fn()); assert.equal(listeners.size, 0)
assert.equal(props.services.pending, null); assert.equal(props.services.listeners.size, 0)
console.error = originalError
assert.deepEqual(errors, [])
console.log('PASS sidebar: registration, no-message navigation, no-overlay gate, native children, shared form, real counters, intent dedupe, safe drafts, explicit bind retry, locales, cleanup')
