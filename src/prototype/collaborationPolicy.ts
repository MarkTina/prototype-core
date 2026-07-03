import type { CollaborationCacheEntry, CollaborationCacheSnapshot, CollaborationDataKind, DataSource, ScopedCollaborationCacheSnapshot } from '../types/prototype'

export function collaborationBranchKey(branch: string) {
  if (branch === 'main') return 'main'
  let hash = 2166136261
  for (const character of branch) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  const slug = branch.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'branch'
  return `${slug}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function collaborationCacheKey(scopeParts: string[], kind: CollaborationDataKind | string) {
  return `prototype-collaboration:v2:${scopeParts.map(encodeURIComponent).join(':')}:${kind}`
}

export function selectLocalFallback<T>(snapshot: CollaborationCacheSnapshot<T> | null, seed: T): { value: T; source: DataSource } {
  return snapshot ? { value: snapshot.value, source: 'local-cache' } : { value: seed, source: 'local-seed' }
}

export function upsertScopedCache<T>(snapshot: ScopedCollaborationCacheSnapshot<T>, scopeId: string, entry: CollaborationCacheEntry<T>) {
  return { ...snapshot, scopes: { ...snapshot.scopes, [scopeId]: entry } }
}

export function withoutScopedCache<T>(snapshot: ScopedCollaborationCacheSnapshot<T>, scopeId: string) {
  const scopes = { ...snapshot.scopes }
  delete scopes[scopeId]
  return { ...snapshot, scopes }
}

export function shouldDeferRemoteRefresh(fromPolling: boolean, editing: boolean) {
  return fromPolling && editing
}

export function createSerialQueue() {
  const queues = new Map<string, Promise<unknown>>()
  return async function enqueue<T>(key: string, task: () => Promise<T>) {
    const previous = queues.get(key) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    queues.set(key, current)
    try {
      return await current
    } finally {
      if (queues.get(key) === current) queues.delete(key)
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function remoteInitializationDecision(current: unknown, next: unknown): 'unchanged' | 'protected' {
  return stableJson(current) === stableJson(next) ? 'unchanged' : 'protected'
}

export function selectGiteeFileResponse(response: unknown, requestedPath: string) {
  const candidates = Array.isArray(response) ? response : [response]
  if (!candidates.length) return null
  const file = candidates.find((item) => {
    if (!item || typeof item !== 'object') return false
    const value = item as Record<string, unknown>
    return value.path === requestedPath && typeof value.content === 'string' && typeof value.sha === 'string'
  })
  return file ? file as { content: string; sha: string } : null
}
