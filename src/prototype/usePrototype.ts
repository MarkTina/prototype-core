import { computed, reactive, ref, watch, type CSSProperties } from 'vue'
import {
  PanelTop,
  RotateCcw,
  SunMedium,
} from '@lucide/vue'

import {
  annotationRemoteEnabled,
  CollaborationConflictError,
  ensureRemoteData,
  ensureRemoteInitializationMarker,
  hasRemoteInitializationMarker,
  loadRemoteAnnotationManifest,
  loadRemoteFlows,
  loadRemotePageDescription,
  loadRemotePageDescriptionManifest,
  loadRemoteScreenAnnotations,
  saveRemoteAnnotationManifest,
  saveRemotePageDescription,
  saveRemotePageDescriptionManifest,
  saveRemoteFlows,
  updateRemoteScreenAnnotations,
  type AnnotationOperation,
} from './annotationClient'
import {
  getCollaborationContext,
  migrateFileCollaborationCache,
  readCollaborationCache,
  readLegacyCollaborationCache,
  readScopedCollaborationCache,
  removeScopedCollaborationCache,
  replaceScopedCollaborationCache,
  writeCollaborationCache,
  writeScopedCollaborationCache,
} from './collaborationStore'
import { jsonValuesEqual, selectLocalFallback, shouldDeferRemoteRefresh } from './collaborationPolicy'
import { getPrototypeProduct, getPrototypeRuntime } from '../core/productAdapter'
import { setActivePrototypeContext } from '../core/contextBridge'
import EmptyPrototypeScreen from '../screens/EmptyPrototypeScreen.vue'
import type {
  AnnotationDraft,
  AnnotationManifest,
  CollaborationDataKind,
  CollaborationSourceState,
  DataSource,
  DesignColorKey,
  DisplayScreen,
  Lang,
  MainFlow,
  Mode,
  PageDescriptionJsonSyncOptions,
  PageDescriptionJsonSyncResult,
  PrototypeAnnotation,
  PrototypePageDescription,
  PrototypeThemeConfig,
  PrototypeStateOption,
  ScreenMeta,
  ScreenPlatform,
  StoredTheme,
  ThemeColorKey,
  ThemeId,
  ThemePreset,
  ThemeRadiusKey,
  ThemeShadowKey,
  ThemeSpacingKey,
  ThemeTypographyKey,
} from '../types/prototype'

const { copy, pages, states, flows: productFlows, extendContext } = getPrototypeProduct()

const defaultThemeColors: Record<ThemeColorKey, string> = {
  ocean: '#1d1d1f',
  ink: '#1d1d1f',
  muted: '#747579',
  line: '#e2e2e7',
  canvas: '#f5f5f7',
  soft: '#f1f2f4',
  panel: '#ffffff',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#c93c37',
  dark: '#232326',
  device: '#1d1d1f',
  head: '#f5f5f7',
}

const defaultDesignColors: Record<DesignColorKey, string> = {
  primary: '#0066cc',
  primaryFocus: '#0071e3',
  primaryOnDark: '#2997ff',
  canvas: '#ffffff',
  canvasParchment: '#f5f5f7',
  surfacePearl: '#fafafc',
  surfaceTile1: '#272729',
  surfaceTile2: '#2a2a2c',
  surfaceTile3: '#252527',
  surfaceBlack: '#000000',
  surfaceChipTranslucent: '#d2d2d7',
  ink: '#1d1d1f',
  body: '#1d1d1f',
  bodyOnDark: '#ffffff',
  bodyMuted: '#cccccc',
  inkMuted80: '#333333',
  inkMuted48: '#7a7a7a',
  dividerSoft: '#f0f0f0',
  hairline: '#e0e0e0',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#c93c37',
}

const defaultTypography: Record<ThemeTypographyKey, string> = {
  displayFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
  bodyFamily: '"SF Pro Text", system-ui, -apple-system, sans-serif',
  heroSize: '56px',
  displayLgSize: '40px',
  displayMdSize: '34px',
  leadSize: '28px',
  bodySize: '17px',
  captionSize: '14px',
  finePrintSize: '12px',
  displayWeight: '600',
  bodyWeight: '400',
  lightWeight: '300',
  bodyLineHeight: '1.47',
}

const defaultRadius: Record<ThemeRadiusKey, string> = {
  none: '0px',
  xs: '5px',
  sm: '8px',
  md: '11px',
  lg: '18px',
  pill: '9999px',
}

const defaultSpacing: Record<ThemeSpacingKey, string> = {
  xs: '8px',
  sm: '12px',
  md: '17px',
  lg: '24px',
  xl: '32px',
  section: '80px',
}

const defaultShadow: Record<ThemeShadowKey, string> = {
  product: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
  soft: '0 16px 40px rgba(17, 24, 39, 0.08)',
}

type ThemeConfigInput = {
  colors?: Partial<Record<ThemeColorKey, string>>
  designColors?: Partial<Record<DesignColorKey, string>>
  typography?: Partial<Record<ThemeTypographyKey, string>>
  radius?: Partial<Record<ThemeRadiusKey, string>>
  spacing?: Partial<Record<ThemeSpacingKey, string>>
  shadow?: Partial<Record<ThemeShadowKey, string>>
}

function createThemeConfig(partial: ThemeConfigInput = {}): PrototypeThemeConfig {
  return {
    colors: { ...defaultThemeColors, ...partial.colors },
    designColors: { ...defaultDesignColors, ...partial.designColors },
    typography: { ...defaultTypography, ...partial.typography },
    radius: { ...defaultRadius, ...partial.radius },
    spacing: { ...defaultSpacing, ...partial.spacing },
    shadow: { ...defaultShadow, ...partial.shadow },
  }
}

const appleThemeConfig = createThemeConfig({
  colors: {
    ...defaultThemeColors,
    ocean: defaultDesignColors.primary,
    ink: defaultDesignColors.ink,
    muted: defaultDesignColors.inkMuted48,
    line: defaultDesignColors.hairline,
    canvas: defaultDesignColors.canvasParchment,
    soft: defaultDesignColors.surfacePearl,
    panel: defaultDesignColors.canvas,
    success: defaultDesignColors.success,
    warning: defaultDesignColors.warning,
    danger: defaultDesignColors.danger,
    dark: defaultDesignColors.surfaceTile3,
    device: defaultDesignColors.ink,
    head: defaultDesignColors.canvasParchment,
  },
})

const themePresets: ThemePreset[] = [
  { id: 'default', nameKey: 'themeDefault', descriptionKey: 'themeDefaultDesc', ...createThemeConfig({ designColors: { ...defaultDesignColors, primary: defaultThemeColors.ocean } }) },
  { id: 'apple', nameKey: 'themeApple', descriptionKey: 'themeAppleDesc', ...appleThemeConfig },
  {
    id: 'warm',
    nameKey: 'themeWarm',
    descriptionKey: 'themeWarmDesc',
    ...createThemeConfig({
      colors: { ...defaultThemeColors, ocean: '#2c251d', ink: '#2c251d', muted: '#7b7169', line: '#e5ded5', canvas: '#faf7f1', soft: '#f1ebe2', device: '#2c251d', head: '#f6efe7' },
      designColors: { ...defaultDesignColors, primary: '#2c251d', ink: '#2c251d', body: '#2c251d', inkMuted48: '#7b7169', hairline: '#e5ded5', canvasParchment: '#faf7f1', surfacePearl: '#f1ebe2' },
    }),
  },
  {
    id: 'calm',
    nameKey: 'themeCalm',
    descriptionKey: 'themeCalmDesc',
    ...createThemeConfig({
      colors: { ...defaultThemeColors, ocean: '#24445c', ink: '#17242e', muted: '#647682', line: '#d6e0e6', canvas: '#f2f7f9', soft: '#e8f0f4', device: '#24445c', head: '#eef4f7' },
      designColors: { ...defaultDesignColors, primary: '#24445c', ink: '#17242e', body: '#17242e', inkMuted48: '#647682', hairline: '#d6e0e6', canvasParchment: '#f2f7f9', surfacePearl: '#e8f0f4' },
    }),
  },
  {
    id: 'spotify',
    nameKey: 'themeSpotify',
    descriptionKey: 'themeSpotifyDesc',
    ...createThemeConfig({
      colors: { ...defaultThemeColors, ocean: '#1ed760', ink: '#ffffff', muted: '#b5b5b5', line: '#424242', canvas: '#121212', soft: '#181818', panel: '#202020', device: '#181818', head: '#252525', success: '#1ed760' },
      designColors: { ...defaultDesignColors, primary: '#1ed760', ink: '#ffffff', body: '#ffffff', inkMuted48: '#b5b5b5', hairline: '#424242', canvas: '#202020', canvasParchment: '#121212', surfacePearl: '#181818', success: '#1ed760' },
    }),
  },
  {
    id: 'meta',
    nameKey: 'themeMeta',
    descriptionKey: 'themeMetaDesc',
    ...createThemeConfig({
      colors: { ...defaultThemeColors, ocean: '#0064e0', ink: '#1c1e21', muted: '#5d6c7b', line: '#ced0d4', canvas: '#ffffff', soft: '#f1f4f7', success: '#31a24c', danger: '#e41e3f' },
      designColors: { ...defaultDesignColors, primary: '#0064e0', primaryFocus: '#0064e0', ink: '#1c1e21', body: '#1c1e21', inkMuted48: '#5d6c7b', hairline: '#ced0d4', canvasParchment: '#ffffff', surfacePearl: '#f1f4f7', success: '#31a24c', danger: '#e41e3f' },
    }),
  },
  {
    id: 'uber',
    nameKey: 'themeUber',
    descriptionKey: 'themeUberDesc',
    ...createThemeConfig({
      colors: { ...defaultThemeColors, ocean: '#000000', ink: '#000000', muted: '#8c8c8c', line: '#e2e2e2', canvas: '#ffffff', soft: '#efefef', device: '#000000', dark: '#282828' },
      designColors: { ...defaultDesignColors, primary: '#000000', primaryFocus: '#000000', ink: '#000000', body: '#000000', inkMuted48: '#8c8c8c', hairline: '#e2e2e2', canvasParchment: '#ffffff', surfacePearl: '#efefef', surfaceTile3: '#282828' },
    }),
  },
]

const themeColorFields: Array<{ key: ThemeColorKey; designKey: DesignColorKey; label: string; description: string }> = [
  { key: 'ocean', designKey: 'primary', label: '主操作色', description: '按钮、链接、焦点强调' },
  { key: 'ink', designKey: 'ink', label: '主要文字', description: '标题、正文和深色控件' },
  { key: 'muted', designKey: 'inkMuted48', label: '次级文字', description: '说明、禁用和弱提示' },
  { key: 'line', designKey: 'hairline', label: '发丝线', description: '卡片、输入框和分隔线' },
  { key: 'canvas', designKey: 'canvasParchment', label: '页面背景', description: '浅灰画布和分区背景' },
  { key: 'soft', designKey: 'surfacePearl', label: '浅色控件底', description: '次级按钮、轻量容器' },
  { key: 'panel', designKey: 'canvas', label: '面板底色', description: '弹层、卡片和主内容面板' },
  { key: 'success', designKey: 'success', label: '成功状态', description: '成功反馈和通过状态' },
  { key: 'warning', designKey: 'warning', label: '警告状态', description: '版本提醒、同步警告' },
  { key: 'danger', designKey: 'danger', label: '危险状态', description: '错误、删除和冲突' },
  { key: 'dark', designKey: 'surfaceTile3', label: '深色块', description: '深色区域和暗色强调' },
  { key: 'device', designKey: 'ink', label: '设备边框', description: '手机和桌面设备外框' },
  { key: 'head', designKey: 'canvasParchment', label: '顶部浅底', description: '导航和头部浅背景' },
]

const themeDesignColorFields: Array<{ key: DesignColorKey; label: string; description: string }> = [
  { key: 'primary', label: 'Primary', description: '设计系统主操作色' },
  { key: 'primaryFocus', label: 'Focus', description: '焦点和选中边框' },
  { key: 'primaryOnDark', label: 'On Dark', description: '深色背景链接色' },
  { key: 'canvas', label: 'Canvas', description: '主画布白色' },
  { key: 'canvasParchment', label: 'Parchment', description: '浅灰分区背景' },
  { key: 'ink', label: 'Ink', description: '浅色背景主要文字' },
  { key: 'hairline', label: 'Hairline', description: '1px 边框' },
  { key: 'surfacePearl', label: 'Pearl', description: '浅色控件填充' },
]

const themeTypographyFields: Array<{ key: ThemeTypographyKey; label: string; description: string }> = [
  { key: 'bodyFamily', label: '正文字体', description: '正文、按钮和表单字体栈' },
  { key: 'displayFamily', label: '标题字体', description: '标题和展示文字字体栈' },
  { key: 'bodySize', label: '正文字号', description: '默认正文和按钮字号' },
]

const themeRadiusFields: Array<{ key: ThemeRadiusKey; label: string; description: string }> = [
  { key: 'sm', label: '紧凑圆角', description: '紧凑按钮、内嵌图片' },
  { key: 'lg', label: '卡片圆角', description: '卡片和网格容器' },
  { key: 'pill', label: '胶囊圆角', description: '主按钮、搜索框和芯片' },
]

const themeCopy: Record<string, { name: string; description: string }> = {
  themeDefault: { name: '默认', description: '沿用当前内核配色' },
  themeApple: { name: 'Apple DS', description: '按 DESIGN.md 映射的设计系统' },
  themeWarm: { name: '暖色', description: '柔和米色原型评审风格' },
  themeCalm: { name: '冷静', description: '低饱和蓝灰风格' },
  themeSpotify: { name: 'Spotify', description: '深色高对比预设' },
  themeMeta: { name: 'Meta', description: '蓝色产品工具风格' },
  themeUber: { name: 'Uber', description: '黑白高对比预设' },
  themeCustom: { name: '自定义', description: '来自面板编辑或 JSON 导入' },
}

const CUSTOM_THEME_STORAGE_KEY = 'prototype-core-custom-theme'
const ANNOTATION_AUTHOR_STORAGE_KEY = 'prototype-core-annotation-author'
const ANNOTATION_POLLING_INTERVAL_STORAGE_KEY = 'prototype-core-collaboration-polling-interval-v2'
const DEFAULT_ANNOTATION_POLLING_INTERVAL_SECONDS = 60
const MIN_ANNOTATION_POLLING_INTERVAL_SECONDS = 10
const MAX_ANNOTATION_POLLING_INTERVAL_SECONDS = 300

const lang = ref<Lang>('zh')
const mode = ref<Mode>('interactive')
const currentScreen = ref<string>('splash')
const selectedFlowId = ref('')
const selectedThemeId = ref<ThemeId>('default')
const customThemeConfig = ref<PrototypeThemeConfig>(createThemeConfig())
const showThemePanel = ref(false)
const themeImportInput = ref<HTMLInputElement | null>(null)
const flowZoom = ref(0.42)
const flowPanX = ref(360)
const flowPanY = ref(150)
const isFlowPanning = ref(false)
const flowPanStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })
const defaultTabScreen = pages.find((page) => page.platform === 'mobile' && page.hasTabBar)
const selectedTab = ref<string>(defaultTabScreen?.id ?? '')
const screenStateMap = reactive<Record<string, string>>({})
Object.entries(states).forEach(([screenId, options]) => {
  if (options.length) screenStateMap[screenId] = options[0].id
})
const activeCollaborationTab = ref<'annotations' | 'pageDescription'>('annotations')
const annotationRemoteReady = ref(annotationRemoteEnabled)
const annotationSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const annotationSyncLabel = ref(annotationRemoteEnabled ? '云端协作已启用' : '本地兜底模式')
const annotationAuthorName = ref('')
const annotationPollingIntervalSeconds = ref(DEFAULT_ANNOTATION_POLLING_INTERVAL_SECONDS)
const annotationPollingIntervalInput = ref(String(DEFAULT_ANNOTATION_POLLING_INTERVAL_SECONDS))
const annotationPollingNotice = ref('')
const annotationPanelCollapsed = ref(false)
const annotationPointsVisible = ref(true)
const isPlacingAnnotation = ref(false)
const hoveredAnnotationId = ref('')
const annotationDraft = ref<AnnotationDraft | null>(null)
const activeAnnotationId = ref('')
const annotationDialogMode = ref<'create' | 'edit' | 'view'>('view')
const annotationEditor = ref({ featureName: '', featureDescription: '', specialNote: '', color: defaultThemeColors.ocean })
const annotations = ref<PrototypeAnnotation[]>([])
const annotationManifest = ref<AnnotationManifest | null>(null)
const pageDescriptions = ref<PrototypePageDescription[]>([])
const pageDescriptionManifest = ref<AnnotationManifest | null>(null)
const pageDescriptionSelectedSource = ref<DataSource>('local-seed')
const pageDescriptionSourceSelectionTouched = ref(false)
const pageDescriptionSourceValues = ref<Record<DataSource, Record<string, PrototypePageDescription>>>({
  gitee: {},
  'local-cache': {},
  'local-seed': {},
})
const pageDescriptionEditor = ref({
  highlighted: false,
  highlightColor: '#ef4444',
  purpose: '',
  structure: '',
  features: '',
  flowPosition: '',
  interactionRules: '',
  stateCriteria: '',
  edgeCases: '',
  acceptanceCriteria: '',
  developmentNotes: '',
})
const mainFlows = ref<MainFlow[]>([])
const collaborationInitialized = ref(false)
const collaborationEditing = ref<Record<CollaborationDataKind, boolean>>({ annotations: false, pageDescriptions: false, flows: false })
const collaborationSources = ref<Record<CollaborationDataKind, CollaborationSourceState>>({
  annotations: { source: 'local-seed', status: 'idle' },
  pageDescriptions: { source: 'local-seed', status: 'idle' },
  flows: { source: 'local-seed', status: 'idle' },
})
const collaborationBootstrapStatus = ref<'idle' | 'running' | 'success' | 'partial'>('idle')
const collaborationBootstrapProgress = ref({ current: 0, total: 0, label: '' })
const collaborationBootstrapMessage = ref('')
const showFlowEditor = ref(false)
const canPushFlowsToRemote = computed(() => annotationRemoteReady.value && collaborationContext.remoteWritable)
const overviewZoom = ref(1)
const overviewColumns = ref(3)
const showAnnotationTimer = ref<number | null>(null)

const screens: ScreenMeta[] = pages

function storage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

const collaborationContext = getCollaborationContext()
const flowDraftStorageKey = `mobile-prototype-flow-draft:${collaborationContext.projectId}:${collaborationContext.remoteBranch}:${collaborationContext.branchKey}`
const localFlowDraftDirty = ref(storage()?.getItem(flowDraftStorageKey) === 'true')

function setLocalFlowDraftDirty(dirty: boolean) {
  localFlowDraftDirty.value = dirty
  if (dirty) storage()?.setItem(flowDraftStorageKey, 'true')
  else storage()?.removeItem(flowDraftStorageKey)
}

const collaborationSourceLabel = computed(() => {
  const states = Object.values(collaborationSources.value)
  if (states.some((state) => state.status === 'conflict')) return '数据冲突'
  if (states.some((state) => state.status === 'syncing')) return '正在同步'
  const sources = new Set(states.map((state) => state.source))
  if (sources.size > 1) return '混合来源'
  const source = states[0]?.source
  return source === 'gitee' ? 'Gitee' : source === 'local-cache' ? '本地缓存' : '本地种子'
})
const collaborationSourceTone = computed(() => {
  const states = Object.values(collaborationSources.value)
  if (states.some((state) => state.status === 'conflict')) return 'conflict'
  if (!collaborationContext.remoteWritable) return 'warning'
  if (states.some((state) => state.status === 'error')) return 'warning'
  if (states.some((state) => state.status === 'syncing')) return 'syncing'
  return states.every((state) => state.source === 'gitee') ? 'remote' : 'local'
})
const collaborationLastSyncedAt = computed(() => {
  const values = Object.values(collaborationSources.value).map((state) => state.syncedAt).filter((value): value is string => Boolean(value)).sort()
  return values[values.length - 1] ?? ''
})
const collaborationSourceDetail = computed(() => {
  if (collaborationBootstrapStatus.value === 'running') return `正在初始化 Gitee · ${collaborationBootstrapProgress.value.current} / ${collaborationBootstrapProgress.value.total}`
  if (collaborationBootstrapMessage.value) return collaborationBootstrapMessage.value
  if (!collaborationContext.remoteWritable) return collaborationContext.unavailableReason
  if (collaborationSourceTone.value === 'conflict') return '远端已更新，请处理本地草稿'
  const failed = Object.values(collaborationSources.value).find((state) => state.status === 'error')
  return failed?.message || '注释 / 页面描述 / 流程'
})
const canInitializeRemote = computed(() => collaborationContext.remoteWritable && collaborationBootstrapStatus.value !== 'running')

function setCollaborationSource(kind: CollaborationDataKind, source: DataSource, status: CollaborationSourceState['status'], message = '', syncedAt?: string) {
  collaborationSources.value = {
    ...collaborationSources.value,
    [kind]: { source, status, message, syncedAt: syncedAt ?? collaborationSources.value[kind].syncedAt },
  }
}

function rememberRemoteRevision(kind: CollaborationDataKind, revision: string | null, fromPolling: boolean, label: string, scopeId?: string) {
  if (!fromPolling || !revision) return
  const previous = kind === 'flows'
    ? readCollaborationCache<MainFlow[]>('flows')?.revision
    : kind === 'annotations'
      ? readScopedCollaborationCache<PrototypeAnnotation[]>('annotations').scopes[scopeId ?? '']?.revision
      : readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions').scopes[scopeId ?? '']?.revision
  if (previous && previous !== revision) {
    annotationPollingNotice.value = `检测到远端${label}更新，已同步到当前页面`
  }
}

function markCollaborationConflict(kind: CollaborationDataKind, message: string) {
  setCollaborationSource(kind, collaborationSources.value[kind].source, 'conflict', message)
  annotationSyncStatus.value = 'error'
  annotationSyncLabel.value = message
}

function setCollaborationEditing(kind: CollaborationDataKind, editing: boolean) {
  collaborationEditing.value = { ...collaborationEditing.value, [kind]: editing }
}

function t(key: keyof typeof copy.zh | string) {
  return (copy[lang.value] as Record<string, string>)[key] ?? key
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function hexToRgbTriplet(hex: string) {
  const value = hex.replace('#', '')
  const numeric = Number.parseInt(value, 16)
  if (Number.isNaN(numeric)) return '0 0 0'
  return `${(numeric >> 16) & 255} ${(numeric >> 8) & 255} ${numeric & 255}`
}

function camelToKebab(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function mergeThemeFromStored(storedTheme: StoredTheme): PrototypeThemeConfig {
  const colors = { ...defaultThemeColors }
  Object.entries(storedTheme.colors ?? {}).forEach(([key, value]) => {
    if (themeColorFields.some((field) => field.key === key) && typeof value === 'string' && isHexColor(value)) colors[key as ThemeColorKey] = value
  })

  const designColors = { ...defaultDesignColors }
  Object.entries(storedTheme.designColors ?? {}).forEach(([key, value]) => {
    if (themeDesignColorFields.some((field) => field.key === key) && typeof value === 'string' && isHexColor(value)) designColors[key as DesignColorKey] = value
  })
  themeColorFields.forEach((field) => {
    if (!storedTheme.designColors?.[field.designKey]) designColors[field.designKey] = colors[field.key]
  })

  const typography = { ...defaultTypography }
  Object.entries(storedTheme.typography ?? {}).forEach(([key, value]) => {
    if (themeTypographyFields.some((field) => field.key === key) && typeof value === 'string' && value.trim()) typography[key as ThemeTypographyKey] = value.trim()
  })

  const radius = { ...defaultRadius }
  Object.entries(storedTheme.radius ?? {}).forEach(([key, value]) => {
    if (themeRadiusFields.some((field) => field.key === key) && typeof value === 'string' && value.trim()) radius[key as ThemeRadiusKey] = value.trim()
  })

  const spacing = { ...defaultSpacing }
  Object.entries(storedTheme.spacing ?? {}).forEach(([key, value]) => {
    if (key in spacing && typeof value === 'string' && value.trim()) spacing[key as ThemeSpacingKey] = value.trim()
  })

  const shadow = { ...defaultShadow }
  Object.entries(storedTheme.shadow ?? {}).forEach(([key, value]) => {
    if (key in shadow && typeof value === 'string' && value.trim()) shadow[key as ThemeShadowKey] = value.trim()
  })

  return { colors, designColors, typography, radius, spacing, shadow }
}

const themeOptions = computed(() => [
  ...themePresets,
  { id: 'custom' as ThemeId, nameKey: 'themeCustom', descriptionKey: 'themeCustomDesc', ...customThemeConfig.value },
])
const activeTheme = computed(() => themeOptions.value.find((theme) => theme.id === selectedThemeId.value) ?? themePresets[0])
const activeThemeColors = computed(() => activeTheme.value.colors)
const activeDesignColors = computed(() => activeTheme.value.designColors)
const themeStyle = computed<CSSProperties>(() => {
  const entries: Array<[string, string]> = []
  Object.entries(activeTheme.value.colors).forEach(([key, value]) => entries.push([`--color-${key}`, hexToRgbTriplet(value)]))
  Object.entries(activeTheme.value.designColors).forEach(([key, value]) => entries.push([`--ds-color-${camelToKebab(key)}`, hexToRgbTriplet(value)]))
  Object.entries(activeTheme.value.typography).forEach(([key, value]) => entries.push([`--ds-font-${camelToKebab(key)}`, value]))
  Object.entries(activeTheme.value.radius).forEach(([key, value]) => entries.push([`--ds-rounded-${camelToKebab(key)}`, value]))
  Object.entries(activeTheme.value.spacing).forEach(([key, value]) => entries.push([`--ds-spacing-${camelToKebab(key)}`, value]))
  Object.entries(activeTheme.value.shadow).forEach(([key, value]) => entries.push([`--ds-shadow-${camelToKebab(key)}`, value]))
  return Object.fromEntries(entries)
})

function selectTheme(id: ThemeId) {
  selectedThemeId.value = id
}

function updateCustomThemeColor(key: ThemeColorKey, value: string) {
  if (!isHexColor(value)) return
  const mappedDesignKey = themeColorFields.find((field) => field.key === key)?.designKey
  customThemeConfig.value = {
    ...customThemeConfig.value,
    colors: { ...customThemeConfig.value.colors, [key]: value },
    designColors: mappedDesignKey ? { ...customThemeConfig.value.designColors, [mappedDesignKey]: value } : customThemeConfig.value.designColors,
  }
  selectedThemeId.value = 'custom'
}

function updateCustomThemeDesignColor(key: DesignColorKey, value: string) {
  if (!isHexColor(value)) return
  const mappedColorKey = themeColorFields.find((field) => field.designKey === key)?.key
  customThemeConfig.value = {
    ...customThemeConfig.value,
    colors: mappedColorKey ? { ...customThemeConfig.value.colors, [mappedColorKey]: value } : customThemeConfig.value.colors,
    designColors: { ...customThemeConfig.value.designColors, [key]: value },
  }
  selectedThemeId.value = 'custom'
}

function updateCustomThemeTypography(key: ThemeTypographyKey, value: string) {
  if (!value.trim()) return
  customThemeConfig.value = { ...customThemeConfig.value, typography: { ...customThemeConfig.value.typography, [key]: value.trim() } }
  selectedThemeId.value = 'custom'
}

function updateCustomThemeRadius(key: ThemeRadiusKey, value: string) {
  if (!value.trim()) return
  customThemeConfig.value = { ...customThemeConfig.value, radius: { ...customThemeConfig.value.radius, [key]: value.trim() } }
  selectedThemeId.value = 'custom'
}

function resetCustomTheme() {
  customThemeConfig.value = createThemeConfig()
  selectedThemeId.value = 'default'
}

function themeLabel(theme: ThemePreset) {
  return themeCopy[theme.nameKey]?.name ?? theme.nameKey
}

function themeDescription(theme: ThemePreset) {
  return themeCopy[theme.nameKey]?.description ?? theme.descriptionKey
}

function exportCustomTheme() {
  const blob = new Blob([JSON.stringify({ version: 2, selectedThemeId: 'custom', ...customThemeConfig.value }, null, 2)], { type: 'application/json;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'prototype-core-theme.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

function importCustomTheme(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as StoredTheme
      customThemeConfig.value = mergeThemeFromStored(parsed)
      selectedThemeId.value = 'custom'
    } catch {
      annotationSyncLabel.value = '主题文件解析失败'
    }
  }
  reader.readAsText(file, 'utf-8')
}

const emptyPrototypeMeta: ScreenMeta = {
  id: '__empty__',
  platform: 'mobile',
  code: '--',
  title: '暂无原型页面',
  subtitle: '等待产品注册',
  icon: PanelTop,
  component: EmptyPrototypeScreen,
  hasTabBar: false,
}
const currentMeta = computed(() => screens.find((screen) => screen.id === currentScreen.value) ?? screens[0] ?? emptyPrototypeMeta)
const selectedFlow = computed(() => mainFlows.value.find((flow) => flow.id === selectedFlowId.value) ?? mainFlows.value[0] ?? null)
const flowScreens = computed<DisplayScreen[]>(() =>
  selectedFlow.value?.rows.flatMap((row, rowIndex) =>
    row
      .filter((node) => node.screenId)
      .map((node, colIndex) => {
        const screen = screens.find((item) => item.id === node.screenId) ?? emptyPrototypeMeta
        return {
          ...screen,
          stateId: node.stateId,
          stateLabel: node.stateId ? getPrototypeStateLabel(screen.id, node.stateId) : undefined,
          flowRow: rowIndex + 1,
          flowCol: colIndex + 1,
          rowLabel: node.rowLabel,
          hasNext: colIndex < row.filter((item) => item.screenId).length - 1,
        }
      }),
  ) ?? [],
)
function getPrototypeStateOptions(screenId: string): PrototypeStateOption[] {
  return (states[screenId] ?? []).map((state) => ({ id: state.id, label: t(state.labelKey) }))
}

function getPrototypeStateLabel(screenId: string, stateId: string) {
  return getPrototypeStateOptions(screenId).find((item) => item.id === stateId)?.label ?? ''
}

function isScreenId(value: string): boolean {
  return screens.some((screen) => screen.id === value)
}

function normalizePrototypeStateId(screenId: string, stateId: unknown): string | undefined {
  const options = getPrototypeStateOptions(screenId)
  return options.find((option) => option.id === stateId)?.id ?? options[0]?.id
}

const activePrototypeStateId = computed<string | undefined>(() => screenStateMap[currentScreen.value])
const currentDisplayScreen = computed<DisplayScreen>(() => ({
  ...currentMeta.value,
  stateId: activePrototypeStateId.value,
  stateLabel: activePrototypeStateId.value ? getPrototypeStateLabel(currentScreen.value, activePrototypeStateId.value) : undefined,
}))
const currentScreenPlatform = computed(() => currentMeta.value.platform)
const overviewScreens = computed<DisplayScreen[]>(() =>
  screens.flatMap((screen) => {
    const states = getPrototypeStateOptions(screen.id)
    if (!states.length) return [{ ...screen }]
    return states.map((state) => ({
      ...screen,
      stateId: state.id,
      stateLabel: state.label,
    }))
  }),
)
const visibleScreens = computed<DisplayScreen[]>(() => {
  if (mode.value === 'overview') return overviewScreens.value
  if (mode.value === 'flow') return flowScreens.value
  return [currentDisplayScreen.value]
})
const prototypeStateOptions = computed(() => getPrototypeStateOptions(currentScreen.value))

function setPrototypeState(screenIdOrStateId: string, stateId?: string) {
  const targetScreenId = stateId === undefined ? currentScreen.value : screenIdOrStateId
  const targetStateId = stateId ?? screenIdOrStateId
  screenStateMap[targetScreenId] = targetStateId
}

function go(id: string) {
  currentScreen.value = id
  const target = screens.find((screen) => screen.id === id)
  if (target?.hasTabBar) selectedTab.value = id
}

function goToAnnotatedScreen(id: string) {
  go(id)
  const currentStateId = activePrototypeStateId.value
  const currentCount = currentStateId ? annotationCountByState(id, currentStateId) : annotationCountByScreen(id)
  const annotatedState = getPrototypeStateOptions(id).find((option) => annotationCountByState(id, option.id) > 0)
  if (currentCount <= 0 && annotatedState) setPrototypeState(id, annotatedState.id)
}

function goTab(id: string) {
  selectedTab.value = id
  go(id)
}

function annotationScopeId(screenId: string, stateId?: string) {
  return stateId ? `${screenId}__${stateId}` : screenId
}

function annotationScopeIdsByScreen(screenId: string) {
  const states = getPrototypeStateOptions(screenId)
  return states.length ? states.map((state) => annotationScopeId(screenId, state.id)) : [annotationScopeId(screenId)]
}

function currentAnnotationScopeId() {
  return annotationScopeId(currentScreen.value, activePrototypeStateId.value)
}

const currentScreenAnnotations = computed(() => annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === currentAnnotationScopeId()))
const currentPageDescription = computed(() => pageDescriptionSourceValues.value[pageDescriptionSelectedSource.value][currentAnnotationScopeId()] ?? null)

function pageDescriptionsByScope(descriptions: PrototypePageDescription[]) {
  return Object.fromEntries(descriptions.map((description) => [annotationScopeId(description.screenId, description.stateId), description]))
}

function setPageDescriptionSourceValue(source: DataSource, scopeId: string, value: PrototypePageDescription | null) {
  const next = { ...pageDescriptionSourceValues.value[source] }
  if (value) next[scopeId] = value
  else delete next[scopeId]
  pageDescriptionSourceValues.value = { ...pageDescriptionSourceValues.value, [source]: next }
}

function selectPageDescriptionSource(source: DataSource) {
  pageDescriptionSourceSelectionTouched.value = true
  pageDescriptionSelectedSource.value = source
  syncPageDescriptionEditor()
}

function isScopeHighlighted(scopeId: string): boolean {
  const fromManifest = pageDescriptionManifest.value?.scopes?.[scopeId]
  if (fromManifest && 'highlighted' in fromManifest) return fromManifest.highlighted === true
  return pageDescriptions.value.some((item) => annotationScopeId(item.screenId, item.stateId) === scopeId && item.highlighted === true)
}

function highlightColorForScope(scopeId: string): string {
  const fromManifest = pageDescriptionManifest.value?.scopes?.[scopeId]
  if (fromManifest?.highlighted === true) return fromManifest.highlightColor ?? '#ef4444'
  return pageDescriptions.value.find((item) => annotationScopeId(item.screenId, item.stateId) === scopeId && item.highlighted === true)?.highlightColor ?? '#ef4444'
}

function isScreenHighlighted(screenId: string): boolean {
  return annotationScopeIdsByScreen(screenId).some((scopeId) => isScopeHighlighted(scopeId))
}

function highlightColorForScreen(screenId: string): string {
  const scopeId = annotationScopeIdsByScreen(screenId).find((id) => isScopeHighlighted(id))
  return scopeId ? highlightColorForScope(scopeId) : '#ef4444'
}

function highlightedStateColorsForScreen(screenId: string): Record<string, string> {
  const stateOptions = getPrototypeStateOptions(screenId)
  const colors: Record<string, string> = {}
  stateOptions.forEach((state) => {
    const scopeId = annotationScopeId(screenId, state.id)
    if (isScopeHighlighted(scopeId)) colors[state.id] = highlightColorForScope(scopeId)
  })
  return colors
}

const activeScreenHighlightedStateColors = computed(() => highlightedStateColorsForScreen(currentScreen.value))

const activeScreenHighlighted = computed(() => isScreenHighlighted(currentScreen.value))

const activeScopeHighlighted = computed(() => isScopeHighlighted(currentAnnotationScopeId()))

const activeAnnotation = computed(() => annotations.value.find((item) => item.id === activeAnnotationId.value) ?? null)
const hoveredAnnotation = computed(() => annotations.value.find((item) => item.id === hoveredAnnotationId.value) ?? null)

function normalizeAnnotationColor(value: unknown) {
  return typeof value === 'string' && isHexColor(value) ? value.toLowerCase() : undefined
}

function annotationPointStyle(annotation: PrototypeAnnotation | AnnotationDraft) {
  const color = normalizeAnnotationColor(annotation.color)
  return {
    left: `${annotation.x}%`,
    top: `${annotation.y}%`,
    ...(color ? { '--annotation-point-color': color } : {}),
  } as CSSProperties
}

function syncPageDescriptionEditor() {
  const current = currentPageDescription.value
  pageDescriptionEditor.value = {
    highlighted: current?.highlighted ?? false,
    highlightColor: current?.highlightColor ?? '#ef4444',
    purpose: current?.purpose ?? '',
    structure: current?.structure ?? '',
    features: current?.features ?? '',
    flowPosition: current?.flowPosition ?? '',
    interactionRules: current?.interactionRules ?? '',
    stateCriteria: current?.stateCriteria ?? '',
    edgeCases: current?.edgeCases ?? '',
    acceptanceCriteria: current?.acceptanceCriteria ?? '',
    developmentNotes: current?.developmentNotes ?? '',
  }
}

function normalizeAnnotations(value: unknown): PrototypeAnnotation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<PrototypeAnnotation>
    if (!raw.id || !raw.screenId || !isScreenId(raw.screenId)) return []
    return [{
      id: String(raw.id),
      screenId: raw.screenId,
      stateId: normalizePrototypeStateId(raw.screenId, raw.stateId),
      x: Number(raw.x) || 50,
      y: Number(raw.y) || 50,
      featureName: String(raw.featureName ?? ''),
      featureDescription: String(raw.featureDescription ?? ''),
      specialNote: String(raw.specialNote ?? ''),
      color: normalizeAnnotationColor(raw.color),
      authorName: raw.authorName,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }]
  })
}

function normalizePageDescriptions(value: unknown): PrototypePageDescription[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<PrototypePageDescription>
    if (!raw.screenId || !isScreenId(raw.screenId)) return []
    return [{
      screenId: raw.screenId,
      stateId: normalizePrototypeStateId(raw.screenId, raw.stateId),
      highlighted: raw.highlighted === true,
      highlightColor: typeof raw.highlightColor === 'string' ? raw.highlightColor : undefined,
      purpose: String(raw.purpose ?? ''),
      structure: String(raw.structure ?? ''),
      features: String(raw.features ?? ''),
      flowPosition: String(raw.flowPosition ?? ''),
      interactionRules: String(raw.interactionRules ?? ''),
      stateCriteria: String(raw.stateCriteria ?? ''),
      edgeCases: String(raw.edgeCases ?? ''),
      acceptanceCriteria: String(raw.acceptanceCriteria ?? ''),
      developmentNotes: String(raw.developmentNotes ?? ''),
      authorName: raw.authorName,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }]
  })
}

async function loadLocalJson<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const baseUrl = getPrototypeRuntime().baseUrl ?? '/'
    const response = await fetch(`${baseUrl.replace(/\/?$/, '/')}${fileName}`, { cache: 'no-store' })
    if (!response.ok) return fallback
    return (await response.json()) as T
  } catch {
    return fallback
  }
}

async function initializePrototype() {
  if (typeof window !== 'undefined') window.__PROTOTYPE_CORE__ = { syncPageDescriptionsFromJson }
  const savedAuthor = storage()?.getItem(ANNOTATION_AUTHOR_STORAGE_KEY)
  if (savedAuthor) annotationAuthorName.value = savedAuthor
  const savedIntervalRaw = storage()?.getItem(ANNOTATION_POLLING_INTERVAL_STORAGE_KEY)
  const savedInterval = savedIntervalRaw === null || savedIntervalRaw === undefined ? Number.NaN : Number(savedIntervalRaw)
  if (Number.isFinite(savedInterval)) {
    annotationPollingIntervalSeconds.value = Math.min(MAX_ANNOTATION_POLLING_INTERVAL_SECONDS, Math.max(MIN_ANNOTATION_POLLING_INTERVAL_SECONDS, savedInterval))
    annotationPollingIntervalInput.value = String(annotationPollingIntervalSeconds.value)
  }

  try {
    const storedTheme = JSON.parse(storage()?.getItem(CUSTOM_THEME_STORAGE_KEY) ?? 'null') as StoredTheme | null
    if (storedTheme?.colors || storedTheme?.designColors || storedTheme?.typography || storedTheme?.radius || storedTheme?.spacing || storedTheme?.shadow) {
      customThemeConfig.value = mergeThemeFromStored(storedTheme)
      selectedThemeId.value = storedTheme.selectedThemeId ?? selectedThemeId.value
    }
  } catch {
    storage()?.removeItem(CUSTOM_THEME_STORAGE_KEY)
  }

  const [flowData, localDescriptions, localAnnotations] = await Promise.all([
    loadLocalJson<{ flows?: MainFlow[] }>('flows.json', { flows: [] }),
    loadLocalJson<unknown>('page-descriptions.json', []),
    loadLocalJson<unknown>('annotations.json', []),
  ])
  const seeds = {
    annotations: normalizeAnnotations(localAnnotations),
    pageDescriptions: normalizePageDescriptions(localDescriptions),
    flows: Array.isArray(flowData.flows) && flowData.flows.length ? flowData.flows : productFlows.flows,
  }
  const legacyAnnotations = readLegacyCollaborationCache<PrototypeAnnotation[]>('annotations')
  const legacyDescriptions = readLegacyCollaborationCache<PrototypePageDescription[]>('pageDescriptions')
  if (legacyAnnotations) {
    const scopes: ReturnType<typeof readScopedCollaborationCache<PrototypeAnnotation[]>>['scopes'] = {}
    normalizeAnnotations(legacyAnnotations.value).forEach((item) => {
      const id = annotationScopeId(item.screenId, item.stateId)
      const entry = scopes[id] ?? { value: [], revision: null, cachedAt: new Date().toISOString(), lastRemoteSyncAt: null, status: 'stale' as const }
      entry.value.push(item)
      scopes[id] = entry
    })
    replaceScopedCollaborationCache('annotations', scopes)
  }
  if (legacyDescriptions) {
    const scopes: ReturnType<typeof readScopedCollaborationCache<PrototypePageDescription>>['scopes'] = {}
    normalizePageDescriptions(legacyDescriptions.value).forEach((item) => {
      scopes[annotationScopeId(item.screenId, item.stateId)] = { value: item, revision: null, cachedAt: new Date().toISOString(), lastRemoteSyncAt: null, status: 'stale' }
    })
    replaceScopedCollaborationCache('pageDescriptions', scopes)
  }
  const scopedAnnotations = readScopedCollaborationCache<PrototypeAnnotation[]>('annotations')
  const scopedDescriptions = readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions')
  const cachedAnnotations = Object.values(scopedAnnotations.scopes).flatMap((entry) => entry.value)
  const cachedDescriptions = Object.values(scopedDescriptions.scopes).map((entry) => entry.value)
  const annotationCachedScopeIds = new Set(Object.keys(scopedAnnotations.scopes))
  const descriptionCachedScopeIds = new Set(Object.keys(scopedDescriptions.scopes))
  const mergedCachedAnnotations = [...seeds.annotations.filter((item) => !annotationCachedScopeIds.has(annotationScopeId(item.screenId, item.stateId))), ...cachedAnnotations]
  const mergedCachedDescriptions = [...seeds.pageDescriptions.filter((item) => !descriptionCachedScopeIds.has(annotationScopeId(item.screenId, item.stateId))), ...cachedDescriptions]
  const flowCache = migrateFileCollaborationCache<MainFlow[]>('flows')
  const annotationFallback = annotationCachedScopeIds.size ? { value: mergedCachedAnnotations, source: 'local-cache' as const } : { value: seeds.annotations, source: 'local-seed' as const }
  const descriptionFallback = descriptionCachedScopeIds.size ? { value: mergedCachedDescriptions, source: 'local-cache' as const } : { value: seeds.pageDescriptions, source: 'local-seed' as const }
  const flowFallback = selectLocalFallback(flowCache, seeds.flows)
  annotations.value = annotationFallback.value
  pageDescriptions.value = descriptionFallback.value
  pageDescriptionSourceValues.value = {
    gitee: {},
    'local-cache': pageDescriptionsByScope(cachedDescriptions),
    'local-seed': pageDescriptionsByScope(seeds.pageDescriptions),
  }
  pageDescriptionSelectedSource.value = pageDescriptionSourceValues.value['local-cache'][currentAnnotationScopeId()] ? 'local-cache' : 'local-seed'
  mainFlows.value = flowFallback.value
  setCollaborationSource('annotations', annotationFallback.source, 'idle')
  setCollaborationSource('pageDescriptions', descriptionFallback.source, 'idle')
  setCollaborationSource('flows', flowFallback.source, 'idle')
  selectedFlowId.value = mainFlows.value[0]?.id ?? ''

  if (annotationRemoteReady.value) await refreshAllCollaborationData(false)
  else annotationSyncLabel.value = collaborationContext.unavailableReason
  syncPageDescriptionEditor()
  collaborationInitialized.value = true
}

watch([customThemeConfig, selectedThemeId], () => {
  storage()?.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({ version: 2, selectedThemeId: selectedThemeId.value, ...customThemeConfig.value }))
}, { deep: true })

watch(annotationAuthorName, (value) => {
  if (value.trim()) storage()?.setItem(ANNOTATION_AUTHOR_STORAGE_KEY, value.trim())
})

watch([currentScreen, activePrototypeStateId], () => {
  syncPageDescriptionEditor()
  if (annotationRemoteReady.value) {
    void refreshPrototypeAnnotations(false)
    void refreshPageDescriptions(false)
  }
})

function updateManifestCount(screenId: string, stateId: string | undefined, count: number) {
  const now = new Date().toISOString()
  const scopeId = annotationScopeId(screenId, stateId)
  const existing = annotationManifest.value ?? {
    projectId: collaborationContext.projectId,
    updatedAt: now,
    scopes: {},
    screens: {},
  }
  existing.scopes = { ...(existing.scopes ?? {}), [scopeId]: { count, updatedAt: now } }
  const total = annotationScopeIdsByScreen(screenId).reduce((sum, id) => sum + (existing.scopes?.[id]?.count ?? 0), 0)
  existing.screens = { ...existing.screens, [screenId]: { count: total, updatedAt: now } }
  existing.updatedAt = now
  annotationManifest.value = existing
}

function updatePageDescriptionManifest(screenId: string, stateId: string | undefined, count: number, highlighted?: boolean, highlightColor?: string) {
  const now = new Date().toISOString()
  const scopeId = annotationScopeId(screenId, stateId)
  const existing = pageDescriptionManifest.value ?? {
    projectId: collaborationContext.projectId,
    updatedAt: now,
    scopes: {},
    screens: {},
  }
  existing.scopes = {
    ...(existing.scopes ?? {}),
    [scopeId]: highlighted === true ? { count, updatedAt: now, highlighted: true, highlightColor: highlightColor ?? '#ef4444' } : { count, updatedAt: now },
  }
  const total = annotationScopeIdsByScreen(screenId).reduce((sum, id) => sum + (existing.scopes?.[id]?.count ?? 0), 0)
  existing.screens = { ...existing.screens, [screenId]: { count: total, updatedAt: now } }
  existing.updatedAt = now
  pageDescriptionManifest.value = existing
}

async function loadScreenAnnotationsFromRemote(screenId: string, stateId = normalizePrototypeStateId(screenId, activePrototypeStateId.value), fromPolling = false) {
  const remote = await loadRemoteScreenAnnotations(annotationScopeId(screenId, stateId))
  if (!remote) return false
  const scopeId = annotationScopeId(screenId, stateId)
  rememberRemoteRevision('annotations', remote.sha, fromPolling, '注释', scopeId)
  const next = normalizeAnnotations(remote.value).map((item) => ({ ...item, screenId, stateId }))
  const merged = [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), ...next]
  const syncedAt = new Date().toISOString()
  writeScopedCollaborationCache('annotations', scopeId, next, remote.sha, syncedAt, 'synced')
  annotations.value = merged
  updateManifestCount(screenId, stateId, next.length)
  setCollaborationSource('annotations', 'gitee', 'success', remote.legacy ? '已读取主分支旧目录' : '', syncedAt)
  return true
}

async function loadCurrentPageDescriptionFromRemote(fromPolling = false) {
  const screenId = currentScreen.value
  const stateId = activePrototypeStateId.value
  const scopeId = annotationScopeId(screenId, stateId)
  const remote = await loadRemotePageDescription(annotationScopeId(screenId, stateId))
  if (!remote) return false
  rememberRemoteRevision('pageDescriptions', remote.sha, fromPolling, '页面描述', scopeId)
  const value = normalizePageDescriptions([{ ...remote.value, screenId, stateId }])[0]
  if (!value) return
  const syncedAt = new Date().toISOString()
  setPageDescriptionSourceValue('gitee', scopeId, value)
  const cached = readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions').scopes[scopeId]
  if (cached?.status === 'pending') {
    setCollaborationSource('pageDescriptions', 'local-cache', 'idle', '已读取 Gitee，本地缓存仍有待推送修改', syncedAt)
  } else {
    const merged = [...pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), value]
    writeScopedCollaborationCache('pageDescriptions', scopeId, value, remote.sha, syncedAt, 'synced')
    setPageDescriptionSourceValue('local-cache', scopeId, value)
    pageDescriptions.value = merged
    updatePageDescriptionManifest(screenId, stateId, 1, value.highlighted, value.highlightColor)
    if (!pageDescriptionSourceSelectionTouched.value) pageDescriptionSelectedSource.value = 'gitee'
    setCollaborationSource('pageDescriptions', 'gitee', 'success', remote.legacy ? '已读取主分支旧目录' : '', syncedAt)
  }
  if (scopeId === currentAnnotationScopeId()) syncPageDescriptionEditor()
  return true
}

async function refreshPrototypeAnnotations(fromPolling = false) {
  if (!annotationRemoteReady.value) return
  if (shouldDeferRemoteRefresh(fromPolling, collaborationEditing.value.annotations)) {
    setCollaborationSource('annotations', collaborationSources.value.annotations.source, 'idle', '检测到本地编辑，已暂缓轮询覆盖')
    return
  }
  annotationSyncStatus.value = 'syncing'
  setCollaborationSource('annotations', collaborationSources.value.annotations.source, 'syncing')
  try {
    const manifest = await loadRemoteAnnotationManifest()
    annotationManifest.value = manifest?.value ?? annotationManifest.value
    const loaded = await loadScreenAnnotationsFromRemote(currentScreen.value, activePrototypeStateId.value, fromPolling)
    const currentScopeId = annotationScopeId(currentScreen.value, activePrototypeStateId.value)
    if (!loaded && !manifest?.value.scopes?.[currentScopeId]) {
      const merged = annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== currentScopeId)
      const syncedAt = new Date().toISOString()
      removeScopedCollaborationCache('annotations', currentScopeId)
      annotations.value = merged
      setCollaborationSource('annotations', 'gitee', 'success', '', syncedAt)
    } else if (!loaded) {
      throw new Error('Gitee 当前注释文件不存在')
    }
    annotationSyncStatus.value = 'success'
    annotationSyncLabel.value = '注释已同步'
  } catch (error) {
    const scopeId = currentAnnotationScopeId()
    const cached = readScopedCollaborationCache<PrototypeAnnotation[]>('annotations').scopes[scopeId]
    if (cached) writeScopedCollaborationCache('annotations', scopeId, cached.value, cached.revision, cached.lastRemoteSyncAt, 'stale', error instanceof Error ? error.message : '注释同步失败')
    annotationSyncStatus.value = 'error'
    annotationSyncLabel.value = '注释同步失败'
    setCollaborationSource('annotations', collaborationSources.value.annotations.source, 'error', error instanceof Error ? error.message : '注释同步失败')
  }
}

async function refreshPageDescriptions(fromPolling = false) {
  if (!annotationRemoteReady.value) return
  if (shouldDeferRemoteRefresh(fromPolling, collaborationEditing.value.pageDescriptions)) {
    setCollaborationSource('pageDescriptions', collaborationSources.value.pageDescriptions.source, 'idle', '检测到本地编辑，已暂缓轮询覆盖')
    return
  }
  annotationSyncStatus.value = 'syncing'
  setCollaborationSource('pageDescriptions', collaborationSources.value.pageDescriptions.source, 'syncing')
  try {
    const manifest = await loadRemotePageDescriptionManifest()
    pageDescriptionManifest.value = manifest?.value ?? pageDescriptionManifest.value
    const loaded = await loadCurrentPageDescriptionFromRemote(fromPolling)
    const currentScopeId = currentAnnotationScopeId()
    if (!loaded && !manifest?.value.scopes?.[currentScopeId]) {
      setPageDescriptionSourceValue('gitee', currentScopeId, null)
      const cached = readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions').scopes[currentScopeId]
      if (cached?.status === 'pending') {
        setCollaborationSource('pageDescriptions', 'local-cache', 'idle', 'Gitee 当前 Scope 不存在，本地缓存待推送')
      } else {
        removeScopedCollaborationCache('pageDescriptions', currentScopeId)
        setPageDescriptionSourceValue('local-cache', currentScopeId, null)
        pageDescriptions.value = pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== currentScopeId)
        setCollaborationSource('pageDescriptions', 'gitee', 'success', '', new Date().toISOString())
      }
      syncPageDescriptionEditor()
    } else if (!loaded) throw new Error('Gitee 当前页面描述不存在')
    annotationSyncStatus.value = 'success'
    annotationSyncLabel.value = collaborationSources.value.pageDescriptions.source === 'local-cache'
      ? '已读取 Gitee，本地缓存待推送'
      : '页面说明已同步'
  } catch (error) {
    const scopeId = currentAnnotationScopeId()
    const cached = readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions').scopes[scopeId]
    if (cached) writeScopedCollaborationCache('pageDescriptions', scopeId, cached.value, cached.revision, cached.lastRemoteSyncAt, cached.status === 'pending' ? 'pending' : 'stale', error instanceof Error ? error.message : '页面描述同步失败')
    annotationSyncStatus.value = 'error'
    annotationSyncLabel.value = '页面说明同步失败'
    setCollaborationSource('pageDescriptions', collaborationSources.value.pageDescriptions.source, 'error', error instanceof Error ? error.message : '页面描述同步失败')
  }
}

async function refreshFlows(fromPolling = false) {
  if (!annotationRemoteReady.value) return
  if (localFlowDraftDirty.value) {
    mainFlows.value = readCollaborationCache<MainFlow[]>('flows')?.value ?? mainFlows.value
    setCollaborationSource('flows', 'local-cache', 'idle', '存在未推送到 Gitee 的本地流程')
    return
  }
  if (shouldDeferRemoteRefresh(fromPolling, collaborationEditing.value.flows)) {
    setCollaborationSource('flows', collaborationSources.value.flows.source, 'idle', '检测到流程编辑，已暂缓轮询覆盖')
    return
  }
  setCollaborationSource('flows', collaborationSources.value.flows.source, 'syncing')
  try {
    const remote = await loadRemoteFlows()
    const flows = Array.isArray(remote?.value?.flows) ? remote.value.flows : null
    if (!remote || !flows) throw new Error('Gitee 流程文件不存在')
    rememberRemoteRevision('flows', remote.sha, fromPolling, '流程')
    const syncedAt = new Date().toISOString()
    writeCollaborationCache('flows', flows, remote.sha, syncedAt, 'synced')
    mainFlows.value = readCollaborationCache<MainFlow[]>('flows')?.value ?? flows
    if (!mainFlows.value.some((flow) => flow.id === selectedFlowId.value)) selectedFlowId.value = mainFlows.value[0]?.id ?? ''
    setCollaborationSource('flows', 'gitee', 'success', '', syncedAt)
  } catch (error) {
    const cached = readCollaborationCache<MainFlow[]>('flows')
    if (cached) writeCollaborationCache('flows', cached.value, cached.revision, cached.lastRemoteSyncAt, 'stale', error instanceof Error ? error.message : '流程同步失败')
    setCollaborationSource('flows', collaborationSources.value.flows.source, 'error', error instanceof Error ? error.message : '流程同步失败')
  }
}

async function refreshAllCollaborationData(fromPolling = false) {
  await Promise.all([refreshPrototypeAnnotations(fromPolling), refreshPageDescriptions(fromPolling), refreshFlows(fromPolling)])
}

function buildInitializationManifest(kind: 'annotations' | 'pageDescriptions') {
  const now = new Date().toISOString()
  const items = kind === 'annotations' ? annotations.value : pageDescriptions.value
  const grouped = new Map<string, { screenId: string; count: number; highlighted: boolean; highlightColor?: string }>()
  items.forEach((item) => {
    const id = annotationScopeId(item.screenId, item.stateId)
    const existing = grouped.get(id)
    const itemHighlighted = kind === 'pageDescriptions' && (item as PrototypePageDescription).highlighted === true
    grouped.set(id, {
      screenId: item.screenId,
      count: (existing?.count ?? 0) + 1,
      highlighted: existing?.highlighted === true || itemHighlighted,
      highlightColor: itemHighlighted ? (item as PrototypePageDescription).highlightColor ?? '#ef4444' : existing?.highlightColor,
    })
  })
  const scopes: NonNullable<AnnotationManifest['scopes']> = {}
  const screenCounts: AnnotationManifest['screens'] = {}
  grouped.forEach(({ screenId, count, highlighted, highlightColor }, id) => {
    scopes[id] = highlighted === true ? { count, updatedAt: now, highlighted: true, highlightColor: highlightColor ?? '#ef4444' } : { count, updatedAt: now }
    screenCounts[screenId] = { count: (screenCounts[screenId]?.count ?? 0) + count, updatedAt: now }
  })
  return { projectId: collaborationContext.projectId, updatedAt: now, scopes, screens: screenCounts } satisfies AnnotationManifest
}

async function initializeRemoteCollaborationData() {
  if (!collaborationContext.remoteWritable || collaborationBootstrapStatus.value === 'running') return
  const author = annotationAuthorName.value.trim() || '初始化工具'
  collaborationBootstrapStatus.value = 'running'
  collaborationBootstrapMessage.value = ''
  collaborationBootstrapProgress.value = { current: 0, total: 1, label: '检查初始化状态' }
  try {
    if (await hasRemoteInitializationMarker()) {
      collaborationBootstrapStatus.value = 'success'
      collaborationBootstrapProgress.value = { current: 1, total: 1, label: '远端已初始化' }
      collaborationBootstrapMessage.value = '远端已初始化：未逐文件检查，未产生重复提交'
      await refreshAllCollaborationData(false)
      return
    }
  } catch (error) {
    collaborationBootstrapStatus.value = 'partial'
    collaborationBootstrapProgress.value = { current: 1, total: 1, label: '初始化状态检查失败' }
    collaborationBootstrapMessage.value = error instanceof Error ? error.message : '无法检查 Gitee 初始化状态'
    console.error('❌ [Gitee 初始化] 初始化状态检查失败', { error })
    return
  }

  const tasks: Array<{ label: string; run: () => Promise<'created' | 'unchanged' | 'protected'> }> = []
  const annotationGroups = new Map<string, PrototypeAnnotation[]>()
  annotations.value.forEach((annotation) => {
    const id = annotationScopeId(annotation.screenId, annotation.stateId)
    annotationGroups.set(id, [...(annotationGroups.get(id) ?? []), annotation])
  })
  annotationGroups.forEach((value, id) => tasks.push({ label: `注释：${id}`, run: () => ensureRemoteData('annotations', id, value, author) }))
  tasks.push({ label: '注释索引', run: () => ensureRemoteData('annotations', undefined, buildInitializationManifest('annotations'), author) })
  pageDescriptions.value.forEach((description) => {
    const id = annotationScopeId(description.screenId, description.stateId)
    tasks.push({ label: `页面描述：${id}`, run: () => ensureRemoteData('pageDescriptions', id, description, author) })
  })
  tasks.push({ label: '页面描述索引', run: () => ensureRemoteData('pageDescriptions', undefined, buildInitializationManifest('pageDescriptions'), author) })
  tasks.push({ label: '流程', run: () => ensureRemoteData('flows', undefined, { version: '1.0.0', flows: mainFlows.value }, author) })

  collaborationBootstrapProgress.value = { current: 0, total: tasks.length + 1, label: '' }
  const counts = { created: 0, unchanged: 0, protected: 0, failed: 0 }
  for (const task of tasks) {
    collaborationBootstrapProgress.value = { ...collaborationBootstrapProgress.value, label: task.label }
    try {
      counts[await task.run()] += 1
    } catch (error) {
      counts.failed += 1
      console.error('❌ [Gitee 初始化] 文件处理失败', { label: task.label, error })
    } finally {
      collaborationBootstrapProgress.value = { ...collaborationBootstrapProgress.value, current: collaborationBootstrapProgress.value.current + 1 }
    }
  }
  collaborationBootstrapProgress.value = { ...collaborationBootstrapProgress.value, label: counts.failed ? '存在失败，暂不写完成标记' : '写入初始化完成标记' }
  if (!counts.failed) {
    try {
      counts[await ensureRemoteInitializationMarker({ schemaVersion: 1, branchKey: collaborationContext.branchKey, completedAt: new Date().toISOString(), fileCount: tasks.length }, author)] += 1
    } catch (error) {
      counts.failed += 1
      console.error('❌ [Gitee 初始化] 完成标记写入失败', { error })
    }
  }
  collaborationBootstrapProgress.value = { ...collaborationBootstrapProgress.value, current: collaborationBootstrapProgress.value.current + 1 }
  collaborationBootstrapStatus.value = counts.failed ? 'partial' : 'success'
  collaborationBootstrapMessage.value = counts.failed
    ? `初始化部分完成：新建 ${counts.created}，跳过 ${counts.unchanged + counts.protected}，失败 ${counts.failed}`
    : counts.created
      ? `初始化成功：新建 ${counts.created}，跳过 ${counts.unchanged + counts.protected}`
      : `远端已初始化：未重复创建，检查 ${counts.unchanged + counts.protected}`
  await refreshAllCollaborationData(false)
}

function startAnnotationPlacement() {
  isPlacingAnnotation.value = true
  annotationDraft.value = null
}

function cancelAnnotationDraft() {
  isPlacingAnnotation.value = false
  annotationDraft.value = null
  annotationDialogMode.value = 'view'
}

function handleAnnotationCanvasClick(event: MouseEvent, screenId: string) {
  if (!isPlacingAnnotation.value) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const layer = target.querySelector<HTMLElement>('.annotation-layer')
  const fullWidth = layer?.scrollWidth ?? rect.width
  const fullHeight = layer?.scrollHeight ?? rect.height
  annotationDraft.value = {
    screenId,
    stateId: normalizePrototypeStateId(screenId, activePrototypeStateId.value),
    x: Math.round(((event.clientX - rect.left + target.scrollLeft) / fullWidth) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top + target.scrollTop) / fullHeight) * 1000) / 10,
    featureName: '',
    featureDescription: '',
    specialNote: '',
    color: activeThemeColors.value.ocean,
  }
  annotationEditor.value = { featureName: '', featureDescription: '', specialNote: '', color: activeThemeColors.value.ocean }
  annotationDialogMode.value = 'create'
}

async function submitRemoteAnnotationChange(screenId: string, stateId: string | undefined, operation: AnnotationOperation, transform: (value: PrototypeAnnotation[]) => PrototypeAnnotation[]) {
  if (!annotationRemoteReady.value) return null
  try {
    const saved = await updateRemoteScreenAnnotations(annotationScopeId(screenId, stateId), annotationAuthorName.value.trim() || '未署名', operation, transform)
    if (!saved) return null
    const values = normalizeAnnotations(saved.value).map((item) => ({ ...item, screenId, stateId }))
    updateManifestCount(screenId, stateId, values.length)
    const syncedAt = new Date().toISOString()
    const merged = [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== annotationScopeId(screenId, stateId)), ...values]
    writeScopedCollaborationCache('annotations', annotationScopeId(screenId, stateId), values, saved.sha, syncedAt, 'synced')
    annotations.value = merged
    if (annotationManifest.value) {
      try {
        await saveRemoteAnnotationManifest(annotationManifest.value, annotationAuthorName.value.trim() || '未署名', annotationScopeId(screenId, stateId))
      } catch (error) {
        setCollaborationSource('annotations', 'gitee', 'error', `注释已保存，但索引同步失败：${error instanceof Error ? error.message : '未知错误'}`, syncedAt)
        return values
      }
    }
    setCollaborationSource('annotations', 'gitee', 'success', '', syncedAt)
    return values
  } catch (error) {
    const message = error instanceof Error ? error.message : '注释保存失败'
    if (error instanceof CollaborationConflictError) markCollaborationConflict('annotations', message)
    else setCollaborationSource('annotations', collaborationSources.value.annotations.source, 'error', message)
    return undefined
  }
}

async function saveAnnotationDraft() {
  const draft = annotationDraft.value
  if (!draft) return
  const now = new Date().toISOString()
  const next: PrototypeAnnotation = {
    ...draft,
    id: `annotation-${Date.now()}`,
    featureName: draft.featureName.trim(),
    featureDescription: draft.featureDescription.trim(),
    specialNote: draft.specialNote.trim(),
    color: normalizeAnnotationColor(draft.color),
    authorName: annotationAuthorName.value.trim() || '未署名',
    createdAt: now,
    updatedAt: now,
  }
  const saved = await submitRemoteAnnotationChange(draft.screenId, draft.stateId, '新增', (remote) => [...remote, next])
  if (saved === undefined) return
  if (saved) {
    annotations.value = [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== annotationScopeId(draft.screenId, draft.stateId)), ...saved]
  } else {
    annotations.value = [...annotations.value, next]
    updateManifestCount(draft.screenId, draft.stateId, currentScreenAnnotations.value.length)
    writeScopedCollaborationCache('annotations', annotationScopeId(draft.screenId, draft.stateId), currentScreenAnnotations.value, null, null, 'pending')
    setCollaborationSource('annotations', 'local-cache', 'success', collaborationContext.unavailableReason)
  }
  cancelAnnotationDraft()
}

function openAnnotationDialog(id: string) {
  const target = annotations.value.find((item) => item.id === id)
  if (!target) return
  activeAnnotationId.value = id
  annotationEditor.value = {
    featureName: target.featureName,
    featureDescription: target.featureDescription,
    specialNote: target.specialNote,
    color: normalizeAnnotationColor(target.color) ?? activeThemeColors.value.ocean,
  }
  annotationDialogMode.value = 'edit'
}

function closeAnnotationDialog() {
  activeAnnotationId.value = ''
  annotationDialogMode.value = 'view'
}

async function saveAnnotationEdit() {
  const active = activeAnnotation.value
  if (!active) return
  const now = new Date().toISOString()
  const applyEdit = (item: PrototypeAnnotation) =>
    item.id === active.id
      ? {
          ...item,
          featureName: annotationEditor.value.featureName.trim() || item.featureName,
          featureDescription: annotationEditor.value.featureDescription.trim() || item.featureDescription,
          specialNote: annotationEditor.value.specialNote.trim(),
          color: normalizeAnnotationColor(annotationEditor.value.color) ?? item.color,
          authorName: annotationAuthorName.value.trim() || item.authorName,
          updatedAt: now,
        }
      : item
  const saved = await submitRemoteAnnotationChange(active.screenId, active.stateId, '编辑', (remote) => remote.map(applyEdit))
  if (saved === undefined) return
  annotations.value = saved ? [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== annotationScopeId(active.screenId, active.stateId)), ...saved] : annotations.value.map(applyEdit)
  if (saved === null) writeScopedCollaborationCache('annotations', annotationScopeId(active.screenId, active.stateId), annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === annotationScopeId(active.screenId, active.stateId)), null, null, 'pending')
  closeAnnotationDialog()
}

async function updateAnnotationPosition(id: string, x: number, y: number) {
  const target = annotations.value.find((item) => item.id === id)
  if (!target) return false
  const now = new Date().toISOString()
  const applyPosition = (item: PrototypeAnnotation): PrototypeAnnotation =>
    item.id === id
      ? {
          ...item,
          x: Math.min(96, Math.max(4, x)),
          y: Math.min(96, Math.max(4, y)),
          authorName: annotationAuthorName.value.trim() || item.authorName || '未署名',
          updatedAt: now,
        }
      : item
  const movedTarget = applyPosition(target)
  const saved = await submitRemoteAnnotationChange(target.screenId, target.stateId, '编辑', (remote) =>
    remote.some((item) => item.id === id) ? remote.map(applyPosition) : [...remote, movedTarget],
  )
  if (saved === undefined) return false
  annotations.value = saved
    ? [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== annotationScopeId(target.screenId, target.stateId)), ...saved]
    : annotations.value.map(applyPosition)
  if (saved === null) writeScopedCollaborationCache('annotations', annotationScopeId(target.screenId, target.stateId), annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === annotationScopeId(target.screenId, target.stateId)), null, null, 'pending')
  return true
}

async function removeAnnotation(id: string) {
  const target = annotations.value.find((item) => item.id === id)
  if (!target) return
  const saved = await submitRemoteAnnotationChange(target.screenId, target.stateId, '删除', (remote) => remote.filter((item) => item.id !== id))
  if (saved === undefined) return
  annotations.value = saved ? [...annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== annotationScopeId(target.screenId, target.stateId)), ...saved] : annotations.value.filter((item) => item.id !== id)
  if (saved === null) writeScopedCollaborationCache('annotations', annotationScopeId(target.screenId, target.stateId), annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === annotationScopeId(target.screenId, target.stateId)), null, null, 'pending')
  updateManifestCount(target.screenId, target.stateId, annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === annotationScopeId(target.screenId, target.stateId)).length)
}

function showAnnotationPopover(id: string) {
  if (showAnnotationTimer.value) window.clearTimeout(showAnnotationTimer.value)
  hoveredAnnotationId.value = id
}

function keepAnnotationPopover() {
  if (showAnnotationTimer.value) window.clearTimeout(showAnnotationTimer.value)
}

function scheduleHideAnnotationPopover() {
  showAnnotationTimer.value = window.setTimeout(() => {
    hoveredAnnotationId.value = ''
  }, 160)
}

function annotationCountByScreen(screenId: string) {
  const scopeCounts = annotationScopeIdsByScreen(screenId).map((scopeId) => annotationManifest.value?.scopes?.[scopeId]?.count)
  if (scopeCounts.some((count) => typeof count === 'number')) return scopeCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
  return annotations.value.filter((item) => item.screenId === screenId).length
}

function annotationCountByState(screenId: string, stateId: string) {
  const scopeId = annotationScopeId(screenId, stateId)
  return annotationManifest.value?.scopes?.[scopeId]?.count ?? annotations.value.filter((item) => annotationScopeId(item.screenId, item.stateId) === scopeId).length
}

function buildCurrentPageDescription(): PrototypePageDescription {
  const screenId = currentScreen.value
  const stateId = activePrototypeStateId.value
  const now = new Date().toISOString()
  const current = currentPageDescription.value
  return {
    screenId,
    stateId,
    ...pageDescriptionEditor.value,
    authorName: annotationAuthorName.value.trim() || '未署名',
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
}

function saveCurrentPageDescriptionToCache() {
  const next = buildCurrentPageDescription()
  const scopeId = annotationScopeId(next.screenId, next.stateId)
  const cached = readScopedCollaborationCache<PrototypePageDescription>('pageDescriptions').scopes[scopeId]
  writeScopedCollaborationCache('pageDescriptions', scopeId, next, cached?.revision ?? null, cached?.lastRemoteSyncAt ?? null, 'pending')
  setPageDescriptionSourceValue('local-cache', scopeId, next)
  pageDescriptions.value = [...pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), next]
  updatePageDescriptionManifest(next.screenId, next.stateId, 1, next.highlighted, next.highlightColor)
  setCollaborationSource('pageDescriptions', 'local-cache', 'success', '页面描述已保存到本地缓存，尚未推送 Gitee')
  return true
}

async function savePageDescriptionToGitee(next: PrototypePageDescription) {
  if (!collaborationContext.remoteWritable) {
    setCollaborationSource('pageDescriptions', pageDescriptionSelectedSource.value, 'error', collaborationContext.unavailableReason || 'Gitee 当前不可写')
    return false
  }
  const scopeId = annotationScopeId(next.screenId, next.stateId)
  try {
    const saved = await saveRemotePageDescription(scopeId, next.authorName ?? '未署名', next)
    if (!saved) return false
    updatePageDescriptionManifest(next.screenId, next.stateId, 1, next.highlighted, next.highlightColor)
    if (!pageDescriptionManifest.value) return false
    const savedManifest = await saveRemotePageDescriptionManifest(pageDescriptionManifest.value, next.authorName ?? '未署名', scopeId)
    if (!savedManifest) throw new Error(`页面描述 ${scopeId} 已写入，但 manifest 回读失败`)
    const canonical = normalizePageDescriptions([{ ...saved.value, screenId: next.screenId, stateId: next.stateId }])[0]
    if (!canonical) throw new Error(`页面描述 ${scopeId} 回读内容无效`)
    const syncedAt = new Date().toISOString()
    writeScopedCollaborationCache('pageDescriptions', scopeId, canonical, saved.sha, syncedAt, 'synced')
    setPageDescriptionSourceValue('gitee', scopeId, canonical)
    setPageDescriptionSourceValue('local-cache', scopeId, canonical)
    pageDescriptions.value = [...pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), canonical]
    pageDescriptionManifest.value = savedManifest.value
    setCollaborationSource('pageDescriptions', 'gitee', 'success', '', syncedAt)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '页面描述保存失败'
    if (error instanceof CollaborationConflictError) markCollaborationConflict('pageDescriptions', message)
    else setCollaborationSource('pageDescriptions', collaborationSources.value.pageDescriptions.source, 'error', message)
    return false
  }
}

async function saveCurrentPageDescription() {
  const next = buildCurrentPageDescription()
  if (annotationRemoteReady.value) return savePageDescriptionToGitee(next)
  return saveCurrentPageDescriptionToCache()
}

async function pushPageDescriptionSourceToGitee(source: DataSource) {
  if (source === 'gitee') return false
  if (!collaborationContext.remoteWritable) {
    setCollaborationSource('pageDescriptions', source, 'error', collaborationContext.unavailableReason || 'Gitee 当前不可写')
    return false
  }
  const scopeId = currentAnnotationScopeId()
  const sourceValue = source === 'local-cache' ? buildCurrentPageDescription() : pageDescriptionSourceValues.value[source][scopeId]
  if (!sourceValue) {
    setCollaborationSource('pageDescriptions', source, 'error', `${source === 'local-cache' ? '本地缓存' : 'JSON'} 当前 Scope 不存在页面描述`)
    return false
  }
  if (source === 'local-cache') saveCurrentPageDescriptionToCache()
  const saved = await savePageDescriptionToGitee(sourceValue)
  if (saved) {
    pageDescriptionSelectedSource.value = 'gitee'
    syncPageDescriptionEditor()
  }
  return saved
}

async function syncPageDescriptionsFromJson(options: PageDescriptionJsonSyncOptions = {}): Promise<PageDescriptionJsonSyncResult> {
  if (!collaborationContext.remoteWritable) throw new Error(collaborationContext.unavailableReason || 'Gitee 当前不可写')
  const seed = normalizePageDescriptions(await loadLocalJson<unknown>('page-descriptions.json', []))
  if (!seed.length) throw new Error('page-descriptions.json 未包含有效页面描述')
  pageDescriptionSourceValues.value = { ...pageDescriptionSourceValues.value, 'local-seed': pageDescriptionsByScope(seed) }
  const requestedScopeIds = [...new Set(options.scopeIds?.map((scopeId) => scopeId.trim()).filter(Boolean) ?? [])]
  const seedByScope = new Map(seed.map((description) => [annotationScopeId(description.screenId, description.stateId), description]))
  const missingScopeIds = requestedScopeIds.filter((scopeId) => !seedByScope.has(scopeId))
  if (missingScopeIds.length) throw new Error(`page-descriptions.json 未找到 Scope：${missingScopeIds.join(', ')}`)
  const targets = requestedScopeIds.length ? requestedScopeIds.map((scopeId) => seedByScope.get(scopeId)!) : [...seedByScope.values()]

  const remoteManifest = await loadRemotePageDescriptionManifest()
  pageDescriptionManifest.value = remoteManifest?.value ?? {
    projectId: collaborationContext.projectId,
    updatedAt: new Date().toISOString(),
    scopes: {},
    screens: {},
  }
  const syncedScopes: string[] = []
  const skippedScopes: string[] = []
  const failedScopes: Array<{ scopeId: string; error: string }> = []
  for (const description of targets) {
    const scopeId = annotationScopeId(description.screenId, description.stateId)
    const author = description.authorName?.trim() || annotationAuthorName.value.trim() || 'AI'
    try {
      const current = await loadRemotePageDescription(scopeId)
      const currentCanonical = current
        ? normalizePageDescriptions([{ ...current.value, screenId: description.screenId, stateId: description.stateId }])[0]
        : undefined
      if (current && currentCanonical && jsonValuesEqual(currentCanonical, description)) {
        const syncedAt = new Date().toISOString()
        writeScopedCollaborationCache('pageDescriptions', scopeId, currentCanonical, current.sha, syncedAt, 'synced')
        setPageDescriptionSourceValue('gitee', scopeId, currentCanonical)
        setPageDescriptionSourceValue('local-cache', scopeId, currentCanonical)
        pageDescriptions.value = [...pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), currentCanonical]
        skippedScopes.push(scopeId)
        continue
      }

      const saved = await saveRemotePageDescription(scopeId, author, description)
      if (!saved) throw new Error(`页面描述 ${scopeId} 写入后未能回读`)
      const canonical = normalizePageDescriptions([{ ...saved.value, screenId: description.screenId, stateId: description.stateId }])[0]
      if (!canonical) throw new Error(`页面描述 ${scopeId} 回读内容无效`)
      const syncedAt = new Date().toISOString()
      writeScopedCollaborationCache('pageDescriptions', scopeId, canonical, saved.sha, syncedAt, 'synced')
      setPageDescriptionSourceValue('gitee', scopeId, canonical)
      setPageDescriptionSourceValue('local-cache', scopeId, canonical)
      pageDescriptions.value = [...pageDescriptions.value.filter((item) => annotationScopeId(item.screenId, item.stateId) !== scopeId), canonical]
      updatePageDescriptionManifest(canonical.screenId, canonical.stateId, 1, canonical.highlighted, canonical.highlightColor)
      if (!pageDescriptionManifest.value) throw new Error('页面描述索引未初始化')
      const savedManifest = await saveRemotePageDescriptionManifest(pageDescriptionManifest.value, author, scopeId)
      if (!savedManifest) throw new Error(`页面描述 ${scopeId} 已写入，但 manifest 回读失败`)
      pageDescriptionManifest.value = savedManifest.value
      syncedScopes.push(scopeId)
    } catch (error) {
      failedScopes.push({ scopeId, error: error instanceof Error ? error.message : '未知错误' })
    }
  }
  syncPageDescriptionEditor()
  const message = `JSON 同步完成：成功 ${syncedScopes.length}，跳过 ${skippedScopes.length}，失败 ${failedScopes.length}`
  setCollaborationSource('pageDescriptions', 'gitee', failedScopes.length ? 'error' : 'success', message, new Date().toISOString())
  return { syncedScopes, skippedScopes, failedScopes, total: targets.length }
}

function exportAnnotations() {
  const blob = new Blob([JSON.stringify(annotations.value, null, 2)], { type: 'application/json;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'annotations.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

function exportPageDescriptions() {
  const blob = new Blob([JSON.stringify(pageDescriptions.value, null, 2)], { type: 'application/json;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'page-descriptions.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

function saveAnnotationPollingInterval() {
  const value = Number(annotationPollingIntervalInput.value)
  if (!Number.isFinite(value)) {
    annotationPollingNotice.value = '请输入数字'
    return
  }
  annotationPollingIntervalSeconds.value = Math.min(MAX_ANNOTATION_POLLING_INTERVAL_SECONDS, Math.max(MIN_ANNOTATION_POLLING_INTERVAL_SECONDS, value))
  annotationPollingIntervalInput.value = String(annotationPollingIntervalSeconds.value)
  storage()?.setItem(ANNOTATION_POLLING_INTERVAL_STORAGE_KEY, String(annotationPollingIntervalSeconds.value))
  annotationPollingNotice.value = '已保存同步间隔'
}

const flowGridStyle = computed(() => ({
  '--flow-zoom': String(flowZoom.value),
}))
const flowZoomPercent = computed(() => `${Math.round(flowZoom.value * 100)}%`)
function flowNodeWidth(platform: ScreenPlatform) {
  return platform === 'pc' ? 640 : 393
}
function flowNodeHeight(platform: ScreenPlatform) {
  return platform === 'pc' ? 360 : 902
}
const flowColumnGap = 88
const flowRowGap = 152
const flowRowLabelWidth = 260

const flowNodeXOffset = computed(() => {
  const map = new Map<string, number>()
  const grouped = new Map<number, DisplayScreen[]>()
  flowScreens.value.forEach((screen) => {
    const row = screen.flowRow ?? 1
    if (!grouped.has(row)) grouped.set(row, [])
    grouped.get(row)!.push(screen)
  })
  grouped.forEach((rowScreens, row) => {
    let x = 0
    rowScreens
      .sort((a, b) => (a.flowCol ?? 0) - (b.flowCol ?? 0))
      .forEach((screen) => {
        map.set(`${row}-${screen.flowCol ?? 1}`, x)
        x += flowNodeWidth(screen.platform) + flowColumnGap
      })
  })
  return map
})

const flowRowHeight = computed(() => {
  const map = new Map<number, number>()
  flowScreens.value.forEach((screen) => {
    const row = screen.flowRow ?? 1
    const h = flowNodeHeight(screen.platform)
    map.set(row, Math.max(map.get(row) ?? 0, h))
  })
  return map
})

const flowRows = computed(() =>
  selectedFlow.value?.rows.map((row, index) => ({
    key: `${selectedFlow.value?.id ?? 'empty'}-${index}`,
    label: row.find((node) => node.rowLabel)?.rowLabel ?? `子流程 ${index + 1}`,
    row: index + 1,
  })) ?? [],
)

function selectFlow(id: string) {
  selectedFlowId.value = id
}

function stepFlowZoom(delta: number) {
  flowZoom.value = clampFlowZoom(flowZoom.value + delta)
}

function resetFlowView() {
  flowPanX.value = 360
  flowPanY.value = 150
  flowZoom.value = 0.42
}

function flowNodeStyle(screen: DisplayScreen) {
  const row = screen.flowRow ?? 1
  const col = screen.flowCol ?? 1
  const x = flowNodeXOffset.value.get(`${row}-${col}`) ?? 0
  let y = 0
  for (let r = 1; r < row; r++) {
    y += (flowRowHeight.value.get(r) ?? flowNodeHeight('mobile')) + flowRowGap
  }
  return {
    left: `${flowPanX.value + (flowRowLabelWidth + x) * flowZoom.value}px`,
    top: `${flowPanY.value + y * flowZoom.value}px`,
  }
}

function flowRowLabelStyle(row: number) {
  let y = 0
  for (let r = 1; r < row; r++) {
    y += (flowRowHeight.value.get(r) ?? flowNodeHeight('mobile')) + flowRowGap
  }
  return {
    left: `${flowPanX.value}px`,
    top: `${flowPanY.value + y * flowZoom.value + 24}px`,
    transform: `scale(${flowZoom.value})`,
  }
}

function startFlowPan(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('button, input, select, textarea, video')) return
  isFlowPanning.value = true
  flowPanStart.value = { x: event.clientX, y: event.clientY, panX: flowPanX.value, panY: flowPanY.value }
}

function moveFlowPan(event: MouseEvent) {
  if (!isFlowPanning.value) return
  flowPanX.value = flowPanStart.value.panX + event.clientX - flowPanStart.value.x
  flowPanY.value = flowPanStart.value.panY + event.clientY - flowPanStart.value.y
}

function stopFlowPan() {
  isFlowPanning.value = false
}

function zoomFlowAtPoint(event: WheelEvent) {
  event.preventDefault()
  const nextZoom = clampFlowZoom(flowZoom.value + (event.deltaY > 0 ? -0.04 : 0.04))
  if (nextZoom === flowZoom.value) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const worldX = (pointerX - flowPanX.value) / flowZoom.value
  const worldY = (pointerY - flowPanY.value) / flowZoom.value

  flowZoom.value = nextZoom
  flowPanX.value = pointerX - worldX * nextZoom
  flowPanY.value = pointerY - worldY * nextZoom
}

function clampFlowZoom(value: number) {
  return Math.min(0.9, Math.max(0.25, Number(value.toFixed(2))))
}

function saveFlowsToSession(flows: MainFlow[]) {
  const next = JSON.parse(JSON.stringify(flows)) as MainFlow[]
  const cached = readCollaborationCache<MainFlow[]>('flows')
  writeCollaborationCache('flows', next, cached?.revision ?? null, cached?.lastRemoteSyncAt ?? null, 'pending')
  mainFlows.value = next
  setLocalFlowDraftDirty(true)
  if (!mainFlows.value.some((flow) => flow.id === selectedFlowId.value)) selectedFlowId.value = mainFlows.value[0]?.id ?? ''
  setCollaborationSource('flows', 'local-cache', 'success', collaborationContext.unavailableReason)
  return true
}

async function pushFlowsToGitee(flows: MainFlow[]) {
  const next = JSON.parse(JSON.stringify(flows)) as MainFlow[]
  saveFlowsToSession(next)
  if (!canPushFlowsToRemote.value) return false
  try {
    const saved = await saveRemoteFlows(annotationAuthorName.value.trim() || '未署名', next)
    const canonical = Array.isArray(saved?.value?.flows) ? saved.value.flows : null
    if (!saved || !canonical) return false
    const syncedAt = new Date().toISOString()
    writeCollaborationCache('flows', canonical, saved.sha, syncedAt, 'synced')
    mainFlows.value = canonical
    setLocalFlowDraftDirty(false)
    if (!mainFlows.value.some((flow) => flow.id === selectedFlowId.value)) selectedFlowId.value = mainFlows.value[0]?.id ?? ''
    setCollaborationSource('flows', 'gitee', 'success', '', syncedAt)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '流程推送失败'
    if (error instanceof CollaborationConflictError) markCollaborationConflict('flows', message)
    else setCollaborationSource('flows', collaborationSources.value.flows.source, 'error', message)
    return false
  }
}

function exportFlows(flows = mainFlows.value) {
  const blob = new Blob([JSON.stringify({ version: '1.0.0', flows }, null, 2)], { type: 'application/json;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'flows.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function useFlowEditorContext() {
  return { saveFlowsToSession, pushFlowsToGitee, exportFlows }
}

export function usePrototypeContext() {
  const context = {
    ...(extendContext?.({ go, goTab, setPrototypeState }) ?? {}),
    PanelTop,
    RotateCcw,
    SunMedium,
    themeColorFields,
    themeDesignColorFields,
    themeTypographyFields,
    themeRadiusFields,
    lang,
    mode,
    currentScreen,
    selectedFlowId,
    selectedThemeId,
    showThemePanel,
    themeImportInput,
    flowZoom,
    isFlowPanning,
    selectedTab,
    activeCollaborationTab,
    annotationRemoteReady,
    annotationSyncStatus,
    annotationSyncLabel,
    annotationAuthorName,
    annotationPollingIntervalSeconds,
    annotationPollingIntervalInput,
    annotationPollingNotice,
    collaborationInitialized,
    collaborationContext,
    collaborationSources,
    collaborationSourceLabel,
    collaborationSourceTone,
    collaborationSourceDetail,
    collaborationLastSyncedAt,
    collaborationBootstrapStatus,
    collaborationBootstrapProgress,
    collaborationBootstrapMessage,
    canInitializeRemote,
    annotationPanelCollapsed,
    annotationPointsVisible,
    isPlacingAnnotation,
    hoveredAnnotationId,
    annotationDraft,
    activeAnnotation,
    annotationDialogMode,
    annotationEditor,
    pageDescriptions,
    pageDescriptionManifest,
    pageDescriptionSelectedSource,
    pageDescriptionSourceValues,
    pageDescriptionEditor,
    activeThemeColors,
    activeDesignColors,
    themeOptions,
    themeStyle,
    themeLabel,
    themeDescription,
    screens,
    mainFlows,
    showFlowEditor,
    canPushFlowsToRemote,
    currentMeta,
    currentDisplayScreen,
    currentScreenPlatform,
    flowRows,
    visibleScreens,
    prototypeStateOptions,
    activePrototypeStateId,
    getPrototypeStateOptions,
    getPrototypeStateLabel,
    normalizePrototypeStateId,
    flowGridStyle,
    flowZoomPercent,
    currentScreenAnnotations,
    currentPageDescription,
    isScopeHighlighted,
    isScreenHighlighted,
    highlightColorForScreen,
    activeScreenHighlightedStateColors,
    activeScreenHighlighted,
    activeScopeHighlighted,
    hoveredAnnotation,
    initializePrototype,
    t,
    selectTheme,
    updateCustomThemeColor,
    updateCustomThemeDesignColor,
    updateCustomThemeTypography,
    updateCustomThemeRadius,
    resetCustomTheme,
    exportCustomTheme,
    importCustomTheme,
    setPrototypeState,
    go,
    goToAnnotatedScreen,
    goTab,
    startAnnotationPlacement,
    cancelAnnotationDraft,
    handleAnnotationCanvasClick,
    saveAnnotationDraft,
    openAnnotationDialog,
    closeAnnotationDialog,
    saveAnnotationEdit,
    updateAnnotationPosition,
    keepAnnotationPopover,
    scheduleHideAnnotationPopover,
    showAnnotationPopover,
    removeAnnotation,
    annotationCountByScreen,
    annotationCountByState,
    refreshPrototypeAnnotations,
    refreshPageDescriptions,
    refreshFlows,
    refreshAllCollaborationData,
    setCollaborationEditing,
    initializeRemoteCollaborationData,
    saveAnnotationPollingInterval,
    exportAnnotations,
    saveCurrentPageDescription,
    saveCurrentPageDescriptionToCache,
    pushPageDescriptionSourceToGitee,
    selectPageDescriptionSource,
    syncPageDescriptionsFromJson,
    exportPageDescriptions,
    annotationPointStyle,
    selectFlow,
    stepFlowZoom,
    resetFlowView,
    flowNodeStyle,
    flowRowLabelStyle,
    startFlowPan,
    moveFlowPan,
    stopFlowPan,
    zoomFlowAtPoint,
    overviewZoom,
    overviewColumns,
  }
  setActivePrototypeContext(context)
  return context
}
