import { computed, ref } from 'vue'

const USER_KEY = 'prototype-core-annotation-author'
const FIXER_KEY = 'prototype-core-bug-fixer'

function readName(key: string) {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeName(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    // 姓名记忆失败不阻断协作，当前会话继续使用内存值。
  }
}

const userInput = ref(readName(USER_KEY))
const rememberedUser = ref(userInput.value)
const rememberedFixer = ref(readName(FIXER_KEY))

export const currentUserName = computed({
  get: () => userInput.value,
  set: (value: string) => {
    const name = value.trim()
    if (name) {
      rememberedUser.value = name
      writeName(USER_KEY, name)
    }
    userInput.value = value
  },
})

export function readDefaultUserName() {
  return rememberedUser.value
}

export function rememberFixerName(value: string) {
  const name = value.trim()
  if (!name) return
  rememberedFixer.value = name
  writeName(FIXER_KEY, name)
}

export function defaultFixerName(existingName?: string) {
  return existingName?.trim() || rememberedFixer.value
}
