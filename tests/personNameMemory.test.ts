import test from 'node:test'
import assert from 'node:assert/strict'
import { watch } from 'vue'

test('姓名兼容旧缓存，手动修改立即记忆，空输入与自动回填不污染默认值', async () => {
  const values = new Map([['prototype-core-annotation-author', ' 旧昵称 ']])
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } },
  })
  try {
    const memory = await import('../src/prototype/personNameMemory.ts')
    assert.equal(memory.currentUserName.value, '旧昵称')
    let observedDefault = ''
    const stop = watch(memory.currentUserName, () => { observedDefault = memory.readDefaultUserName() }, { flush: 'sync' })
    memory.currentUserName.value = ' 新操作人 '
    assert.equal(observedDefault, '新操作人')
    stop()
    assert.equal(memory.readDefaultUserName(), '新操作人')
    assert.equal(values.get('prototype-core-annotation-author'), '新操作人')
    memory.currentUserName.value = ' '
    assert.equal(memory.currentUserName.value, ' ')
    assert.equal(memory.readDefaultUserName(), '新操作人')
    assert.equal(memory.defaultFixerName(), '')
    memory.rememberFixerName(' 修复甲 ')
    assert.equal(values.get('prototype-core-bug-fixer'), '修复甲')
    assert.equal(memory.defaultFixerName(' 工单修复乙 '), '工单修复乙')
    assert.equal(memory.defaultFixerName(' '), '修复甲')
    memory.rememberFixerName(' ')
    assert.equal(memory.defaultFixerName(), '修复甲')
    assert.equal(memory.readDefaultUserName(), '新操作人')

    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('存储禁用') } })
    const unavailableMemory = await import(new URL('../src/prototype/personNameMemory.ts?unavailable', import.meta.url).href)
    assert.equal(unavailableMemory.readDefaultUserName(), '')
    assert.equal(unavailableMemory.defaultFixerName(), '')
    memory.currentUserName.value = '内存操作人'
    memory.rememberFixerName('内存修复人')
    assert.equal(memory.readDefaultUserName(), '内存操作人')
    assert.equal(memory.defaultFixerName(), '内存修复人')
  } finally {
    Reflect.deleteProperty(globalThis, 'window')
  }
})
