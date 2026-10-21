import test from 'node:test'
import assert from 'node:assert/strict'
import { storageHarness, base, pagePath, manifestPath, description, context } from './fixtures/storageHarness.mjs'

test('旧页面描述编辑基线冲突时阻止写入，并保留 pending 草稿', async (t) => {
  const h = await storageHarness(t)
  h.files.set(pagePath, { value: description, sha: 'old' })
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  h.state.setCollaborationEditing('pageDescriptions', true)
  h.state.pageDescriptionEditor.value.purpose = '我的旧版本修改'
  h.files.set(pagePath, { value: { ...description, purpose: '其他人已保存' }, sha: 'new' })
  assert.equal(await h.state.saveCurrentPageDescription(), false)
  assert.equal(h.files.get(pagePath).value.purpose, '其他人已保存')
  const cache = h.store.readScopedCollaborationCache('pageDescriptions').scopes.home
  assert.equal(cache.status, 'pending')
  assert.equal(cache.baseRevision, 'old')
  assert.equal(cache.value.purpose, '我的旧版本修改')
})

test('流程草稿根据编辑基线冲突，不能借最新 SHA 覆盖远端', async (t) => {
  const h = await storageHarness(t)
  const path = `${base}/flows.json`
  h.files.set(path, { value: { version: '1.0.0', flows: [] }, sha: 'old' })
  await h.state.refreshFlows()
  h.state.setCollaborationEditing('flows', true)
  h.files.set(path, { value: { version: '1.0.0', flows: [{ id: 'remote', title: '远端', rows: [] }] }, sha: 'new' })
  assert.equal(await h.state.pushFlowsToGitee([{ id: 'mine', title: '草稿', rows: [] }]), false)
  assert.equal(h.files.get(path).value.flows[0].id, 'remote')
  assert.equal(h.store.readCollaborationCache('flows').status, 'pending')
  assert.equal(h.store.readCollaborationCache('flows').baseRevision, 'old')
})

test('浏览器索引失败保持 pending，重跑只修复索引，完成后才 synced', async (t) => {
  const h = await storageHarness(t)
  h.controls.failManifest = true
  const first = await h.state.syncPageDescriptionsFromJson()
  assert.equal(first.failedScopes.length, 1)
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.status, 'pending')
  const scopeWrites = h.calls.filter((item) => item.path === pagePath && item.method !== 'GET').length
  h.controls.failManifest = false
  const second = await h.state.syncPageDescriptionsFromJson()
  assert.deepEqual(second.syncedScopes, ['home'])
  assert.equal(h.calls.filter((item) => item.path === pagePath && item.method !== 'GET').length, scopeWrites)
  assert.equal(h.files.get(manifestPath).value.screens.home.count, 1)
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.status, 'synced')
  assert.deepEqual((await h.state.syncPageDescriptionsFromJson()).skippedScopes, ['home'])
})

test('空远端不会丢失初始化种子，显式初始化才写入测试用例', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  await h.cases.initializeTestCases()
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
  assert.equal(h.state.pageDescriptions.value.length, 0)
  await h.state.initializeRemoteCollaborationData()
  assert.equal(h.files.get(pagePath).value.purpose, description.purpose)
  assert.ok(h.files.has(`${base}/test-cases/home.json`))
  assert.equal(h.state.collaborationBootstrapStatus.value, 'success')
})

test('初始化保护已有不同正文，索引按远端真实数量生成', async (t) => {
  const h = await storageHarness(t)
  h.files.set(pagePath, { value: { ...description, purpose: '受保护的远端正文' }, sha: 'existing' })
  const casePath = `${base}/test-cases/home.json`
  h.files.set(casePath, { value: [{ id: 'TC-1', screenId: 'home' }, { id: 'TC-2', screenId: 'home' }], sha: 'cases' })
  await h.state.initializePrototype()
  await h.state.initializeRemoteCollaborationData()
  assert.equal(h.files.get(pagePath).sha, 'existing')
  assert.equal(h.files.get(casePath).sha, 'cases')
  assert.equal(h.files.get(`${base}/test-cases/manifest.json`).value.scopes.home.count, 2)
})

test('轮询发出后开始编辑，响应不能覆盖未保存表单', async (t) => {
  const h = await storageHarness(t)
  h.files.set(pagePath, { value: description, sha: 'remote' })
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  const gate = h.hold(pagePath)
  const pending = h.state.refreshPageDescriptions(true)
  await gate.ready
  h.state.setCollaborationEditing('pageDescriptions', true)
  h.state.pageDescriptionEditor.value.purpose = '正在输入'
  gate.release()
  await pending
  assert.equal(h.state.pageDescriptionEditor.value.purpose, '正在输入')
  assert.equal(h.state.collaborationSources.value.pageDescriptions.status, 'idle')
})

test('旧页面的缺失响应不能清除新页面缓存', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  h.files.set(`${base}/page-descriptions/other.json`, { value: { ...description, screenId: 'other', purpose: '新页面' }, sha: 'other' })
  const gate = h.hold(pagePath)
  const pending = h.state.refreshPageDescriptions()
  await gate.ready
  h.state.currentScreen.value = 'other'
  await h.state.refreshPageDescriptions()
  gate.release()
  await pending
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.other.value.purpose, '新页面')
  assert.equal(h.state.currentPageDescription.value.purpose, '新页面')
})

test('索引冲突重新合并并重算同页汇总，不丢其他 scope', async (t) => {
  const h = await storageHarness(t)
  const existing = { count: 1, updatedAt: 'old' }
  h.controls.conflictManifest = { projectId: 'example', scopes: { home__other: existing }, screens: { home: { count: 1 } } }
  const result = await h.state.syncPageDescriptionsFromJson()
  assert.deepEqual(result.syncedScopes, ['home'])
  const value = h.files.get(manifestPath).value
  assert.deepEqual(value.scopes.home__other, existing)
  assert.equal(value.screens.home.count, 2)
})

test('回读正文或索引不一致不能标记 synced', async (t) => {
  const h = await storageHarness(t)
  h.controls.corruptPath = pagePath
  assert.equal((await h.state.syncPageDescriptionsFromJson()).failedScopes.length, 1)
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.status, 'pending')
  h.files.delete(pagePath)
  h.controls.corruptPath = manifestPath
  assert.equal((await h.state.syncPageDescriptionsFromJson()).failedScopes.length, 1)
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.status, 'pending')
})

test('存储配额失败保留会话草稿，远端完整保存仍返回成功', async (t) => {
  const h = await storageHarness(t)
  h.storage.setItem = () => { throw new Error('QuotaExceededError') }
  const result = await h.state.syncPageDescriptionsFromJson()
  assert.deepEqual(result.syncedScopes, ['home'])
  const cache = h.store.readScopedCollaborationCache('pageDescriptions').scopes.home
  assert.equal(cache.status, 'synced')
  assert.equal(cache.persistence, 'session')
  assert.equal(cache.value.purpose, description.purpose)
  h.store.writeCollaborationCache('flows', [], null, null, 'pending')
  assert.equal(h.store.readCollaborationCache('flows').status, 'pending')
})

test('流程 pending 状态按仓库隔离，不再由独立 dirty 标记串扰', async (t) => {
  const h = await storageHarness(t)
  h.store.writeCollaborationCache('flows', [{ id: 'draft-a' }], 'a', null, 'pending')
  h.adapter.configurePrototypeRuntime({ collaboration: { ...context, repo: 'second-repo' } })
  h.files.set(`${base}/flows.json`, { value: { version: '1.0.0', flows: [{ id: 'remote-b' }] }, sha: 'b' })
  await h.state.refreshFlows()
  assert.equal(h.state.mainFlows.value[0].id, 'remote-b')
  h.adapter.configurePrototypeRuntime({ collaboration: context })
  assert.equal(h.store.readCollaborationCache('flows').value[0].id, 'draft-a')
  assert.equal(h.store.readCollaborationCache('flows').status, 'pending')
})

test('测试用例轮询返回前开始编辑，响应保留原始编辑基线', async (t) => {
  const h = await storageHarness(t)
  const path = `${base}/test-cases/home.json`
  h.files.set(path, { value: [{ id: 'TC-1', screenId: 'home', testItem: '旧值' }], sha: 'old' })
  await h.cases.initializeTestCases()
  h.files.set(path, { value: [{ id: 'TC-1', screenId: 'home', testItem: '他人新值' }], sha: 'new' })
  const gate = h.hold(path)
  const pending = h.cases.refreshTestCases(true)
  await gate.ready
  h.cases.setTestCaseEditing(true)
  gate.release()
  await pending
  const old = h.cases.testCases.value[0]
  assert.equal(old.testItem, '旧值')
  assert.equal(await h.cases.saveTestCase('编辑', { ...old, testItem: '我的修改' }), false)
  assert.equal(h.files.get(path).value[0].testItem, '他人新值')
})

test('注释索引失败保留新增草稿，重试不会创建重复注释', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  h.state.annotationDraft.value = { screenId: 'home', x: 50, y: 50, featureName: '新注释', featureDescription: '', specialNote: '' }
  h.controls.failIndexPath = `${base}/annotations/manifest.json`
  await h.state.saveAnnotationDraft()
  assert.ok(h.state.annotationDraft.value)
  assert.equal(h.store.readScopedCollaborationCache('annotations').scopes.home.status, 'pending')
  h.controls.failIndexPath = ''
  await h.state.saveAnnotationDraft()
  assert.equal(h.files.get(`${base}/annotations/home.json`).value.length, 1)
  assert.equal(h.files.get(`${base}/annotations/manifest.json`).value.scopes.home.count, 1)
  assert.equal(h.state.annotationDraft.value, null)
  assert.equal(h.store.readScopedCollaborationCache('annotations').scopes.home.status, 'synced')
})

test('测试用例索引失败保持 pending，同一新增 ID 重试只修复索引', async (t) => {
  const h = await storageHarness(t)
  h.seeds.testCases = []
  await h.cases.initializeTestCases()
  const target = { id: 'new-case', screenId: 'home', module: '模块', testItem: '新用例', testPoint: '要点', preconditions: '无', steps: ['步骤'], expectedResult: '结果', actualResult: '未执行' }
  h.controls.failIndexPath = `${base}/test-cases/manifest.json`
  assert.equal(await h.cases.saveTestCase('新增', target), false)
  assert.equal(h.store.readScopedCollaborationCache('testCases').scopes.home.status, 'pending')
  h.controls.failIndexPath = ''
  assert.equal(await h.cases.saveTestCase('新增', target), true)
  assert.equal(h.files.get(`${base}/test-cases/home.json`).value.length, 1)
  assert.equal(h.files.get(`${base}/test-cases/manifest.json`).value.scopes.home.count, 1)
})

test('已有初始化标记仍可补齐新增种子，重复初始化不产生写入', async (t) => {
  const h = await storageHarness(t)
  await h.state.initializePrototype()
  h.files.set(`${base}/initialization.json`, { value: { schemaVersion: 1 }, sha: 'marker' })
  await h.state.initializeRemoteCollaborationData()
  assert.ok(h.files.has(pagePath))
  const writes = h.calls.filter((item) => item.method !== 'GET').length
  await h.state.initializeRemoteCollaborationData()
  assert.equal(h.calls.filter((item) => item.method !== 'GET').length, writes)
})

test('索引完成后再次核对正文，期间变更不能宣称同步成功', async (t) => {
  const h = await storageHarness(t)
  h.controls.changePageAfterManifest = true
  assert.equal((await h.state.syncPageDescriptionsFromJson()).failedScopes.length, 1)
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.status, 'pending')
  assert.equal(h.files.get(pagePath).value.purpose, '索引保存期间的新修改')
})

test('JSON 差异读取途中开始编辑时停止该 scope，不覆盖人工草稿', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  h.files.set(pagePath, { value: description, sha: 'old' })
  await h.state.initializePrototype()
  const gate = h.hold(pagePath)
  const pending = h.state.syncPageDescriptionsFromJson()
  await gate.ready
  h.state.setCollaborationEditing('pageDescriptions', true)
  h.state.pageDescriptionEditor.value.purpose = '人工草稿'
  gate.release()
  assert.equal((await pending).failedScopes.length, 1)
  assert.equal(h.state.pageDescriptionEditor.value.purpose, '人工草稿')
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
})

test('JSON 已提交正文时开始编辑，保留人工原始基线以阻止随后覆盖', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  h.files.set(pagePath, { value: { ...description, purpose: '远端原始内容' }, sha: 'old' })
  await h.state.initializePrototype()
  const gate = h.hold(manifestPath, 1)
  const pending = h.state.syncPageDescriptionsFromJson()
  await gate.ready
  h.state.setCollaborationEditing('pageDescriptions', true)
  h.state.pageDescriptionEditor.value.purpose = '基于原始版本编辑'
  gate.release()
  assert.deepEqual((await pending).syncedScopes, ['home'])
  assert.equal(await h.state.saveCurrentPageDescription(), false)
  assert.equal(h.files.get(pagePath).value.purpose, description.purpose)
  assert.equal(h.state.pageDescriptionEditor.value.purpose, '基于原始版本编辑')
})

const bug = { id: 'BUG-001', title: '原始问题', type: '功能异常', ownerRole: '前端开发', status: '待处理', description: '问题描述', reporterName: '测试者', createdAt: '2026-01-01', updatedAt: '2026-01-01' }

test('Bug 旧刷新请求不得覆盖保存成功后的远端与缓存', async (t) => {
  const h = await storageHarness(t)
  const path = `${base}/bugs/bugs.json`
  h.files.set(path, { value: [bug], sha: 'old' })
  await h.bugs.initializeBugs()
  const gate = h.hold(path)
  const pending = h.bugs.refreshBugs()
  await gate.ready
  assert.equal(await h.bugs.persistBugs('测试者', '编辑', (values) => values.map((item) => ({ ...item, title: '保存后新值' }))), true)
  gate.release()
  await pending
  assert.equal(h.bugs.bugs.value[0].title, '保存后新值')
  assert.equal(h.store.readCollaborationCache('bugs').revision, h.files.get(path).sha)
})

test('Bug 读取失败及恢复均保留 pending 缓存', async (t) => {
  const h = await storageHarness(t)
  const path = `${base}/bugs/bugs.json`
  h.files.set(path, { value: [bug], sha: 'remote' })
  h.store.writeCollaborationCache('bugs', [{ ...bug, title: '本地未推送' }], 'old', null, 'pending')
  h.controls.failReadPath = path
  await h.bugs.refreshBugs()
  assert.equal(h.store.readCollaborationCache('bugs').status, 'pending')
  h.controls.failReadPath = ''
  await h.bugs.refreshBugs()
  assert.equal(h.store.readCollaborationCache('bugs').status, 'pending')
  assert.equal(h.bugs.bugs.value[0].title, '本地未推送')
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
})

test('Bug 本地存储配额失败明确提示会话限制，格式异常远端禁止覆盖', async (t) => {
  const h = await storageHarness(t)
  h.bugs.bugRemoteReady.value = false
  h.storage.setItem = () => { throw new Error('QuotaExceededError') }
  assert.equal(await h.bugs.persistBugs('测试者', '新增', () => [bug]), true)
  assert.match(h.bugs.bugSyncMessage.value, /本次会话/)
  assert.equal(h.store.readCollaborationCache('bugs').persistence, 'session')
  h.bugs.bugRemoteReady.value = true
  const path = `${base}/bugs/bugs.json`
  h.files.set(path, { value: { invalid: true }, sha: 'invalid' })
  assert.equal(await h.bugs.persistBugs('测试者', '新增', () => [bug]), false)
  assert.equal(h.files.get(path).sha, 'invalid')
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
})

test('初始化不会以 JSON 种子隐式覆盖 main 旧目录真值', async (t) => {
  const h = await storageHarness(t)
  const legacy = 'projects/example/page-descriptions/home.json'
  h.files.set(legacy, { value: { ...description, purpose: '旧目录协作真值' }, sha: 'legacy' })
  await h.state.initializePrototype()
  await h.state.initializeRemoteCollaborationData()
  assert.equal(h.files.has(pagePath), false)
  assert.equal(h.files.get(legacy).sha, 'legacy')
  assert.equal(h.files.get(manifestPath).value.scopes.home.count, 1)
})

test('远端异常正文和索引禁止按空文件覆盖', async (t) => {
  const h = await storageHarness(t)
  const annotationPath = `${base}/annotations/home.json`
  const casePath = `${base}/test-cases/home.json`
  h.files.set(annotationPath, { value: { invalid: true }, sha: 'invalid' })
  h.files.set(casePath, { value: null, sha: 'invalid' })
  h.files.set(manifestPath, { value: { scopes: [], screens: {} }, sha: 'invalid' })
  await assert.rejects(h.client.updateRemoteScreenAnnotations('home', '测试', '新增', () => []), /格式无效/)
  await assert.rejects(h.client.updateRemoteTestCases('home', '测试', '新增', () => []), /格式无效/)
  await assert.rejects(h.client.saveRemotePageDescriptionManifest({ projectId: 'example', scopes: { home: { count: 1 } }, screens: {} }, '测试', 'home'), /格式无效/)
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
})

test('Bug 远端数组中存在无效记录时禁止归一化丢弃后写回', async (t) => {
  const h = await storageHarness(t)
  const path = `${base}/bugs/bugs.json`
  const value = [bug, { id: '历史无效记录' }]
  h.files.set(path, { value, sha: 'original' })
  assert.equal(await h.bugs.persistBugs('测试者', '编辑', (values) => values.map((item) => ({ ...item, title: '修改' }))), false)
  assert.match(h.bugs.bugSyncMessage.value, /无效记录/)
  assert.deepEqual(h.files.get(path).value, value)
  assert.equal(h.calls.some((item) => item.method !== 'GET'), false)
})

test('远端已确认缺失后重新启动断网，空缓存仍屏蔽旧 JSON', async (t) => {
  const h = await storageHarness(t)
  h.state.currentScreen.value = 'home'
  await h.state.initializePrototype()
  assert.equal(h.store.readScopedCollaborationCache('pageDescriptions').scopes.home.value, null)
  h.controls.failReadPath = pagePath
  await h.state.initializePrototype()
  assert.equal(h.state.pageDescriptionSelectedSource.value, 'local-cache')
  assert.equal(h.state.currentPageDescription.value, null)
  assert.equal(h.state.pageDescriptionEditor.value.purpose, '')
  assert.equal(h.state.pageDescriptions.value.length, 0)
})
