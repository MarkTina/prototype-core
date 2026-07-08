<script setup lang="ts">
import { Check, CircleAlert, Clipboard, X } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import themeGuideMarkdown from '../../DESIGN-TOKENS.md?raw'

defineEmits<{ close: [] }>()

const copyStatus = ref<'idle' | 'copied' | 'error'>('idle')
const currentCoreVersion = __CORE_PACKAGE_VERSION__
let copyNoticeTimer: ReturnType<typeof window.setTimeout> | undefined

function fallbackCopy() {
  const textarea = document.createElement('textarea')
  textarea.value = themeGuideMarkdown
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('浏览器拒绝复制')
}

async function copyGuide() {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(themeGuideMarkdown)
    else fallbackCopy()
    copyStatus.value = 'copied'
  } catch {
    try {
      fallbackCopy()
      copyStatus.value = 'copied'
    } catch {
      copyStatus.value = 'error'
    }
  }
  if (copyNoticeTimer) window.clearTimeout(copyNoticeTimer)
  copyNoticeTimer = window.setTimeout(() => {
    copyStatus.value = 'idle'
    copyNoticeTimer = undefined
  }, 1800)
}

onBeforeUnmount(() => {
  if (copyNoticeTimer) window.clearTimeout(copyNoticeTimer)
})
</script>

<template>
  <section class="prototype-help-page">
    <header class="prototype-help-header">
      <div class="min-w-0">
        <p class="prototype-help-eyebrow">PROTOTYPE CORE · v{{ currentCoreVersion }}</p>
        <h1>主题实现准则</h1>
        <p>面向人和 AI 的设计系统 token、使用规则与兼容映射。</p>
      </div>
      <div class="prototype-help-actions">
        <button type="button" @click="copyGuide">
          <Check v-if="copyStatus === 'copied'" class="h-4 w-4" />
          <CircleAlert v-else-if="copyStatus === 'error'" class="h-4 w-4" />
          <Clipboard v-else class="h-4 w-4" />
          {{ copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '请手动选择复制' : '复制全文' }}
        </button>
        <button class="is-icon" type="button" aria-label="返回原型" title="返回原型" @click="$emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <div class="prototype-help-document" aria-label="Prototype Core 主题实现准则 Markdown 原文">
      <pre>{{ themeGuideMarkdown }}</pre>
    </div>
  </section>
</template>

<style scoped>
.prototype-help-page {
  min-height: 100dvh;
  padding: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgb(var(--color-panel)) 0, transparent 32%),
    rgb(var(--color-canvas));
}

.prototype-help-header {
  position: sticky;
  top: 16px;
  z-index: 10;
  display: flex;
  width: min(1120px, 100%);
  margin: 0 auto 18px;
  padding: 18px 20px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 22px;
  background: rgb(var(--color-panel) / 0.92);
  box-shadow: 0 18px 55px rgb(var(--shadow-soft-color) / 0.1);
  backdrop-filter: blur(18px);
}

.prototype-help-eyebrow {
  margin: 0 0 7px;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.14em;
}

.prototype-help-header h1 {
  margin: 0;
  color: rgb(var(--color-ink));
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 720;
  line-height: 1.1;
}

.prototype-help-header p:last-child {
  margin: 8px 0 0;
  color: rgb(var(--color-muted));
  font-size: 13px;
}

.prototype-help-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.prototype-help-actions button {
  display: inline-flex;
  min-height: 38px;
  padding: 0 14px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 999px;
  background: rgb(var(--color-panel));
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 700;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

.prototype-help-actions button:hover {
  border-color: rgb(var(--color-ocean) / 0.35);
  background: rgb(var(--color-soft));
}

.prototype-help-actions button:active {
  transform: scale(0.96);
}

.prototype-help-actions button.is-icon {
  width: 38px;
  padding: 0;
}

.prototype-help-document {
  width: min(1120px, 100%);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line));
  border-radius: 22px;
  background: rgb(var(--color-panel));
  box-shadow: 0 24px 70px rgb(var(--shadow-soft-color) / 0.08);
}

.prototype-help-document pre {
  min-height: calc(100dvh - 176px);
  margin: 0;
  padding: clamp(22px, 4vw, 48px);
  overflow: auto;
  color: rgb(var(--color-ink));
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
}

@media (max-width: 640px) {
  .prototype-help-page {
    padding: 10px;
  }

  .prototype-help-header {
    top: 8px;
    margin-bottom: 10px;
    padding: 16px;
    align-items: flex-start;
  }

  .prototype-help-header p:last-child,
  .prototype-help-actions button:not(.is-icon) {
    display: none;
  }

  .prototype-help-document pre {
    padding: 20px 16px;
    font-size: 12px;
  }
}
</style>
