<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayScreen } from '../types/prototype'

const props = defineProps<{
  screen: DisplayScreen
}>()

const activeComponent = computed(() => props.screen.component)
</script>

<template>
  <component :is="activeComponent" :screen="screen" />
</template>
