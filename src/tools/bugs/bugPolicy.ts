import type { ProductBug } from './types'

export interface BugReportVersion {
  id: string
  name: string
}

export const defaultBugVersion: BugReportVersion = { id: 'v1', name: 'V1' }
export const maxBugVersionNameLength = 60

export function bugVersionNameKey(name: string) {
  return name.trim().normalize('NFKC').toLowerCase()
}

export function isBugVersionId(id: unknown): id is string {
  return typeof id === 'string' && (id === defaultBugVersion.id || /^[a-f0-9]{32}$/.test(id))
}

export function validateBugVersionName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > maxBugVersionNameLength || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error(`请输入有效的版本名称（1–${maxBugVersionNameLength} 个字符）`)
  }
  return trimmed
}

export function readBugVersionCatalog(value: unknown): BugReportVersion[] {
  if (!Array.isArray(value)) throw new Error('Bug 版本清单格式无效')
  const ids = new Set([defaultBugVersion.id])
  const names = new Set([bugVersionNameKey(defaultBugVersion.name)])
  return value.map((entry) => {
    const { id, name } = (entry ?? {}) as Partial<BugReportVersion>
    if (!isBugVersionId(id) || ids.has(id) || typeof name !== 'string' || validateBugVersionName(name) !== name || names.has(bugVersionNameKey(name))) {
      throw new Error('Bug 版本清单包含无效或重复的版本')
    }
    ids.add(id)
    names.add(bugVersionNameKey(name))
    return { id, name }
  })
}

export function appendBugVersion(current: BugReportVersion[], version: BugReportVersion) {
  if ([defaultBugVersion, ...current].some((item) => bugVersionNameKey(item.name) === bugVersionNameKey(version.name))) {
    throw new Error('该版本名称已存在，请换一个名称')
  }
  return readBugVersionCatalog([...current, version])
}

export function bugSubmissionDraftKind(versionId: string) {
  return versionId === defaultBugVersion.id ? 'bug-submit-draft' : `bug-submit-draft:${versionId}`
}

export function formatReportedBugId(version: BugReportVersion, id: string) {
  return version.id === defaultBugVersion.id ? id : `${version.name} / ${id}`
}

export function normalizeBugId(value: string) {
  return value.trim().toUpperCase()
}

export function nextBugId(current: Pick<ProductBug, 'id'>[]) {
  const maxNumber = current.reduce((max, bug) => {
    const matched = /^BUG-(\d+)$/i.exec(bug.id.trim())
    if (!matched) return max
    return Math.max(max, Number.parseInt(matched[1], 10) || 0)
  }, 0)
  return `BUG-${String(maxNumber + 1).padStart(3, '0')}`
}

export function assertUniqueBugIds(current: Pick<ProductBug, 'id'>[]) {
  const seen = new Set<string>()
  for (const bug of current) {
    const normalizedId = normalizeBugId(bug.id)
    if (seen.has(normalizedId)) throw new Error(`检测到重复 Bug ID：${bug.id}，请先处理远端数据后再提交`)
    seen.add(normalizedId)
  }
}

export function bugIdExists(current: Pick<ProductBug, 'id'>[], candidate: string, excludedIndex = -1) {
  const normalizedCandidate = normalizeBugId(candidate)
  return current.some((bug, index) => index !== excludedIndex && normalizeBugId(bug.id) === normalizedCandidate)
}
