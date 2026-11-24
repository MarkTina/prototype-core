import { computed, ref } from 'vue'
import { bugRemoteEnabled, createRemoteBugVersion, loadRemoteBugs, loadRemoteBugVersions, updateRemoteBugs } from './bugClient'
import { collaborationContextStorageKey, migrateFileCollaborationCache, readCollaborationCache, writeCollaborationCache } from '../../prototype/collaborationStore'
import { CollaborationConflictError } from '../../prototype/annotationClient'
import { appendBugVersion, defaultBugVersion, isBugVersionId, nextBugId, readBugVersionCatalog, validateBugVersionName, type BugReportVersion } from './bugPolicy'
import { bugOwnerRoles, bugSeverities, bugSourceSides, bugStatuses, bugTypes, normalizeBugs, normalizeCompleteRemoteBugs, requireRemoteBugsForExport, unresolvedBugStatuses } from './bugModel'
import type { ProductBug } from './types'

const bugs = ref<ProductBug[]>([])
const bugRemoteReady = ref(bugRemoteEnabled)
const bugSyncStatus = ref<'idle' | 'loading' | 'success' | 'conflict' | 'error'>(bugRemoteEnabled ? 'loading' : 'idle')
const bugSyncMessage = ref('')
const bugMutating = ref(false)
const bugVersions = ref<BugReportVersion[]>([defaultBugVersion])
const activeBugVersion = ref(defaultBugVersion)
let preferredVersionId = defaultBugVersion.id
let initialized = false
let refreshVersion = 0

function bugCacheKind(versionId: string): 'bugs' | `bugs:${string}` {
  return versionId === defaultBugVersion.id ? 'bugs' : `bugs:${versionId}`
}

function readCachedVersions() {
  try {
    return readBugVersionCatalog(readCollaborationCache<BugReportVersion[]>('bug-versions')?.value ?? [])
  } catch {
    return []
  }
}

function rememberVersion(versionId: string) {
  preferredVersionId = versionId
  try {
    window.localStorage.setItem(collaborationContextStorageKey('bug-active-version'), versionId)
  } catch {
    return
  }
}

function restoreVersionPreference() {
  if (initialized) return
  initialized = true
  try {
    const saved = window.localStorage.getItem(collaborationContextStorageKey('bug-active-version'))
    if (isBugVersionId(saved)) preferredVersionId = saved
  } catch {
    return
  }
}

function activateBugVersion(version: BugReportVersion) {
  if (activeBugVersion.value.id === version.id) return
  bugs.value = normalizeBugs(readCollaborationCache<ProductBug[]>(bugCacheKind(version.id))?.value ?? [])
  activeBugVersion.value = version
}

function applyCatalog(versions: BugReportVersion[], confirmed: boolean) {
  bugVersions.value = [defaultBugVersion, ...versions]
  const preferred = bugVersions.value.find((version) => version.id === preferredVersionId)
  if (preferred) activateBugVersion(preferred)
  else if (confirmed) {
    if (preferredVersionId !== defaultBugVersion.id) rememberVersion(defaultBugVersion.id)
    activateBugVersion(defaultBugVersion)
  }
}

function setBugSync(status: typeof bugSyncStatus.value, message = '') {
  bugSyncStatus.value = status
  bugSyncMessage.value = message
}

async function refreshVersionBugs(request: number, catalogError = '') {
  const versionId = activeBugVersion.value.id
  const kind = bugCacheKind(versionId)
  if (kind === 'bugs') migrateFileCollaborationCache<ProductBug[]>(kind)
  const isCurrent = () => request === refreshVersion && versionId === activeBugVersion.value.id
  const setRefreshStatus = (status: typeof bugSyncStatus.value, message: string) => {
    setBugSync(catalogError ? 'error' : status, catalogError ? `${catalogError}；${message}` : message)
  }
  const snapshot = readCollaborationCache<ProductBug[]>(kind)
  bugs.value = normalizeBugs(snapshot?.value ?? [])
  if (bugRemoteReady.value) {
    try {
      setBugSync('loading', '正在同步 Gitee Bug 数据')
      const remote = await loadRemoteBugs(versionId)
      if (!isCurrent()) return
      const cached = readCollaborationCache<ProductBug[]>(kind)
      if (cached?.status === 'pending') {
        bugs.value = normalizeBugs(cached.value)
        setRefreshStatus('idle', '本地 Bug 数据待推送，已保留草稿')
        return
      }
      bugs.value = normalizeCompleteRemoteBugs(remote?.value ?? [])
      writeCollaborationCache(kind, bugs.value, remote?.sha ?? null, new Date().toISOString(), 'synced')
      setRefreshStatus('success', '已同步当前版本 Bug 数据')
      return
    } catch (error) {
      if (!isCurrent()) return
      const cached = readCollaborationCache<ProductBug[]>(kind)
      const message = error instanceof Error ? error.message : 'Gitee Bug 数据同步失败'
      if (cached) writeCollaborationCache(kind, cached.value, cached.revision, cached.lastRemoteSyncAt, cached.status === 'pending' ? 'pending' : 'stale', message)
      setRefreshStatus('error', message)
      return
    }
  }
  setRefreshStatus('idle', '当前使用本地 Bug 数据')
}

async function refreshBugs() {
  if (bugMutating.value) return
  restoreVersionPreference()
  const request = ++refreshVersion
  applyCatalog(readCachedVersions(), !bugRemoteReady.value)
  let catalogError = ''
  if (bugRemoteReady.value) {
    setBugSync('loading', '正在读取 Bug 版本清单')
    try {
      const remote = await loadRemoteBugVersions()
      if (request !== refreshVersion) return
      writeCollaborationCache('bug-versions', remote?.value ?? [], remote?.sha ?? null, new Date().toISOString(), 'synced')
      applyCatalog(remote?.value ?? [], true)
    } catch (error) {
      if (request !== refreshVersion) return
      catalogError = `Bug 版本清单读取失败：${error instanceof Error ? error.message : '未知错误'}`
      const cached = readCollaborationCache<BugReportVersion[]>('bug-versions')
      if (cached) writeCollaborationCache('bug-versions', cached.value, cached.revision, cached.lastRemoteSyncAt, 'stale', catalogError)
    }
  }
  await refreshVersionBugs(request, catalogError)
}

async function initializeBugs() {
  if (!initialized) await refreshBugs()
}

async function selectBugVersion(versionId: string) {
  const version = bugVersions.value.find((item) => item.id === versionId)
  if (!version || bugMutating.value) return
  rememberVersion(version.id)
  activateBugVersion(version)
  await refreshVersionBugs(++refreshVersion)
}

async function createBugVersion(name: string, operatorName: string) {
  if (bugMutating.value) throw new Error('另一个 Bug 操作正在保存，请稍后重试')
  const version = {
    id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    name: validateBugVersionName(name),
  }
  bugMutating.value = true
  const request = ++refreshVersion
  try {
    setBugSync('loading', '正在保存 Bug 版本')
    let versions: BugReportVersion[]
    let sessionOnly = false
    if (bugRemoteReady.value) {
      const saved = await createRemoteBugVersion(operatorName, version)
      versions = saved.value
      writeCollaborationCache('bug-versions', versions, saved.sha, new Date().toISOString(), 'synced')
    } else {
      versions = appendBugVersion(readCachedVersions(), version)
      sessionOnly = writeCollaborationCache('bug-versions', versions, null, null, 'pending').persistence === 'session'
    }
    rememberVersion(version.id)
    applyCatalog(versions, true)
    await refreshVersionBugs(request)
    if (sessionOnly) setBugSync('success', '浏览器存储不可用，Bug 版本仅在本次会话保留')
  } catch (error) {
    setBugSync(error instanceof CollaborationConflictError ? 'conflict' : 'error', error instanceof Error ? error.message : 'Bug 版本保存失败')
    throw error
  } finally {
    bugMutating.value = false
  }
}

async function persistBugs(operatorName: string, operation: string, transform: (current: ProductBug[]) => ProductBug[]) {
  if (bugMutating.value) return false
  const versionId = activeBugVersion.value.id
  const kind = bugCacheKind(versionId)
  bugMutating.value = true
  refreshVersion += 1
  const applyTransform = (current: ProductBug[]) => {
    const normalizedCurrent = bugRemoteReady.value ? normalizeCompleteRemoteBugs(current) : normalizeBugs(current)
    return normalizeBugs(transform(normalizedCurrent))
  }
  try {
    if (bugRemoteReady.value) {
      setBugSync('loading', '正在提交 Gitee Bug 数据')
      const saved = await updateRemoteBugs(operatorName, operation, applyTransform, versionId)
      bugs.value = normalizeBugs(saved.value)
      writeCollaborationCache(kind, bugs.value, saved.sha, new Date().toISOString(), 'synced')
      setBugSync('success', 'Bug 数据已提交')
      return true
    }
    const previous = readCollaborationCache<ProductBug[]>(kind)
    bugs.value = applyTransform(normalizeBugs(previous?.value ?? bugs.value))
    const cached = writeCollaborationCache(kind, bugs.value, previous?.revision ?? null, previous?.lastRemoteSyncAt ?? null, 'pending')
    setBugSync('success', cached.persistence === 'session' ? '浏览器存储不可用，Bug 数据仅在本次会话保留，刷新后可能丢失' : 'Bug 数据已保存到本地，尚未推送 Gitee')
    return true
  } catch (error) {
    setBugSync(error instanceof CollaborationConflictError ? 'conflict' : 'error', error instanceof Error ? error.message : 'Bug 数据保存失败')
    return false
  } finally {
    bugMutating.value = false
  }
}

async function loadLatestBugsForExport() {
  const versionId = activeBugVersion.value.id
  const remote = bugRemoteReady.value ? await loadRemoteBugs(versionId) : null
  if (bugRemoteReady.value && !remote && versionId !== defaultBugVersion.id) {
    const catalog = await loadRemoteBugVersions()
    if (catalog?.value.some((version) => version.id === versionId)) return []
  }
  return requireRemoteBugsForExport(remote, bugRemoteReady.value)
}

const unresolvedBugCount = computed(() => bugs.value.filter((bug) => unresolvedBugStatuses.includes(bug.status)).length)

export function useProductBugs() {
  return {
    bugs,
    bugTypes,
    bugSeverities,
    bugSourceSides,
    bugOwnerRoles,
    bugStatuses,
    unresolvedBugStatuses,
    unresolvedBugCount,
    bugRemoteReady,
    bugMutating,
    bugVersions,
    activeBugVersion,
    bugSyncStatus,
    bugSyncMessage,
    initializeBugs,
    selectBugVersion,
    createBugVersion,
    refreshBugs,
    persistBugs,
    loadLatestBugsForExport,
    nextBugId,
  }
}
