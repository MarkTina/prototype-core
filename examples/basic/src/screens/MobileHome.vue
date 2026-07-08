<script setup lang="ts">
import { usePrototypeContext } from '@marktowin/prototype-core'

const { activePrototypeStateId, setPrototypeState, go } = usePrototypeContext()
</script>

<template>
  <main class="demo-mobile">
    <span class="demo-kicker">PROTOTYPE CORE</span>
    <h1>产品页面由业务项目提供</h1>
    <p>{{ activePrototypeStateId === 'empty' ? '当前没有演示数据。' : '公共内核已经成功加载产品页面。' }}</p>
    <div class="demo-actions">
      <button @click="setPrototypeState(activePrototypeStateId === 'empty' ? 'ready' : 'empty')">切换状态</button>
      <button @click="go('pcDashboard')">打开 PC 示例</button>
    </div>
  </main>
</template>

<style scoped>
.demo-mobile { min-height: 100%; padding: 72px 28px; background: rgb(var(--ds-color-canvas-parchment)); color: rgb(var(--ds-color-ink)); }
.demo-kicker { color: rgb(var(--ds-color-primary)); font-size: 12px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 18px 0 12px; font-size: 32px; line-height: 1.15; }
p { color: rgb(var(--ds-color-ink-muted-48)); line-height: 1.7; }
.demo-actions { display: grid; gap: 12px; margin-top: 32px; }
button { border: 0; border-radius: var(--ds-rounded-lg); padding: 14px 18px; background: rgb(var(--ds-color-ink)); color: rgb(var(--ds-color-body-on-dark)); cursor: pointer; }
</style>
