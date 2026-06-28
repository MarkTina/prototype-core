<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'

defineProps<{
  label: string
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button class="mb-2 inline-flex items-center gap-1 text-xs font-normal text-muted transition hover:text-ink active:scale-95" @click="$emit('click')">
    <ArrowLeft class="h-3.5 w-3.5" />
    {{ label }}
  </button>
</template>
