import type { AnnotationManifest, CollaborationDataKind, MainFlow, PrototypeAnnotation, PrototypePageDescription } from '../types/prototype'
import { getCollaborationContext } from './collaborationStore'
import { createSerialQueue, remoteInitializationDecision, selectGiteeFileResponse } from './collaborationPolicy'

export interface RemotePayload<T> {
  value: T
  sha: string
  legacy: boolean
}

export type AnnotationOperation = '新增' | '编辑' | '删除' | '同步索引'
export type PageDescriptionOperation = '保存' | '同步索引'

const GITEE_API_BASE = 'https://gitee.com/api/v5'
const enqueue = createSerialQueue()

export class CollaborationConflictError extends Error {
  constructor(message = '远端已有更新，请刷新后重试或放弃本地草稿') {
    super(message)
    this.name = 'CollaborationConflictError'
  }
}

export type RemoteInitializationResult = 'created' | 'unchanged' | 'protected'

export const annotationRemoteEnabled = getCollaborationContext().remoteReadable

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function encodeBase64(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
}

function decodeBase64(value: string) {
  return decodeURIComponent(escape(atob(value.replace(/\s/g, ''))))
}

function kindPath(kind: CollaborationDataKind) {
  if (kind === 'pageDescriptions') return 'page-descriptions'
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
  if (kind === 'flows') return null
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = new URL(`${GITEE_API_BASE}/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${encodePath(path)}`)
    url.searchParams.set('access_token', context.token)
    url.searchParams.set('ref', context.remoteBranch)
    url.searchParams.set('_ts', `${Date.now()}-${attempt}`)
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
    })
    if (response.status === 304) continue
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`读取 Gitee 文件失败：${response.status}`)
    const payload = await response.json() as unknown
    const file = selectGiteeFileResponse(payload, path)
    if (file) return { value: JSON.parse(decodeBase64(file.content)), sha: file.sha, legacy: false }
    if (Array.isArray(payload)) return null
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).join(',') || 'empty' : typeof payload
    throw new Error(`Gitee 文件响应格式异常：${response.status} / ${keys}`)
  }
  throw new Error('读取 Gitee 文件失败：304 缓存响应')
}

async function loadRemote<T>(kind: CollaborationDataKind, scopeId?: string): Promise<RemotePayload<T> | null> {
  const current = await requestGiteeFile(dataPath(kind, scopeId))
  if (current) return current as RemotePayload<T>
  const context = getCollaborationContext()
  if (context.codeBranch !== 'main') return null
  const fallbackPath = legacyPath(kind, scopeId)
  if (!fallbackPath) return null
  const legacy = await requestGiteeFile(fallbackPath)
  return legacy ? { ...legacy, legacy: true } as RemotePayload<T> : null
}

async function writeGiteeFile(path: string, value: unknown, sha: string | null, message: string) {
  const context = getCollaborationContext()
  if (!context.remoteWritable) return
  const url = `${GITEE_API_BASE}/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${encodePath(path)}`
  const body = new URLSearchParams()
  body.set('access_token', context.token)
  body.set('branch', context.remoteBranch)
  body.set('content', encodeBase64(JSON.stringify(value, null, 2)))
  body.set('message', message)
  if (sha) body.set('sha', sha)
  const response = await fetch(url, {
    method: sha ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  if (response.status === 409 || response.status === 422) throw new CollaborationConflictError()
  if (!response.ok) throw new Error(`提交 Gitee 文件失败：${response.status}`)
}

function commitMessage(scopeId: string, authorName: string, operation: string, kind: CollaborationDataKind) {
  const label = kind === 'annotations' ? 'annotations' : kind === 'pageDescriptions' ? 'page description' : 'flows'
  return [`docs: update ${scopeId} ${label}`, '', `提交人：${authorName}`, `范围：${scopeId}`, `操作：${operation}`].join('\n')
}

async function saveRemote<T>(kind: CollaborationDataKind, value: T, scopeId: string, authorName: string, operation: string) {
  return enqueue(`${kind}:${scopeId}`, async () => {
    const current = await requestGiteeFile(dataPath(kind, scopeId || undefined))
    await writeGiteeFile(dataPath(kind, scopeId || undefined), value, current?.sha ?? null, commitMessage(scopeId || 'all', authorName, operation, kind))
    return loadRemote<T>(kind, scopeId || undefined)
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
    if (current) return remoteInitializationDecision(current.value, value)
    await writeGiteeFile(path, value, null, commitMessage(scopeId ?? 'all', authorName, '初始化', kind))
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
    return 'created' as const
  })
}

async function saveManifest(kind: 'annotations' | 'pageDescriptions', manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return enqueue(`${kind}:manifest`, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await requestGiteeFile(dataPath(kind))
      const legacy = !current && getCollaborationContext().codeBranch === 'main' ? await loadRemote<AnnotationManifest>(kind) : null
      const remoteManifest = (current ?? legacy)?.value as AnnotationManifest | undefined
      const screenId = scopeId.split('__')[0] as keyof AnnotationManifest['screens']
      const next: AnnotationManifest = {
        ...(remoteManifest ?? manifest),
        projectId: manifest.projectId,
        updatedAt: new Date().toISOString(),
        scopes: { ...(remoteManifest?.scopes ?? {}), [scopeId]: manifest.scopes?.[scopeId] ?? { count: 0, updatedAt: new Date().toISOString() } },
        screens: { ...(remoteManifest?.screens ?? {}), [screenId]: manifest.screens[screenId] ?? { count: 0, updatedAt: new Date().toISOString() } },
      }
      try {
        await writeGiteeFile(dataPath(kind), next, current?.sha ?? null, commitMessage(scopeId, authorName, '同步索引', kind))
        return loadRemote<AnnotationManifest>(kind)
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
) {
  return enqueue(`annotations:${scopeId}`, async () => {
    const current = await requestGiteeFile(dataPath('annotations', scopeId))
    const legacy = !current && getCollaborationContext().codeBranch === 'main' ? await loadRemoteScreenAnnotations(scopeId) : null
    const remoteValue = (current ?? legacy)?.value
    const next = transform(Array.isArray(remoteValue) ? remoteValue as PrototypeAnnotation[] : [])
    await writeGiteeFile(dataPath('annotations', scopeId), next, current?.sha ?? null, commitMessage(scopeId, authorName, operation, 'annotations'))
    return loadRemoteScreenAnnotations(scopeId)
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

export function saveRemotePageDescription(scopeId: string, authorName: string, value: PrototypePageDescription) {
  return saveRemote('pageDescriptions', value, scopeId, authorName, '保存')
}

export function saveRemotePageDescriptionManifest(manifest: AnnotationManifest, authorName: string, scopeId: string) {
  return saveManifest('pageDescriptions', manifest, authorName, scopeId)
}

export function loadRemoteFlows() {
  return loadRemote<{ version?: string; flows?: MainFlow[] }>('flows')
}

export function saveRemoteFlows(authorName: string, flows: MainFlow[]) {
  return saveRemote('flows', { version: '1.0.0', flows }, '', authorName, '保存')
}
