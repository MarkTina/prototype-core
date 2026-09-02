import type { BugOwnerRole, BugSeverity, BugSourceSide, BugStatus, BugType, ProductBug, ProductBugAttachment } from './types'

export const bugTypes: BugType[] = ['功能异常', 'UI/文案', '流程阻塞', '数据/报告', '设备/蓝牙', '性能/稳定性', '兼容性', '其他']
export const bugSeverities: BugSeverity[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const bugSourceSides: BugSourceSide[] = ['安卓侧', 'iOS 侧', '安卓+iOS', '后端', '硬件设计', '嵌入式']
export const bugOwnerRoles: BugOwnerRole[] = ['后端开发', 'iOS 开发', '安卓开发', '产品经理', '算法开发', '硬件嵌入式开发', 'UI设计']
export const bugStatuses: BugStatus[] = ['待处理', '已确认', '修复中', '已修复', '已验证', '无需处理']
export const unresolvedBugStatuses: BugStatus[] = ['待处理', '已确认', '修复中']

function isBugType(value: unknown): value is BugType {
  return typeof value === 'string' && bugTypes.includes(value as BugType)
}

function isBugSeverity(value: unknown): value is BugSeverity {
  return typeof value === 'string' && bugSeverities.includes(value as BugSeverity)
}

function isBugSourceSide(value: unknown): value is BugSourceSide {
  return typeof value === 'string' && bugSourceSides.includes(value as BugSourceSide)
}

export function isBugOwnerRole(value: unknown): value is BugOwnerRole {
  return typeof value === 'string' && bugOwnerRoles.includes(value as BugOwnerRole)
}

export function normalizeBugOwnerRoles(ownerRoles: unknown, ownerRole?: unknown): BugOwnerRole[] | null {
  if (Array.isArray(ownerRoles)) {
    if (!ownerRoles.length || !ownerRoles.every(isBugOwnerRole)) return null
    return Array.from(new Set(ownerRoles))
  }
  return isBugOwnerRole(ownerRole) ? [ownerRole] : null
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
  const item = raw as Partial<ProductBug> & { ownerRoles?: unknown; ownerRole?: unknown }
  if (typeof item.id !== 'string' || !item.id.trim()) return null
  if (typeof item.title !== 'string' || !item.title.trim()) return null
  const ownerRoles = normalizeBugOwnerRoles(item.ownerRoles, item.ownerRole)
  if (!isBugType(item.type) || !ownerRoles || !isBugStatus(item.status)) return null
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
    ownerRole: ownerRoles[0],
    ownerRoles,
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

export function normalizeBugs(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeBug).filter((item): item is ProductBug => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

interface BugRemoteExportPayload {
  value: ProductBug[]
  exists: boolean
}

export function requireRemoteBugsForExport(remote: BugRemoteExportPayload | null, remoteReady = true) {
  if (!remoteReady) throw new Error('未启用 Gitee Bug 协作，无法导出远端最新数据')
  if (!remote?.exists) throw new Error('Gitee Bug 文件不存在，无法导出远端最新数据')
  const normalized = normalizeBugs(remote.value)
  if (normalized.length !== remote.value.length) throw new Error('Gitee Bug 数据包含无效记录，已中止导出以避免遗漏')
  const remoteAttachmentCount = remote.value.reduce((count, bug) => count + (Array.isArray(bug.attachments) ? bug.attachments.length : 0), 0)
  const remoteHistoryCount = remote.value.reduce((count, bug) => count + (Array.isArray(bug.history) ? bug.history.length : 0), 0)
  const normalizedAttachmentCount = normalized.reduce((count, bug) => count + (bug.attachments?.length ?? 0), 0)
  const normalizedHistoryCount = normalized.reduce((count, bug) => count + bug.history.length, 0)
  if (remoteAttachmentCount !== normalizedAttachmentCount || remoteHistoryCount !== normalizedHistoryCount) {
    throw new Error('Gitee Bug 数据包含无效附件或状态历史，已中止导出以避免遗漏')
  }
  return normalized
}
