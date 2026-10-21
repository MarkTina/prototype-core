import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)
const base = 'projects/example/branches/main/page-descriptions'
const manifestPath = `${base}/manifest.json`
const description = { screenId: 'home', purpose: '首页说明 🫡' }
const entry = { count: 1, updatedAt: '2026-01-01' }
const manifest = { projectId: 'example', scopes: { home: entry }, screens: { home: entry } }

async function runCli(t, scenario = {}, descriptions = [description], extraArgs = []) {
  const directory = await mkdtemp(join(tmpdir(), 'prototype-core-sync-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts'))
  await mkdir(join(directory, 'dist'))
  await writeFile(join(directory, 'package.json'), '{"type":"module"}', 'utf8')
  await copyFile(new URL('../scripts/sync-page-descriptions.mjs', import.meta.url), join(directory, 'scripts/sync-page-descriptions.mjs'))
  // 复刻发布包布局，执行真实 CLI 入口与同一份共享协议代码。
  await copyFile(new URL('../src/prototype/giteeContents.mjs', import.meta.url), join(directory, 'dist/giteeContents.js'))
  const seedPath = join(directory, 'seed.json')
  const scenarioPath = join(directory, 'scenario.json')
  const resultPath = join(directory, 'result.json')
  await writeFile(seedPath, JSON.stringify(descriptions), 'utf8')
  await writeFile(scenarioPath, JSON.stringify(scenario), 'utf8')
  const args = ['--import', new URL('./fixtures/giteeMock.mjs', import.meta.url).href, join(directory, 'scripts/sync-page-descriptions.mjs'), '--file', seedPath, '--owner', 'example-owner', '--repo', 'example-repo', '--project-id', 'example', '--code-branch', 'main', ...extraArgs]
  const env = { ...process.env, AGENT_GITEE_ACCESS_TOKEN: 'test-token', GITEE_TOKEN: '', PROTOTYPE_TEST_SCENARIO: scenarioPath, PROTOTYPE_TEST_RESULT: resultPath }
  let processResult
  try {
    processResult = { ...(await run(process.execPath, args, { env, encoding: 'utf8' })), code: 0 }
  } catch (error) {
    processResult = { stdout: error.stdout, stderr: error.stderr, code: error.code }
  }
  const remote = JSON.parse(await readFile(resultPath, 'utf8'))
  return { ...processResult, remote, result: processResult.stdout ? JSON.parse(processResult.stdout) : null }
}

test('首次同步接受 200 空数组，创建 scope 和 manifest，重跑无重复写入', async (t) => {
  const first = await runCli(t)
  assert.equal(first.code, 0)
  assert.deepEqual(first.result.syncedScopes, ['home'])
  assert.deepEqual(first.remote.files[`${base}/home.json`].value, description)
  assert.equal(first.remote.files[manifestPath].value.scopes.home.count, 1)
  assert.equal(first.remote.files[manifestPath].value.screens.home.count, 1)
  const files = Object.fromEntries(Object.entries(first.remote.files).map(([path, file]) => [path, file.value]))
  const second = await runCli(t, { files })
  assert.deepEqual(second.result.skippedScopes, ['home'])
  assert.equal(second.remote.calls.filter((call) => call.method !== 'GET').length, 0)
})

test('已有 manifest 时创建缺失状态 scope，并保留其他索引和页面汇总', async (t) => {
  const state = { ...description, stateId: 'empty', highlighted: true }
  const result = await runCli(t, { files: { [manifestPath]: manifest }, missingStatus: 404, objectResponse: true }, [state])
  assert.equal(result.code, 0)
  const saved = result.remote.files[manifestPath].value
  assert.deepEqual(saved.scopes.home, entry)
  assert.equal(saved.scopes.home__empty.highlightColor, '#ef4444')
  assert.equal(saved.screens.home.count, 2)
})

test('manifest 冲突重新合并并保留并发新增的其他 scope', async (t) => {
  const concurrent = { projectId: 'example', scopes: { other: entry }, screens: { other: entry } }
  const result = await runCli(t, { writeResponses: { [manifestPath]: [{ status: 409, concurrentManifest: concurrent }] } })
  assert.equal(result.code, 0)
  assert.deepEqual(result.remote.files[manifestPath].value.scopes.other, entry)
  assert.equal(result.remote.calls.filter((call) => call.path === manifestPath && call.method !== 'GET').length, 2)
})

test('manifest 连续冲突报告失败，重跑能修复相同 scope 内容的缺失索引', async (t) => {
  const first = await runCli(t, { writeResponses: { [manifestPath]: [{ status: 409 }, { status: 422 }] } })
  assert.equal(first.code, 1)
  assert.equal(first.result.failedScopes[0].scopeId, 'home')
  assert.equal(first.remote.calls.filter((call) => call.path === manifestPath && call.method !== 'GET').length, 2)
  const second = await runCli(t, { files: { [`${base}/home.json`]: description } })
  assert.equal(second.code, 0)
  assert.deepEqual(second.result.syncedScopes, ['home'])
  assert.equal(second.remote.calls.filter((call) => call.path === `${base}/home.json` && call.method !== 'GET').length, 0)
  assert.ok(second.remote.files[manifestPath])
})

test('旧路径仅在 main 回退，创建新路径时不携带旧文件 SHA', async (t) => {
  const legacyBase = 'projects/example/page-descriptions'
  const files = { [`${legacyBase}/home.json`]: { ...description, purpose: '旧说明' }, [`${legacyBase}/manifest.json`]: manifest }
  const main = await runCli(t, { files })
  assert.equal(main.code, 0)
  assert.deepEqual(main.remote.files[`${legacyBase}/home.json`].value, files[`${legacyBase}/home.json`])
  assert.ok(main.remote.files[`${base}/home.json`])
  const feature = await runCli(t, { files }, [description], ['--code-branch', 'feature/demo'])
  assert.equal(feature.code, 0)
  assert.equal(feature.remote.calls.some((call) => call.path.startsWith(legacyBase)), false)
})

test('权限或异常 manifest 响应在写入前失败，不能误创建', async (t) => {
  for (const response of [{ status: 403, body: '权限不足' }, { status: 200, body: '[{"path":"other.json"}]' }]) {
    const result = await runCli(t, { readResponses: { [manifestPath]: [response] } })
    assert.equal(result.code, 1)
    assert.equal(result.remote.calls.some((call) => call.method !== 'GET'), false)
    assert.match(result.stderr, /权限不足|响应格式异常/)
  }
})

test('scope 写入冲突和精确回读不一致均报告失败，其他目标继续执行', async (t) => {
  for (const scenario of [{ writeResponses: { [`${base}/home.json`]: [{ status: 409 }] } }, { corruptAfterWrite: `${base}/home.json` }]) {
    const result = await runCli(t, scenario, [description, { screenId: 'other', purpose: '其他页' }])
    assert.equal(result.code, 1)
    assert.equal(result.result.failedScopes[0].scopeId, 'home')
    assert.deepEqual(result.result.syncedScopes, ['other'])
    assert.equal(result.remote.calls.filter((call) => call.path === `${base}/home.json` && call.method !== 'GET').length, 1)
  }
})

test('有效 HTTP 响应中的异常 manifest JSON 不得触发覆盖写入', async (t) => {
  const result = await runCli(t, { files: { [manifestPath]: { scopes: [], screens: {} } } })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /索引格式无效/)
  assert.equal(result.remote.calls.some((call) => call.method !== 'GET'), false)
})

test('索引保存期间正文变化时 CLI 精确回读报告失败', async (t) => {
  const other = { ...description, purpose: '并发修改' }
  const result = await runCli(t, { changeScopeAfterManifest: { path: `${base}/home.json`, value: other } })
  assert.equal(result.code, 1)
  assert.equal(result.result.failedScopes[0].scopeId, 'home')
  assert.match(result.result.failedScopes[0].error, /索引保存期间已变化/)
  assert.deepEqual(result.remote.files[`${base}/home.json`].value, other)
})
