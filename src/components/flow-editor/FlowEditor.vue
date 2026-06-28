<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { MainFlow, ScreenMeta, FlowNode, ScreenId, DisplayScreen, PrototypeStateId, PrototypeStateOption, ScreenPlatform } from '../../types/prototype'
import { X, Plus, Trash2, ChevronDown, ChevronRight, Download, Save, CloudUpload } from '@lucide/vue'
import ScreenRenderer from '../../screens/ScreenRenderer.vue'

const props = defineProps<{
  flows: MainFlow[]
  screens: ScreenMeta[]
  stateOptionsByScreen: (screenId: ScreenId) => PrototypeStateOption[]
  canPushRemote: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', flows: MainFlow[], done: (success: boolean) => void): void
  (e: 'push', flows: MainFlow[], done: (success: boolean) => void): void
  (e: 'export', flows: MainFlow[]): void
}>()

// 深拷贝一份可编辑数据
const editableFlows = ref<MainFlow[]>(JSON.parse(JSON.stringify(props.flows)))

watch(() => props.flows, (next) => {
  editableFlows.value = JSON.parse(JSON.stringify(next))
}, { deep: true })

// 当前选中的主流程和子流程索引
const selectedFlowIndex = ref(0)
const selectedRowIndex = ref(0)

const selectedFlow = computed(() => editableFlows.value[selectedFlowIndex.value])
const selectedRow = computed(() => selectedFlow.value?.rows[selectedRowIndex.value] ?? [])

// 缩略图缩放
const thumbZoom = ref(0.28)
const minThumbZoom = 0.18
const maxThumbZoom = 0.38

const MOBILE_THUMB_WIDTH = 393
const MOBILE_THUMB_HEIGHT = 852
const PC_THUMB_WIDTH = 640
const PC_THUMB_HEIGHT = 360
const PC_BASE_WIDTH = 1920

function thumbScale(platform: ScreenPlatform) {
  return platform === 'pc' ? thumbZoom.value * PC_THUMB_WIDTH / PC_BASE_WIDTH : thumbZoom.value
}

function thumbFrameSize(platform: ScreenPlatform) {
  const w = platform === 'pc' ? PC_THUMB_WIDTH : MOBILE_THUMB_WIDTH
  const h = platform === 'pc' ? PC_THUMB_HEIGHT : MOBILE_THUMB_HEIGHT
  return {
    width: `${Math.ceil(w * thumbZoom.value) + 2}px`,
    height: `${Math.ceil(h * thumbZoom.value) + 2}px`,
  }
}

const thumbCardWidthMobile = computed(() => Math.ceil(MOBILE_THUMB_WIDTH * thumbZoom.value) + 16)
const thumbCardWidthPc = computed(() => Math.ceil(PC_THUMB_WIDTH * thumbZoom.value) + 16)

const pcPaletteDisplayZoom = computed(() => thumbZoom.value * 0.55)
const pcPaletteZoom = computed(() => pcPaletteDisplayZoom.value * PC_THUMB_WIDTH / PC_BASE_WIDTH)
const pcPaletteThumbFrameSize = computed(() => ({
  width: `${Math.ceil(PC_THUMB_WIDTH * pcPaletteDisplayZoom.value) + 2}px`,
  height: `${Math.ceil(PC_THUMB_HEIGHT * pcPaletteDisplayZoom.value) + 2}px`,
}))

// 展开状态的主流程
const expandedFlows = ref<Set<number>>(new Set([0]))

function toggleFlow(index: number) {
  if (expandedFlows.value.has(index)) {
    expandedFlows.value.delete(index)
  } else {
    expandedFlows.value.add(index)
  }
}

function selectRow(flowIndex: number, rowIndex: number) {
  selectedFlowIndex.value = flowIndex
  selectedRowIndex.value = rowIndex
}

// 获取页面信息
function getScreen(screenId: string): ScreenMeta | undefined {
  return props.screens.find(s => s.id === screenId)
}

// ===== 主流程操作 =====
function addFlow() {
  const id = `flow-${Date.now()}`
  editableFlows.value.push({
    id,
    title: '新流程',
    subtitle: '',
    rows: [[]],
  })
  const newIndex = editableFlows.value.length - 1
  expandedFlows.value.add(newIndex)
  selectRow(newIndex, 0)
}

function deleteFlow(index: number) {
  if (editableFlows.value.length <= 1) return
  editableFlows.value.splice(index, 1)
  if (selectedFlowIndex.value >= editableFlows.value.length) {
    selectedFlowIndex.value = editableFlows.value.length - 1
  }
  if (selectedRowIndex.value >= (selectedFlow.value?.rows.length ?? 0)) {
    selectedRowIndex.value = Math.max(0, (selectedFlow.value?.rows.length ?? 1) - 1)
  }
}

function updateFlowTitle(index: number, title: string) {
  editableFlows.value[index].title = title
}

// ===== 子流程操作 =====
function addRow(flowIndex: number) {
  editableFlows.value[flowIndex].rows.push([])
  selectRow(flowIndex, editableFlows.value[flowIndex].rows.length - 1)
}

function deleteRow(flowIndex: number, rowIndex: number) {
  const flow = editableFlows.value[flowIndex]
  if (flow.rows.length <= 1) return
  flow.rows.splice(rowIndex, 1)
  if (selectedRowIndex.value >= flow.rows.length) {
    selectedRowIndex.value = Math.max(0, flow.rows.length - 1)
  }
}

function getRowLabel(flow: MainFlow | undefined, rowIndex: number): string {
  if (!flow) return '尚未选择流程'
  const firstNode = flow.rows[rowIndex][0]
  return firstNode?.rowLabel ?? `子流程 ${rowIndex + 1}`
}

function updateRowLabel(rowIndex: number, label: string) {
  const flow = editableFlows.value[selectedFlowIndex.value]
  if (!flow) return
  const row = flow.rows[rowIndex]
  if (!row) return
  if (row.length > 0) {
    row[0].rowLabel = label
  } else {
    row.push({ screenId: '', rowLabel: label })
  }
}

interface ScreenPaletteItem {
  key: string
  screen: ScreenMeta
  stateId?: PrototypeStateId
  stateLabel?: string
}

const screenPaletteItems = computed<ScreenPaletteItem[]>(() =>
  props.screens.flatMap<ScreenPaletteItem>((screen) => {
    const options = props.stateOptionsByScreen(screen.id)
    if (!options.length) return [{ key: screen.id, screen, stateId: undefined, stateLabel: undefined }]
    return options.map((option) => ({
      key: `${screen.id}__${option.id}`,
      screen,
      stateId: option.id,
      stateLabel: option.label,
    }))
  }),
)

const mobilePaletteItems = computed(() => screenPaletteItems.value.filter((item) => item.screen.platform === 'mobile'))
const pcPaletteItems = computed(() => screenPaletteItems.value.filter((item) => item.screen.platform === 'pc'))

function nodePlatform(node: FlowNode): ScreenPlatform {
  return getScreen(node.screenId)?.platform ?? 'mobile'
}

function asPaletteDisplayScreen(item: ScreenPaletteItem): DisplayScreen {
  return {
    ...item.screen,
    stateId: item.stateId,
    stateLabel: item.stateLabel,
  }
}

function asNodeDisplayScreen(node: FlowNode): DisplayScreen {
  const screen = getScreen(node.screenId) ?? props.screens[0]
  const stateLabel = node.stateId ? props.stateOptionsByScreen(screen.id).find((item) => item.id === node.stateId)?.label : undefined
  return {
    ...screen,
    stateId: node.stateId,
    stateLabel,
  }
}

function addEmptyRowToSelectedFlow() {
  const flow = editableFlows.value[selectedFlowIndex.value]
  if (!flow) return
  flow.rows.push([])
  selectedRowIndex.value = flow.rows.length - 1
}

function getSelectedEditableRow() {
  return editableFlows.value[selectedFlowIndex.value]?.rows[selectedRowIndex.value]
}

// ===== 拖拽逻辑 =====
const dragFrom = ref<{ type: 'palette' | 'sort'; screenId?: string; stateId?: PrototypeStateId; fromIndex?: number; fromRowIndex?: number } | null>(null)
const dragOverIndex = ref<number>(-1)
const dragOverPosition = ref<'before' | 'after'>('before')
const draggingCardIndex = ref<number>(-1)
const draggingPaletteId = ref<string | null>(null)

const insertLineIndex = computed(() => {
  if (!dragFrom.value || dragOverIndex.value < 0) return -1
  if (dragOverPosition.value === 'before') return dragOverIndex.value
  return dragOverIndex.value + 1
})

function onPaletteDragStart(e: DragEvent, item: ScreenPaletteItem) {
  if (!e.dataTransfer) return
  dragFrom.value = { type: 'palette', screenId: item.screen.id, stateId: item.stateId }
  draggingPaletteId.value = item.key
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'palette', screenId: item.screen.id, stateId: item.stateId }))
}

function onCardDragStart(e: DragEvent, fromIndex: number) {
  if (!e.dataTransfer) return
  dragFrom.value = { type: 'sort', fromIndex, fromRowIndex: selectedRowIndex.value }
  draggingCardIndex.value = fromIndex
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'sort', fromIndex }))
}

function onDragEnd() {
  dragOverIndex.value = -1
  dragFrom.value = null
  draggingCardIndex.value = -1
  draggingPaletteId.value = null
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  dragOverPosition.value = e.clientX < centerX ? 'before' : 'after'
  dragOverIndex.value = index
}

function onDrop(e: DragEvent, dropIndex: number) {
  e.preventDefault()
  e.stopPropagation()
  const position = dragOverPosition.value
  dragOverIndex.value = -1
  dragFrom.value = null
  draggingCardIndex.value = -1
  draggingPaletteId.value = null

  const dataStr = e.dataTransfer?.getData('text/plain')
  if (!dataStr) return

  let data: { type: string; screenId?: string; stateId?: PrototypeStateId; fromIndex?: number }
  try {
    data = JSON.parse(dataStr)
  } catch {
    return
  }

  const row = getSelectedEditableRow()
  if (!row) return
  const insertIndex = position === 'before' ? dropIndex : dropIndex + 1

  if (data.type === 'palette' && data.screenId) {
    const node: FlowNode = { screenId: data.screenId as ScreenId, stateId: data.stateId }
    row.splice(insertIndex, 0, node)
  } else if (data.type === 'sort' && typeof data.fromIndex === 'number') {
    const fromIdx = data.fromIndex
    if (fromIdx === insertIndex) return
    const [removed] = row.splice(fromIdx, 1)
    const adjustedIndex = fromIdx < insertIndex ? insertIndex - 1 : insertIndex
    row.splice(adjustedIndex, 0, removed)
  }
}

function onCanvasDrop(e: DragEvent) {
  e.preventDefault()
  dragOverIndex.value = -1
  dragFrom.value = null
  draggingCardIndex.value = -1
  draggingPaletteId.value = null
  const dataStr = e.dataTransfer?.getData('text/plain')
  if (!dataStr) return

  let data: { type: string; screenId?: string; stateId?: PrototypeStateId }
  try {
    data = JSON.parse(dataStr)
  } catch {
    return
  }

  if (data.type === 'palette' && data.screenId) {
    const row = getSelectedEditableRow()
    if (!row) return
    row.push({ screenId: data.screenId as ScreenId, stateId: data.stateId })
  }
}

function removeCard(rowIndex: number, cardIndex: number) {
  editableFlows.value[selectedFlowIndex.value]?.rows[rowIndex]?.splice(cardIndex, 1)
}

// ===== 提示 =====
const notice = ref<{ message: string; type: 'success' | 'error' } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(message: string, type: 'success' | 'error') {
  notice.value = { message, type }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = null }, 2500)
}

// ===== 保存与导出 =====
const savingToSession = ref(false)
const pushingToRemote = ref(false)

function handleSave() {
  if (savingToSession.value) return
  savingToSession.value = true
  emit('save', JSON.parse(JSON.stringify(editableFlows.value)), (success) => {
    savingToSession.value = false
    showNotice(success ? '保存成功，流程模式已更新' : '保存失败，已保留当前编辑', success ? 'success' : 'error')
  })
}

function handlePush() {
  if (pushingToRemote.value || !props.canPushRemote) return
  pushingToRemote.value = true
  emit('push', JSON.parse(JSON.stringify(editableFlows.value)), (success) => {
    pushingToRemote.value = false
    showNotice(success ? '已推送到 Gitee，流程模式已更新' : '推送失败，本地编辑已保留', success ? 'success' : 'error')
  })
}

function handleExport() {
  try {
    emit('export', JSON.parse(JSON.stringify(editableFlows.value)))
    showNotice('导出成功，JSON 文件已下载', 'success')
  } catch {
    showNotice('导出失败，请重试', 'error')
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[200] bg-canvas flex flex-col">
    <!-- 顶部工具栏 -->
    <header class="flex items-center justify-between px-6 py-3 border-b border-line bg-panel relative">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold text-ink">流程编排</h2>
        <span class="text-xs text-muted">
          {{ selectedFlow?.title }} · 子流程 {{ selectedRowIndex + 1 }} / {{ selectedFlow?.rows.length }}
        </span>
      </div>
      <!-- 提示 Toast -->
      <Transition name="toast">
        <div
          v-if="notice"
          class="absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium shadow-lg z-50"
          :class="notice.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'"
        >
          {{ notice.message }}
        </div>
      </Transition>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-lg bg-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          :disabled="savingToSession"
          @click="handleSave"
        >
          <Save class="h-4 w-4" />
          {{ savingToSession ? '保存中…' : '保存到当前会话' }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ocean disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="pushingToRemote || !canPushRemote"
          :title="canPushRemote ? '推送到当前代码分支的 Gitee 流程文件' : 'Gitee 未配置或当前代码分支不可识别'"
          @click="handlePush"
        >
          <CloudUpload class="h-4 w-4" />
          {{ pushingToRemote ? '推送中…' : '推送到 Gitee' }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-ocean px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition"
          @click="handleExport"
        >
          <Download class="h-4 w-4" />
          导出 JSON
        </button>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-full bg-soft text-ink hover:bg-canvas transition"
          @click="handleClose"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- 主体：左中右 -->
    <div class="grid grid-cols-[1fr_3fr_1fr] flex-1 overflow-hidden">
      <!-- 左侧：流程导航 -->
      <aside class="min-w-[200px] border-r border-line bg-panel flex flex-col overflow-hidden">
        <div class="p-4 border-b border-line">
          <button
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-ocean py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
            @click="addFlow"
          >
            <Plus class="h-4 w-4" />
            新建主流程
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div
            v-for="(flow, flowIdx) in editableFlows"
            :key="flow.id"
            class="rounded-xl border border-line bg-soft overflow-hidden"
            :class="{ 'ring-1 ring-ocean': selectedFlowIndex === flowIdx }"
          >
            <!-- 主流程标题行 -->
            <div
              class="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-canvas transition"
              @click="toggleFlow(flowIdx)"
            >
              <component :is="expandedFlows.has(flowIdx) ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted" />
              <input
                :value="flow.title"
                class="flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none"
                @click.stop
                @input="updateFlowTitle(flowIdx, ($event.target as HTMLInputElement).value)"
              />
              <button
                class="text-muted hover:text-danger transition"
                title="删除主流程"
                @click.stop="deleteFlow(flowIdx)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <!-- 子流程列表 -->
            <div v-if="expandedFlows.has(flowIdx)" class="border-t border-line">
              <div
                v-for="(row, rowIdx) in flow.rows"
                :key="rowIdx"
                class="group/row flex items-center gap-2 py-2 text-xs cursor-pointer hover:bg-canvas transition"
                :class="[
                  selectedFlowIndex === flowIdx && selectedRowIndex === rowIdx
                    ? 'pl-[9px] pr-3 bg-ocean/5 border-l-[3px] border-ocean'
                    : 'px-3',
                ]"
                @click="selectRow(flowIdx, rowIdx)"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="selectedFlowIndex === flowIdx && selectedRowIndex === rowIdx ? 'bg-ocean' : 'bg-muted'"
                />
                <span
                  class="flex-1 min-w-0 truncate"
                  :class="selectedFlowIndex === flowIdx && selectedRowIndex === rowIdx ? 'text-ink font-medium' : 'text-muted'"
                >{{ getRowLabel(flow, rowIdx) }}</span>
                <span
                  class=""
                  :class="selectedFlowIndex === flowIdx && selectedRowIndex === rowIdx ? 'text-ocean' : 'text-muted/60'"
                >{{ row.length }} 页</span>
                <button
                  class="text-muted hover:text-danger transition opacity-0 group-hover/row:opacity-100"
                  title="删除子流程"
                  @click.stop="deleteRow(flowIdx, rowIdx)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
              <button
                class="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-ocean hover:bg-canvas transition"
                @click="addRow(flowIdx)"
              >
                <Plus class="h-3 w-3" />
                添加子流程
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中间：画布编辑区 -->
      <section class="flex-1 flex flex-col bg-canvas min-w-0">
        <!-- 画布头部 -->
        <div class="flex items-center justify-between px-6 py-3 border-b border-line bg-panel">
          <div class="flex items-center gap-3">
            <span class="text-sm text-muted">当前子流程名称</span>
            <input
              :value="getRowLabel(selectedFlow, selectedRowIndex)"
              class="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink outline-none focus:border-ocean"
              placeholder="输入子流程名称..."
              @input="updateRowLabel(selectedRowIndex, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">缩略图</span>
              <input
                v-model.number="thumbZoom"
                type="range"
                :min="minThumbZoom"
                :max="maxThumbZoom"
                step="0.01"
                class="w-20 h-1 accent-ocean cursor-pointer"
                aria-label="缩略图缩放"
              />
              <span class="text-xs text-muted w-8 text-right">{{ Math.round(thumbZoom * 100) }}%</span>
            </div>
            <button
              v-if="selectedFlow"
              class="flex items-center gap-1.5 rounded-lg bg-soft px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas transition"
              @click="addEmptyRowToSelectedFlow"
            >
              <Plus class="h-3.5 w-3.5" />
              新增空行
            </button>
          </div>
        </div>
        <!-- 画布主体 -->
        <div
          class="flex-1 overflow-y-auto p-6"
          @dragover.prevent
          @drop="onCanvasDrop"
        >
          <div class="flex flex-wrap gap-4 content-start min-h-full">
            <template v-if="selectedRow.length > 0">
              <div
                v-for="(node, cardIdx) in selectedRow"
                :key="`${node.screenId}-${cardIdx}`"
                class="group relative flex flex-col items-center gap-2"
                :style="{ width: `${nodePlatform(node) === 'pc' ? thumbCardWidthPc : thumbCardWidthMobile}px` }"
                :class="{
                  'opacity-40 scale-[0.96]': draggingCardIndex === cardIdx,
                  'transition-all duration-150': true,
                }"
                draggable="true"
                @dragstart="onCardDragStart($event, cardIdx)"
                @dragend="onDragEnd"
                @dragover.prevent="onDragOver($event, cardIdx)"
                @drop="onDrop($event, cardIdx)"
              >
                <!-- 插入指示线：当前卡片之前 -->
                <div
                  v-if="insertLineIndex === cardIdx"
                  class="absolute -left-2 top-1/2 -translate-y-1/2 h-[72%] w-[3px] rounded-full bg-ocean pointer-events-none z-20"
                  style="box-shadow: 0 0 10px rgb(var(--color-ocean)), 0 0 4px rgb(var(--color-ocean));"
                />
                <!-- 插入指示线：最后一个卡片之后 -->
                <div
                  v-if="cardIdx === selectedRow.length - 1 && insertLineIndex === selectedRow.length"
                  class="absolute -right-2 top-1/2 -translate-y-1/2 h-[72%] w-[3px] rounded-full bg-ocean pointer-events-none z-20"
                  style="box-shadow: 0 0 10px rgb(var(--color-ocean)), 0 0 4px rgb(var(--color-ocean));"
                />
                <!-- 页面缩略图 -->
                <div class="relative cursor-grab active:cursor-grabbing">
                  <div class="thumb-frame" :class="{ 'pc-thumb-frame': nodePlatform(node) === 'pc' }" :style="thumbFrameSize(nodePlatform(node))">
                    <div class="thumb-scale" :style="{ transform: `scale(${thumbScale(nodePlatform(node))})` }">
                      <div v-if="nodePlatform(node) === 'pc'" class="desktop-frame-thumb">
                        <div class="desktop-screen-content-thumb">
                          <ScreenRenderer
                            v-if="node.screenId"
                            :screen="asNodeDisplayScreen(node)"
                          />
                        </div>
                      </div>
                      <div v-else class="phone-screen" style="width: 393px; height: 852px;">
                        <div class="status-bar">
                          <span>9:41</span>
                          <span class="flex items-center gap-1">
                            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2.5 3 5.5 4 9 1-3.5 4-6.5 4-9a4 4 0 0 0-4-4Z"/><circle cx="12" cy="6" r="1.5"/></svg>
                            86%
                          </span>
                        </div>
                        <div class="screen-content" style="height: 100%; overflow: hidden; padding-bottom: 20px;">
                          <ScreenRenderer
                            v-if="node.screenId"
                            :screen="asNodeDisplayScreen(node)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    class="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-sm transition hover:scale-110"
                    @click="removeCard(selectedRowIndex, cardIdx)"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
                <!-- 页面名称 -->
                <div class="flex items-center justify-center gap-1 max-w-full">
                  <span
                    class="platform-badge is-small"
                    :class="nodePlatform(node) === 'pc' ? 'is-pc' : 'is-mobile'"
                  >{{ nodePlatform(node) === 'pc' ? 'P' : 'M' }}</span>
                  <span class="text-center text-[11px] text-ink leading-tight truncate">
                    {{ getScreen(node.screenId)?.title ?? node.screenId }}
                  </span>
                </div>
                <span class="text-center text-[10px] text-muted">
                  {{ getScreen(node.screenId)?.code ?? '' }}<template v-if="node.stateId"> · {{ asNodeDisplayScreen(node).stateLabel }}</template>
                </span>
              </div>
            </template>
            <!-- 空状态 -->
            <div v-else class="flex flex-col items-center justify-center w-full h-48 text-muted relative">
              <div v-if="dragFrom" class="absolute inset-x-6 top-0 h-[3px] rounded-full bg-ocean pointer-events-none z-20" style="box-shadow: 0 0 10px rgb(var(--color-ocean)), 0 0 4px rgb(var(--color-ocean));" />
              <div class="h-16 w-16 rounded-full border-2 border-dashed border-line flex items-center justify-center mb-3">
                <Plus class="h-6 w-6" />
              </div>
              <p class="text-sm">从右侧拖拽页面到此处</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 右侧：页面卡片池 -->
      <aside class="min-w-[200px] border-l border-line bg-panel flex flex-col overflow-hidden">
        <div class="p-4 border-b border-line">
          <h3 class="text-sm font-semibold text-ink">状态库</h3>
          <p class="text-xs text-muted mt-1">拖拽页面状态到中间画布</p>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
          <!-- 移动端状态库 -->
          <div v-if="mobilePaletteItems.length">
            <p class="mb-2 text-xs font-semibold text-muted">移动端</p>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="item in mobilePaletteItems"
                :key="item.key"
                class="group flex flex-col gap-1 p-2 rounded-xl border border-line bg-soft hover:border-ocean hover:shadow-sm transition cursor-grab active:cursor-grabbing"
                :class="{
                  'opacity-40 ring-2 ring-ocean/40': draggingPaletteId === item.key,
                }"
                draggable="true"
                @dragstart="onPaletteDragStart($event, item)"
                @dragend="onDragEnd"
              >
                <div class="thumb-frame" :style="thumbFrameSize('mobile')">
                  <div class="thumb-scale" :style="{ transform: `scale(${thumbZoom})` }">
                    <div class="phone-screen" style="width: 393px; height: 852px;">
                      <div class="status-bar">
                        <span>9:41</span>
                        <span class="flex items-center gap-1">
                          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2.5 3 5.5 4 9 1-3.5 4-6.5 4-9a4 4 0 0 0-4-4Z"/><circle cx="12" cy="6" r="1.5"/></svg>
                          86%
                        </span>
                      </div>
                      <div class="screen-content" style="height: 100%; overflow: hidden; padding-bottom: 20px;">
                        <ScreenRenderer :screen="asPaletteDisplayScreen(item)" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1 px-0.5">
                  <span class="platform-badge is-small is-mobile">M</span>
                  <span class="text-[10px] font-mono text-muted">{{ item.screen.code }}</span>
                  <span class="text-[10px] text-ink leading-tight truncate">{{ item.screen.title }}</span>
                </div>
                <span v-if="item.stateLabel" class="px-0.5 text-[10px] leading-tight text-ocean truncate">{{ item.stateLabel }}</span>
              </div>
            </div>
          </div>

          <!-- PC 端状态库 -->
          <div v-if="pcPaletteItems.length">
            <p class="mb-2 text-xs font-semibold text-muted">PC 端</p>
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="item in pcPaletteItems"
                :key="item.key"
                class="group flex flex-col gap-1 p-2 rounded-xl border border-line bg-soft hover:border-ocean hover:shadow-sm transition cursor-grab active:cursor-grabbing"
                :class="{
                  'opacity-40 ring-2 ring-ocean/40': draggingPaletteId === item.key,
                }"
                draggable="true"
                @dragstart="onPaletteDragStart($event, item)"
                @dragend="onDragEnd"
              >
                <div class="thumb-frame pc-thumb-frame" :style="pcPaletteThumbFrameSize">
                  <div class="thumb-scale" :style="{ transform: `scale(${pcPaletteZoom})` }">
                    <div class="desktop-frame-thumb">
                      <div class="desktop-screen-content-thumb">
                        <ScreenRenderer :screen="asPaletteDisplayScreen(item)" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1 px-0.5">
                  <span class="platform-badge is-small is-pc">P</span>
                  <span class="text-[10px] font-mono text-muted">{{ item.screen.code }}</span>
                  <span class="text-[10px] text-ink leading-tight truncate">{{ item.screen.title }}</span>
                </div>
                <span v-if="item.stateLabel" class="px-0.5 text-[10px] leading-tight text-ocean truncate">{{ item.stateLabel }}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.thumb-frame {
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e0e0e0;
  align-self: center;
}

.thumb-frame.pc-thumb-frame {
  border: 2px solid rgb(var(--color-ink));
  border-radius: 0;
}

.thumb-scale {
  transform-origin: top left;
  display: inline-block;
}

.thumb-frame .phone-screen {
  position: relative;
  overflow: hidden;
  border-radius: 42px;
  border: 10px solid rgb(var(--color-device));
  background: rgb(var(--color-canvas));
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.18);
}

.thumb-frame .status-bar {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 20;
  display: flex;
  height: 44px;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  padding-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--color-ink));
}

.thumb-frame .screen-content {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-left: 20px;
  padding-right: 20px;
  padding-bottom: 20px;
  padding-top: 56px;
}

.thumb-frame .screen-content::-webkit-scrollbar {
  display: none;
}

  .thumb-frame .desktop-frame-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 0;
  border: 3px solid rgb(var(--color-ink));
  background: #fff;
  width: 1920px;
  height: 1080px;
}

.thumb-frame .desktop-screen-content-thumb {
  position: absolute;
  inset: 0;
  overflow: auto;
}

.thumb-frame .desktop-frame-thumb .screen-content {
  padding: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}
</style>
