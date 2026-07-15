import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import type { PrototypeTestCase, ScreenMeta } from '../src/types/prototype.ts'
import {
  applyTestCaseChange,
  buildTestCaseManifest,
  buildTestCaseScopes,
  emptyTestCaseDraft,
  normalizeTestCases,
  testCaseExportRows,
  testCaseScopeId,
  validateTestCaseDraft,
} from '../src/tools/test-cases/model.ts'
import { buildTestCasesWorkbook } from '../src/tools/test-cases/exportTestCases.ts'

const icon = {} as ScreenMeta['icon']
const screens: ScreenMeta[] = [
  { id: 'home', platform: 'mobile', code: 'M1', title: '首页', subtitle: '', icon },
  { id: 'dashboard', platform: 'pc', code: 'PC1', title: '工作台', subtitle: '', icon },
]
const states = { home: [{ id: 'ready', labelKey: 'ready' }, { id: 'empty', labelKey: 'empty' }] }

function sample(overrides: Partial<PrototypeTestCase> = {}): PrototypeTestCase {
  return {
    id: 'case-1', screenId: 'home', stateId: 'ready', module: '首页', testItem: '展示', testPoint: '正常态',
    preconditions: '无', steps: ['打开页面', '观察内容'], expectedResult: '展示内容', actualResult: '未执行', ...overrides,
  }
}

test('测试用例 scope 覆盖有状态和无状态页面', () => {
  assert.equal(testCaseScopeId('home', 'ready'), 'home__ready')
  assert.equal(testCaseScopeId('dashboard'), 'dashboard')
  const scopes = buildTestCaseScopes(screens, states, { ready: '正常态', empty: '空状态' })
  assert.deepEqual(scopes.map((scope) => scope.id), ['home__ready', 'home__empty', 'dashboard'])
})

test('规范化默认值并保留未知页面用例', () => {
  const normalized = normalizeTestCases([{ ...sample(), preconditions: '', actualResult: '', steps: [' 打开页面 ', '', '观察'] }, { id: '', screenId: 'x' }])
  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].preconditions, '无')
  assert.equal(normalized[0].actualResult, '未执行')
  assert.deepEqual(normalized[0].steps, ['打开页面', '观察'])
  assert.equal(normalizeTestCases({ version: '1.0.0', testCases: [sample()] }).length, 1)
  const scopes = buildTestCaseScopes(screens, states, {}, [sample({ screenId: 'removed', stateId: 'legacy' })])
  assert.equal(scopes.at(-1)?.known, false)
})

test('草稿校验要求五个核心字段并允许默认前置与实际结果', () => {
  const draft = emptyTestCaseDraft('首页')
  assert.equal(validateTestCaseDraft(draft), '请填写测试项')
  Object.assign(draft, { testItem: '展示', testPoint: '正常态', steps: ['打开'], expectedResult: '可见' })
  assert.equal(validateTestCaseDraft(draft), '')
})

test('按 ID 原子新增、编辑和删除', () => {
  const first = sample()
  const added = applyTestCaseChange([], '新增', first)
  assert.equal(added.length, 1)
  const edited = applyTestCaseChange(added, '编辑', { ...first, testPoint: '更新' })
  assert.equal(edited[0].testPoint, '更新')
  assert.deepEqual(applyTestCaseChange(edited, '删除', first), [])
})

test('manifest 按 scope 和页面汇总计数', () => {
  const manifest = buildTestCaseManifest('demo', [sample(), sample({ id: 'case-2', stateId: 'empty' })], 'now')
  assert.equal(manifest.scopes?.home__ready.count, 1)
  assert.equal(manifest.scopes?.home__empty.count, 1)
  assert.equal(manifest.screens.home?.count, 2)
})

test('Excel 行包含定位列、7 个业务字段和编号步骤', async () => {
  const cases = [sample()]
  const scopes = buildTestCaseScopes(screens, states, { ready: '正常态', empty: '空状态' }, cases)
  const rows = testCaseExportRows(cases, scopes)
  assert.equal(rows[0].screenCode, 'M1')
  assert.equal(rows[0].steps, '1. 打开页面\n2. 观察内容')

  const workbook = await buildTestCasesWorkbook(cases, scopes)
  const buffer = await workbook.xlsx.writeBuffer()
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(buffer)
  const sheet = reopened.getWorksheet('测试用例')
  assert.ok(sheet)
  assert.deepEqual(Array.from(sheet.getRow(1).values as unknown[]).slice(1), ['页面编号', '页面名称', '状态名称', '所属模块', '测试项', '测试要点', '前置条件', '测试步骤', '预期结果', '实际结果'])
  assert.equal(sheet.rowCount, 2)
  assert.equal(sheet.getCell('H2').value, '1. 打开页面\n2. 观察内容')
  assert.equal(sheet.views[0]?.state, 'frozen')
  assert.ok(sheet.autoFilter)
})
