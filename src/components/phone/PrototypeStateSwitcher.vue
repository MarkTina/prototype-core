<script setup lang="ts">
import type { PrototypeStateId, PrototypeStateOption } from '../../types/prototype'

defineProps<{
  title: string
  options: PrototypeStateOption[]
  activeId: PrototypeStateId
  countForState?: (id: PrototypeStateId) => number
  highlightedColors?: Record<string, string>
}>()

const emit = defineEmits<{
  change: [id: PrototypeStateId]
}>()
</script>

<template>
  <aside class="prototype-state-switcher">
    <p>{{ title }}</p>
    <button
      v-for="item in options"
      :key="item.id"
      type="button"
      :class="{ active: activeId === item.id }"
      @click="emit('change', item.id)"
    >
      <span v-if="highlightedColors?.[item.id]" class="prototype-state-highlight-bookmark" :style="{ backgroundColor: highlightedColors[item.id] }" aria-hidden="true" />
      <span v-else />
      {{ item.label }}
      <div class="ml-auto flex items-center gap-2">
        <b v-if="countForState?.(item.id)" class="prototype-state-annotation-count">{{ countForState(item.id) }}</b>
      </div>
    </button>
  </aside>
</template>
