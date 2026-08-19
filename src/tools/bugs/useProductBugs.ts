import { computed, ref } from 'vue'
import { bugRemoteEnabled, loadRemoteBugs, updateRemoteBugs } from './bugClient'
import { migrateFileCollaborationCache, readCollaborationCache, writeCollaborationCache } from '../../prototype/collaborationStore'
import { CollaborationConflictError } from '../../prototype/annotationClient'
import { nextBugId } from './bugPolicy'
import { bugOwnerRoles, bugSeverities, bugSourceSides, bugStatuses, bugTypes, normalizeBugs, requireRemoteBugsForExport, unresolvedBugStatuses } from './bugModel'
import type { ProductBug } from './types'

const bugs = ref<ProductBug[]>([])
const bugRemoteReady = ref(bugRemoteEnabled)
const bugSyncStatus = ref<'idle' | 'loading' | 'success' | 'conflict' | 'error'>(bugRemoteEnabled ? 'loading' : 'idle')
const bugSyncMessage = ref('')
let initialized = false

function saveLocalBugs(next: ProductBug[]) {
  const cached = readCollaborationCache<ProductBug[]>('bugs')
  writeCollaborationCache('bugs', next, cached?.revision ?? null, cached?.lastRemoteSyncAt ?? null, 'pending')
}

function setBugSync(status: typeof bugSyncStatus.value, message = '') {
  bugSyncStatus.value = status
  bugSyncMessage.value = message
}

async function refreshBugs() {
  migrateFileCollaborationCache<ProductBug[]>('bugs')
  if (bugRemoteReady.value) {
    try {
      setBugSync('loading', '正在同步 Gitee Bug 数据')
      const remote = await loadRemoteBugs()
      bugs.value = normalizeBugs(remote?.value ?? [])
      writeCollaborationCache('bugs', bugs.value, remote?.sha ?? null, new Date().toISOString(), 'synced')
      setBugSync('success', '已同步 Gitee Bug 数据')
      return
    } catch (error) {
      const cached = readCollaborationCache<ProductBug[]>('bugs')
      if (cached) writeCollaborationCache('bugs', cached.value, cached.revision, cached.lastRemoteSyncAt, 'stale', error instanceof Error ? error.message : 'Gitee Bug 数据同步失败')
      setBugSync('error', error instanceof Error ? error.message : 'Gitee Bug 数据同步失败，已切换本地兜底')
    }
  }

  bugs.value = normalizeBugs(readCollaborationCache<ProductBug[]>('bugs')?.value ?? [])
  if (!bugSyncMessage.value) setBugSync('idle', '当前使用本地 Bug 数据')
}

async function initializeBugs() {
  if (initialized) return
  initialized = true
  try {
    await refreshBugs()
  } catch {
    bugs.value = []
    setBugSync('error', 'Bug 数据初始化失败')
  }
}

async function persistBugs(operatorName: string, operation: string, transform: (current: ProductBug[]) => ProductBug[]) {
  const applyTransform = (current: ProductBug[]) => {
    const normalizedCurrent = normalizeBugs(current)
    return normalizeBugs(transform(normalizedCurrent))
  }
  const applyLocal = () => {
    bugs.value = applyTransform(bugs.value)
    saveLocalBugs(bugs.value)
  }

  if (bugRemoteReady.value) {
    try {
      setBugSync('loading', '正在提交 Gitee Bug 数据')
      const saved = await updateRemoteBugs(operatorName, operation, applyTransform)
      bugs.value = normalizeBugs(saved?.value ?? [])
      writeCollaborationCache('bugs', bugs.value, saved?.sha ?? null, new Date().toISOString(), 'synced')
      setBugSync('success', 'Bug 数据已提交')
      return true
    } catch (error) {
      setBugSync(error instanceof CollaborationConflictError ? 'conflict' : 'error', error instanceof Error ? error.message : 'Bug 数据提交失败')
      return false
    }
  }

  try {
    applyLocal()
    setBugSync('success', 'Bug 数据已保存到本地')
    return true
  } catch (error) {
    setBugSync('error', error instanceof Error ? error.message : 'Bug 数据保存失败')
    return false
  }
}

async function loadLatestBugsForExport() {
  const remote = bugRemoteReady.value ? await loadRemoteBugs() : null
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
    bugSyncStatus,
    bugSyncMessage,
    initializeBugs,
    refreshBugs,
    persistBugs,
    loadLatestBugsForExport,
    nextBugId,
  }
}
