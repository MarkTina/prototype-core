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
.demo-pc { box-sizing: border-box; display: grid; grid-template-columns: 300px 1fr; width: 1920px; height: 1080px; background: #f3f4f6; color: #111827; }
aside { padding: 52px; background: #111827; color: white; font-size: 26px; font-weight: 700; }
section { padding: 170px 140px; }
span { color: #2563eb; font-weight: 700; }
h1 { margin: 28px 0 16px; font-size: 72px; }
p { color: #6b7280; font-size: 26px; }
button { margin-top: 48px; border: 0; border-radius: 14px; padding: 18px 26px; background: #2563eb; color: white; font-size: 18px; cursor: pointer; }
</style>
