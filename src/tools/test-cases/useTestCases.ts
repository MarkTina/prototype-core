import { computed, ref } from 'vue'
import type { CollaborationManifest, CollaborationSourceState, PrototypeTestCase } from '../../types/prototype'
import { getPrototypeProduct, getPrototypeRuntime } from '../../core/productAdapter'
import {
  CollaborationConflictError,
  ensureRemoteData,
  loadRemoteTestCaseManifest,
  loadRemoteTestCases,
  saveRemoteTestCaseManifest,
  updateRemoteTestCases,
  type TestCaseOperation,
} from '../../prototype/annotationClient'
import {
  getCollaborationContext,
  readScopedCollaborationCache,
  removeScopedCollaborationCache,
  writeScopedCollaborationCache,
} from '../../prototype/collaborationStore'
import { shouldDeferRemoteRefresh } from '../../prototype/collaborationPolicy'
import {
  applyTestCaseChange,
  buildTestCaseManifest,
  buildTestCaseScopes,
  normalizeTestCases,
  orderTestCases,
  testCaseScopeId,
  type TestCaseScope,
} from './model'

const testCases = ref<PrototypeTestCase[]>([])
const testCaseManifest = ref<CollaborationManifest | null>(null)
const selectedScopeId = ref('')
const initialized = ref(false)
const editing = ref(false)
const sourceState = ref<CollaborationSourceState>({ source: 'local-seed', status: 'idle' })
const product = getPrototypeProduct()
const collaboration = getCollaborationContext()

function setSource(source: CollaborationSourceState['source'], status: CollaborationSourceState['status'], message = '', syncedAt?: string) {
  sourceState.value = { source, status, ...(message ? { message } : {}), ...(syncedAt ? { syncedAt } : {}) }
}

async function loadLocalSeed() {
  try {
    const baseUrl = getPrototypeRuntime().baseUrl ?? '/'
    const response = await fetch(`${baseUrl.replace(/\/?$/, '/')}test-cases.json`, { cache: 'no-store' })
    return response.ok ? normalizeTestCases(await response.json()) : []
  } catch {
    return []
  }
}

function replaceScope(scopeId: string, value: PrototypeTestCase[]) {
  testCases.value = [
    ...testCases.value.filter((item) => testCaseScopeId(item.screenId, item.stateId) !== scopeId),
    ...value,
  ]
}

function updateLocalManifest(scopeId: string, count: number) {
  const now = new Date().toISOString()
  const screenId = scopeId.split('__')[0]
  const existing = testCaseManifest.value ?? { projectId: collaboration.projectId, updatedAt: now, scopes: {}, screens: {} }
  const scopes = { ...(existing.scopes ?? {}), [scopeId]: { count, updatedAt: now } }
  const screenCount = Object.entries(scopes).reduce((total, [id, entry]) => total + (id === screenId || id.startsWith(`${screenId}__`) ? entry.count : 0), 0)
  testCaseManifest.value = {
    ...existing,
    updatedAt: now,
    scopes,
    screens: { ...existing.screens, [screenId]: { count: screenCount, updatedAt: now } },
  }
}

async function ensureRemoteTestCaseData(seed: PrototypeTestCase[], authorName: string) {
  if (!collaboration.remoteWritable) return
  const grouped = new Map<string, PrototypeTestCase[]>()
  seed.forEach((item) => {
    const scopeId = testCaseScopeId(item.screenId, item.stateId)
    grouped.set(scopeId, [...(grouped.get(scopeId) ?? []), item])
  })
  for (const [scopeId, value] of grouped) await ensureRemoteData('testCases', scopeId, value, authorName)
  await ensureRemoteData('testCases', undefined, buildTestCaseManifest(collaboration.projectId, seed), authorName)
}

async function initializeTestCases(authorName = '初始化工具') {
  if (initialized.value) return
  const seed = await loadLocalSeed()
  const cache = readScopedCollaborationCache<PrototypeTestCase[]>('testCases')
  const cachedScopeIds = new Set(Object.keys(cache.scopes))
  const cached = Object.values(cache.scopes).flatMap((entry) => normalizeTestCases(entry.value))
  testCases.value = [...seed.filter((item) => !cachedScopeIds.has(testCaseScopeId(item.screenId, item.stateId))), ...cached]
  setSource(cachedScopeIds.size ? 'local-cache' : 'local-seed', 'idle', cachedScopeIds.size ? '已加载测试用例本地缓存' : '')
  const defaultScreen = product.pages[0]
  const defaultState = defaultScreen ? product.states[defaultScreen.id]?.[0]?.id : undefined
  selectedScopeId.value = defaultScreen ? testCaseScopeId(defaultScreen.id, defaultState) : ''
  initialized.value = true
  if (!collaboration.remoteReadable) {
    setSource(cachedScopeIds.size ? 'local-cache' : 'local-seed', 'idle', collaboration.unavailableReason)
    return
  }
  try {
    await ensureRemoteTestCaseData(seed, authorName)
    await refreshTestCases(false)
  } catch (error) {
    setSource(cachedScopeIds.size ? 'local-cache' : 'local-seed', 'error', error instanceof Error ? error.message : '测试用例初始化失败')
  }
}

async function selectTestCaseScope(screenId: string, stateId?: string) {
  selectedScopeId.value = testCaseScopeId(screenId, stateId)
  if (initialized.value && collaboration.remoteReadable) await refreshTestCases(false)
}

async function refreshTestCases(fromPolling = false) {
  if (!initialized.value || !collaboration.remoteReadable || !selectedScopeId.value) return
  if (shouldDeferRemoteRefresh(fromPolling, editing.value)) {
    setSource(sourceState.value.source, 'idle', '检测到未保存编辑，已暂缓轮询覆盖')
    return
  }
  setSource(sourceState.value.source, 'syncing')
  const scopeId = selectedScopeId.value
  try {
    const [manifest, remote] = await Promise.all([loadRemoteTestCaseManifest(), loadRemoteTestCases(scopeId)])
    testCaseManifest.value = manifest?.value ?? testCaseManifest.value
    const cached = readScopedCollaborationCache<PrototypeTestCase[]>('testCases').scopes[scopeId]
    if (!remote && !manifest?.value.scopes?.[scopeId]) {
      if (cached?.status === 'pending') {
        setSource('local-cache', 'idle', 'Gitee 当前 Scope 不存在，本地缓存待推送')
        return
      }
      removeScopedCollaborationCache('testCases', scopeId)
      replaceScope(scopeId, [])
      setSource('gitee', 'success', '', new Date().toISOString())
      return
    }
    if (!remote) throw new Error(`Gitee 测试用例文件不存在：${scopeId}`)
    const [screenId, stateId] = scopeId.split('__')
    const canonical = normalizeTestCases(remote.value).map((item) => ({ ...item, screenId, stateId }))
    const syncedAt = new Date().toISOString()
    if (cached?.status === 'pending') {
      setSource('local-cache', 'idle', '已读取 Gitee，本地缓存仍有待推送修改', syncedAt)
      return
    }
    writeScopedCollaborationCache('testCases', scopeId, canonical, remote.sha, syncedAt, 'synced')
    replaceScope(scopeId, canonical)
    updateLocalManifest(scopeId, canonical.length)
    setSource('gitee', 'success', '', syncedAt)
  } catch (error) {
    const cached = readScopedCollaborationCache<PrototypeTestCase[]>('testCases').scopes[scopeId]
    if (cached) writeScopedCollaborationCache('testCases', scopeId, cached.value, cached.revision, cached.lastRemoteSyncAt, cached.status === 'pending' ? 'pending' : 'stale', error instanceof Error ? error.message : '测试用例同步失败')
    setSource(cached ? 'local-cache' : sourceState.value.source, 'error', error instanceof Error ? error.message : '测试用例同步失败')
  }
}

async function saveTestCase(operation: TestCaseOperation, target: PrototypeTestCase) {
  const scopeId = testCaseScopeId(target.screenId, target.stateId)
  const author = target.authorName?.trim() || '未署名'
  if (!collaboration.remoteWritable) {
    const next = applyTestCaseChange(testCases.value.filter((item) => testCaseScopeId(item.screenId, item.stateId) === scopeId), operation, target)
    replaceScope(scopeId, next)
    const cached = readScopedCollaborationCache<PrototypeTestCase[]>('testCases').scopes[scopeId]
    writeScopedCollaborationCache('testCases', scopeId, next, cached?.revision ?? null, cached?.lastRemoteSyncAt ?? null, 'pending')
    updateLocalManifest(scopeId, next.length)
    setSource('local-cache', 'success', `${collaboration.unavailableReason || 'Gitee 当前不可写'}，修改尚未同步`)
    return true
  }
  setSource(sourceState.value.source, 'syncing')
  try {
    const saved = await updateRemoteTestCases(scopeId, author, operation, (remote) => applyTestCaseChange(normalizeTestCases(remote), operation, target))
    if (!saved) throw new Error('测试用例写入后未能回读')
    const canonical = normalizeTestCases(saved.value).map((item) => ({ ...item, screenId: target.screenId, stateId: target.stateId }))
    const syncedAt = new Date().toISOString()
    replaceScope(scopeId, canonical)
    updateLocalManifest(scopeId, canonical.length)
    writeScopedCollaborationCache('testCases', scopeId, canonical, saved.sha, syncedAt, 'synced')
    if (!testCaseManifest.value) testCaseManifest.value = buildTestCaseManifest(collaboration.projectId, testCases.value, syncedAt)
    const savedManifest = await saveRemoteTestCaseManifest(testCaseManifest.value, author, scopeId)
    if (!savedManifest) throw new Error(`测试用例 ${scopeId} 已写入，但 manifest 回读失败`)
    testCaseManifest.value = savedManifest.value
    setSource('gitee', 'success', '', syncedAt)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '测试用例保存失败'
    setSource(sourceState.value.source, error instanceof CollaborationConflictError ? 'conflict' : 'error', message)
    return false
  }
}

async function loadAllTestCasesForExport() {
  if (!collaboration.remoteReadable) return orderTestCases(testCases.value, scopes('zh'))
  const manifest = await loadRemoteTestCaseManifest()
  if (!manifest) throw new Error('Gitee 测试用例 manifest 不存在，无法确认整体导出范围')
  const failures: string[] = []
  const all: PrototypeTestCase[] = []
  const cache = readScopedCollaborationCache<PrototypeTestCase[]>('testCases')
  for (const scopeId of Object.keys(manifest.value.scopes ?? {})) {
    try {
      const remote = await loadRemoteTestCases(scopeId)
      if (!remote) throw new Error('文件不存在')
      const [screenId, stateId] = scopeId.split('__')
      const canonical = normalizeTestCases(remote.value).map((item) => ({ ...item, screenId, stateId }))
      all.push(...canonical)
      if (cache.scopes[scopeId]?.status !== 'pending') {
        writeScopedCollaborationCache('testCases', scopeId, canonical, remote.sha, new Date().toISOString(), 'synced')
        replaceScope(scopeId, canonical)
      }
    } catch (error) {
      failures.push(`${scopeId}：${error instanceof Error ? error.message : '读取失败'}`)
    }
  }
  if (failures.length) throw new Error(`整体导出已中止，以下 Scope 读取失败：\n${failures.join('\n')}`)
  testCaseManifest.value = manifest.value
  return orderTestCases(all, buildTestCaseScopes(product.pages, product.states, product.copy.zh, all))
}

function scopes(lang: 'zh' | 'en'): TestCaseScope[] {
  return buildTestCaseScopes(product.pages, product.states, product.copy[lang], testCases.value)
}

export function useTestCases() {
  return {
    testCases,
    testCaseManifest,
    selectedScopeId,
    initialized,
    sourceState,
    selectedScopeCases: computed(() => testCases.value.filter((item) => testCaseScopeId(item.screenId, item.stateId) === selectedScopeId.value)),
    scopes,
    initializeTestCases,
    selectTestCaseScope,
    refreshTestCases,
    saveTestCase,
    loadAllTestCasesForExport,
    setTestCaseEditing(value: boolean) { editing.value = value },
  }
}
