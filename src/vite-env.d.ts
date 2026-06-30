/// <reference types="vite/client" />

interface GitHistoryItem {
  hash: string
  date: string
  message: string
  details: string
}

declare const __GIT_HISTORY__: GitHistoryItem[]
declare const __APP_VERSION__: string
declare const __APP_BUILT_AT__: string
declare const __APP_GIT_BRANCH__: string
declare const __CORE_PACKAGE_VERSION__: string
