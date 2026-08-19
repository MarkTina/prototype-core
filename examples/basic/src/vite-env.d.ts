/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_DOCUMENT_URL?: string
}

declare const __BUSINESS_APP_VERSION__: string
declare const __BUSINESS_APP_BUILT_AT__: string
declare const __BUSINESS_UPDATE_HISTORY__: Array<{
  hash: string
  date: string
  message: string
  details: string
}>
