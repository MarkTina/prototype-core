<script setup lang="ts">
import type { PrototypeStateId, PrototypeStateOption } from '../../types/prototype'

defineProps<{
  title: string
  options: PrototypeStateOption[]
  activeId: PrototypeStateId
  countForState?: (id: PrototypeStateId) => number
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
      <span />
      {{ item.label }}
      <b v-if="countForState?.(item.id)" class="prototype-state-annotation-count">{{ countForState(item.id) }}</b>
    </button>
  </aside>
</template>
