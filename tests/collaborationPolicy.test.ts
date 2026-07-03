import test from 'node:test'
import assert from 'node:assert/strict'
import { collaborationBranchKey, collaborationCacheKey, createSerialQueue, remoteInitializationDecision, selectGiteeFileResponse, selectLocalFallback, shouldDeferRemoteRefresh, upsertScopedCache, withoutScopedCache } from '../src/prototype/collaborationPolicy.ts'

test('主分支使用稳定目录，功能分支不会互相碰撞', () => {
  assert.equal(collaborationBranchKey('main'), 'main')
  assert.notEqual(collaborationBranchKey('feature/a'), collaborationBranchKey('feature-a'))
  assert.equal(collaborationBranchKey('feature/a'), collaborationBranchKey('feature/a'))
})

test('缓存键按代码分支和数据类型隔离', () => {
  const main = collaborationCacheKey(['gitee', 'owner', 'repo', 'master', 'project', 'main'], 'annotations')
  const feature = collaborationCacheKey(['gitee', 'owner', 'repo', 'master', 'project', 'feature'], 'annotations')
  const flows = collaborationCacheKey(['gitee', 'owner', 'repo', 'master', 'project', 'main'], 'flows')
  assert.notEqual(main, feature)
  assert.notEqual(main, flows)
})

test('本地回退优先使用缓存，无缓存才使用种子', () => {
  assert.deepEqual(selectLocalFallback(null, ['seed']), { value: ['seed'], source: 'local-seed' })
  assert.deepEqual(selectLocalFallback({ schemaVersion: 3, value: ['cache'], revision: null, cachedAt: '', lastRemoteSyncAt: null, status: 'synced' }, ['seed']), {
    value: ['cache'],
    source: 'local-cache',
  })
})

test('轮询在编辑期间延迟覆盖', () => {
  assert.equal(shouldDeferRemoteRefresh(true, true), true)
  assert.equal(shouldDeferRemoteRefresh(false, true), false)
  assert.equal(shouldDeferRemoteRefresh(true, false), false)
})

test('页面描述缓存按 scope 保存独立 revision，并可精确删除', () => {
  const empty = { schemaVersion: 3 as const, scopes: {} }
  const home = { value: { screenId: 'home' }, revision: 'sha-home', cachedAt: '', lastRemoteSyncAt: '', status: 'synced' as const }
  const detail = { value: { screenId: 'detail', stateId: 'empty' }, revision: 'sha-detail', cachedAt: '', lastRemoteSyncAt: null, status: 'pending' as const }
  const snapshot = upsertScopedCache(upsertScopedCache(empty, 'home', home), 'detail__empty', detail)
  assert.equal(snapshot.scopes.home.revision, 'sha-home')
  assert.equal(snapshot.scopes.detail__empty.revision, 'sha-detail')
  assert.equal(snapshot.scopes.detail__empty.status, 'pending')
  assert.equal(withoutScopedCache(snapshot, 'home').scopes.home, undefined)
})

test('同一资源的并发任务按顺序执行', async () => {
  const enqueue = createSerialQueue()
  const order: string[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const first = enqueue('annotations:home', async () => { order.push('first:start'); await gate; order.push('first:end') })
  const second = enqueue('annotations:home', async () => { order.push('second') })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(order, ['first:start'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first:start', 'first:end', 'second'])
})

test('重复初始化不会覆盖或重复创建远端文件', () => {
  assert.equal(remoteInitializationDecision({ b: 2, a: 1 }, { a: 1, b: 2 }), 'unchanged')
  assert.equal(remoteInitializationDecision({ a: 1 }, { a: 2 }), 'protected')
})

test('按 Gitee 官方 Content 数组结构解析文件与缺失状态', () => {
  assert.equal(selectGiteeFileResponse([], 'a/b.json'), null)
  assert.deepEqual(selectGiteeFileResponse([{ type: 'file', path: 'a/b.json', content: 'e30=', sha: 'abc' }], 'a/b.json'), { type: 'file', path: 'a/b.json', content: 'e30=', sha: 'abc' })
  assert.equal(selectGiteeFileResponse([{ type: 'dir', path: 'a', name: 'a' }], 'a/b.json'), null)
})
