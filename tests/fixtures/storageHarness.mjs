import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import assert from 'node:assert/strict'

export const base = 'projects/example/branches/main'
export const pagePath = `${base}/page-descriptions/home.json`
export const manifestPath = `${base}/page-descriptions/manifest.json`
export const description = { screenId: 'home', purpose: '静态种子', structure: '', features: '', flowPosition: '', interactionRules: '', stateCriteria: '', edgeCases: '', acceptanceCriteria: '', developmentNotes: '', highlighted: false }
export const context = { provider: 'gitee', owner: 'example-owner', repo: 'example-repo', projectId: 'example', codeBranch: 'main', token: 'test-token' }

export async function storageHarness(t) {
  const local = new Map()
  const storage = { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) }
  const previousWindow = globalThis.window
  globalThis.window = { localStorage: storage }
  t.after(() => { globalThis.window = previousWindow })
  const files = new Map()
  const calls = []
  const controls = { failManifest: false, failIndexPath: '', failReadPath: '', corruptPath: '', conflictManifest: null, changePageAfterManifest: false, gates: new Map() }
  const seeds = { descriptions: [description], annotations: [], flows: [], testCases: [{ id: 'TC-1', screenId: 'home', module: '模块', steps: ['步骤'] }] }
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const text = String(input)
    if (text.startsWith('/')) {
      if (text.endsWith('page-descriptions.json')) return Response.json(seeds.descriptions)
      if (text.endsWith('annotations.json')) return Response.json(seeds.annotations)
      if (text.endsWith('test-cases.json')) return Response.json(seeds.testCases)
      return Response.json({ flows: seeds.flows })
    }
    const url = new URL(text)
    assert.equal(url.origin, 'https://gitee.com', '测试禁止访问真实服务')
    const path = decodeURIComponent(url.pathname.split('/contents/')[1])
    const method = options.method ?? 'GET'
    calls.push({ path, method, repo: url.pathname.split('/')[5], sha: options.body?.get('sha') })
    if (method === 'GET') {
      if (path === controls.failReadPath) return new Response('读取失败', { status: 500 })
      const file = files.get(path)
      const payload = file ? [{ path, sha: file.sha, content: Buffer.from(JSON.stringify(file.value)).toString('base64') }] : []
      const gate = controls.gates.get(path)
      if (gate && gate.skip > 0) gate.skip -= 1
      else if (gate) { controls.gates.delete(path); gate.reached(); await gate.wait }
      return Response.json(payload)
    }
    if ((controls.failManifest && path === manifestPath) || path === controls.failIndexPath) return new Response('索引不可写', { status: 500 })
    if (controls.conflictManifest && path === manifestPath) {
      files.set(path, { value: controls.conflictManifest, sha: 'concurrent' })
      controls.conflictManifest = null
      return new Response(null, { status: 409 })
    }
    const body = options.body
    const current = files.get(path)
    if ((method === 'POST' && current) || (method === 'PUT' && current?.sha !== body.get('sha'))) return new Response(null, { status: 409 })
    const value = JSON.parse(Buffer.from(body.get('content'), 'base64').toString('utf8'))
    files.set(path, { value: controls.corruptPath === path ? { corrupted: true } : value, sha: `sha-${calls.length}` })
    if (path === manifestPath && controls.changePageAfterManifest) files.set(pagePath, { value: { ...description, purpose: '索引保存期间的新修改' }, sha: 'changed-again' })
    return Response.json({})
  })
  const server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  t.after(() => server.close())
  const adapter = await server.ssrLoadModule('/src/core/productAdapter.ts')
  adapter.configurePrototypeRuntime({ collaboration: context })
  adapter.configurePrototypeProduct({ pages: ['home', 'other'].map((id) => ({ id, platform: 'mobile', code: id, title: id, subtitle: '', icon: {} })), states: {}, copy: { zh: {}, en: {} }, flows: { version: '1', flows: [] } })
  const client = await server.ssrLoadModule('/src/prototype/annotationClient.ts')
  const store = await server.ssrLoadModule('/src/prototype/collaborationStore.ts')
  const prototype = await server.ssrLoadModule('/src/prototype/usePrototype.ts')
  const state = { ...prototype.usePrototypeContext(), ...prototype.useFlowEditorContext() }
  const cases = (await server.ssrLoadModule('/src/tools/test-cases/useTestCases.ts')).useTestCases()
  const bugs = (await server.ssrLoadModule('/src/tools/bugs/useProductBugs.ts')).useProductBugs()
  function hold(path, skip = 0) {
    let reached
    let release
    const ready = new Promise((resolve) => { reached = resolve })
    const wait = new Promise((resolve) => { release = resolve })
    controls.gates.set(path, { reached, wait, skip })
    return { ready, release }
  }
  return { local, storage, files, calls, controls, seeds, client, store, state, cases, bugs, adapter, hold }
}
