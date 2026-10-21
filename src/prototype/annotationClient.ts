import type { AnnotationManifest, CollaborationDataKind, MainFlow, PrototypeAnnotation, PrototypePageDescription, PrototypeTestCase } from '../types/prototype'
import { getCollaborationContext, readCollaborationCache, readScopedCollaborationCache } from './collaborationStore'
import { createSerialQueue, remoteInitializationDecision, jsonValuesEqual } from './collaborationPolicy'
import { CollaborationConflictError, readGiteeJson, writeGiteeJson, validateCollaborationManifest } from './giteeContents.mjs'
export { CollaborationConflictError } from './giteeContents.mjs'

export interface RemotePayload<T> {
  value: T
  sha: string
  legacy: boolean
}

export type AnnotationOperation = '新增' | '编辑' | '删除' | '同步索引'
export type PageDescriptionOperation = '保存' | '同步索引'
export type TestCaseOperation = '新增' | '编辑' | '删除'

const enqueue = createSerialQueue()

export type RemoteInitializationResult = 'created' | 'unchanged' | 'protected'

export const annotationRemoteEnabled = getCollaborationContext().remoteReadable

function kindPath(kind: CollaborationDataKind) {
  if (kind === 'pageDescriptions') return 'page-descriptions'
  if (kind === 'testCases') return 'test-cases'
  return kind
}

function dataPath(kind: CollaborationDataKind, scopeId?: string) {
  const context = getCollaborationContext()
  const base = `projects/${context.projectId}/branches/${context.branchKey}`
  if (kind === 'flows') return `${base}/flows.json`
  return `${base}/${kindPath(kind)}/${scopeId ?? 'manifest'}.json`
}

function legacyPath(kind: CollaborationDataKind, scopeId?: string) {
  const context = getCollaborationContext()
  if (kind === 'flows' || kind === 'testCases') return null
  if (kind === 'annotations' && !scopeId) return `projects/${context.projectId}/manifest.json`
  if (kind === 'annotations') return `projects/${context.projectId}/annotations/${scopeId}.json`
  if (!scopeId) return `projects/${context.projectId}/page-descriptions/manifest.json`
  return `projects/${context.projectId}/page-descriptions/${scopeId}.json`
}

function initializationMarkerPath() {
  const context = getCollaborationContext()
  return `projects/${context.projectId}/branches/${context.branchKey}/initialization.json`
}

async function requestGiteeFile(path: string): Promise<RemotePayload<unknown> | null> {
  const context = getCollaborationContext()
  if (!context.remoteReadable) return null
  const file = await readGiteeJson(context, path)
  return file ? { ...file, legacy: false } : null
}

async function loadRemote<T>(kind: CollaborationDataKind, scopeId?: string): Promise<RemotePayload<T> | null> {
  const current = await requestGiteeFile(dataPath(kind, scopeId))
  if (current) {
    validateRemoteShape(kind, scopeId, current.value)
    return current as RemotePayload<T>
  }
  const context = getCollaborationContext()
  if (context.codeBranch !== 'main') return null
  const fallbackPath = legacyPath(kind, scopeId)
  if (!fallbackPath) return null
  const legacy = await requestGiteeFile(fallbackPath)
  if (legacy) validateRemoteShape(kind, scopeId, legacy.value)
  return legacy ? { ...legacy, legacy: true } as RemotePayload<T> : null
}

function validateRemoteShape(kind: CollaborationDataKind, scopeId: string | undefined, value: unknown) {
  if ((kind === 'annotations' || kind === 'testCases') && scopeId) {
    if (!Array.isArray(value)) throw new Error('Gitee 协作正文格式无效，预期为数组')
  } else if (kind !== 'flows' && !scopeId) {
    validateCollaborationManifest(value)
  }
}

async function writeGiteeFile(path: string, value: unknown, sha: string | null, message: string) {
  const context = getCollaborationContext()
  if (!context.remoteWritable) return
  await writeGiteeJson(context, path, value, sha, message)
}

function commitMessage(scopeId: string, authorName: string, operation: string, kind: CollaborationDataKind) {
  const label = kind === 'annotations' ? 'annotations' : kind === 'pageDescriptions' ? 'page description' : kind === 'testCases' ? 'test cases' : 'flows'
  return [`docs: update ${scopeId} ${label}`, '', `提交人：${authorName}`, `范围：${scopeId}`, `操作：${operation}`].join('\n')
}

async function saveRemote<T>(kind: 'pageDescriptions' | 'flows', value: T, scopeId: string, authorName: string, operation: string, expectedRevision?: string | null) {
  return enqueue(`${kind}:${scopeId}`, async () => {
    const current = await requestGiteeFile(dataPath(kind, scopeId || undefined))
    const existing = current ?? await loadRemote<T>(kind, scopeId || undefined)
    const cached = kind === 'flows' ? readCollaborationCache(kind) : readScopedCollaborationCache(kind).scopes[scopeId]
    const baseline = expectedRevision !== undefined ? expectedRevision : cached?.baseRevision !== undefined ? cached.baseRevision : cached?.revision ?? null
    // 内容相同可恢复索引；有差异时必须核对编辑基线，不能用最新 SHA 替旧草稿解锁。
    if (existing && jsonValuesEqual(existing.value, value)) return existing as RemotePayload<T>
    if ((existing?.sha ?? null) !== baseline) throw new CollaborationConflictError()
    await writeGiteeFile(dataPath(kind, scopeId || undefined), value, current?.sha ?? null, commitMessage(scopeId || 'all', authorName, operation, kind))
    const saved = await requestGiteeFile(dataPath(kind, scopeId || undefined))
    if (!saved || !jsonValuesEqual(saved.value, value)) throw new Error('Gitee 写入后精确回读不一致')
    return saved as RemotePayload<T>
  })
}

export function ensureRemoteData(
  kind: CollaborationDataKind,
  scopeId: string | undefined,
  value: unknown,
  authorName: string,
): Promise<RemoteInitializationResult> {
  const key = `${kind}:${scopeId ?? 'root'}:initialize`
  return enqueue(key, async () => {
    const path = dataPath(kind, scopeId)
    const current = await requestGiteeFile(path)
    const existing = current ?? await loadRemote(kind, scopeId)
    // 旧目录也是可读真值，初始化不能用种子隐式迁移并覆盖它。
    if (existing) {
      validateRemoteShape(kind, scopeId, existing.value)
      return remoteInitializationDecision(existing.value, value)
    }
    await writeGiteeFile(path, value, null, commitMessage(scopeId ?? 'all', authorName, '初始化', kind))
    const saved = await requestGiteeFile(path)
    if (!saved || !jsonValuesEqual(saved.value, value)) throw new Error('Gitee 初始化后精确回读不一致')
    return 'created'
  })
}

export async function hasRemoteInitializationMarker() {
  return Boolean(await requestGiteeFile(initializationMarkerPath()))
}

export function ensureRemoteInitializationMarker(value: unknown, authorName: string) {
  return enqueue('initialization:marker', async () => {
    const path = initializationMarkerPath()
    const current = await requestGiteeFile(path)
    if (current) return remoteInitializationDecision(current.value, value)
    await writeGiteeFile(path, value, null, commitMessage('all', authorName, '初始化完成', 'flows'))
    const saved = await requestGiteeFile(path)
    if (!saved || !jsonValuesEqual(saved.value, value)) throw new Error('Gitee 初始化标记回读不一致')
    return 'created' as const
  })
}

async function saveManifest(kind: 'annotations' | 'pageDescriptions' | 'testCases', manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return enqueue(`${kind}:manifest`, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await requestGiteeFile(dataPath(kind))
      const legacy = !current && getCollaborationContext().codeBranch === 'main' ? await loadRemote<AnnotationManifest>(kind) : null
      const remoteManifest = (current ?? legacy)?.value as AnnotationManifest | undefined
      if (remoteManifest !== undefined) validateRemoteShape(kind, undefined, remoteManifest)
      const screenId = scopeId.split('__')[0] as keyof AnnotationManifest['screens']
      const scopes = { ...(remoteManifest?.scopes ?? {}), [scopeId]: manifest.scopes?.[scopeId] ?? { count: 0, updatedAt: new Date().toISOString() } }
      const count = Object.entries(scopes).reduce((sum, [id, entry]) => sum + (id === screenId || id.startsWith(`${screenId}__`) ? entry.count : 0), 0)
      const next: AnnotationManifest = {
        ...(remoteManifest ?? manifest),
        projectId: manifest.projectId,
        updatedAt: new Date().toISOString(),
        scopes,
        screens: { ...(remoteManifest?.screens ?? {}), [screenId]: { count, updatedAt: new Date().toISOString() } },
      }
      const oldEntry = remoteManifest?.scopes?.[scopeId]
      if (oldEntry && jsonValuesEqual({ ...oldEntry, updatedAt: '' }, { ...scopes[scopeId], updatedAt: '' }) && remoteManifest?.screens[screenId]?.count === count) {
        return (current ?? legacy) as RemotePayload<AnnotationManifest>
      }
      try {
        await writeGiteeFile(dataPath(kind), next, current?.sha ?? null, commitMessage(scopeId, authorName, '同步索引', kind))
        const saved = await requestGiteeFile(dataPath(kind))
        if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('Gitee 索引写入后精确回读不一致')
        return saved as RemotePayload<AnnotationManifest>
      } catch (error) {
        if (!(error instanceof CollaborationConflictError) || attempt === 1) throw error
      }
    }
    return null
  })
}

export function loadRemoteAnnotationManifest() {
  return loadRemote<AnnotationManifest>('annotations')
}

export function loadRemoteScreenAnnotations(scopeId: string) {
  return loadRemote<PrototypeAnnotation[]>('annotations', scopeId)
}

export async function updateRemoteScreenAnnotations(
  scopeId: string,
  authorName: string,
  operation: AnnotationOperation,
  transform: (remoteValue: PrototypeAnnotation[]) => PrototypeAnnotation[],
  expected?: PrototypeAnnotation[],
) {
  return enqueue(`annotations:${scopeId}`, async () => {
    const current = await requestGiteeFile(dataPath('annotations', scopeId))
    const legacy = !current && getCollaborationContext().codeBranch === 'main' ? await loadRemoteScreenAnnotations(scopeId) : null
    const remoteValue = (current ?? legacy)?.value
    if (remoteValue !== undefined) validateRemoteShape('annotations', scopeId, remoteValue)
    if (expected) {
      const desired = transform(expected)
      const ids = new Set([...expected, ...desired].map((item) => item.id))
      for (const id of ids) {
        const before = expected.find((item) => item.id === id)
        const after = desired.find((item) => item.id === id)
        const remote = Array.isArray(remoteValue) ? remoteValue.find((item) => item.id === id) : undefined
        if (!jsonValuesEqual(before, after) && !jsonValuesEqual(remote, after) && !jsonValuesEqual(remote, before)) throw new CollaborationConflictError('该注释已被其他协作者修改，请刷新后处理草稿')
      }
    }
    const next = transform(Array.isArray(remoteValue) ? remoteValue as PrototypeAnnotation[] : [])
    await writeGiteeFile(dataPath('annotations', scopeId), next, current?.sha ?? null, commitMessage(scopeId, authorName, operation, 'annotations'))
    const saved = await requestGiteeFile(dataPath('annotations', scopeId))
    if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('注释写入后精确回读不一致')
    return saved as RemotePayload<PrototypeAnnotation[]>
  })
}

export async function saveRemoteAnnotationManifest(manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return saveManifest('annotations', manifest, authorName, scopeId)
}

export function loadRemotePageDescriptionManifest() {
  return loadRemote<AnnotationManifest>('pageDescriptions')
}

export function loadRemotePageDescription(scopeId: string) {
  return loadRemote<PrototypePageDescription>('pageDescriptions', scopeId)
}

export function saveRemotePageDescription(scopeId: string, authorName: string, value: PrototypePageDescription, expectedRevision?: string | null) {
  return saveRemote('pageDescriptions', value, scopeId, authorName, '保存', expectedRevision)
}

export function saveRemotePageDescriptionManifest(manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return saveManifest('pageDescriptions', manifest, authorName, scopeId)
}

export function loadRemoteTestCaseManifest() {
  return loadRemote<AnnotationManifest>('testCases')
}

export function loadRemoteTestCases(scopeId: string) {
  return loadRemote<PrototypeTestCase[]>('testCases', scopeId)
}

export async function updateRemoteTestCases(
  scopeId: string,
  authorName: string,
  operation: TestCaseOperation,
  transform: (remoteValue: PrototypeTestCase[]) => PrototypeTestCase[],
) {
  return enqueue(`testCases:${scopeId}`, async () => {
    const current = await requestGiteeFile(dataPath('testCases', scopeId))
    const remoteValue = current?.value
    if (remoteValue !== undefined) validateRemoteShape('testCases', scopeId, remoteValue)
    const next = transform(Array.isArray(remoteValue) ? remoteValue as PrototypeTestCase[] : [])
    await writeGiteeFile(dataPath('testCases', scopeId), next, current?.sha ?? null, commitMessage(scopeId, authorName, operation, 'testCases'))
    const saved = await requestGiteeFile(dataPath('testCases', scopeId))
    if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('测试用例写入后精确回读不一致')
    return saved as RemotePayload<PrototypeTestCase[]>
  })
}

export function saveRemoteTestCaseManifest(manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return saveManifest('testCases', manifest, authorName, scopeId)
}

export function loadRemoteFlows() {
  return loadRemote<{ version?: string; flows?: MainFlow[] }>('flows')
}

export function saveRemoteFlows(authorName: string, flows: MainFlow[], expectedRevision?: string | null) {
  return saveRemote('flows', { version: '1.0.0', flows }, '', authorName, '保存', expectedRevision)
}
