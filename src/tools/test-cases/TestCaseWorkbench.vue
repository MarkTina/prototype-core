<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowUp, FileJson, FileSpreadsheet, Plus, RefreshCw, Search, Trash2, X } from '@lucide/vue'
import { getPrototypeProduct } from '../../core/productAdapter'
import type { Lang, PrototypeTestCase } from '../../types/prototype'
import { emptyTestCaseDraft, testCaseScopeId, validateTestCaseDraft, type TestCaseDraft, type TestCaseScope } from './model'
import { exportTestCasesExcel, exportTestCasesJson } from './exportTestCases'
import { useTestCases } from './useTestCases'

const props = defineProps<{
  lang: Lang
  currentScreenId: string
  currentStateId?: string
  authorName: string
}>()
const emit = defineEmits<{
  close: []
  'update:authorName': [value: string]
}>()

const product = getPrototypeProduct()
const {
  testCases,
  testCaseManifest,
  selectedScopeId,
  sourceState,
  scopes,
  initializeTestCases,
  selectTestCaseScope,
  refreshTestCases,
  saveTestCase,
  loadAllTestCasesForExport,
  setTestCaseEditing,
} = useTestCases()

const copy = computed(() => props.lang === 'zh' ? {
  title: '测试用例', subtitle: '按页面状态维护可执行、可追溯的测试场景', back: '返回原型', searchScope: '搜索页面或状态',
  current: '当前状态', all: '全部用例', searchCase: '搜索 7 个业务字段', add: '新增用例', empty: '当前范围暂无测试用例',
  edit: '编辑用例', create: '新增用例', save: '保存用例', cancel: '取消', author: '协作者昵称', module: '所属模块',
  item: '测试项', point: '测试要点', preconditions: '前置条件', steps: '测试步骤', expected: '预期结果', actual: '实际结果',
  json: '导出 JSON', excel: '导出 Excel', refresh: '刷新', delete: '删除', addStep: '新增步骤', close: '关闭编辑器', moveUp: '上移步骤', moveDown: '下移步骤', removeStep: '删除步骤', unknown: '未知页面或状态',
} : {
  title: 'Test Cases', subtitle: 'Maintain executable, traceable scenarios by page state', back: 'Back to prototype', searchScope: 'Search pages or states',
  current: 'Current state', all: 'All cases', searchCase: 'Search all 7 fields', add: 'New case', empty: 'No test cases in this scope',
  edit: 'Edit case', create: 'New case', save: 'Save case', cancel: 'Cancel', author: 'Collaborator', module: 'Module',
  item: 'Test item', point: 'Test point', preconditions: 'Preconditions', steps: 'Steps', expected: 'Expected result', actual: 'Actual result',
  json: 'Export JSON', excel: 'Export Excel', refresh: 'Refresh', delete: 'Delete', addStep: 'Add step', close: 'Close editor', moveUp: 'Move step up', moveDown: 'Move step down', removeStep: 'Remove step', unknown: 'Unknown page or state',
})

const scopeQuery = ref('')
const caseQuery = ref('')
const rangeMode = ref<'current' | 'all'>('current')
const mobileView = ref<'scopes' | 'cases'>('cases')
const editorVisible = ref(false)
const editingCaseId = ref('')
const draft = reactive<TestCaseDraft>(emptyTestCaseDraft())
const initialDraftJson = ref('')
const notice = ref('')
const exporting = ref(false)

const allScopes = computed(() => scopes(props.lang))
const currentScope = computed(() => allScopes.value.find((scope) => scope.id === selectedScopeId.value) ?? allScopes.value[0])
const filteredScopes = computed(() => {
  const query = scopeQuery.value.trim().toLowerCase()
  return query ? allScopes.value.filter((scope) => `${scope.screenCode} ${scope.screenTitle} ${scope.stateLabel}`.toLowerCase().includes(query)) : allScopes.value
})
const groupedScopes = computed(() => {
  const groups = new Map<string, { screenId: string; code: string; title: string; scopes: TestCaseScope[] }>()
  filteredScopes.value.forEach((scope) => {
    const group = groups.get(scope.screenId) ?? { screenId: scope.screenId, code: scope.screenCode, title: scope.screenTitle, scopes: [] }
    group.scopes.push(scope)
    groups.set(scope.screenId, group)
  })
  return [...groups.values()]
})
const visibleCases = computed(() => {
  const base = rangeMode.value === 'all' ? testCases.value : testCases.value.filter((item) => testCaseScopeId(item.screenId, item.stateId) === selectedScopeId.value)
  const query = caseQuery.value.trim().toLowerCase()
  if (!query) return base
  return base.filter((item) => [item.module, item.testItem, item.testPoint, item.preconditions, item.steps.join(' '), item.expectedResult, item.actualResult].join(' ').toLowerCase().includes(query))
})
const isDirty = computed(() => editorVisible.value && JSON.stringify(draft) !== initialDraftJson.value)
const sourceLabel = computed(() => {
  const source = sourceState.value.source === 'gitee' ? 'Gitee' : sourceState.value.source === 'local-cache' ? '本地缓存' : 'JSON 种子'
  const status = sourceState.value.status === 'syncing' ? '同步中' : sourceState.value.status === 'conflict' ? '冲突' : sourceState.value.status === 'error' ? '失败' : sourceState.value.source === 'local-cache' ? '待同步' : '已就绪'
  return `${source} · ${status}`
})

function resetDraft(value: TestCaseDraft) {
  Object.assign(draft, value)
  initialDraftJson.value = JSON.stringify(draft)
}

function confirmDiscard() {
  return !isDirty.value || window.confirm('当前测试用例有未保存修改，确定放弃吗？')
}

async function chooseScope(scope: TestCaseScope) {
  if (!confirmDiscard()) return
  closeEditor(false)
  rangeMode.value = 'current'
  await selectTestCaseScope(scope.screenId, scope.stateId)
  mobileView.value = 'cases'
}

function openCreate() {
  editingCaseId.value = ''
  resetDraft(emptyTestCaseDraft(currentScope.value?.screenTitle ?? ''))
  editorVisible.value = true
}

function openEdit(item: PrototypeTestCase) {
  editingCaseId.value = item.id
  resetDraft({
    module: item.module,
    testItem: item.testItem,
    testPoint: item.testPoint,
    preconditions: item.preconditions,
    steps: [...item.steps],
    expectedResult: item.expectedResult,
    actualResult: item.actualResult,
  })
  editorVisible.value = true
}

function closeEditor(check = true) {
  if (check && !confirmDiscard()) return
  editorVisible.value = false
  editingCaseId.value = ''
  resetDraft(emptyTestCaseDraft())
}

function moveStep(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= draft.steps.length) return
  const next = [...draft.steps]
  ;[next[index], next[target]] = [next[target], next[index]]
  draft.steps = next
}

async function submit() {
  notice.value = validateTestCaseDraft(draft)
  if (notice.value || !currentScope.value) return
  const existing = testCases.value.find((item) => item.id === editingCaseId.value)
  const now = new Date().toISOString()
  const target: PrototypeTestCase = {
    id: existing?.id ?? (crypto.randomUUID?.() ?? `test-case-${Date.now()}`),
    screenId: currentScope.value.screenId,
    stateId: currentScope.value.stateId,
    module: draft.module.trim(),
    testItem: draft.testItem.trim(),
    testPoint: draft.testPoint.trim(),
    preconditions: draft.preconditions.trim() || '无',
    steps: draft.steps.map((step) => step.trim()).filter(Boolean),
    expectedResult: draft.expectedResult.trim(),
    actualResult: draft.actualResult.trim() || '未执行',
    authorName: props.authorName.trim() || '未署名',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const success = await saveTestCase(existing ? '编辑' : '新增', target)
  notice.value = success ? (sourceState.value.source === 'local-cache' ? '已保存到本地缓存，尚未同步 Gitee' : '测试用例已保存') : (sourceState.value.message ?? '保存失败')
  if (success) closeEditor(false)
}

async function remove(item: PrototypeTestCase) {
  if (!window.confirm(`确定删除测试用例“${item.testItem}”吗？`)) return
  const success = await saveTestCase('删除', { ...item, authorName: props.authorName.trim() || item.authorName || '未署名', updatedAt: new Date().toISOString() })
  notice.value = success ? '测试用例已删除' : (sourceState.value.message ?? '删除失败')
  if (success && editingCaseId.value === item.id) closeEditor(false)
}

async function showAll() {
  if (!confirmDiscard()) return
  closeEditor(false)
  exporting.value = true
  notice.value = ''
  try {
    await loadAllTestCasesForExport()
    rangeMode.value = 'all'
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '加载全部测试用例失败'
  } finally {
    exporting.value = false
  }
}

async function exportAll(format: 'json' | 'excel') {
  exporting.value = true
  notice.value = ''
  try {
    const all = await loadAllTestCasesForExport()
    if (format === 'json') exportTestCasesJson(all)
    else await exportTestCasesExcel(all, scopes(props.lang))
    notice.value = format === 'json' ? 'JSON 导出成功' : 'Excel 导出成功'
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '整体导出失败'
  } finally {
    exporting.value = false
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch(isDirty, (value) => setTestCaseEditing(value), { immediate: true })
watch(allScopes, (options) => {
  if (options.length && !options.some((scope) => scope.id === selectedScopeId.value)) selectedScopeId.value = options[0].id
}, { immediate: true })
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  await initializeTestCases(props.authorName.trim() || '初始化工具')
  const requestedScopeId = testCaseScopeId(props.currentScreenId, props.currentStateId)
  const targetScope = scopes(props.lang).find((scope) => scope.id === requestedScopeId) ?? scopes(props.lang)[0]
  if (targetScope) await selectTestCaseScope(targetScope.screenId, targetScope.stateId)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  setTestCaseEditing(false)
})
</script>

<template>
  <section class="test-case-workbench">
    <header class="test-case-toolbar">
      <div class="test-case-title-block">
        <button class="test-case-back" type="button" @click="confirmDiscard() && emit('close')"><ArrowLeft />{{ copy.back }}</button>
        <div><h1>{{ copy.title }}</h1><p>{{ copy.subtitle }}</p></div>
      </div>
      <div class="test-case-toolbar-actions">
        <button type="button" :disabled="exporting" @click="refreshTestCases(false)"><RefreshCw />{{ copy.refresh }}</button>
        <button type="button" :disabled="exporting" @click="exportAll('json')"><FileJson />{{ copy.json }}</button>
        <button class="is-primary" type="button" :disabled="exporting" @click="exportAll('excel')"><FileSpreadsheet />{{ copy.excel }}</button>
      </div>
    </header>

    <div class="test-case-grid" :class="[{ 'has-editor': editorVisible }, `mobile-${mobileView}`]">
      <aside class="test-case-scope-panel">
        <label class="test-case-search"><Search /><input v-model="scopeQuery" type="search" :placeholder="copy.searchScope" /></label>
        <div class="test-case-scope-list">
          <section v-for="group in groupedScopes" :key="group.screenId">
            <div class="test-case-screen-label"><b>{{ group.code }}</b><span>{{ group.title }}</span></div>
            <button
              v-for="scope in group.scopes"
              :key="scope.id"
              type="button"
              :class="{ active: scope.id === selectedScopeId, unknown: !scope.known }"
              @click="chooseScope(scope)"
            >
              <span>{{ scope.stateLabel }}</span>
              <small>{{ testCaseManifest?.scopes?.[scope.id]?.count ?? testCases.filter((item) => testCaseScopeId(item.screenId, item.stateId) === scope.id).length }}</small>
            </button>
          </section>
        </div>
      </aside>

      <main class="test-case-list-panel">
        <button class="test-case-mobile-scope-back" type="button" @click="mobileView = 'scopes'"><ArrowLeft />页面与状态</button>
        <div class="test-case-list-head">
          <div>
            <p>{{ currentScope?.screenCode }} · {{ currentScope?.screenTitle }}</p>
            <h2>{{ rangeMode === 'all' ? copy.all : currentScope?.stateLabel }}</h2>
          </div>
          <button class="is-primary" type="button" @click="openCreate"><Plus />{{ copy.add }}</button>
        </div>
        <div class="test-case-filter-row">
          <div class="test-case-range-switch">
            <button type="button" :class="{ active: rangeMode === 'current' }" @click="rangeMode = 'current'">{{ copy.current }}</button>
            <button type="button" :class="{ active: rangeMode === 'all' }" :disabled="exporting" @click="showAll">{{ copy.all }}</button>
          </div>
          <label class="test-case-search"><Search /><input v-model="caseQuery" type="search" :placeholder="copy.searchCase" /></label>
        </div>
        <p class="test-case-source" :class="`is-${sourceState.status}`">{{ sourceLabel }}<span v-if="sourceState.message"> · {{ sourceState.message }}</span></p>
        <p v-if="notice" class="test-case-notice">{{ notice }}</p>
        <div class="test-case-table-wrap">
          <table class="test-case-table">
            <thead><tr><th>{{ copy.module }}</th><th>{{ copy.item }}</th><th>{{ copy.point }}</th><th>{{ copy.preconditions }}</th><th>{{ copy.steps }}</th><th>{{ copy.expected }}</th><th>{{ copy.actual }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="item in visibleCases" :key="item.id" @click="openEdit(item)">
                <td><b>{{ item.module }}</b><small v-if="rangeMode === 'all'">{{ scopes(lang).find((scope) => scope.id === testCaseScopeId(item.screenId, item.stateId))?.stateLabel }}</small></td>
                <td>{{ item.testItem }}</td><td>{{ item.testPoint }}</td><td>{{ item.preconditions }}</td>
                <td><ol><li v-for="(step, stepIndex) in item.steps" :key="stepIndex">{{ step }}</li></ol></td>
                <td>{{ item.expectedResult }}</td><td>{{ item.actualResult }}</td>
                <td><button type="button" :aria-label="copy.delete" @click.stop="remove(item)"><Trash2 /></button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!visibleCases.length" class="test-case-empty"><span>✓</span><p>{{ copy.empty }}</p></div>
        </div>
      </main>

      <aside v-if="editorVisible" class="test-case-editor">
        <header><div><small>{{ currentScope?.screenCode }} · {{ currentScope?.stateLabel }}</small><h2>{{ editingCaseId ? copy.edit : copy.create }}</h2></div><button type="button" :aria-label="copy.close" @click="closeEditor()"><X /></button></header>
        <div class="test-case-editor-body">
          <label><span>{{ copy.author }}</span><input :value="authorName" type="text" @input="emit('update:authorName', ($event.target as HTMLInputElement).value)" /></label>
          <label><span>{{ copy.module }} *</span><input v-model="draft.module" type="text" /></label>
          <label><span>{{ copy.item }} *</span><input v-model="draft.testItem" type="text" /></label>
          <label><span>{{ copy.point }} *</span><textarea v-model="draft.testPoint" rows="3" /></label>
          <label><span>{{ copy.preconditions }}</span><textarea v-model="draft.preconditions" rows="3" /></label>
          <fieldset><legend>{{ copy.steps }} *</legend>
            <div v-for="(step, index) in draft.steps" :key="index" class="test-case-step">
              <b>{{ index + 1 }}</b><textarea v-model="draft.steps[index]" rows="2" />
              <div><button type="button" :aria-label="copy.moveUp" :disabled="index === 0" @click="moveStep(index, -1)"><ArrowUp /></button><button type="button" :aria-label="copy.moveDown" :disabled="index === draft.steps.length - 1" @click="moveStep(index, 1)"><ArrowDown /></button><button type="button" :aria-label="copy.removeStep" :disabled="draft.steps.length === 1" @click="draft.steps.splice(index, 1)"><X /></button></div>
            </div>
            <button class="test-case-add-step" type="button" @click="draft.steps.push('')"><Plus />{{ copy.addStep }}</button>
          </fieldset>
          <label><span>{{ copy.expected }} *</span><textarea v-model="draft.expectedResult" rows="4" /></label>
          <label><span>{{ copy.actual }}</span><textarea v-model="draft.actualResult" rows="3" /></label>
        </div>
        <footer><button type="button" @click="closeEditor()">{{ copy.cancel }}</button><button class="is-primary" type="button" :disabled="sourceState.status === 'syncing'" @click="submit">{{ copy.save }}</button></footer>
      </aside>
    </div>
  </section>
</template>
