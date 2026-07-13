#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const API_BASE = 'https://gitee.com/api/v5'

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

function branchKey(branch) {
  if (branch === 'main') return 'main'
  let hash = 2166136261
  for (const character of branch) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  const slug = branch.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'branch'
  return `${slug}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function scopeId(description) {
  return description.stateId ? `${description.screenId}__${description.stateId}` : description.screenId
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function responseError(prefix, response) {
  const body = (await response.text()).trim().slice(0, 2000)
  return new Error(`${prefix}：${response.status}${body ? ` / ${body}` : ''}`)
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
  const basePath = `projects/${options.projectId}/branches/${branchKey(options.codeBranch)}/page-descriptions`

  async function readRemote(path) {
    const url = new URL(`${API_BASE}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents/${encodePath(path)}`)
    url.searchParams.set('access_token', token)
    url.searchParams.set('ref', options.remoteBranch)
    url.searchParams.set('_ts', String(Date.now()))
    const response = await fetch(url, { cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) throw await responseError('读取 Gitee 文件失败', response)
    const payload = await response.json()
    const candidates = Array.isArray(payload) ? payload : [payload]
    const file = candidates.find((item) => item?.path === path && typeof item.content === 'string' && typeof item.sha === 'string')
    if (!file) throw new Error(`Gitee 文件响应格式异常：${path}`)
    return { value: JSON.parse(Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8')), sha: file.sha }
  }

  async function writeRemote(path, value, sha, message) {
    const body = new URLSearchParams({ access_token: token, branch: options.remoteBranch, content: Buffer.from(JSON.stringify(value, null, 2)).toString('base64'), message })
    if (sha) body.set('sha', sha)
    const response = await fetch(`${API_BASE}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents/${encodePath(path)}`, {
      method: sha ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    })
    if (!response.ok) throw await responseError('提交 Gitee 文件失败', response)
  }

  const manifestPath = `${basePath}/manifest.json`
  let manifest = (await readRemote(manifestPath))?.value ?? { projectId: options.projectId, updatedAt: new Date().toISOString(), scopes: {}, screens: {} }
  const result = { syncedScopes: [], skippedScopes: [], failedScopes: [], total: targets.length }
  for (const description of targets) {
    const scope = scopeId(description)
    try {
      const path = `${basePath}/${scope}.json`
      const current = await readRemote(path)
      if (current && stableJson(current.value) === stableJson(description)) {
        result.skippedScopes.push(scope)
        continue
      }
      await writeRemote(path, description, current?.sha, `docs: update ${scope} page description`)
      const saved = await readRemote(path)
      if (!saved || stableJson(saved.value) !== stableJson(description)) throw new Error(`页面描述 ${scope} 写入后精确回读不一致`)

      const now = new Date().toISOString()
      const currentManifest = await readRemote(manifestPath)
      const remoteManifest = currentManifest?.value ?? manifest
      const scopeEntry = description.highlighted === true
        ? { count: 1, updatedAt: now, highlighted: true, highlightColor: description.highlightColor ?? '#ef4444' }
        : { count: 1, updatedAt: now }
      const scopes = { ...remoteManifest.scopes, [scope]: scopeEntry }
      const screenScopes = Object.keys(scopes).filter((item) => item === description.screenId || item.startsWith(`${description.screenId}__`))
      manifest = {
        ...remoteManifest,
        projectId: options.projectId,
        updatedAt: now,
        scopes,
        screens: { ...remoteManifest.screens, [description.screenId]: { count: screenScopes.reduce((sum, item) => sum + (scopes[item]?.count ?? 0), 0), updatedAt: now } },
      }
      await writeRemote(manifestPath, manifest, currentManifest?.sha, `docs: update ${scope} page description manifest`)
      const savedManifest = await readRemote(manifestPath)
      if (!savedManifest || stableJson(savedManifest.value) !== stableJson(manifest)) throw new Error(`页面描述 ${scope} 的 manifest 写入后精确回读不一致`)
      manifest = savedManifest.value
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
