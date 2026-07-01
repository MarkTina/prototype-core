import type { Component } from 'vue'

export type Mode = 'interactive' | 'overview' | 'flow'
export type Lang = 'zh' | 'en'
export type MainFlowId = string
export type CollaborationDataKind = 'annotations' | 'pageDescriptions' | 'flows'
export type DataSource = 'gitee' | 'local-cache' | 'local-seed'
export type CollaborationSyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict'

export interface CollaborationSourceState {
  source: DataSource
  status: CollaborationSyncStatus
  syncedAt?: string
  message?: string
}

export interface CollaborationCacheSnapshot<T> {
  schemaVersion: 2
  value: T
  revision: string | null
  cachedAt: string
  lastRemoteSyncAt: string | null
}
export type ThemeId = 'default' | 'warm' | 'calm' | 'spotify' | 'meta' | 'uber' | 'custom'
export type ThemeColorKey =
  | 'ocean'
  | 'ink'
  | 'muted'
  | 'line'
  | 'canvas'
  | 'soft'
  | 'panel'
  | 'success'
  | 'warning'
  | 'danger'
  | 'dark'
  | 'device'
  | 'head'

export type ScreenId = string
export type ScreenPlatform = 'mobile' | 'pc'

// 保留旧字面量类型别名以兼容历史引用，但核心接口统一使用 string。
export type HomePreviewState = 'homeFilled' | 'homeEmpty'
export type ListPreviewState = 'listFilled' | 'listEmpty'
export type DetailPreviewState = 'detailReady' | 'detailLoading'
export type DialogPreviewState = 'confirmDialog' | 'toastDialog'
export type PrototypeStateId = string

export interface ScreenMeta {
  id: string
  platform: ScreenPlatform
  code: string
  title: string
  subtitle: string
  icon: Component
  iconName?: string
  component?: Component
  componentPath?: string
  hasTabBar?: boolean
}

export interface FlowNode {
  screenId: string
  stateId?: string
  rowLabel?: string
}

export interface MainFlow {
  id: MainFlowId
  title: string
  subtitle: string
  rows: FlowNode[][]
}

export interface DisplayScreen extends ScreenMeta {
  stateId?: string
  stateLabel?: string
  flowRow?: number
  flowCol?: number
  rowLabel?: string
  hasNext?: boolean
}

export interface ThemePreset {
  id: ThemeId
  nameKey: string
  descriptionKey: string
  colors: Record<ThemeColorKey, string>
}

export interface PrototypeStateOption {
  id: string
  label: string
}

export interface StoredTheme {
  colors?: Partial<Record<ThemeColorKey, string>>
  selectedThemeId?: ThemeId
}

export interface PrototypeAnnotation {
  id: string
  screenId: string
  stateId?: string
  x: number
  y: number
  featureName: string
  featureDescription: string
  specialNote: string
  authorName?: string
  createdAt?: string
  updatedAt?: string
}

export interface PrototypePageDescription {
  screenId: string
  stateId?: string
  highlighted?: boolean
  purpose: string
  structure: string
  features: string
  flowPosition: string
  interactionRules: string
  stateCriteria: string
  edgeCases: string
  acceptanceCriteria: string
  developmentNotes: string
  authorName?: string
  createdAt?: string
  updatedAt?: string
}

export interface AnnotationDraft {
  screenId: string
  stateId?: string
  x: number
  y: number
  featureName: string
  featureDescription: string
  specialNote: string
}

export interface AnnotationManifestScreen {
  count: number
  updatedAt: string
  highlighted?: boolean
}

export interface AnnotationManifest {
  projectId: string
  updatedAt: string
  scopes?: Record<string, AnnotationManifestScreen>
  screens: Partial<Record<string, AnnotationManifestScreen>>
}
