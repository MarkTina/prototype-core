import { createSerialQueue, selectGiteeFileResponse } from '../../prototype/collaborationPolicy'
import { getCollaborationContext } from '../../prototype/collaborationStore'
import type { ProductBug } from './types'

export interface BugRemotePayload<T> {
  value: T
  sha: string
  exists: boolean
  legacy: boolean
}

const GITEE_API_BASE = 'https://gitee.com/api/v5'
const enqueue = createSerialQueue()

export const bugRemoteEnabled = getCollaborationContext().remoteReadable

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function encodeBase64(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
}

function decodeBase64(value: string) {
  return decodeURIComponent(escape(atob(value.replace(/\s/g, ''))))
}

function bugDataPath() {
  const context = getCollaborationContext()
  return `projects/${context.projectId}/branches/${context.branchKey}/bugs/bugs.json`
}

function legacyBugDataPath() {
  const context = getCollaborationContext()
  return `projects/${context.projectId}/bugs/bugs.json`
}

function commitMessage(operatorName: string, operation: string) {
  const context = getCollaborationContext()
  return ['docs: update product bugs', '', `提交人：${operatorName}`, `代码分支：${context.codeBranch}`, `数据分支：${context.branchKey}`, `操作：${operation}`].join('\n')
}

async function requestGiteeFile(path: string): Promise<BugRemotePayload<unknown> | null> {
  const context = getCollaborationContext()
  if (!context.remoteReadable) return null

  const url = new URL(`${GITEE_API_BASE}/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${encodePath(path)}`)
  url.searchParams.set('access_token', context.token)
  url.searchParams.set('ref', context.remoteBranch)
  url.searchParams.set('_ts', `${Date.now()}`)

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`读取 Gitee Bug 文件失败：${response.status}`)

  const payload = await response.json() as unknown
  const file = selectGiteeFileResponse(payload, path)
  if (file) {
    return {
      value: JSON.parse(decodeBase64(file.content)),
      sha: file.sha,
      exists: true,
      legacy: path === legacyBugDataPath(),
    }
  }
  if (Array.isArray(payload)) return null
  throw new Error('Gitee Bug 文件响应格式异常')
}

async function loadCurrentRemote(): Promise<BugRemotePayload<unknown> | null> {
  const current = await requestGiteeFile(bugDataPath())
  if (current) return current
  if (getCollaborationContext().codeBranch !== 'main') return null
  return requestGiteeFile(legacyBugDataPath())
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

  if (response.status === 409 || response.status === 422) throw new Error('远端已有新的 Bug 数据，请刷新后再提交')
  if (!response.ok) throw new Error(`提交 Gitee Bug 文件失败：${response.status}`)
}

export async function loadRemoteBugs(): Promise<BugRemotePayload<ProductBug[]> | null> {
  const payload = await loadCurrentRemote()
  if (!payload) return null
  return {
    ...payload,
    value: Array.isArray(payload.value) ? (payload.value as ProductBug[]) : [],
  }
}

export async function updateRemoteBugs(
  operatorName: string,
  operation: string,
  transform: (remoteValue: ProductBug[]) => ProductBug[],
) {
  return enqueue('bugs:all', async () => {
    const remote = await loadCurrentRemote()
    const next = transform(Array.isArray(remote?.value) ? (remote.value as ProductBug[]) : [])
    await writeGiteeFile(bugDataPath(), next, remote?.legacy ? null : remote?.sha ?? null, commitMessage(operatorName, operation))
    return next
  })
}
