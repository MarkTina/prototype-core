import type { ProductBug } from './types'

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
    const normalizedId = bug.id.trim().toUpperCase()
    if (seen.has(normalizedId)) throw new Error(`检测到重复 Bug ID：${bug.id}，请先处理远端数据后再提交`)
    seen.add(normalizedId)
  }
}
