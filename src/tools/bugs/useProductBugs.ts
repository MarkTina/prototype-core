import { computed, ref } from 'vue'
import { bugRemoteEnabled, loadRemoteBugs, updateRemoteBugs } from './bugClient'
import { migrateFileCollaborationCache, readCollaborationCache, writeCollaborationCache } from '../../prototype/collaborationStore'
import type { BugOwnerRole, BugSeverity, BugSourceSide, BugStatus, BugType, ProductBug, ProductBugAttachment } from './types'

export const bugTypes: BugType[] = ['功能异常', 'UI/文案', '流程阻塞', '数据/报告', '设备/蓝牙', '性能/稳定性', '兼容性', '其他']
export const bugSeverities: BugSeverity[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const bugSourceSides: BugSourceSide[] = ['安卓侧', 'iOS 侧', '后端']
export const bugOwnerRoles: BugOwnerRole[] = ['后端开发', 'iOS 开发', '安卓开发', '产品经理', '算法开发', '硬件嵌入式开发']
export const bugStatuses: BugStatus[] = ['待处理', '已确认', '修复中', '已修复', '已验证', '无需处理']
export const unresolvedBugStatuses: BugStatus[] = ['待处理', '已确认', '修复中']

const bugs = ref<ProductBug[]>([])
const bugRemoteReady = ref(bugRemoteEnabled)
const bugSyncStatus = ref<'idle' | 'loading' | 'success' | 'error'>(bugRemoteEnabled ? 'loading' : 'idle')
const bugSyncMessage = ref('')
let initialized = false

function isBugType(value: unknown): value is BugType {
  return typeof value === 'string' && bugTypes.includes(value as BugType)
}

function isBugSeverity(value: unknown): value is BugSeverity {
  return typeof value === 'string' && bugSeverities.includes(value as BugSeverity)
}

function isBugSourceSide(value: unknown): value is BugSourceSide {
  return typeof value === 'string' && bugSourceSides.includes(value as BugSourceSide)
}

function isBugOwnerRole(value: unknown): value is BugOwnerRole {
  return typeof value === 'string' && bugOwnerRoles.includes(value as BugOwnerRole)
}

function isBugStatus(value: unknown): value is BugStatus {
  return typeof value === 'string' && bugStatuses.includes(value as BugStatus)
}

function normalizeAttachment(raw: unknown): ProductBugAttachment | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<ProductBugAttachment>
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.name !== 'string' || !item.name.trim()) return null
  if (typeof item.objectKey !== 'string' || !item.objectKey.trim()) return null
  if (typeof item.url !== 'string' || !item.url.trim()) return null
  if (typeof item.mimeType !== 'string' || !item.mimeType.startsWith('image/')) return null
  if (typeof item.uploaderName !== 'string' || !item.uploaderName.trim()) return null
  return {
    id: item.id,
    name: item.name,
    objectKey: item.objectKey,
    url: item.url,
    mimeType: item.mimeType,
    size: typeof item.size === 'number' ? item.size : 0,
    originalSize: typeof item.originalSize === 'number' ? item.originalSize : typeof item.size === 'number' ? item.size : 0,
    uploaderName: item.uploaderName,
    createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
  }
}

function normalizeBug(raw: unknown): ProductBug | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<ProductBug>
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.title !== 'string' || !item.title.trim()) return null
  if (!isBugType(item.type) || !isBugOwnerRole(item.ownerRole) || !isBugStatus(item.status)) return null
  if (typeof item.description !== 'string' || !item.description.trim()) return null
  if (typeof item.reporterName !== 'string' || !item.reporterName.trim()) return null
  const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString()
  const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : createdAt

  return {
    id: item.id,
    title: item.title.trim(),
    type: item.type,
    severity: isBugSeverity(item.severity) ? item.severity : 'P2',
    sourceSide: isBugSourceSide(item.sourceSide) ? item.sourceSide : '后端',
    sourceSideVersion: typeof item.sourceSideVersion === 'string' && item.sourceSideVersion.trim() ? item.sourceSideVersion.trim() : undefined,
    ownerRole: item.ownerRole,
    status: item.status,
    description: item.description.trim(),
    reporterName: item.reporterName.trim(),
    fixerName: typeof item.fixerName === 'string' ? item.fixerName.trim() : undefined,
    createdAt,
    updatedAt,
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map(normalizeAttachment).filter((attachment): attachment is ProductBugAttachment => Boolean(attachment))
      : [],
    history: Array.isArray(item.history)
      ? item.history
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => entry as ProductBug['history'][number])
          .filter((entry) => typeof entry.id === 'string' && isBugStatus(entry.fromStatus) && isBugStatus(entry.toStatus) && typeof entry.operatorName === 'string' && typeof entry.createdAt === 'string')
      : [],
  }
}

function normalizeBugs(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeBug).filter((item): item is ProductBug => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

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
  const applyLocal = () => {
    bugs.value = normalizeBugs(transform(bugs.value))
    saveLocalBugs(bugs.value)
  }

  if (bugRemoteReady.value) {
    try {
      setBugSync('loading', '正在提交 Gitee Bug 数据')
      const saved = await updateRemoteBugs(operatorName, operation, (remoteValue) => normalizeBugs(transform(normalizeBugs(remoteValue))))
      bugs.value = normalizeBugs(saved?.value ?? [])
      writeCollaborationCache('bugs', bugs.value, saved?.sha ?? null, new Date().toISOString(), 'synced')
      setBugSync('success', 'Bug 数据已提交')
      return true
    } catch (error) {
      setBugSync('error', error instanceof Error ? error.message : 'Bug 数据提交失败')
      return false
    }
  }

  applyLocal()
  setBugSync('success', 'Bug 数据已保存到本地')
  return true
}

const unresolvedBugCount = computed(() => bugs.value.filter((bug) => unresolvedBugStatuses.includes(bug.status)).length)

function nextBugId(current: ProductBug[]) {
  const maxNumber = current.reduce((max, bug) => {
    const matched = /^BUG-(\d+)$/i.exec(bug.id.trim())
    if (!matched) return max
    return Math.max(max, Number.parseInt(matched[1], 10) || 0)
  }, 0)
  return `BUG-${String(maxNumber + 1).padStart(3, '0')}`
}

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
    nextBugId,
  }
}
