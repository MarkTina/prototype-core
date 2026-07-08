<script setup lang="ts">
import { usePrototypeContext } from '@marktowin/prototype-core'

const { go } = usePrototypeContext()
</script>

<template>
  <main class="demo-pc">
    <aside>Prototype Core</aside>
    <section>
      <span>PC1 · 1920×1080</span>
      <h1>桌面端产品画布</h1>
      <p>页面结构、业务状态和视觉资产全部由产品项目维护。</p>
      <button @click="go('mobileHome')">返回移动端示例</button>
    </section>
  </main>
</template>

<style scoped>
.demo-pc { box-sizing: border-box; display: grid; grid-template-columns: 300px 1fr; width: 1920px; height: 1080px; background: rgb(var(--ds-color-canvas-parchment)); color: rgb(var(--ds-color-ink)); }
aside { padding: 52px; background: rgb(var(--ds-color-surface-tile-3)); color: rgb(var(--ds-color-body-on-dark)); font-size: 26px; font-weight: 700; }
section { padding: 170px 140px; }
span { color: rgb(var(--ds-color-primary)); font-weight: 700; }
h1 { margin: 28px 0 16px; font-size: 72px; }
p { color: rgb(var(--ds-color-ink-muted-48)); font-size: 26px; }
button { margin-top: 48px; border: 0; border-radius: var(--ds-rounded-lg); padding: 18px 26px; background: rgb(var(--ds-color-primary)); color: rgb(var(--ds-color-body-on-dark)); font-size: 18px; cursor: pointer; }
</style>
