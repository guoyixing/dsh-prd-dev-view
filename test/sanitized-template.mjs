import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { fromLegacy, readLegacyConstants, renderLegacyHtml, isGeneratedHtml } from '../lib/legacy.js'
import { lint } from '../lib/model.js'

// Run: node test/sanitized-template.mjs
// Optional full DOM check: node test/sanitized-template.mjs --dom <path-to-jsdom-lib-api.js>
const template = await readFile(new URL('../assets/template/snapshot-template.html', import.meta.url), 'utf8')
const forbidden = /HDRP|DDCP-10903|projectDevGroup|hisense|glaway|ProductArch|productarch|PA-\d{2}|13a9c05|典型产品架构|槽位|平台货架|TR3|PLM|CAN-0|冰箱平台/i
function checkSource(html) {
  assert.doesNotMatch(html, forbidden, 'Original project identifiers or business semantics remain')
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  assert.ok(scripts.length, 'Expected inline renderer script')
  for (const [, script] of scripts) new vm.Script(script, { filename: 'snapshot-template.js' })
  assert.equal((html.match(/const PRD_META/g) || []).length, 1)
  assert.equal((html.match(/\/\*\s*=+\s*\r?\n\s*二、应用/g) || []).length, 1)
}
function checkRelations(L) {
  const entities = [...L.FEAT, ...L.QS, ...L.ADJ, ...L.GRULES, ...L.MODS, ...L.OBJ]
  const ids = new Set(entities.map(x => x.id))
  assert.equal(ids.size, entities.length, 'Global ids must be unique')
  const features = new Set(L.FEAT.map(x => x.id))
  const resolve = (list, available = ids) => { for (const id of list || []) assert.ok(available.has(id), `Unresolved reference: ${id}`) }
  for (const item of entities) {
    for (const key of ['qs', 'adj', 'mods', 'rel', 'blocked', 'q']) resolve(item[key])
    resolve(item.features, features)
    resolve(Object.keys(item.uses || {}), features)
  }
  assert.ok(Array.isArray(L.CHAIN) && L.CHAIN.length, 'Data chain must be a nonempty group array for the native client')
  for (const chain of L.CHAIN) {
    assert.ok(typeof chain.name === 'string' && chain.name.length, 'Native client requires chain.name')
    assert.ok(Array.isArray(chain.steps) && chain.steps.length, 'Native client requires chain.steps')
    for (const step of chain.steps) {
      resolve([step.f], features)
      assert.ok(typeof step.t === 'string' && step.t.length, 'Native client requires step.t')
    }
  }
  for (const id of Object.keys(L.OBJ_MAP.nodes)) resolve([id])
  for (const [a, b] of L.OBJ_MAP.edges) {
    assert.ok(L.OBJ_MAP.nodes[a] && L.OBJ_MAP.nodes[b], 'Object-map edge needs both endpoints')
  }
  for (const f of L.FEAT) {
    const card = L.DEEP[f.id]
    assert.ok(card && card.stages.length >= 3, `${f.id} needs a complete three-stage card`)
    assert.ok(card.pre.length && card.rules.length && card.compat.length)
    assert.ok(!card.steps[card.stages[0].id]?.length)
    for (const stage of card.stages.slice(1)) assert.ok(card.steps[stage.id]?.length)
    const entries = [...card.pre, ...card.rules, ...Object.values(card.steps).flat(), ...card.adj, ...card.qs, ...card.compat, ...card.related]
    const local = new Set([...card.stages, ...entries].map(x => x.id))
    assert.equal(local.size, card.stages.length + entries.length, 'Card ids must be unique')
    for (const entry of entries) {
      resolve(entry.links, local)
      if (entry.span) assert.ok(entry.span.length === 2 && entry.span[0] >= 0 && entry.span[0] <= entry.span[1] && entry.span[1] < card.stages.length)
    }
    assert.ok(!card.scenarios?.length && !card.mock, 'No scenario demonstration data is allowed')
    resolve(card.qs.map(x => x.id))
    resolve(card.adj.map(x => x.id))
  }
}
checkSource(template)
const legacy = readLegacyConstants(template)
assert.match(legacy.PRD_META.title, /虚构/)
assert.match(legacy.PRD_META.scopeNote, /不代表任何真实项目/)
assert.match(legacy.PRD_META.codeNote, /未检查真实代码/)
checkRelations(legacy)
const data = fromLegacy(legacy)
assert.deepEqual(lint(data), { errors: [], warnings: [] })
const exported = renderLegacyHtml(template, data)
assert.ok(isGeneratedHtml(exported))
checkSource(exported)
const reread = readLegacyConstants(exported)
checkRelations(reread)
const roundTrip = fromLegacy(reread)
assert.deepEqual(lint(roundTrip), { errors: [], warnings: [] })
const plain = value => JSON.parse(JSON.stringify(value))
for (const key of ['features', 'rules', 'modules', 'objects', 'chain', 'lifecycle', 'objMap', 'cards']) {
  assert.deepEqual(plain(roundTrip[key]), plain(data[key]), `Round trip changed ${key}`)
}
console.log(`PASS: sanitized constants, script syntax, complete cards, all links, round trip; lint 0 errors/0 warnings (${data.features.length} feature)`)

const domIndex = process.argv.indexOf('--dom')
if (domIndex >= 0) {
  assert.ok(process.argv[domIndex + 1], '--dom requires a path to jsdom lib/api.js')
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(process.argv[domIndex + 1]).href)
  for (const [label, html] of [['template', template], ['export', exported]]) {
    const errors = []
    const console = new VirtualConsole()
    console.on('jsdomError', e => errors.push(e))
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
      beforeParse(window) { window.HTMLElement.prototype.scrollIntoView = () => {} } })
    try {
      const w = dom.window
      const run = source => w.eval(source)
      for (const view of ['l2', 'l1', 'qboard', 'rules', 'aboard', 'imap']) run(`setView('${view}')`)
      run("App.l2mode='table';setView('l2')")
      run("setView('l1');App.chain=true;renderL1()")
      assert.ok(w.document.querySelector('.chainbtn').textContent.includes(legacy.CHAIN[0].name))
      assert.ok(w.document.querySelector('.chainline').textContent.includes('F-01'))
      assert.ok(w.document.querySelector('.chainline').textContent.includes(legacy.CHAIN[0].steps[0].t))
      for (const e of [...legacy.FEAT, ...legacy.QS, ...legacy.ADJ, ...legacy.GRULES, ...legacy.MODS, ...legacy.OBJ]) run(`renderInsp('${e.id}')`)
      run("openFeature('F-01')")
      assert.ok(w.document.querySelectorAll('.stage').length >= 3)
      assert.ok(w.document.querySelectorAll('.step').length >= 2)
      for (const id of ['P1', 'P2', 'R1', 'R2', 'R3', 'Q1', 'A1', 'C1', 's1-1', 's2-2']) run(`DeepCard.focus('${id}')`)
      run("App.cardMode='light';render()")
      assert.ok(!w.document.body.textContent.includes('undefined'), 'Rendered content includes undefined')
      assert.deepEqual(errors.map(e => e.message), [], `${label}: browser script errors`)
    } finally { dom.window.close() }
  }
  console.log('PASS: jsdom template/export initial load, all six views, L1 chain, inspectors, deep card details, light card')
}
