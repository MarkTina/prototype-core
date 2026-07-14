import test from 'node:test'
import assert from 'node:assert/strict'
import { createVersionManifestUrl, normalizeVersionManifest, shouldNotifyVersion } from '../src/core/versionUpdate.ts'

test('版本清单只接受非空版本并规范可选构建时间', () => {
  assert.deepEqual(normalizeVersionManifest({ version: ' build-2 ', builtAt: ' 2026-07-14 ' }), { version: 'build-2', builtAt: '2026-07-14' })
  assert.deepEqual(normalizeVersionManifest({ version: 'build-2' }), { version: 'build-2' })
  assert.equal(normalizeVersionManifest({ version: ' ' }), null)
  assert.equal(normalizeVersionManifest(null), null)
})

test('仅远端新版本且未忽略时通知', () => {
  assert.equal(shouldNotifyVersion('build-1', 'build-2'), true)
  assert.equal(shouldNotifyVersion('build-1', 'build-1'), false)
  assert.equal(shouldNotifyVersion('build-1', 'build-2', 'build-2'), false)
  assert.equal(shouldNotifyVersion('', 'build-2'), false)
})

test('版本清单地址支持部署子路径、自定义地址和缓存穿透', () => {
  assert.equal(createVersionManifestUrl('/prototype/', undefined, 'https://example.com', 123).toString(), 'https://example.com/prototype/version.json?ts=123')
  assert.equal(createVersionManifestUrl('/prototype/', '/meta/version.json', 'https://example.com', 456).toString(), 'https://example.com/meta/version.json?ts=456')
})
