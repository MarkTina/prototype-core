<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
}>()
</script>

<template>
  <div class="pt-1">
    <p class="text-sm font-normal leading-5 text-muted">{{ subtitle }}</p>
    <h2 class="mt-1 text-[34px] font-semibold leading-[1.18] tracking-normal text-ink">{{ title }}</h2>
  </div>
</template>
