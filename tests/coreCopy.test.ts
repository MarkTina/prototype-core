import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coreCopy, coreText, readProductText, type CoreCopyKey, type ProductCopy } from '../src/i18n/coreCopy.ts'

const annotationKeys: CoreCopyKey[] = [
  'annotationExpand',
  'annotationCollapse',
  'annotationPanelTitle',
  'annotationPanelSubtitle',
  'annotationTabNotes',
  'annotationTabDescription',
  'annotationCancelAdd',
  'annotationAdd',
  'annotationHidePoints',
  'annotationShowPoints',
  'annotationRefresh',
  'annotationExport',
  'annotationRemoteDisabled',
  'annotationAuthorName',
  'annotationAuthorPlaceholder',
  'annotationPollingInterval',
  'annotationPollingUnit',
  'annotationPollingSave',
  'annotationEmpty',
  'annotationDelete',
  'annotationCancel',
  'annotationSave',
  'annotationFormTitle',
  'annotationEditTitle',
  'annotationDetailTitle',
  'annotationFeatureName',
  'annotationNamePlaceholder',
  'annotationFeatureDescription',
  'annotationDescPlaceholder',
  'annotationSpecialNote',
  'annotationNotePlaceholder',
]

test('中文和 English 模式下内核注释文案均固定为中文', () => {
  for (const _lang of ['zh', 'en'] as const) {
    for (const key of annotationKeys) {
      const value = coreText(key)
      assert.match(value, /[\u3400-\u9fff]/)
      assert.notEqual(value, key)
    }
  }
})

test('语言切换只改变消费者业务文案', () => {
  const copy: ProductCopy = {
    zh: { stateReady: '正常态' },
    en: { stateReady: 'Ready' },
  }
  assert.equal(readProductText(copy, 'zh', 'stateReady'), '正常态')
  assert.equal(readProductText(copy, 'en', 'stateReady'), 'Ready')
  assert.equal(coreText('annotationPanelTitle'), '原型协作')
})

test('消费者只提供业务状态文案时内核工具文案仍完整', () => {
  const copy: ProductCopy = {
    zh: { stateReady: '正常态' },
    en: { stateReady: 'Ready' },
  }
  assert.equal(readProductText(copy, 'en', 'stateReady'), 'Ready')
  for (const [key, value] of Object.entries(coreCopy)) {
    assert.ok(value.length > 0, `${key} 缺少内核中文文案`)
    assert.notEqual(value, key)
  }
})

test('内核源码调用的每个 CoreCopyKey 均存在且不再调用通用 t()', async () => {
  const files = [
    'src/App.vue',
    'src/prototype/usePrototype.ts',
    'src/tools/test-cases/TestCaseWorkbench.vue',
  ]
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/coreText\('([^']+)'\)/g)) {
      assert.ok(Object.hasOwn(coreCopy, match[1]), `${file} 使用了缺失的 CoreCopyKey：${match[1]}`)
    }
    assert.doesNotMatch(source, /\bt\(['"](?:annotation|pageDescription)/)
  }
})

test('基础示例无需配置内核文案', async () => {
  const source = await readFile('examples/basic/src/product.ts', 'utf8')
  assert.match(source, /stateReady/)
  assert.doesNotMatch(source, /annotation[A-Z]|pageDescription[A-Z]|testCase[A-Z]/)
})
