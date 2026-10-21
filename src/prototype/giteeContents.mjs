const API_BASE = 'https://gitee.com/api/v5'

export class CollaborationConflictError extends Error {
  constructor(message = '远端已有更新，请刷新后重试或放弃本地草稿') {
    super(message)
    this.name = 'CollaborationConflictError'
  }
}

export function collaborationBranchKey(branch) {
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
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item) ?? 'null').join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function jsonValuesEqual(left, right) {
  return stableJson(left) === stableJson(right)
}

export function validateCollaborationManifest(value) {
  const isIndex = (index) => index && typeof index === 'object' && !Array.isArray(index) && Object.values(index).every((entry) => entry && typeof entry.count === 'number' && Number.isFinite(entry.count) && entry.count >= 0)
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isIndex(value.screens) || (value.scopes !== undefined && !isIndex(value.scopes))) throw new Error('Gitee 协作索引格式无效')
}

export function selectGiteeFileResponse(response, requestedPath) {
  const candidates = Array.isArray(response) ? response : [response]
  return candidates.find((item) => item && typeof item === 'object' && item.path === requestedPath && typeof item.content === 'string' && typeof item.sha === 'string') ?? null
}

function contentsUrl(context, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return new URL(`${API_BASE}/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${encodedPath}`)
}

async function responseError(prefix, response) {
  const body = (await response.text()).trim().slice(0, 2000)
  return new Error(`${prefix}：${response.status}${body ? ` / ${body}` : ''}`)
}

export async function readGiteeJson(context, path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = contentsUrl(context, path)
    url.searchParams.set('access_token', context.token)
    url.searchParams.set('ref', context.remoteBranch)
    url.searchParams.set('_ts', `${Date.now()}-${attempt}`)
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
    })
    if (response.status === 304) continue
    if (response.status === 404) return null
    if (!response.ok) throw await responseError('读取 Gitee 文件失败', response)
    const payload = await response.json()
    // Gitee 用 200 + 空数组表示路径不存在；其他异常响应不能触发新建。
    if (Array.isArray(payload) && payload.length === 0) return null
    const file = selectGiteeFileResponse(payload, path)
    if (!file) throw new Error(`Gitee 文件响应格式异常：${path}`)
    const content = decodeURIComponent(escape(atob(file.content.replace(/\s/g, ''))))
    return { value: JSON.parse(content), sha: file.sha }
  }
  throw new Error('读取 Gitee 文件失败：304 缓存响应')
}

export async function writeGiteeJson(context, path, value, sha, message) {
  const body = new URLSearchParams({
    access_token: context.token,
    branch: context.remoteBranch,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2)))),
    message,
  })
  if (sha) body.set('sha', sha)
  const response = await fetch(contentsUrl(context, path), {
    method: sha ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  if (response.status === 409 || response.status === 422) throw new CollaborationConflictError()
  if (!response.ok) throw await responseError('提交 Gitee 文件失败', response)
}
