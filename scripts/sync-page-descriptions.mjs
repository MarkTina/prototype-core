#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { collaborationBranchKey, jsonValuesEqual, readGiteeJson, writeGiteeJson, CollaborationConflictError, validateCollaborationManifest } from '../dist/giteeContents.js'

function parseArgs(argv) {
  const values = { file: 'public/page-descriptions.json', remoteBranch: 'master', scopes: [] }
  const names = { '--file': 'file', '--owner': 'owner', '--repo': 'repo', '--project-id': 'projectId', '--code-branch': 'codeBranch', '--remote-branch': 'remoteBranch' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--scope') {
      values.scopes.push(argv[++index] ?? '')
      continue
    }
    const name = names[argument]
    if (!name) throw new Error(`未知参数：${argument}`)
    values[name] = argv[++index] ?? ''
  }
  return values
}

function scopeId(description) {
  return description.stateId ? `${description.screenId}__${description.stateId}` : description.screenId
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const token = process.env.AGENT_GITEE_ACCESS_TOKEN?.trim() || process.env.GITEE_TOKEN?.trim()
  const missing = ['owner', 'repo', 'projectId', 'codeBranch'].filter((name) => !options[name])
  if (!token) missing.push('AGENT_GITEE_ACCESS_TOKEN/GITEE_TOKEN')
  if (missing.length) throw new Error(`缺少必要配置：${missing.join(', ')}`)

  const descriptions = JSON.parse(await readFile(options.file, 'utf8'))
  if (!Array.isArray(descriptions)) throw new Error(`${options.file} 必须是页面描述数组`)
  const byScope = new Map(descriptions.filter((item) => item && typeof item.screenId === 'string').map((item) => [scopeId(item), item]))
  const requested = [...new Set(options.scopes.filter(Boolean))]
  const missingScopes = requested.filter((scope) => !byScope.has(scope))
  if (missingScopes.length) throw new Error(`JSON 未找到 Scope：${missingScopes.join(', ')}`)
  const targets = requested.length ? requested.map((scope) => byScope.get(scope)) : [...byScope.values()]
  const basePath = `projects/${options.projectId}/branches/${collaborationBranchKey(options.codeBranch)}/page-descriptions`
  const context = { ...options, token }

  async function readRemote(path) {
    const file = await readGiteeJson(context, path)
    if (file && path.endsWith('/manifest.json')) validateCollaborationManifest(file.value)
    return file
  }

  async function writeRemote(path, value, sha, message) {
    return writeGiteeJson(context, path, value, sha, message)
  }

  async function loadRemote(path) {
    const current = await readRemote(path)
    if (current) return { ...current, legacy: false }
    if (options.codeBranch !== 'main') return null
    const legacyPath = path.replace(basePath, `projects/${options.projectId}/page-descriptions`)
    const legacy = await readRemote(legacyPath)
    return legacy ? { ...legacy, legacy: true } : null
  }

  function scopeEntry(description, updatedAt) {
    return description.highlighted === true
      ? { count: 1, updatedAt, highlighted: true, highlightColor: description.highlightColor ?? '#ef4444' }
      : { count: 1, updatedAt }
  }

  function screenCount(scopes, screenId) {
    return Object.keys(scopes).filter((item) => item === screenId || item.startsWith(`${screenId}__`))
      .reduce((sum, item) => sum + (scopes[item]?.count ?? 0), 0)
  }

  function manifestMatches(value, description, scope) {
    const entry = value.scopes?.[scope]
    const screen = value.screens?.[description.screenId]
    return value.projectId === options.projectId && entry && screen
      && jsonValuesEqual({ ...entry, updatedAt: '' }, scopeEntry(description, ''))
      && screen.count === screenCount(value.scopes, description.screenId)
  }

  async function saveManifest(description, scope) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await loadRemote(manifestPath)
      const remoteManifest = current?.value ?? { scopes: {}, screens: {} }
      const now = new Date().toISOString()
      const scopes = { ...remoteManifest.scopes, [scope]: scopeEntry(description, now) }
      const next = {
        ...remoteManifest,
        projectId: options.projectId,
        updatedAt: now,
        scopes,
        screens: { ...remoteManifest.screens, [description.screenId]: { count: screenCount(scopes, description.screenId), updatedAt: now } },
      }
      try {
        await writeRemote(manifestPath, next, current?.legacy ? null : current?.sha, `docs: update ${scope} page description manifest`)
      } catch (error) {
        // 只重试索引冲突，重新读取并合并其他 scope；页面文件冲突仍报告失败。
        if (!(error instanceof CollaborationConflictError) || attempt === 1) throw error
        continue
      }
      const saved = await readRemote(manifestPath)
      if (!saved || !jsonValuesEqual(saved.value, next)) throw new Error(`页面描述 ${scope} 的 manifest 写入后精确回读不一致`)
      return saved.value
    }
  }

  const manifestPath = `${basePath}/manifest.json`
  let manifest = (await loadRemote(manifestPath))?.value ?? { projectId: options.projectId, scopes: {}, screens: {} }
  const result = { syncedScopes: [], skippedScopes: [], failedScopes: [], total: targets.length }
  for (const description of targets) {
    const scope = scopeId(description)
    try {
      const path = `${basePath}/${scope}.json`
      const current = await loadRemote(path)
      const unchanged = current && jsonValuesEqual(current.value, description)
      if (unchanged && manifestMatches(manifest, description, scope)) {
        result.skippedScopes.push(scope)
        continue
      }
      if (!unchanged || current.legacy) {
        await writeRemote(path, description, current?.legacy ? null : current?.sha, `docs: update ${scope} page description`)
      }
      const saved = await readRemote(path)
      if (!saved || !jsonValuesEqual(saved.value, description)) throw new Error(`页面描述 ${scope} 写入后精确回读不一致`)
      manifest = await saveManifest(description, scope)
      const verified = await readRemote(path)
      if (!verified || verified.sha !== saved.sha || !jsonValuesEqual(verified.value, saved.value)) throw new CollaborationConflictError(`页面描述 ${scope} 在索引保存期间已变化，请刷新后重试`)
      result.syncedScopes.push(scope)
    } catch (error) {
      result.failedScopes.push({ scopeId: scope, error: error instanceof Error ? error.message : '未知错误' })
    }
  }
  console.log(JSON.stringify(result, null, 2))
  if (result.failedScopes.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
