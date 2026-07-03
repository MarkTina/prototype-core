import type { CollaborationCacheEntry, CollaborationCacheSnapshot, CollaborationCacheStatus, CollaborationDataKind, ScopedCollaborationCacheSnapshot } from '../types/prototype'
import { collaborationBranchKey, collaborationCacheKey, upsertScopedCache, withoutScopedCache } from './collaborationPolicy'
import { getPrototypeRuntime } from '../core/productAdapter'

const CACHE_SCHEMA_VERSION = 3 as const

export interface CollaborationContext {
  provider: string
  owner: string
  repo: string
  remoteBranch: string
  projectId: string
  codeBranch: string
  branchKey: string
  token: string
  remoteReadable: boolean
  remoteWritable: boolean
  unavailableReason: string
}

export function getCollaborationContext(): CollaborationContext {
  const config = getPrototypeRuntime().collaboration ?? {}
  const provider = config.provider?.trim() ?? ''
  const owner = config.owner?.trim() ?? ''
  const repo = config.repo?.trim() ?? ''
  const token = config.token?.trim() ?? ''
  const codeBranch = config.codeBranch?.trim() ?? ''
  const missingConnection = provider !== 'gitee' || !owner || !repo || !token
  const missingBranch = !codeBranch
  return {
    provider,
    owner,
    repo,
    token,
    remoteBranch: config.remoteBranch?.trim() || 'master',
    projectId: config.projectId?.trim() || 'prototype-core',
    codeBranch,
    branchKey: codeBranch ? collaborationBranchKey(codeBranch) : 'unknown',
    remoteReadable: !missingConnection && !missingBranch,
    remoteWritable: !missingConnection && !missingBranch,
    unavailableReason: missingBranch ? '无法识别代码分支，当前无法推送' : missingConnection ? 'Gitee 未配置，当前无法推送' : '',
  }
}

function storage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function cacheKey(kind: CollaborationDataKind | 'bugs') {
  const context = getCollaborationContext()
  return collaborationCacheKey(
    [context.provider || 'local', context.owner || 'none', context.repo || 'none', context.remoteBranch, context.projectId, context.branchKey],
    kind,
  )
}

export function readCollaborationCache<T>(kind: CollaborationDataKind | 'bugs'): CollaborationCacheSnapshot<T> | null {
  try {
    const value = JSON.parse(storage()?.getItem(cacheKey(kind)) ?? 'null') as CollaborationCacheSnapshot<T> | null
    return value?.schemaVersion === CACHE_SCHEMA_VERSION && 'value' in value ? value : null
  } catch {
    return null
  }
}

export function writeCollaborationCache<T>(
  kind: CollaborationDataKind | 'bugs',
  value: T,
  revision: string | null,
  lastRemoteSyncAt: string | null,
  status: CollaborationCacheStatus = lastRemoteSyncAt ? 'synced' : 'pending',
  error?: string,
) {
  const snapshot: CollaborationCacheSnapshot<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    value,
    revision,
    cachedAt: new Date().toISOString(),
    lastRemoteSyncAt,
    status,
    ...(error ? { error } : {}),
  }
  storage()?.setItem(cacheKey(kind), JSON.stringify(snapshot))
  return snapshot
}

export function migrateFileCollaborationCache<T>(kind: 'flows' | 'bugs'): CollaborationCacheSnapshot<T> | null {
  const current = readCollaborationCache<T>(kind)
  if (current) return current
  try {
    const legacy = JSON.parse(storage()?.getItem(cacheKey(kind)) ?? 'null') as unknown
    const value = kind === 'bugs' && Array.isArray(legacy)
      ? legacy as T
      : legacy && typeof legacy === 'object' && (legacy as { schemaVersion?: number }).schemaVersion === 2
        ? (legacy as { value: T }).value
        : null
    if (value === null) return null
    return writeCollaborationCache(kind, value, null, null, 'stale')
  } catch {
    return null
  }
}

export function readLegacyCollaborationCache<T>(kind: CollaborationDataKind | 'bugs') {
  try {
    const value = JSON.parse(storage()?.getItem(cacheKey(kind)) ?? 'null') as { schemaVersion?: number; value?: T; revision?: string | null; lastRemoteSyncAt?: string | null } | null
    return value?.schemaVersion === 2 && 'value' in value ? value : null
  } catch {
    return null
  }
}

export function readScopedCollaborationCache<T>(kind: 'annotations' | 'pageDescriptions'): ScopedCollaborationCacheSnapshot<T> {
  try {
    const value = JSON.parse(storage()?.getItem(cacheKey(kind)) ?? 'null') as ScopedCollaborationCacheSnapshot<T> | null
    if (value?.schemaVersion === CACHE_SCHEMA_VERSION && value.scopes && !('value' in value)) return value
  } catch {
    // 无效缓存按空缓存处理。
  }
  return { schemaVersion: CACHE_SCHEMA_VERSION, scopes: {} }
}

export function replaceScopedCollaborationCache<T>(kind: 'annotations' | 'pageDescriptions', scopes: Record<string, CollaborationCacheEntry<T>>) {
  const snapshot: ScopedCollaborationCacheSnapshot<T> = { schemaVersion: CACHE_SCHEMA_VERSION, scopes }
  storage()?.setItem(cacheKey(kind), JSON.stringify(snapshot))
  return snapshot
}

export function writeScopedCollaborationCache<T>(
  kind: 'annotations' | 'pageDescriptions',
  scopeId: string,
  value: T,
  revision: string | null,
  lastRemoteSyncAt: string | null,
  status: CollaborationCacheStatus = lastRemoteSyncAt ? 'synced' : 'pending',
  error?: string,
) {
  const snapshot = readScopedCollaborationCache<T>(kind)
  const next = upsertScopedCache(snapshot, scopeId, {
    value,
    revision,
    cachedAt: new Date().toISOString(),
    lastRemoteSyncAt,
    status,
    ...(error ? { error } : {}),
  })
  storage()?.setItem(cacheKey(kind), JSON.stringify(next))
  return next.scopes[scopeId]
}

export function removeScopedCollaborationCache(kind: 'annotations' | 'pageDescriptions', scopeId: string) {
  const snapshot = withoutScopedCache(readScopedCollaborationCache(kind), scopeId)
  storage()?.setItem(cacheKey(kind), JSON.stringify(snapshot))
}
