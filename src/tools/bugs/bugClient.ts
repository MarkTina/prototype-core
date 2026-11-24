import { createSerialQueue, jsonValuesEqual } from '../../prototype/collaborationPolicy'
import { getCollaborationContext } from '../../prototype/collaborationStore'
import { readGiteeJson, writeGiteeJson, CollaborationConflictError } from '../../prototype/giteeContents.mjs'
import { appendBugVersion, defaultBugVersion, isBugVersionId, readBugVersionCatalog, type BugReportVersion } from './bugPolicy'
import type { ProductBug } from './types'

export interface BugRemotePayload<T> {
  value: T
  sha: string
  exists: boolean
  legacy: boolean
}

const enqueue = createSerialQueue()

export const bugRemoteEnabled = getCollaborationContext().remoteReadable

function bugRootPath() {
  const context = getCollaborationContext()
  return `projects/${context.projectId}/branches/${context.branchKey}/bugs`
}

function bugDataPath(versionId: string) {
  if (!isBugVersionId(versionId)) throw new Error('Bug 版本无效')
  return versionId === defaultBugVersion.id ? `${bugRootPath()}/bugs.json` : `${bugRootPath()}/versions/${versionId}.json`
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
  if (file && !file.sha.trim()) throw new Error('Gitee Bug 文件缺少有效 revision')
  return file ? { ...file, exists: true, legacy: path === legacyBugDataPath() } : null
}

async function loadCurrentRemote(versionId: string): Promise<BugRemotePayload<unknown> | null> {
  const current = await requestGiteeFile(bugDataPath(versionId))
  if (current) return current
  if (versionId !== defaultBugVersion.id || getCollaborationContext().codeBranch !== 'main') return null
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

export async function loadRemoteBugVersions(): Promise<BugRemotePayload<BugReportVersion[]> | null> {
  const payload = await requestGiteeFile(`${bugRootPath()}/versions.json`)
  return payload ? { ...payload, value: readBugVersionCatalog(payload.value) } : null
}

export async function createRemoteBugVersion(operatorName: string, version: BugReportVersion) {
  return enqueue('bugs:versions', async () => {
    const path = `${bugRootPath()}/versions.json`
    const remote = await loadRemoteBugVersions()
    const next = appendBugVersion(remote?.value ?? [], version)
    await writeGiteeFile(path, next, remote?.sha ?? null, commitMessage(operatorName, `创建提报版本 ${version.name}`))
    const saved = await requestGiteeFile(path)
    if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('Bug 版本清单写入后精确回读不一致')
    return { ...saved, value: readBugVersionCatalog(saved.value) }
  })
}

export async function loadRemoteBugs(versionId = defaultBugVersion.id): Promise<BugRemotePayload<ProductBug[]> | null> {
  const payload = await loadCurrentRemote(versionId)
  if (!payload) return null
  if (!Array.isArray(payload.value)) throw new Error('Gitee Bug 数据格式无效')
  return { ...payload, value: payload.value as ProductBug[] }
}

export async function updateRemoteBugs(
  operatorName: string,
  operation: string,
  transform: (remoteValue: ProductBug[]) => ProductBug[],
  versionId = defaultBugVersion.id,
) {
  return enqueue(`bugs:data:${versionId}`, async () => {
    const path = bugDataPath(versionId)
    const remote = await loadCurrentRemote(versionId)
    if (remote && !Array.isArray(remote.value)) throw new Error('Gitee Bug 数据格式无效，已停止写入')
    const next = transform(Array.isArray(remote?.value) ? (remote.value as ProductBug[]) : [])
    await writeGiteeFile(path, next, remote?.legacy ? null : remote?.sha ?? null, commitMessage(operatorName, operation))
    const saved = await requestGiteeFile(path)
    if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error('Bug 写入后精确回读不一致')
    return { ...saved, value: saved.value as ProductBug[] }
  })
}
