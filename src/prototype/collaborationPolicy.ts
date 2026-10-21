import type { CollaborationCacheEntry, CollaborationCacheSnapshot, CollaborationDataKind, DataSource, ScopedCollaborationCacheSnapshot } from '../types/prototype'

import { jsonValuesEqual } from './giteeContents.mjs'
export { collaborationBranchKey, jsonValuesEqual, selectGiteeFileResponse } from './giteeContents.mjs'

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

export function remoteInitializationDecision(current: unknown, next: unknown): 'unchanged' | 'protected' {
  return jsonValuesEqual(current, next) ? 'unchanged' : 'protected'
}
