// Real service fixtures. Run: node --test test/generation-state.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PrdViewService } from '../lib/service.js'
import { GenerationState } from '../lib/generation-state.js'

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prd-generation-'))
  // Only remove this exact unique fixture directory after each test.
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const config = { registryDir: path.join(directory, 'registry'), autoExport: false }
  const service = new PrdViewService(config, console)
  const project = await service.create({ dataFile: path.join(directory, 'view.prdview.json'), title: '生成状态测试' })
  const state = new GenerationState(service)
  await state.ready
  return { directory, config, service, project, state }
}

const card = id => ({
  title: `${id} 查询详情`, lead: '读取当前对象详情并返回可见内容。',
  stages: [{ id: 'entry', name: '进入' }, { id: 'read', name: '读取' }, { id: 'result', name: '返回' }],
  pre: [{ id: 'P1', cond: '已登录且有查看权限', act: '允许读取详情' }], rules: [],
  steps: {
    read: [{ id: 'S1', t: '加载内容', d: '按对象编号加载详情。', tag: '沿用', rules: [], links: [] }],
    result: [{ id: 'S2', t: '返回内容', d: '返回用户可以查看的字段。', tag: '沿用', rules: [], links: [] }],
  }, adj: [], qs: [], compat: [], related: [],
})
async function features(service, project, values, withCards = true) {
  await service.apply(project, values.flatMap(id => [
    { op: 'add', kind: 'feature', item: { id, name: `${id} 详情`, obj: '对象', cap: '查询', status: 'ok' } },
    ...(withCards ? [{ op: 'card', feature: id, patch: card(id) }] : []),
  ]))
}
const report = (state, project, phase, extra = {}) => state.report(project, 'session-a', { phase, detail: `阶段：${phase}`, ...extra })

test('creation is pending; headings and existing complete cards never imply generation completion', async t => {
  const { service, project, state } = await fixture(t)
  let status = await state.get(project)
  assert.equal(status.phase, 'pending')
  assert.equal(status.total, null)
  assert.equal(status.done, 0)
  assert.equal(status.lastReportedAt, null)
  await features(service, project, ['F1'], false)
  status = await state.get(project)
  assert.equal(status.phase, 'pending')
  assert.equal(status.counts.features, 1)
  assert.equal(status.done, 0)
  await service.apply(project, [{ op: 'card', feature: 'F1', patch: card('F1') }])
  status = await state.get(project)
  assert.equal(status.phase, 'pending')
  assert.equal(status.done, 0)
  assert.equal(status.counts.cards, 1)
  await report(state, project, 'cards', { featureIds: ['F1'] })
  assert.equal((await state.get(project)).done, 0)
})

test('batches accumulate only reported, planned, existing and basically complete cards', async t => {
  const { service, project, state } = await fixture(t)
  await features(service, project, ['F1', 'F2'], false)
  await report(state, project, 'reading')
  await report(state, project, 'code', { featureIds: ['F1', 'F2', 'F3'] })
  let status = await report(state, project, 'cards', { completedFeatureIds: ['F1', 'F3'] })
  assert.equal(status.total, 3)
  assert.equal(status.done, 0)
  assert.deepEqual(status.invalidFeatureIds, ['F1', 'F3'])
  await service.apply(project, [{ op: 'card', feature: 'F1', patch: card('F1') }, { op: 'card', feature: 'F2', patch: { title: '标题不是内容', stages: [{ id: 'a' }, { id: 'b' }] } }])
  status = await report(state, project, 'cards', { completedFeatureIds: ['F1', 'F2'] })
  assert.equal(status.done, 1)
  assert.deepEqual(status.completedFeatureIds, ['F1'])
  assert.deepEqual(status.reportedCompletedFeatureIds, ['F1', 'F3', 'F2'])
  await assert.rejects(report(state, project, 'cards', { completedFeatureIds: ['OTHER'] }), /计划/)
  assert.equal((await state.get(project)).done, 1)
})

test('complete requires exact non-empty plan, explicit confirmations, basic cards and real service lint', async t => {
  const { service, project, state } = await fixture(t)
  await assert.rejects(report(state, project, 'complete'), /非空功能计划/)
  assert.equal((await state.get(project)).phase, 'failed')
  await features(service, project, ['F1', 'F2'])
  await report(state, project, 'reading', { featureIds: ['F1'] })
  await assert.rejects(report(state, project, 'complete', { completedFeatureIds: ['F1'] }), /清单不一致/)
  await report(state, project, 'checking', { featureIds: ['F1', 'F2'] })
  await assert.rejects(report(state, project, 'complete'), /F2 尚未明确上报/)
  await service.apply(project, [{ op: 'set', kind: 'feature', id: 'F2', fields: { rel: ['MISSING'] } }])
  let lintCalls = 0
  const lint = service.lint.bind(service)
  service.lint = async (...args) => { lintCalls++; return lint(...args) }
  await assert.rejects(report(state, project, 'complete', { completedFeatureIds: ['F2'] }), /相关功能 MISSING 不存在/)
  assert.equal(lintCalls, 1)
  assert.equal((await state.get(project)).completedAt, null)
  await service.apply(project, [{ op: 'set', kind: 'feature', id: 'F2', fields: { rel: [] } }])
  const bytesBefore = await fs.readFile(project.dataFile, 'utf8')
  const status = await report(state, project, 'complete')
  assert.equal(status.phase, 'complete')
  assert.equal(status.done, 2)
  assert.equal(status.total, 2)
  assert.ok(status.completedAt)
  assert.ok(status.lastReportedAt)
  assert.equal(await fs.readFile(project.dataFile, 'utf8'), bytesBefore, 'generation reports must not mutate business data')
  assert.equal(lintCalls, 2)
  const disk = JSON.parse(await fs.readFile(state.file, 'utf8'))
  assert.equal(Object.values(disk.projects)[0].phase, 'complete')
  assert.equal(Object.values(disk.projects)[0].lint.errors, 0)
})

test('lint-valid shells and blank stage content cannot be marked complete', async t => {
  const { service, project, state } = await fixture(t)
  await features(service, project, ['F1'], false)
  await service.apply(project, [{ op: 'card', feature: 'F1', patch: { stages: [{ id: 'a' }, { id: 'b' }] } }])
  assert.deepEqual((await service.lint(project)).errors, [], 'existing lint permits a two-stage shell')
  await report(state, project, 'cards', { featureIds: ['F1'], completedFeatureIds: ['F1'] })
  await assert.rejects(report(state, project, 'complete'), /至少需要 3 个阶段/)
  const broken = card('F1'); broken.steps.result[0].d = '  '
  await service.apply(project, [{ op: 'card', feature: 'F1', patch: broken }])
  assert.equal((await state.get(project)).done, 0)
  await assert.rejects(report(state, project, 'complete'), /完整处理步骤/)
})

test('Host restart persists interruption without replacing last report time or claiming live activity', async t => {
  const { config, service, project, state } = await fixture(t)
  await features(service, project, ['F1'])
  const before = await report(state, project, 'cards', { featureIds: ['F1'], completedFeatureIds: ['F1'] })
  // No timer-based agent liveness guesses: repeated reads preserve the report exactly.
  assert.equal((await state.get(project)).lastReportedAt, before.lastReportedAt)
  const restarted = new GenerationState(new PrdViewService(config, console))
  const after = await restarted.get(project)
  assert.equal(after.phase, 'interrupted')
  assert.equal(after.previousPhase, 'cards')
  assert.equal(after.lastReportedAt, before.lastReportedAt)
  assert.equal(after.detail, before.detail)
  assert.ok(after.interruptedAt)
  assert.equal(after.done, 1)
  assert.match(after.error, /Host 已重启/)
  assert.equal(Object.values(JSON.parse(await fs.readFile(state.file, 'utf8')).projects)[0].phase, 'interrupted')
  const reset = await report(restarted, project, 'reading')
  assert.equal(reset.total, null)
  assert.equal(reset.done, 0)
  assert.equal(reset.error, null)
})

test('restart preserves completed and failed receipts; subsequent data changes invalidate success', async t => {
  const { config, service, project, state } = await fixture(t)
  await features(service, project, ['F1'])
  await report(state, project, 'checking', { featureIds: ['F1'], completedFeatureIds: ['F1'] })
  await report(state, project, 'complete')
  const restarted = new GenerationState(new PrdViewService(config, console))
  assert.equal((await restarted.get(project)).phase, 'complete')
  await service.apply(project, [{ op: 'card', feature: 'F1', patch: { lead: '' } }])
  const stale = await state.get(project)
  assert.equal(stale.phase, 'interrupted')
  assert.equal(stale.done, 0)
  assert.match(stale.error, /内容已变化/)
  await report(state, project, 'failed', { error: '代码文件无法读取' })
  const last = new GenerationState(new PrdViewService(config, console))
  assert.equal((await last.get(project)).phase, 'failed')
  assert.equal((await last.get(project)).error, '代码文件无法读取')
})

test('concurrent reports serialize across projects and recover after rejected writes', async t => {
  const { directory, service, project, state } = await fixture(t)
  const other = await service.create({ dataFile: path.join(directory, 'other.prdview.json'), title: '另一份' })
  await features(service, project, ['F1', 'F2'])
  await report(state, project, 'cards', { featureIds: ['F1', 'F2'] })
  await Promise.all([
    report(state, project, 'cards', { completedFeatureIds: ['F1'] }),
    report(state, other, 'reading'),
    report(state, project, 'cards', { completedFeatureIds: ['F2'] }),
  ])
  assert.equal((await state.get(project)).done, 2)
  assert.equal((await state.get(other)).phase, 'reading')
  assert.equal(Object.keys(JSON.parse(await fs.readFile(state.file, 'utf8')).projects).length, 2)
  await assert.rejects(report(state, other, 'complete'), /拒绝标记/)
  assert.equal((await report(state, other, 'reading')).phase, 'reading')
  assert.equal((await state.get(project)).done, 2)
})

test('validate arguments, report explicit interruption and retain counts for unavailable data', async t => {
  const { service, project, state } = await fixture(t)
  await assert.rejects(state.report(project, '', { phase: 'reading', detail: '开始' }), /对话编号/)
  await assert.rejects(report(state, project, 'not-a-phase'), /生成阶段/)
  await assert.rejects(state.report(project, 'session', { phase: 'reading', detail: '' }), /detail/)
  await assert.rejects(report(state, project, 'cards', { featureIds: ['F1', 'F1'] }), /重复编号/)
  await assert.rejects(report(state, project, 'cards', { completedFeatureIds: ['F1'] }), /完整功能计划/)
  await features(service, project, ['F1'])
  const stopped = await report(state, project, 'interrupted', { detail: '用户暂停，等待继续' })
  assert.equal(stopped.phase, 'interrupted')
  assert.equal(stopped.error, '用户暂停，等待继续')
  assert.ok(stopped.interruptedAt)
  const readData = service.readData.bind(service)
  service.readData = async () => { throw new Error('fixture unavailable') }
  const unavailable = await state.get(project)
  assert.match(unavailable.error, /无法核验实际内容/)
  assert.equal(unavailable.counts, null)
  service.readData = readData
})

test('malformed persisted state fails closed and is not silently overwritten', async t => {
  const { service, project, state } = await fixture(t)
  await report(state, project, 'reading')
  await fs.writeFile(state.file, '{corrupt', 'utf8')
  const corrupt = new GenerationState(service)
  await assert.rejects(corrupt.get(project), /未覆盖原文件/)
  await assert.rejects(report(corrupt, project, 'reading'), /未覆盖原文件/)
  assert.equal(await fs.readFile(state.file, 'utf8'), '{corrupt')
})
