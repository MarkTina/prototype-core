import type { Component } from 'vue'

export type Mode = 'interactive' | 'overview' | 'flow'
export type Lang = 'zh' | 'en'
export type MainFlowId = string
export type CollaborationDataKind = 'annotations' | 'pageDescriptions' | 'testCases' | 'flows'
export type DataSource = 'gitee' | 'local-cache' | 'local-seed'
export type CollaborationSyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict'
export type CollaborationCacheStatus = 'synced' | 'pending' | 'stale' | 'error'

export interface CollaborationSourceState {
  source: DataSource
  status: CollaborationSyncStatus
  syncedAt?: string
  message?: string
}

export interface CollaborationCacheEntry<T> {
  value: T
  revision: string | null
  cachedAt: string
  lastRemoteSyncAt: string | null
  status: CollaborationCacheStatus
  error?: string
}

export interface CollaborationCacheSnapshot<T> extends CollaborationCacheEntry<T> {
  schemaVersion: 3
}

export interface ScopedCollaborationCacheSnapshot<T> {
  schemaVersion: 3
  scopes: Record<string, CollaborationCacheEntry<T>>
}

export interface PageDescriptionJsonSyncResult {
  syncedScopes: string[]
  skippedScopes: string[]
  failedScopes: Array<{ scopeId: string; error: string }>
  total: number
}

export interface PageDescriptionJsonSyncOptions {
  scopeIds?: string[]
}

export interface PrototypeCoreCommands {
  syncPageDescriptionsFromJson(options?: PageDescriptionJsonSyncOptions): Promise<PageDescriptionJsonSyncResult>
}

declare global {
  interface Window {
    __PROTOTYPE_CORE__?: PrototypeCoreCommands
  }
}
export type ThemeId = 'default' | 'apple' | 'warm' | 'calm' | 'spotify' | 'meta' | 'uber' | 'custom'
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

export type DesignColorKey =
  | 'primary'
  | 'primaryFocus'
  | 'primaryOnDark'
  | 'canvas'
  | 'canvasParchment'
  | 'surfacePearl'
  | 'surfaceTile1'
  | 'surfaceTile2'
  | 'surfaceTile3'
  | 'surfaceBlack'
  | 'surfaceChipTranslucent'
  | 'ink'
  | 'body'
  | 'bodyOnDark'
  | 'bodyMuted'
  | 'inkMuted80'
  | 'inkMuted48'
  | 'dividerSoft'
  | 'hairline'
  | 'success'
  | 'warning'
  | 'danger'

export type ThemeTypographyKey =
  | 'displayFamily'
  | 'bodyFamily'
  | 'heroSize'
  | 'displayLgSize'
  | 'displayMdSize'
  | 'leadSize'
  | 'bodySize'
  | 'captionSize'
  | 'finePrintSize'
  | 'displayWeight'
  | 'bodyWeight'
  | 'lightWeight'
  | 'bodyLineHeight'

export type ThemeRadiusKey = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'pill'
export type ThemeSpacingKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'section'
export type ThemeShadowKey = 'product' | 'soft'

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

export interface PrototypeThemeConfig {
  colors: Record<ThemeColorKey, string>
  designColors: Record<DesignColorKey, string>
  typography: Record<ThemeTypographyKey, string>
  radius: Record<ThemeRadiusKey, string>
  spacing: Record<ThemeSpacingKey, string>
  shadow: Record<ThemeShadowKey, string>
}

export interface ThemePreset extends PrototypeThemeConfig {
  id: ThemeId
  nameKey: string
  descriptionKey: string
}

export interface PrototypeStateOption {
  id: string
  label: string
}

export interface StoredTheme {
  version?: number
  colors?: Partial<Record<ThemeColorKey, string>>
  designColors?: Partial<Record<DesignColorKey, string>>
  typography?: Partial<Record<ThemeTypographyKey, string>>
  radius?: Partial<Record<ThemeRadiusKey, string>>
  spacing?: Partial<Record<ThemeSpacingKey, string>>
  shadow?: Partial<Record<ThemeShadowKey, string>>
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
  color?: string
  authorName?: string
  createdAt?: string
  updatedAt?: string
}

export interface PrototypePageDescription {
  screenId: string
  stateId?: string
  highlighted?: boolean
  highlightColor?: string
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

export interface PrototypeTestCase {
  id: string
  screenId: string
  stateId?: string
  module: string
  testItem: string
  testPoint: string
  preconditions: string
  steps: string[]
  expectedResult: string
  actualResult: string
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
  color?: string
}

export interface CollaborationManifestScreen {
  count: number
  updatedAt: string
  highlighted?: boolean
  highlightColor?: string
}

export interface CollaborationManifest {
  projectId: string
  updatedAt: string
  scopes?: Record<string, CollaborationManifestScreen>
  screens: Partial<Record<string, CollaborationManifestScreen>>
}

// 保留旧名称，避免破坏已发布的公共类型引用。
export type AnnotationManifestScreen = CollaborationManifestScreen
export type AnnotationManifest = CollaborationManifest
