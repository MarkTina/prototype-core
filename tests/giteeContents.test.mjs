import test from 'node:test'
import assert from 'node:assert/strict'
import { readGiteeJson, writeGiteeJson, CollaborationConflictError } from '../src/prototype/giteeContents.mjs'

const context = { owner: 'example-owner', repo: 'example-repo', token: 'test-token', remoteBranch: 'master' }
const path = 'projects/example/branches/main/page-descriptions/home.json'

test('Gitee 空数组和 404 表示文件缺失，文件对象和数组都能读取中文 JSON', async (t) => {
  for (const response of [new Response('[]'), new Response(null, { status: 404 })]) {
    t.mock.method(globalThis, 'fetch', async () => response)
    assert.equal(await readGiteeJson(context, path), null)
    t.mock.restoreAll()
  }
  const value = { purpose: '中文说明 🫡' }
  const file = { path, content: Buffer.from(JSON.stringify(value)).toString('base64'), sha: 'sha-1' }
  for (const payload of [file, [file]]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload))
    assert.deepEqual(await readGiteeJson(context, path), { value, sha: 'sha-1' })
    t.mock.restoreAll()
  }
})

test('304 只重试一次，并带防缓存头和新的请求参数', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options })
    return calls.length === 1 ? new Response(null, { status: 304 }) : Response.json([])
  })
  assert.equal(await readGiteeJson(context, path), null)
  assert.equal(calls.length, 2)
  assert.notEqual(calls[0].url, calls[1].url)
  assert.equal(calls[0].options.headers['Cache-Control'], 'no-cache, no-store')
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 304 }))
  await assert.rejects(readGiteeJson(context, path), /304 缓存响应/)
})

test('非空异常响应和 HTTP 错误不会当成文件缺失', async (t) => {
  for (const payload of [{ message: '异常' }, [{ path, sha: 'sha-1' }], [{ path: 'other.json', content: 'e30=', sha: 'sha-1' }]]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload))
    await assert.rejects(readGiteeJson(context, path), /响应格式异常/)
    t.mock.restoreAll()
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('权限不足', { status: 403 }))
  await assert.rejects(readGiteeJson(context, path), /403.*权限不足/)
})

test('新建使用 POST，更新使用 PUT 和 SHA，冲突保持可识别', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options })
    return Response.json({})
  })
  await writeGiteeJson(context, path, { purpose: '中文' }, null, 'docs: create')
  await writeGiteeJson(context, path, { purpose: '更新' }, 'sha-1', 'docs: update')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.body.has('sha'), false)
  assert.equal(calls[1].options.method, 'PUT')
  assert.equal(calls[1].options.body.get('sha'), 'sha-1')
  assert.deepEqual(JSON.parse(Buffer.from(calls[1].options.body.get('content'), 'base64').toString('utf8')), { purpose: '更新' })
  for (const status of [409, 422]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }))
    await assert.rejects(writeGiteeJson(context, path, {}, 'sha-1', 'docs: conflict'), CollaborationConflictError)
  }
})
