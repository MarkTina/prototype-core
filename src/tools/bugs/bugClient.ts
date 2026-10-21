import { createSerialQueue, jsonValuesEqual } from '../../prototype/collaborationPolicy'
import { getCollaborationContext } from '../../prototype/collaborationStore'
import { readGiteeJson, writeGiteeJson, CollaborationConflictError } from '../../prototype/giteeContents.mjs'
import type { ProductBug } from './types'

export interface BugRemotePayload<T> {
  value: T
  sha: string
  exists: boolean
  legacy: boolean
}

const enqueue = createSerialQueue()

export const bugRemoteEnabled = getCollaborationContext().remoteReadable

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
  const file = await readGiteeJson(context, path)
  return file ? { ...file, exists: true, legacy: path === legacyBugDataPath() } : null
}

async function loadCurrentRemote(): Promise<BugRemotePayload<unknown> | null> {
  const current = await requestGiteeFile(bugDataPath())
  if (current) return current
  if (getCollaborationContext().codeBranch !== 'main') return null
  return requestGiteeFile(legacyBugDataPath())
}

async function writeGiteeFile(path: string, value: unknown, sha: string | null, message: string) {
  const context = getCollaborationContext()
  if (!context.remoteWritable) throw new Error(context.unavailableReason)
  try {
    await writeGiteeJson(context, path, value, sha, message)
  } catch (error) {
    if (error instanceof CollaborationConflictError) throw new CollaborationConflictError('远端已有新的 Bug 数据，提交草稿已保留')
    throw error
  }
}

export async function loadRemoteBugs(): Promise<BugRemotePayload<ProductBug[]> | null> {
  const payload = await loadCurrentRemote()
  if (!payload) return null
  if (!Array.isArray(payload.value)) throw new Error('Gitee Bug 数据格式无效')
  return { ...payload, value: payload.value as ProductBug[] }
}

export async function updateRemoteBugs(
  operatorName: string,
  operation: string,
  transform: (remoteValue: ProductBug[]) => ProductBug[],
) {
  return enqueue('bugs:all', async () => {
    const remote = await loadCurrentRemote()
    if (remote && !Array.isArray(remote.value)) throw new Error('Gitee Bug 数据格式无效，已停止写入')
    const next = transform(Array.isArray(remote?.value) ? (remote.value as ProductBug[]) : [])
    await writeGiteeFile(bugDataPath(), next, remote?.legacy ? null : remote?.sha ?? null, commitMessage(operatorName, operation))
    const saved = await requestGiteeFile(bugDataPath())
    if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('Bug 写入后精确回读不一致')
    return { ...saved, value: saved.value as ProductBug[] }
  })
}
