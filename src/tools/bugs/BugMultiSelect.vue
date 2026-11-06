<script setup lang="ts" generic="T extends string">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { ChevronDown } from '@lucide/vue'

const props = defineProps<{
  label: string
  options: readonly T[]
}>()
const selection = defineModel<T[]>({ required: true })
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const expanded = ref(false)
const panelId = useId()
const summary = computed(() => {
  if (!selection.value.length) return `全部${props.label}`
  if (selection.value.length === 1) return selection.value[0]
  return `${props.label}：已选 ${selection.value.length} 项`
})

function closeAndFocus() {
  expanded.value = false
  trigger.value?.focus()
}

function handleOutsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) expanded.value = false
}

function handleFocusOut(event: FocusEvent) {
  // 点击选项文字或空白时可能先短暂失焦，不能提前卸载 label 并打断默认勾选。
  // 外部点击由 pointerdown 收起；键盘移到其他元素时按实际焦点判断。
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) expanded.value = false
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointer))
</script>

<template>
  <div ref="root" class="bug-multiselect" :class="{ 'is-expanded': expanded }" @focusout="handleFocusOut" @keydown.esc.stop.prevent="closeAndFocus">
    <button
      ref="trigger"
      type="button"
      class="bug-multiselect-trigger"
      :class="{ 'has-selection': selection.length }"
      :aria-label="`${label}筛选：${selection.length ? selection.join('、') : '全部'}`"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      :title="selection.length ? selection.join('、') : `全部${label}`"
      @click="expanded = !expanded"
    >
      <span>{{ summary }}</span>
      <ChevronDown class="h-4 w-4" aria-hidden="true" />
    </button>
    <div v-if="expanded" :id="panelId" class="bug-multiselect-panel" role="group" :aria-label="`${label}多选`">
      <button class="bug-multiselect-clear" type="button" @click="selection = []">
        <span>全部{{ label }}</span>
        <small>清除限制</small>
      </button>
      <div class="bug-multiselect-options">
        <label v-for="option in options" :key="option" class="bug-multiselect-option">
          <input v-model="selection" type="checkbox" :value="option" />
          <span>{{ option }}</span>
        </label>
        <p v-if="!options.length" class="bug-multiselect-empty">暂无可选项</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bug-multiselect {
  position: relative;
  min-width: 0;
}

.bug-multiselect.is-expanded {
  z-index: 30;
}

.bug-multiselect-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-spacing-xs);
  width: 100%;
  min-height: 44px;
  padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
  border: 1px solid rgb(var(--ds-color-hairline));
  border-radius: var(--bug-control-radius);
  corner-shape: var(--bug-corner-shape);
  background: rgb(var(--ds-color-canvas-parchment));
  color: rgb(var(--ds-color-ink));
  font-size: var(--ds-font-caption-size);
  text-align: left;
}

.bug-multiselect-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bug-multiselect-trigger svg {
  flex-shrink: 0;
}

.bug-multiselect-trigger.has-selection {
  color: rgb(var(--ds-color-primary));
}

.bug-multiselect-trigger:focus-visible,
.bug-multiselect-clear:focus-visible,
.bug-multiselect-option:focus-within {
  outline: 2px solid rgb(var(--ds-color-primary-focus));
  outline-offset: 2px;
}

.bug-multiselect-panel {
  position: absolute;
  top: calc(100% + var(--ds-spacing-xs));
  left: 0;
  width: 100%;
  border: 1px solid rgb(var(--ds-color-hairline));
  border-radius: var(--ds-rounded-md);
  corner-shape: var(--bug-corner-shape);
  background: rgb(var(--ds-color-canvas));
  box-shadow: var(--ds-shadow-soft);
  color: rgb(var(--ds-color-ink));
  font-size: var(--ds-font-caption-size);
}

.bug-multiselect-clear {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-spacing-xs);
  width: 100%;
  min-height: 44px;
  padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
  border-bottom: 1px solid rgb(var(--ds-color-hairline));
  border-radius: var(--ds-rounded-md) var(--ds-rounded-md) 0 0;
  corner-shape: var(--bug-corner-shape);
  color: rgb(var(--ds-color-primary));
  text-align: left;
}

.bug-multiselect-clear small,
.bug-multiselect-empty {
  color: rgb(var(--ds-color-ink-muted-48));
  font-size: var(--ds-font-fine-print-size);
}

.bug-multiselect-options {
  max-height: 18rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--ds-spacing-xs);
}

.bug-multiselect-option {
  display: flex;
  align-items: center;
  gap: var(--ds-spacing-xs);
  min-height: 44px;
  padding: var(--ds-spacing-xs);
  border-radius: var(--ds-rounded-xs);
  corner-shape: var(--bug-corner-shape);
  cursor: pointer;
  overflow-wrap: anywhere;
}

.bug-multiselect-option:has(input:checked) {
  background: rgb(var(--ds-color-canvas-parchment));
  color: rgb(var(--ds-color-primary));
}

.bug-multiselect-option input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--ds-color-primary));
}

.bug-multiselect-empty {
  padding: var(--ds-spacing-xs);
}
</style>
