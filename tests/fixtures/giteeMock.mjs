import { readFileSync, writeFileSync } from 'node:fs'

const scenario = JSON.parse(readFileSync(process.env.PROTOTYPE_TEST_SCENARIO, 'utf8'))
const files = new Map(Object.entries(scenario.files ?? {}).map(([path, value]) => [path, { value, sha: `initial-${path}` }]))
const calls = []
let revision = 0

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input)
  if (url.origin !== 'https://gitee.com') throw new Error('测试禁止真实网络请求')
  const path = decodeURIComponent(url.pathname.split('/contents/')[1])
  const method = options.method ?? 'GET'
  calls.push({ path, method })
  if (method === 'GET') {
    const override = scenario.readResponses?.[path]?.shift()
    if (override) return new Response(override.body ?? null, { status: override.status })
    const file = files.get(path)
    if (!file) return scenario.missingStatus === 404 ? new Response(null, { status: 404 }) : Response.json([])
    const payload = { path, content: Buffer.from(JSON.stringify(file.value)).toString('base64'), sha: file.sha }
    return Response.json(scenario.objectResponse ? payload : [payload])
  }
  const override = scenario.writeResponses?.[path]?.shift()
  if (override) {
    if (override.concurrentManifest) files.set(path, { value: override.concurrentManifest, sha: 'concurrent-sha' })
    return new Response(override.body ?? null, { status: override.status })
  }
  const current = files.get(path)
  const body = options.body
  if ((method === 'POST' && current) || (method === 'PUT' && body.get('sha') !== current?.sha)) return new Response(null, { status: 409 })
  const value = JSON.parse(Buffer.from(body.get('content'), 'base64').toString('utf8'))
  files.set(path, { value: scenario.corruptAfterWrite === path ? { corrupted: true } : value, sha: `revision-${++revision}` })
  if (path.endsWith('/manifest.json') && scenario.changeScopeAfterManifest) {
    const target = scenario.changeScopeAfterManifest
    files.set(target.path, { value: target.value, sha: `revision-${++revision}` })
  }
  return Response.json({})
}

process.on('exit', () => {
  writeFileSync(process.env.PROTOTYPE_TEST_RESULT, JSON.stringify({ files: Object.fromEntries(files), calls }), 'utf8')
})
