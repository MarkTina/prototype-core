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
.demo-mobile { min-height: 100%; padding: 72px 28px; background: #f5f5f7; color: #1d1d1f; }
.demo-kicker { color: #2563eb; font-size: 12px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 18px 0 12px; font-size: 32px; line-height: 1.15; }
p { color: #6b7280; line-height: 1.7; }
.demo-actions { display: grid; gap: 12px; margin-top: 32px; }
button { border: 0; border-radius: 14px; padding: 14px 18px; background: #1d1d1f; color: white; cursor: pointer; }
</style>
