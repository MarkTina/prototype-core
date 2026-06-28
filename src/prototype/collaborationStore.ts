import type { CollaborationCacheSnapshot, CollaborationDataKind } from '../types/prototype'
import { collaborationBranchKey, collaborationCacheKey } from './collaborationPolicy'
import { getPrototypeRuntime } from '../core/productAdapter'

const CACHE_SCHEMA_VERSION = 2 as const

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

function cacheKey(kind: CollaborationDataKind) {
  const context = getCollaborationContext()
  return collaborationCacheKey(
    [context.provider || 'local', context.owner || 'none', context.repo || 'none', context.remoteBranch, context.projectId, context.branchKey],
    kind,
  )
}

export function readCollaborationCache<T>(kind: CollaborationDataKind): CollaborationCacheSnapshot<T> | null {
  try {
    const value = JSON.parse(storage()?.getItem(cacheKey(kind)) ?? 'null') as CollaborationCacheSnapshot<T> | null
    return value?.schemaVersion === CACHE_SCHEMA_VERSION ? value : null
  } catch {
    return null
  }
}

export function writeCollaborationCache<T>(
  kind: CollaborationDataKind,
  value: T,
  revision: string | null,
  lastRemoteSyncAt: string | null,
) {
  const snapshot: CollaborationCacheSnapshot<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    value,
    revision,
    cachedAt: new Date().toISOString(),
    lastRemoteSyncAt,
  }
  storage()?.setItem(cacheKey(kind), JSON.stringify(snapshot))
  return snapshot
}
