import type { CollaborationManifest, PrototypeTestCase, ScreenMeta } from '../../types/prototype'
import type { ProductStateItem } from '../../core/productAdapter'

export type TestCaseDraft = Pick<PrototypeTestCase, 'module' | 'testItem' | 'testPoint' | 'preconditions' | 'steps' | 'expectedResult' | 'actualResult'>

export interface TestCaseScope {
  id: string
  screenId: string
  stateId?: string
  screenCode: string
  screenTitle: string
  stateLabel: string
  known: boolean
}

export interface TestCaseExportRow {
  screenCode: string
  screenTitle: string
  stateLabel: string
  module: string
  testItem: string
  testPoint: string
  preconditions: string
  steps: string
  expectedResult: string
  actualResult: string
}

export function testCaseScopeId(screenId: string, stateId?: string) {
  return stateId ? `${screenId}__${stateId}` : screenId
}

export function emptyTestCaseDraft(module = ''): TestCaseDraft {
  return {
    module,
    testItem: '',
    testPoint: '',
    preconditions: '无',
    steps: [''],
    expectedResult: '',
    actualResult: '未执行',
  }
}

export function normalizeTestCases(value: unknown): PrototypeTestCase[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { testCases?: unknown }).testCases)
      ? (value as { testCases: unknown[] }).testCases
      : []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<PrototypeTestCase>
    const id = String(raw.id ?? '').trim()
    const screenId = String(raw.screenId ?? '').trim()
    if (!id || !screenId) return []
    const steps = Array.isArray(raw.steps) ? raw.steps.map((step) => String(step).trim()).filter(Boolean) : []
    return [{
      id,
      screenId,
      stateId: typeof raw.stateId === 'string' && raw.stateId.trim() ? raw.stateId.trim() : undefined,
      module: String(raw.module ?? '').trim(),
      testItem: String(raw.testItem ?? '').trim(),
      testPoint: String(raw.testPoint ?? '').trim(),
      preconditions: String(raw.preconditions ?? '').trim() || '无',
      steps,
      expectedResult: String(raw.expectedResult ?? '').trim(),
      actualResult: String(raw.actualResult ?? '').trim() || '未执行',
      authorName: typeof raw.authorName === 'string' ? raw.authorName : undefined,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    }]
  })
}

export function validateTestCaseDraft(value: TestCaseDraft) {
  if (!value.module.trim()) return '请填写所属模块'
  if (!value.testItem.trim()) return '请填写测试项'
  if (!value.testPoint.trim()) return '请填写测试要点'
  if (!value.steps.some((step) => step.trim())) return '请至少填写一个测试步骤'
  if (!value.expectedResult.trim()) return '请填写预期结果'
  return ''
}

export function applyTestCaseChange(
  value: PrototypeTestCase[],
  operation: '新增' | '编辑' | '删除',
  target: PrototypeTestCase,
) {
  if (operation === '删除') return value.filter((item) => item.id !== target.id)
  if (operation === '编辑') return value.some((item) => item.id === target.id)
    ? value.map((item) => item.id === target.id ? target : item)
    : [...value, target]
  return value.some((item) => item.id === target.id) ? value : [...value, target]
}

export function buildTestCaseManifest(projectId: string, testCases: PrototypeTestCase[], now = new Date().toISOString()): CollaborationManifest {
  const scopes: NonNullable<CollaborationManifest['scopes']> = {}
  const screens: CollaborationManifest['screens'] = {}
  testCases.forEach((item) => {
    const scopeId = testCaseScopeId(item.screenId, item.stateId)
    scopes[scopeId] = { count: (scopes[scopeId]?.count ?? 0) + 1, updatedAt: now }
    screens[item.screenId] = { count: (screens[item.screenId]?.count ?? 0) + 1, updatedAt: now }
  })
  return { projectId, updatedAt: now, scopes, screens }
}

export function buildTestCaseScopes(
  screens: ScreenMeta[],
  states: Record<string, ProductStateItem[]>,
  copy: Record<string, string>,
  testCases: PrototypeTestCase[] = [],
): TestCaseScope[] {
  const known = screens.flatMap<TestCaseScope>((screen): TestCaseScope[] => {
    const options = states[screen.id] ?? []
    if (!options.length) return [{
      id: screen.id,
      screenId: screen.id,
      stateId: undefined,
      screenCode: screen.code,
      screenTitle: screen.title,
      stateLabel: '默认状态',
      known: true,
    }]
    return options.map((state) => ({
      id: testCaseScopeId(screen.id, state.id),
      screenId: screen.id,
      stateId: state.id,
      screenCode: screen.code,
      screenTitle: screen.title,
      stateLabel: copy[state.labelKey] ?? state.id,
      known: true,
    }))
  })
  const knownIds = new Set(known.map((scope) => scope.id))
  const unknown = [...new Set(testCases.map((item) => testCaseScopeId(item.screenId, item.stateId)).filter((id) => !knownIds.has(id)))].map((id) => {
    const sample = testCases.find((item) => testCaseScopeId(item.screenId, item.stateId) === id)!
    return {
      id,
      screenId: sample.screenId,
      stateId: sample.stateId,
      screenCode: sample.screenId,
      screenTitle: '未知页面',
      stateLabel: sample.stateId ? `未知状态：${sample.stateId}` : '未知状态',
      known: false,
    } satisfies TestCaseScope
  })
  return [...known, ...unknown]
}

export function orderTestCases(testCases: PrototypeTestCase[], scopes: TestCaseScope[]) {
  const scopeOrder = new Map(scopes.map((scope, index) => [scope.id, index]))
  return [...testCases].sort((a, b) => (scopeOrder.get(testCaseScopeId(a.screenId, a.stateId)) ?? Number.MAX_SAFE_INTEGER) - (scopeOrder.get(testCaseScopeId(b.screenId, b.stateId)) ?? Number.MAX_SAFE_INTEGER))
}

export function testCaseExportRows(testCases: PrototypeTestCase[], scopes: TestCaseScope[]): TestCaseExportRow[] {
  const scopeMap = new Map(scopes.map((scope) => [scope.id, scope]))
  return orderTestCases(testCases, scopes).map((item) => {
    const scope = scopeMap.get(testCaseScopeId(item.screenId, item.stateId))
    return {
      screenCode: scope?.screenCode ?? item.screenId,
      screenTitle: scope?.screenTitle ?? '未知页面',
      stateLabel: scope?.stateLabel ?? (item.stateId || '未知状态'),
      module: item.module,
      testItem: item.testItem,
      testPoint: item.testPoint,
      preconditions: item.preconditions,
      steps: item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
      expectedResult: item.expectedResult,
      actualResult: item.actualResult,
    }
  })
}
