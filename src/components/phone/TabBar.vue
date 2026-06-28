<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  active: string
  items: { id: string; label: string; icon: Component }[]
}>()

defineEmits<{
  change: [value: string]
}>()
</script>

<template>
  <div class="tab-bar">
    <button
      v-for="item in items"
      :key="item.id"
      class="flex flex-col items-center gap-1 rounded-full py-2 text-xs font-normal transition active:scale-95"
      :class="active === item.id ? 'bg-soft text-ocean' : 'text-muted'"
      @click="$emit('change', item.id)"
    >
      <component :is="item.icon" class="h-5 w-5" />
      {{ item.label }}
    </button>
  </div>
</template>
