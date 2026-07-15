import type { MainFlow, ScreenMeta } from '../types/prototype'

export interface ProductStateItem {
  id: string
  labelKey: string
}

export interface PrototypeNavigationApi {
  go: (screenId: string) => void
  goTab: (screenId: string) => void
  setPrototypeState: {
    (screenId: string, stateId: string): void
    (stateId: string): void
  }
}

export interface PrototypeProductDocument {
  title: string
  description: string
  url?: string
}

export interface PrototypeUpdateHistoryItem {
  hash: string
  date: string
  message: string
  details: string
}

export interface PrototypeProductDefinition {
  document?: PrototypeProductDocument
  updateHistory?: PrototypeUpdateHistoryItem[]
  pages: ScreenMeta[]
  copy: {
    zh: Record<string, string>
    en: Record<string, string>
  }
  states: Record<string, ProductStateItem[]>
  flows: {
    version: string
    flows: MainFlow[]
  }
  extendContext?: (navigation: PrototypeNavigationApi) => Record<string, unknown>
}

export interface PrototypeRuntimeConfig {
  baseUrl?: string
  versionUpdate?: {
    currentVersion: string
    builtAt?: string
    manifestUrl?: string
    intervalMs?: number
  }
  auth?: {
    enabled?: boolean
    username?: string
    password?: string
  }
  collaboration?: {
    provider?: string
    owner?: string
    repo?: string
    remoteBranch?: string
    projectId?: string
    codeBranch?: string
    token?: string
  }
  oss?: {
    bucket?: string
    baseUrl?: string
    accessKeyId?: string
    accessKeySecret?: string
  }
  tools?: {
    bugDeleteCode?: string
  }
  environment?: {
    deployment?: {
      host?: boolean
      port?: boolean
      username?: boolean
      password?: boolean
      path?: boolean
      backupPath?: boolean
    }
  }
}

export interface MountPrototypeAppOptions {
  target?: string
  product: PrototypeProductDefinition
  runtimeConfig?: PrototypeRuntimeConfig
}

let activeProduct: PrototypeProductDefinition | undefined
let activeRuntimeConfig: PrototypeRuntimeConfig = {}

export function configurePrototypeProduct(product: PrototypeProductDefinition) {
  if (activeProduct) throw new Error('🧩 [产品适配] 产品定义只能配置一次')
  activeProduct = product
}

export function getPrototypeProduct(): PrototypeProductDefinition {
  if (!activeProduct) throw new Error('🧩 [产品适配] 产品定义尚未配置，请先调用 configurePrototypeProduct')
  return activeProduct
}

export function configurePrototypeRuntime(config: PrototypeRuntimeConfig = {}) {
  activeRuntimeConfig = config
}

export function getPrototypeRuntime(): PrototypeRuntimeConfig {
  return activeRuntimeConfig
}
