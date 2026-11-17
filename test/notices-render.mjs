// Behavior/CSS-contract regression only: jsdom does not measure browser geometry.
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
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
const source = readFileSync(path.join(pluginDir, 'client.js'), 'utf8')
const timers = new Map(), intervals = new Map()
let timerId = 0
const originals = { setTimeout, clearTimeout, setInterval, clearInterval }
globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id }
globalThis.clearTimeout = id => timers.delete(id)
globalThis.setInterval = (fn, delay) => { const id = ++timerId; intervals.set(id, { fn, delay }); return id }
globalThis.clearInterval = id => intervals.delete(id)
const errors = [], oldError = console.error
console.error = (...args) => errors.push(args.join(' '))
const registrations = [], disposers = [], dictionaries = {}, calls = []
let plugin, language = 'zh', draft = 'keep my unsent draft', generationError = null, deferred = null
const longDetail = 'LONG_REPORT_DETAIL_' + '文档路径与分析细节 '.repeat(500)
const states = {
  A: { phase: 'cards', startedAt: 'run-a', updatedAt: '2026-11-16T08:00:00Z', detail: longDetail, done: 2, total: 8 },
  B: { phase: 'pending', detail: '视图已创建，内容待生成。', total: null },
}
const project = id => ({ id, title: id, dataFile: 'E:/fixture/' + id + '.prdview.json' })
const bindings = { s1: 'A', s2: 'A' }
const tasks = { s1: { id: 'create-A', status: 'completed', stage: 'complete', created: { ...project('A'), prdFile: 'prd.md' } }, s2: null }
const api = async (endpoint, args) => {
  calls.push([endpoint, args])
  if (endpoint === 'binding') return { project: project(bindings[args.sessionId]), candidates: [], viewsRel: '.dsh/prd-views' }
  if (endpoint === 'creationTasks') return tasks[args.sessionId] ? [tasks[args.sessionId]] : []
  if (endpoint === 'load') return { project: project(args.project), data: { project: { title: args.project }, meta: {}, revision: 0, features: [], issues: [], adjustments: [], rules: [], modules: [], objects: [], log: [], cards: {} }, derived: { counts: { issuesOpen: 0, adjustmentsOpen: 0, features: 0, rules: 0, issuesBlockOpen: 0, issues: 0, adjustments: 0, closed: 0, review: 0 }, featureRemaining: {} } }
  if (endpoint === 'codeStatus') return { configured: false }
  if (endpoint === 'status') return { revision: 0 }
  if (endpoint === 'getGeneration') {
    if (deferred) { const next = deferred; deferred = null; return next.promise }
    if (generationError) throw Error(generationError)
    return { ...states[args.project] }
  }
  throw Error('Unexpected route ' + endpoint)
}
const ctx = {
  effect(fn) { const stop = fn(); if (typeof stop === 'function') disposers.push(stop) },
  locale: { register(_ns, values) { Object.assign(dictionaries, values); return () => {} }, bind: () => key => dictionaries[language]?.[key] ?? key },
  sidebarRight: { mounted: { getSnapshot: () => 's1', subscribe: () => () => {} }, openTab() {} }, sidebarRightTabs: { register: () => () => {} }, uiWorkspace: {},
  slots: { inject(_name, fn) { fn() }, register(opts, C) { registrations.push({ opts, C }); return () => {} } },
  get: key => ({ connection: { rpc: { call: async (_channel, method, args) => ({ ok: true, value: await api(method.replace('prd-view.', ''), args) }) } },
    sessions: { binding: sessionId => ({ sessionId }) }, conversation: { input: { requestDraftInitialization(_binding, opts) {
      calls.push(['draft', opts]); if (draft && opts.whenDraftExists === 'keep') return 'preserved'
      draft = draft ? draft + '\n\n' + opts.prompt : opts.prompt; return 'applied'
    } } } })[key],
}
window.__ModuleLoader__ = { load: mod => { plugin = mod.factory(require) } }
new Function(source)(); plugin.apply(ctx)
const dock = registrations.find(r => r.opts.name === 'sidebar.right.pane.tab')
const props = sid => ({ ...dock.opts.inject(sid), t: ctx.locale.bind() })
const store = props('s1').store
const root = createRoot(document.getElementById('root'))
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const render = async (sid = 's1') => act(async () => { root.render(React.createElement(dock.C, props(sid))); await flush() })
const unmountView = () => act(async () => { root.render(React.createElement('div')); await flush() })
const notice = () => document.querySelector('.pdv-notices')
const button = label => [...(notice()?.querySelectorAll('button') ?? [])].find(el => el.textContent === label || el.getAttribute('aria-label') === label)
const assertDismissed = message => {
  assert.equal(notice(), null, message)
  assert.equal(document.querySelector('.pdv-notice-row, .pdv-notice-details, .pdv-notice-reopen'), null, 'Dismissal leaves no notice DOM or placeholder')
  assert.ok(!/重新查看生成状态|Review generation status/.test(document.body.textContent), 'No user-facing reopen entry')
}
// Test-only state setup: there is intentionally no UI action to reopen a dismissed notice.
const restoreNoticeForTest = async (sid = 's1', scope = bindings[sid]) => act(async () => {
  store.patchNotice(sid, scope, { hidden: null, expanded: store.notice(sid, scope).signature })
  await flush()
})
const click = async label => act(async () => { assert.ok(button(label), label); button(label).click(); await flush() })
const poll = async () => act(async () => {
  const entry = [...timers].find(([, v]) => v.delay === 4000); assert.ok(entry, 'generation poll exists')
  timers.delete(entry[0]); await entry[1].fn(); await flush()
})
const refresh = async sid => act(async () => { await store.refresh(sid); await flush() })
try {
  await render()
  assert.equal(document.querySelectorAll('.pdv-notices').length, 1, 'One combined notice')
  assert.match(notice().textContent, /生成功能卡片.*最后上报.*2 \/ 8/)
  assert.equal(document.querySelector('.pdv-notice-details'), null, 'Collapsed details are not mounted or taking space')
  assert.ok(!notice().textContent.includes(longDetail))
  assert.equal(calls.filter(([name]) => name === 'draft').length, 0, 'A reported generation suppresses old task prefill')
  assert.equal(document.querySelector('.pdv-draft-notice'), null)
  assert.match(source, /\.pdv-notice-row\{[^}]*white-space:nowrap/)
  assert.match(source, /\.pdv-notice-summary\{[^}]*min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/)
  await click('查看详情'); assert.ok(notice().textContent.includes(longDetail)); assert.equal(button('收起详情').getAttribute('aria-expanded'), 'true')
  assert.match(source, /\.pdv-notice-details\{max-height:180px;overflow:auto;overflow-wrap:anywhere/)
  assert.ok(!/尚未发送|内容待生成/.test(notice().textContent))
  await click('关闭提示'); assertDismissed('Dismissal removes the whole notice section, not just its contents')
  states.A.updatedAt = '2026-11-16T08:01:00Z'; states.A.detail = 'new routine detail'; states.A.done = 3
  await poll(); assertDismissed('Same-phase detail/count/time updates do not undo dismissal')
  assert.equal(store.notice('s1', 'A').state.done, 3, 'Polling still updates state without notice DOM')
  await unmountView(); await render(); assertDismissed('Remount retains dismissal')
  await restoreNoticeForTest(); assert.match(notice().textContent, /new routine detail/)
  await click('关闭提示'); assertDismissed()
  states.A.phase = 'failed'; states.A.error = 'failure details '.repeat(400)
  await poll(); assert.ok(button('查看详情')); assert.match(notice().textContent, /生成失败/)
  assert.equal(notice().querySelector('.pdv-notice-row').dataset.warning, 'true')
  assert.equal(document.querySelector('.pdv-notice-details'), null)
  await click('查看详情'); assert.ok(notice().textContent.includes(states.A.error))
  await click('关闭提示'); states.A.error = 'another failure'; await poll(); assert.ok(button('查看详情'))
  await click('关闭提示'); states.A.phase = 'interrupted'; await poll(); assert.match(notice().textContent, /生成中断/)
  await click('关闭提示'); states.A.phase = 'cards'; states.A.error = null; await poll(); assert.ok(button('查看详情'), 'Returning to an earlier phase reminds again')
  await click('关闭提示'); states.A.startedAt = 'run-a-2'; await poll(); assert.ok(button('查看详情'), 'New run of same phase reminds again')
  await click('关闭提示'); states.A.phase = 'complete'; await poll(); assert.match(notice().textContent, /生成完成/)
  await click('查看详情'); assert.equal(document.querySelector('.pdv-draft-notice'), null)
  await click('关闭提示')
  bindings.s1 = 'B'; await refresh('s1'); assert.match(notice().textContent, /内容待生成/)
  await click('查看详情'); assert.equal(document.querySelector('.pdv-draft-notice'), null, 'Task A does not produce a draft notice in B')
  assert.match(notice().textContent, /尚无生成上报/); assert.ok(!notice().textContent.includes('尚未发送'))
  await click('关闭提示'); assertDismissed(); bindings.s1 = 'A'; await refresh('s1'); assertDismissed('B does not change A dismissal')
  await render('s2'); assert.ok(button('查看详情'), 'Same view in another session is independent')
  await render('s1'); assertDismissed('Switching back to a session retains dismissal')
  // Deferred response for A must not overwrite B or schedule a poll after cleanup.
  let resolveOld
  deferred = { promise: new Promise(resolve => { resolveOld = resolve }) }
  const pollEntry = [...timers].find(([, v]) => v.delay === 4000); timers.delete(pollEntry[0])
  let pendingPoll; await act(async () => { pendingPoll = pollEntry[1].fn(); await flush() })
  bindings.s1 = 'B'; await refresh('s1')
  await act(async () => { resolveOld({ phase: 'failed', error: 'STALE_A' }); await pendingPoll; await flush() })
  assertDismissed('A stale response cannot restore B or its dismissed notice')
  assert.ok(!document.body.textContent.includes('STALE_A'))
  assert.equal(store.notice('s1', 'B').state.phase, 'pending')
  assert.equal([...timers.values()].filter(v => v.delay === 4000).length, 1)
  // A new completed task in B restores the prompt; only explicit append changes nonempty drafts.
  tasks.s1 = { id: 'create-B', status: 'completed', stage: 'complete', created: { ...project('B'), prdFile: 'b.md' } }
  store.get('s1').task = tasks.s1; await refresh('s1')
  assert.ok(button('查看详情'), 'New creation task reminds')
  assert.equal(draft, 'keep my unsent draft')
  await click('查看详情'); assert.match(notice().textContent, /未被覆盖/)
  await click('插入生成请求（追加，不发送）'); assert.match(draft, /^keep my unsent draft\n\n/)
  const draftCalls = calls.filter(([name]) => name === 'draft').length
  await click('关闭提示'); assertDismissed(); await restoreNoticeForTest(); assert.equal(calls.filter(([name]) => name === 'draft').length, draftCalls)
  generationError = 'OFFLINE'; await poll(); assert.match(notice().textContent, /暂时无法读取/)
  await click('查看详情'); assert.match(notice().textContent, /OFFLINE/)
  generationError = null; await poll(); assert.match(notice().textContent, /内容待生成/)
  // Automatic prefill remains supported only for a fresh pending task and empty draft.
  draft = ''; tasks.s1 = { ...tasks.s1, id: 'create-B-2' }; store.get('s1').task = tasks.s1
  await refresh('s1'); assert.match(draft, /生成研发视图/)
  assert.equal(calls.filter(([name]) => name === 'draft').at(-1)[1].whenDraftExists, 'keep')
  language = 'en'; await render(); assert.ok(button('Show details')); await click('Show details')
  assert.match(notice().textContent, /No generation report yet/); assert.match(notice().textContent, /Review and send it yourself/)
  assert.ok(!/尚未|内容待|notice\.|generation\./.test(notice().textContent))
  await click('Dismiss notice'); assertDismissed('English dismissal also leaves zero notice DOM')
  states.B = { phase: 'reading', startedAt: 'run-b', detail: 'Read only', total: null }; await poll()
  assert.match(notice().textContent, /Reading documents and code/); assert.ok(!notice().textContent.includes(' / '), 'Unknown total stays unknown')
  assert.ok(!calls.some(([name]) => /send|apply|setPrd|report|createTask/.test(name)), 'UI never edits PRD or sends/reports generation')
  // The main development tab uses the same component/store, without changing header/body placement.
  await click('Dismiss notice')
  const tab = registrations.find(r => r.opts.name === 'conversation.view')
  await act(async () => { root.render(React.createElement(tab.C, { ...tab.opts.inject('s1'), t: ctx.locale.bind(), completeViewRequest() {} })); await flush() })
  assertDismissed('Tab and native sidebar share dismissal with no section or placeholder')
  assert.ok(document.querySelector('.pdv-head')); assert.ok(document.querySelector('.pdv-body'))
  await restoreNoticeForTest(); assert.match(notice().textContent, /Read only/)
  await render(); assert.ok(button('Hide details'), 'Expansion also survives surface switching')
  const secondContainer = document.createElement('div'); document.body.appendChild(secondContainer)
  const secondRoot = createRoot(secondContainer)
  await act(async () => { secondRoot.render(React.createElement(dock.C, props('s1'))); await flush() })
  await click('Dismiss notice')
  assert.equal(document.querySelectorAll('.pdv-notices').length, 0, 'Two mounted surfaces both remove their notice DOM')
  assertDismissed('Two mounted surfaces share dismissal without reopen placeholders')
  let resolveSlow
  deferred = { promise: new Promise(resolve => { resolveSlow = resolve }) }
  const slow = [...timers].find(([, v]) => v.delay === 4000); timers.delete(slow[0])
  let slowPoll; await act(async () => { slowPoll = slow[1].fn(); await flush() })
  states.B.phase = 'failed'; states.B.error = 'shared failure'
  await poll()
  await act(async () => { resolveSlow({ phase: 'reading', startedAt: 'run-b', detail: 'STALE_READING' }); await slowPoll; await flush() })
  assert.equal(document.querySelectorAll('.pdv-notices').length, 2, 'A new phase restores both mounted surfaces')
  assert.equal(document.querySelectorAll('.pdv-notice-summary').length, 2)
  for (const item of document.querySelectorAll('.pdv-notice-summary')) assert.match(item.textContent, /Generation failed/, 'One poll updates both surfaces')
  await click('Dismiss notice')
  await act(async () => secondRoot.unmount()); secondContainer.remove()
  assertDismissed('Unmounting the second surface does not restore the first notice')
  // In-flight poll resolving after component disposal must not schedule another timer.
  deferred = { promise: new Promise(resolve => { resolveOld = resolve }) }
  const last = [...timers].find(([, v]) => v.delay === 4000); timers.delete(last[0])
  await act(async () => { pendingPoll = last[1].fn(); await flush() })
  await act(async () => root.unmount()); disposers.reverse().forEach(fn => fn())
  await act(async () => { resolveOld(states.B); await pendingPoll; await flush() })
  assert.equal(timers.size, 0); assert.equal(intervals.size, 0)
  assert.equal(store.get('s1').listeners.size, 0); assert.equal(store.get('s2').listeners.size, 0)
  assert.deepEqual(errors, [])
  console.log('PASS notices: zero-DOM dismissal without reopen, hidden polling/remount/surface persistence, phase/error/run/task reminders, view/session isolation, stale poll cleanup, truthful status, draft protection and locales')
} finally {
  Object.assign(globalThis, originals); console.error = oldError; dom.window.close()
}
