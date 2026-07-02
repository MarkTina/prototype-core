<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Keyboard } from '@lucide/vue'
import ScreenRenderer from './screens/ScreenRenderer.vue'
import TabBar from './components/phone/TabBar.vue'
import PrototypeStateSwitcher from './components/phone/PrototypeStateSwitcher.vue'
import FlowEditor from './components/flow-editor/FlowEditor.vue'
import BugReportPage from './tools/bugs/BugReportPage.vue'
import { usePrototypeContext, useFlowEditorContext } from './prototype/usePrototype'
import { useProductBugs } from './tools/bugs/useProductBugs'
import type { DisplayScreen, PrototypeAnnotation } from './types/prototype'
import { getPrototypeRuntime } from './core/productAdapter'

const {
  themeColorFields,
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
  pageDescriptionEditor,
  activeThemeColors,
  themeOptions,
  themeStyle,
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
  isScreenHighlighted,
  highlightColorForScreen,
  activeScreenHighlightedStateColors,
  hoveredAnnotation,
  initializePrototype,
  t,
  selectTheme,
  updateCustomThemeColor,
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
  refreshAllCollaborationData,
  setCollaborationEditing,
  initializeRemoteCollaborationData,
  saveAnnotationPollingInterval,
  exportAnnotations,
  saveCurrentPageDescription,
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
} = usePrototypeContext()

const { saveFlowsToSession, pushFlowsToGitee, exportFlows } = useFlowEditorContext()
const { unresolvedBugCount, initializeBugs } = useProductBugs()

const tabBarItems = computed(() =>
  screens
    .filter((page) => page.platform === 'mobile' && page.hasTabBar)
    .map((page) => ({ id: page.id, label: page.title, icon: page.icon })),
)

const collaborationSourceNames = {
  gitee: 'Gitee',
  'local-cache': '缓存',
  'local-seed': '种子',
} as const
const collaborationBranchLabel = computed(() => collaborationContext.codeBranch || '未知分支')
const collaborationTimeLabel = computed(() => {
  if (!collaborationLastSyncedAt.value) return ''
  const elapsed = Date.now() - new Date(collaborationLastSyncedAt.value).getTime()
  if (elapsed < 60_000) return '刚刚同步'
  return new Date(collaborationLastSyncedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})
const collaborationKindSummary = computed(() => {
  if (collaborationBootstrapStatus.value === 'running') return `${collaborationSourceDetail.value} · ${collaborationBootstrapProgress.value.label}`
  if (collaborationBootstrapStatus.value === 'success' || collaborationBootstrapStatus.value === 'partial') return collaborationSourceDetail.value
  if (!collaborationContext.remoteWritable || collaborationSourceTone.value === 'conflict') return collaborationSourceDetail.value
  return [
    `注释 ${collaborationSourceNames[collaborationSources.value.annotations.source]}`,
    `页面描述 ${collaborationSourceNames[collaborationSources.value.pageDescriptions.source]}`,
    `流程 ${collaborationSourceNames[collaborationSources.value.flows.source]}`,
  ].join(' · ')
})
const collaborationAllRemote = computed(() => Object.values(collaborationSources.value).every((state) => state.source === 'gitee'))
const collaborationCardTitle = computed(() => collaborationBootstrapStatus.value === 'running' ? '正在初始化 Gitee' : collaborationSourceLabel.value)

const AUTH_STORAGE_KEY = 'prototype-core-authenticated'
const PAGE_DESCRIPTION_SECTION_STORAGE_KEY = 'prototype-core-page-description-summary-sections'
const PANEL_STATE_STORAGE_KEY = 'prototype-core-panel-state-v1'
const defaultPageDescriptionSectionIds = ['structure', 'features'] as const
const authUsername = ref('')
const authPassword = ref('')
const authError = ref('')
const isAuthenticated = ref(false)
const prototypeInitialized = ref(false)
const showPrototypeHealthPanel = ref(false)
const showEnvironmentCheckPanel = ref(false)
const prototypeHealthTab = ref<'overview' | 'matrix'>('overview')
const pageDescriptionSummaryVisible = ref(false)
const pageDescriptionCopyNotice = ref('')
const selectedPageDescriptionSectionIds = ref<string[]>([...defaultPageDescriptionSectionIds])
const pageDescriptionEditing = ref(false)
const presetHighlightColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']
const customHighlightColorInput = ref('')
const customHighlightColorNotice = ref('')
const customHighlightColorStorageKey = `prototype-highlight-colors:${collaborationContext.projectId}`
const customHighlightColors = ref<string[]>(loadCustomHighlightColors())

function loadCustomHighlightColors(): string[] {
  try {
    const stored = window.localStorage.getItem(customHighlightColorStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((color): color is string => /^#[0-9a-f]{6}$/i.test(color)) : []
  } catch {
    return []
  }
}

function selectHighlightColor(color: string) {
  pageDescriptionEditor.value.highlightColor = color
}

function addCustomHighlightColor() {
  const color = customHighlightColorInput.value.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    customHighlightColorNotice.value = '请输入 #RRGGBB 格式的颜色值'
    return
  }
  customHighlightColors.value = [color, ...customHighlightColors.value.filter((item) => item !== color)]
  try {
    window.localStorage.setItem(customHighlightColorStorageKey, JSON.stringify(customHighlightColors.value))
  } catch {
    customHighlightColorNotice.value = '颜色已添加，但本地缓存失败'
    return
  }
  pageDescriptionEditor.value.highlightColor = color
  customHighlightColorInput.value = ''
  customHighlightColorNotice.value = '已添加并保存到本地'
}
const mobilePagePickerVisible = ref(false)
const mobilePagePickerQuery = ref('')
const mobilePagePickerExpandedIds = ref<Set<string>>(new Set())
const mobileGestureStartY = ref<number | null>(null)
const mobileGestureTriggered = ref(false)
const annotationHoldId = ref('')
const annotationDragPreview = ref<{ id: string; x: number; y: number } | null>(null)
const annotationPositionSyncingIds = ref<Set<string>>(new Set())
const popoverAnchorRect = ref<DOMRect | null>(null)
let annotationHoldTimer: ReturnType<typeof setTimeout> | null = null
const annotationPositionSaveTimers = new Map<string, ReturnType<typeof window.setTimeout>>()
let annotationPress:
  | {
      annotation: PrototypeAnnotation
      pointerId: number
      startClientX: number
      startClientY: number
      content: HTMLElement
      activated: boolean
    }
  | null = null
let suppressedAnnotationClickId = ''
const runtimeConfig = getPrototypeRuntime()
const hasRuntimeValue = (value: unknown) => typeof value === 'string' ? Boolean(value.trim()) : value === true

type EnvironmentCheckItem = { name: string; configured: boolean }
type EnvironmentCheckGroup = { id: string; title: string; items: EnvironmentCheckItem[] }

const environmentCheckGroups = computed<EnvironmentCheckGroup[]>(() => {
  const collaboration = runtimeConfig.collaboration ?? {}
  const oss = runtimeConfig.oss ?? {}
  const auth = runtimeConfig.auth ?? {}
  const deployment = runtimeConfig.environment?.deployment ?? {}

  return [
    {
      id: 'gitee',
      title: 'Gitee 协作',
      items: [
        { name: 'VITE_COLLABORATION_PROVIDER', configured: hasRuntimeValue(collaboration.provider) },
        { name: 'VITE_COLLABORATION_OWNER', configured: hasRuntimeValue(collaboration.owner) },
        { name: 'VITE_COLLABORATION_REPO', configured: hasRuntimeValue(collaboration.repo) },
        { name: 'VITE_COLLABORATION_REMOTE_BRANCH', configured: hasRuntimeValue(collaboration.remoteBranch) },
        { name: 'VITE_COLLABORATION_PROJECT_ID', configured: hasRuntimeValue(collaboration.projectId) },
        { name: 'VITE_COLLABORATION_CODE_BRANCH', configured: hasRuntimeValue(collaboration.codeBranch) },
        { name: 'VITE_COLLABORATION_TOKEN', configured: hasRuntimeValue(collaboration.token) },
      ],
    },
    {
      id: 'oss',
      title: '对象存储 OSS',
      items: [
        { name: 'VITE_OSS_BUCKET_IDENTIFIER', configured: hasRuntimeValue(oss.bucket) },
        { name: 'VITE_OSS_BASE_URL', configured: hasRuntimeValue(oss.baseUrl) },
        { name: 'VITE_OSS_ACCESS_KEY_ID', configured: hasRuntimeValue(oss.accessKeyId) },
        { name: 'VITE_OSS_ACCESS_KEY_SECRET', configured: hasRuntimeValue(oss.accessKeySecret) },
      ],
    },
    {
      id: 'deployment',
      title: '部署配置',
      items: [
        { name: 'DEPLOY_HOST', configured: deployment.host === true },
        { name: 'DEPLOY_PORT', configured: deployment.port === true },
        { name: 'DEPLOY_USERNAME', configured: deployment.username === true },
        { name: 'DEPLOY_PASSWORD', configured: deployment.password === true },
        { name: 'DEPLOY_PATH', configured: deployment.path === true },
        { name: 'DEPLOY_BACKUP_PATH', configured: deployment.backupPath === true },
      ],
    },
    {
      id: 'auth',
      title: '原型访问',
      items: [
        { name: 'VITE_PROTOTYPE_AUTH_USERNAME', configured: hasRuntimeValue(auth.username) },
        { name: 'VITE_PROTOTYPE_AUTH_PASSWORD', configured: hasRuntimeValue(auth.password) },
      ],
    },
    {
      id: 'tools',
      title: '工具安全',
      items: [
        { name: 'VITE_BUG_DELETE_CODE', configured: hasRuntimeValue(runtimeConfig.tools?.bugDeleteCode) },
      ],
    },
  ]
})

const environmentCheckTotal = computed(() => environmentCheckGroups.value.reduce((total, group) => total + group.items.length, 0))
const environmentConfiguredCount = computed(() => environmentCheckGroups.value.reduce((total, group) => total + group.items.filter((item) => item.configured).length, 0))
const environmentMissingCount = computed(() => environmentCheckTotal.value - environmentConfiguredCount.value)
const currentCoreVersion = __CORE_PACKAGE_VERSION__
const latestCoreVersion = ref('')
const latestCoreVersionStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const hasNewerCoreVersion = computed(() => latestCoreVersionStatus.value === 'success' && latestCoreVersion.value !== currentCoreVersion)

const latestCoreVersionLabel = computed(() => {
  if (latestCoreVersionStatus.value === 'success') return `v${latestCoreVersion.value}`
  if (latestCoreVersionStatus.value === 'error') return '版本暂不可用'
  return '版本检测中'
})

async function checkLatestCoreVersion() {
  if (latestCoreVersionStatus.value !== 'idle') return
  latestCoreVersionStatus.value = 'loading'
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch('https://registry.npmjs.org/@marktowin%2Fprototype-core/latest', {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const manifest = (await response.json()) as { version?: unknown }
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('npm latest 响应缺少有效版本号')

    latestCoreVersion.value = manifest.version.trim()
    latestCoreVersionStatus.value = 'success'
  } catch (error) {
    latestCoreVersionStatus.value = 'error'
    console.warn('⚠️ [内核版本] 无法获取 npm 最新版本', { currentVersion: currentCoreVersion, error })
  } finally {
    window.clearTimeout(timeout)
  }
}

function configuredAuthUsername() {
  return runtimeConfig.auth?.username?.trim() ?? ''
}

function configuredAuthPassword() {
  return runtimeConfig.auth?.password?.trim() ?? ''
}

function hasConfiguredCredentials() {
  return runtimeConfig.auth?.enabled === true && Boolean(configuredAuthUsername() && configuredAuthPassword())
}

function startAuthenticatedApp() {
  if (!prototypeInitialized.value) {
    void initializePrototype().then(startCollaborationPolling)
    void initializeBugs()
    prototypeInitialized.value = true
  }
  void checkLatestCoreVersion()
  startUpdateChecks()
}

function handleAuthSubmit() {
  authError.value = ''

  if (!hasConfiguredCredentials()) {
    console.error('🔐 [前端认证] 已启用认证但未提供用户名或密码，无法完成认证')
    authError.value = '账号或密码错误'
    return
  }

  const matched =
    authUsername.value.trim() === configuredAuthUsername() &&
    authPassword.value.trim() === configuredAuthPassword()

  if (!matched) {
    authError.value = '账号或密码错误'
    return
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, 'true')
  isAuthenticated.value = true
  authUsername.value = ''
  authPassword.value = ''
  startAuthenticatedApp()
}

const gitHistory = __GIT_HISTORY__
const showUpdateHistory = ref(false)
const expandedHistoryHash = ref(gitHistory[0]?.hash ?? '')
const latestUpdateTime = computed(() => gitHistory[0]?.date ?? '暂无记录')
const appRoute = ref<'prototype' | 'bugs'>('prototype')
const interactiveSideNavRef = ref<HTMLElement | null>(null)
const interactiveSideNavCanScrollUp = ref(false)
const interactiveSideNavCanScrollDown = ref(false)
const interactiveFlowNavCollapsed = ref(false)
const dataSourcePanelCollapsed = ref(false)
const shortcutPanelCollapsed = ref(true)
const interactionModeToastVisible = ref(false)
const isMobileViewport = ref(false)
const isMobilePureInteractive = computed(() =>
  isMobileViewport.value && currentScreenPlatform.value === 'mobile',
)
const presentationMode = ref(false)
let interactionModeToastTimer: ReturnType<typeof window.setTimeout> | undefined

function showInteractionModeToast() {
  interactionModeToastVisible.value = true
  if (interactionModeToastTimer) window.clearTimeout(interactionModeToastTimer)
  interactionModeToastTimer = window.setTimeout(() => {
    interactionModeToastVisible.value = false
    interactionModeToastTimer = undefined
  }, 3000)
}

function togglePresentationMode() {
  if (mode.value !== 'interactive') return
  presentationMode.value = !presentationMode.value
  if (presentationMode.value) {
    showThemePanel.value = false
    showUpdateHistory.value = false
    showPrototypeHealthPanel.value = false
    showFlowEditor.value = false
  }
}
function exitPresentationMode() {
  presentationMode.value = false
}
const overviewStageRef = ref<HTMLElement | null>(null)
const overviewGridRef = ref<HTMLElement | null>(null)
const overviewStageWidth = ref(0)
const viewportWidth = ref(1440)
const viewportHeight = ref(900)
const overviewPanX = ref(0)
const overviewPanY = ref(120)
const isOverviewPanning = ref(false)
let overviewPanStart = { x: 0, y: 0, panX: 0, panY: 0 }
const effectiveMode = computed(() => (isMobilePureInteractive.value ? 'interactive' : mode.value))
const renderedScreens = computed<DisplayScreen[]>(() =>
  isMobilePureInteractive.value ? [currentDisplayScreen.value] : visibleScreens.value,
)
const currentPrototypeStateLabel = computed(() =>
  activePrototypeStateId.value ? getPrototypeStateLabel(currentScreen.value, activePrototypeStateId.value) : '',
)
const mobilePagePickerItems = computed(() => {
  const query = mobilePagePickerQuery.value.trim().toLowerCase()
  return screens
    .map((screen) => {
      const states = getPrototypeStateOptions(screen.id)
      const stateMatches = states.filter((state) => `${state.label} ${state.id}`.toLowerCase().includes(query))
      const screenMatches = !query || `${screen.code} ${screen.title} ${screen.subtitle} ${screen.id}`.toLowerCase().includes(query)
      return {
        screen,
        states: screenMatches ? states : stateMatches,
        visible: screenMatches || stateMatches.length > 0,
        forceExpanded: Boolean(query && stateMatches.length),
      }
    })
    .filter((item) => item.visible)
})
const annotationDraftMatchesCurrentState = computed(() =>
  Boolean(
    annotationDraft.value &&
      annotationDraft.value.screenId === currentScreen.value &&
      annotationDraft.value.stateId === normalizePrototypeStateId(currentScreen.value, activePrototypeStateId.value),
  ),
)

watch([currentScreen, activePrototypeStateId, activeCollaborationTab], () => {
  pageDescriptionEditing.value = false
})

watch(pageDescriptionEditing, (editing) => setCollaborationEditing('pageDescriptions', editing), { immediate: true })
watch(showFlowEditor, (editing) => setCollaborationEditing('flows', editing), { immediate: true })
watch([annotationDialogMode, annotationDraft], ([dialogMode, draft]) => {
  setCollaborationEditing('annotations', dialogMode !== 'view' || Boolean(draft))
}, { immediate: true })

watch(mode, (nextMode, previousMode) => {
  if (nextMode !== 'interactive' && presentationMode.value) {
    exitPresentationMode()
  }
  if (nextMode === 'interactive' && previousMode !== 'interactive') {
    showInteractionModeToast()
  }
})

function resetPageDescriptionEditorFromCurrent() {
  const description = currentPageDescription.value
  pageDescriptionEditor.value = description
    ? {
        highlighted: description.highlighted ?? false,
        highlightColor: description.highlightColor ?? '#ef4444',
        purpose: description.purpose,
        structure: description.structure,
        features: description.features,
        flowPosition: description.flowPosition,
        interactionRules: description.interactionRules,
        stateCriteria: description.stateCriteria,
        edgeCases: description.edgeCases,
        acceptanceCriteria: description.acceptanceCriteria,
        developmentNotes: description.developmentNotes,
      }
    : {
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
      }
}

function startPageDescriptionEdit() {
  resetPageDescriptionEditorFromCurrent()
  pageDescriptionEditing.value = true
}

function cancelPageDescriptionEdit() {
  resetPageDescriptionEditorFromCurrent()
  pageDescriptionEditing.value = false
}

async function handlePageDescriptionSave() {
  const saved = await saveCurrentPageDescription()
  if (saved) pageDescriptionEditing.value = false
}

function handleFlowSave(flows: Parameters<typeof saveFlowsToSession>[0], done: (success: boolean) => void) {
  done(saveFlowsToSession(flows))
}

async function handleFlowPush(flows: Parameters<typeof pushFlowsToGitee>[0], done: (success: boolean) => void) {
  done(await pushFlowsToGitee(flows))
}

function clearAnnotationHoldTimer() {
  if (!annotationHoldTimer) return
  window.clearTimeout(annotationHoldTimer)
  annotationHoldTimer = null
}

function clearAnnotationPress() {
  clearAnnotationHoldTimer()
  annotationHoldId.value = ''
  annotationPress = null
}

function setAnnotationPositionSyncing(id: string, syncing: boolean) {
  const next = new Set(annotationPositionSyncingIds.value)
  if (syncing) next.add(id)
  else next.delete(id)
  annotationPositionSyncingIds.value = next
}

function clearAnnotationPositionSaveTimers() {
  annotationPositionSaveTimers.forEach((timer) => window.clearTimeout(timer))
  annotationPositionSaveTimers.clear()
  annotationPositionSyncingIds.value = new Set()
}

function annotationDisplayPointStyle(annotation: PrototypeAnnotation) {
  const preview = annotationDragPreview.value
  return annotationPointStyle(preview?.id === annotation.id ? { ...annotation, x: preview.x, y: preview.y } : annotation)
}

const hoveredAnnotationPopoverStyle = computed(() => {
  if (!hoveredAnnotation.value || !popoverAnchorRect.value) return { left: '-9999px', top: '-9999px' }
  const rect = popoverAnchorRect.value
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.bottom + 8}px`,
  }
})

function handleAnnotationPointClick(annotation: PrototypeAnnotation) {
  if (suppressedAnnotationClickId === annotation.id) {
    suppressedAnnotationClickId = ''
    return
  }
  openAnnotationDialog(annotation.id)
}

function getScrollWrapper(content: HTMLElement) {
  return content.querySelector<HTMLElement>('.screen-scroll-wrapper')
}

function getAnnotationLayer(content: HTMLElement) {
  return content.querySelector<HTMLElement>('.annotation-layer')
}

function computeAnnotationPositionFromEvent(event: PointerEvent | MouseEvent, content: HTMLElement) {
  const rect = content.getBoundingClientRect()
  const layer = getAnnotationLayer(content)
  const fullWidth = layer?.scrollWidth ?? rect.width
  const fullHeight = layer?.scrollHeight ?? rect.height
  const x = ((event.clientX - rect.left + content.scrollLeft) / fullWidth) * 100
  const y = ((event.clientY - rect.top + content.scrollTop) / fullHeight) * 100
  return { x: Math.min(96, Math.max(4, x)), y: Math.min(96, Math.max(4, y)) }
}

function handleAnnotationPointPointerDown(annotation: PrototypeAnnotation, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (annotationPositionSyncingIds.value.has(annotation.id)) return
  const content = (event.currentTarget as HTMLElement).closest<HTMLElement>('.screen-content')
  if (!content) return

  clearAnnotationPress()
  hoveredAnnotationId.value = ''
  annotationHoldId.value = annotation.id
  annotationPress = {
    annotation,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    content,
    activated: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  annotationHoldTimer = window.setTimeout(() => {
    if (!annotationPress || annotationPress.pointerId !== event.pointerId) return
    annotationPress.activated = true
    annotationHoldId.value = ''
    annotationDragPreview.value = { id: annotation.id, x: annotation.x, y: annotation.y }
  }, 800)
}

function handleAnnotationPointPointerMove(event: PointerEvent) {
  if (!annotationPress || annotationPress.pointerId !== event.pointerId) return
  if (!annotationPress.activated) {
    const movedDistance = Math.hypot(event.clientX - annotationPress.startClientX, event.clientY - annotationPress.startClientY)
    if (movedDistance > 8) clearAnnotationPress()
    return
  }

  event.preventDefault()
  event.stopPropagation()
  const { x, y } = computeAnnotationPositionFromEvent(event, annotationPress.content)
  annotationDragPreview.value = { id: annotationPress.annotation.id, x, y }
}

function handleAnnotationPointPointerUp(event: PointerEvent) {
  if (!annotationPress || annotationPress.pointerId !== event.pointerId) return
  const activePress = annotationPress
  const preview = annotationDragPreview.value
  clearAnnotationPress()
  if (!activePress.activated || !preview || preview.id !== activePress.annotation.id) return

  event.preventDefault()
  event.stopPropagation()
  suppressedAnnotationClickId = activePress.annotation.id

  const positionDelta = Math.max(
    Math.abs(preview.x - activePress.annotation.x),
    Math.abs(preview.y - activePress.annotation.y),
  )
  if (positionDelta < 1) {
    annotationDragPreview.value = null
    return
  }

  const existingTimer = annotationPositionSaveTimers.get(activePress.annotation.id)
  if (existingTimer) window.clearTimeout(existingTimer)
  setAnnotationPositionSyncing(activePress.annotation.id, true)
  const timer = window.setTimeout(async () => {
    try {
      await updateAnnotationPosition(activePress.annotation.id, preview.x, preview.y)
    } finally {
      annotationPositionSaveTimers.delete(activePress.annotation.id)
      setAnnotationPositionSyncing(activePress.annotation.id, false)
      if (annotationDragPreview.value?.id === activePress.annotation.id) annotationDragPreview.value = null
    }
  }, 300)
  annotationPositionSaveTimers.set(activePress.annotation.id, timer)
}

function handleAnnotationPointPointerCancel(event: PointerEvent) {
  if (!annotationPress || annotationPress.pointerId !== event.pointerId) return
  clearAnnotationPress()
  annotationDragPreview.value = null
}

function handleAnnotationPointMouseEnter(annotation: PrototypeAnnotation, event: MouseEvent) {
  if (annotationHoldId.value || annotationDragPreview.value) return
  popoverAnchorRect.value = (event.currentTarget as HTMLElement).getBoundingClientRect()
  showAnnotationPopover(annotation.id)
}

function handleAnnotationListMouseEnter(annotation: PrototypeAnnotation) {
  if (annotationHoldId.value || annotationDragPreview.value) return
  const pointEl = document.querySelector(`[data-annotation-id="${annotation.id}"]`)
  popoverAnchorRect.value = pointEl instanceof HTMLElement ? pointEl.getBoundingClientRect() : null
  showAnnotationPopover(annotation.id)
}
const currentPageDescriptionUpdatedLabel = computed(() => {
  if (!currentPageDescription.value?.authorName && !currentPageDescription.value?.updatedAt) return ''
  const updatedAt = formatAnnotationTime(currentPageDescription.value.updatedAt)
  return `${currentPageDescription.value.authorName || '未署名'}${updatedAt ? ` · ${updatedAt}` : ''}`
})
const pageDescriptionSummary = computed(() => ({
  purpose: currentPageDescription.value?.purpose.trim() || '当前页面暂无页面目的描述。',
  structure: currentPageDescription.value?.structure.trim() || '当前页面暂无页面结构描述。',
  features: currentPageDescription.value?.features.trim() || '当前页面暂无核心功能描述。',
  flowPosition: currentPageDescription.value?.flowPosition.trim() || '当前页面暂无流程位置描述。',
  interactionRules: currentPageDescription.value?.interactionRules.trim() || '当前页面暂无交互规则。',
  stateCriteria: currentPageDescription.value?.stateCriteria.trim() || '当前页面暂无状态判断依据。',
  edgeCases: currentPageDescription.value?.edgeCases.trim() || '当前页面暂无异常与边界。',
  acceptanceCriteria: currentPageDescription.value?.acceptanceCriteria.trim() || '当前页面暂无开发验收。',
  developmentNotes: currentPageDescription.value?.developmentNotes.trim() || '当前页面暂无补充说明。',
}))
const pageDescriptionSummarySections = computed(() => [
  { id: 'purpose', label: '页面目的', value: pageDescriptionSummary.value.purpose },
  { id: 'structure', label: '页面结构', value: pageDescriptionSummary.value.structure },
  { id: 'features', label: '核心功能', value: pageDescriptionSummary.value.features },
  { id: 'flowPosition', label: '流程位置', value: pageDescriptionSummary.value.flowPosition },
  { id: 'interactionRules', label: '交互规则', value: pageDescriptionSummary.value.interactionRules },
  { id: 'stateCriteria', label: '状态判断依据', value: pageDescriptionSummary.value.stateCriteria },
  { id: 'edgeCases', label: '异常与边界', value: pageDescriptionSummary.value.edgeCases },
  { id: 'acceptanceCriteria', label: '开发验收', value: pageDescriptionSummary.value.acceptanceCriteria },
  { id: 'developmentNotes', label: '补充说明', value: pageDescriptionSummary.value.developmentNotes },
])
const selectedPageDescriptionSections = computed(() =>
  pageDescriptionSummarySections.value.filter((section) => selectedPageDescriptionSectionIds.value.includes(section.id)),
)
const pageDescriptionSummaryText = computed(() =>
  selectedPageDescriptionSections.value.map((section) => `${section.label}：${section.value}`).join('\n\n'),
)
function prototypeScopeId(screenId: DisplayScreen['id'], stateId?: DisplayScreen['stateId']) {
  return stateId ? `${screenId}__${stateId}` : screenId
}

const flowNodes = computed(() =>
  mainFlows.value.flatMap((flow) =>
    flow.rows.flatMap((row, rowIndex) =>
      row
        .filter((node) => node.screenId)
        .map((node, nodeIndex) => ({
          flowId: flow.id,
          flowTitle: flow.title,
          rowIndex,
          nodeIndex,
          screenId: node.screenId,
          stateId: node.stateId,
        })),
    ),
  ),
)
const pageDescriptionScopeIds = computed(() => {
  const ids = new Set(pageDescriptions.value.map((item) => prototypeScopeId(item.screenId, item.stateId)))

  if (annotationRemoteReady.value && pageDescriptionManifest.value?.scopes) {
    Object.entries(pageDescriptionManifest.value.scopes).forEach(([scopeId, meta]) => {
      if ((meta?.count ?? 0) > 0) ids.add(scopeId)
    })
  }

  return ids
})
const pageDescriptionHealthSource = computed(() => {
  if (!annotationRemoteReady.value) return '本地兜底数据'
  if (pageDescriptionManifest.value?.scopes) return '云端 manifest'
  return '云端 manifest 未加载'
})
const prototypeMatrixRows = computed(() =>
  screens.map((screen) => {
    const stateOptions = getPrototypeStateOptions(screen.id)
    const scopes = stateOptions.length
      ? stateOptions.map((state) => ({
          id: prototypeScopeId(screen.id, state.id),
          stateId: state.id,
          label: state.label,
        }))
      : [{ id: prototypeScopeId(screen.id), stateId: undefined, label: '默认' }]
    const describedCount = scopes.filter((scope) => pageDescriptionScopeIds.value.has(scope.id)).length
    const flowCount = flowNodes.value.filter((node) => node.screenId === screen.id).length

    return {
      ...screen,
      stateCount: scopes.length,
      scopes,
      flowCount,
      inFlow: flowCount > 0,
      describedCount,
      descriptionRatio: `${describedCount}/${scopes.length}`,
      annotationCount: annotationCountByScreen(screen.id),
      missingDescriptions: scopes.filter((scope) => !pageDescriptionScopeIds.value.has(scope.id)).map((scope) => scope.label),
    }
  }),
)
const invalidFlowNodes = computed(() =>
  flowNodes.value.filter((node) => {
    const screen = screens.find((item) => item.id === node.screenId)
    if (!screen) return true
    return Boolean(node.stateId && !getPrototypeStateOptions(screen.id).some((state) => state.id === node.stateId))
  }),
)
const missingPageDescriptionRows = computed(() => prototypeMatrixRows.value.filter((row) => row.describedCount < row.stateCount))
const screensMissingFromFlow = computed(() => prototypeMatrixRows.value.filter((row) => !row.inFlow))
const prototypeHealthStats = computed(() => {
  const totalStates = prototypeMatrixRows.value.reduce((sum, row) => sum + row.stateCount, 0)
  const describedScopes = prototypeMatrixRows.value.reduce((sum, row) => sum + row.describedCount, 0)
  const annotationTotal = prototypeMatrixRows.value.reduce((sum, row) => sum + row.annotationCount, 0)

  return [
    { label: '页面', value: screens.length, detail: '已注册屏幕' },
    { label: '状态', value: totalStates, detail: '页面/状态 scope' },
    { label: '流程', value: mainFlows.value.length, detail: `${flowNodes.value.length} 个节点` },
    { label: '页面描述', value: `${describedScopes}/${totalStates}`, detail: pageDescriptionHealthSource.value },
    { label: '注释', value: annotationTotal, detail: annotationRemoteReady.value ? '当前已加载云端数据' : '当前本地数据' },
  ]
})
const prototypeHealthIssues = computed(() => {
  const issues: Array<{ tone: 'danger' | 'warning' | 'success'; title: string; detail: string }> = []

  if (invalidFlowNodes.value.length) {
    issues.push({
      tone: 'danger',
      title: '存在无效流程节点',
      detail: invalidFlowNodes.value.map((node) => `${node.flowTitle} / ${node.screenId}${node.stateId ? ` / ${node.stateId}` : ''}`).join('；'),
    })
  }

  if (missingPageDescriptionRows.value.length) {
    issues.push({
      tone: 'warning',
      title: '存在缺失页面描述的状态',
      detail: missingPageDescriptionRows.value.map((row) => `${row.code} ${row.title}：${row.descriptionRatio}`).join('；'),
    })
  }

  if (screensMissingFromFlow.value.length) {
    issues.push({
      tone: 'warning',
      title: '存在未进入流程图的页面',
      detail: screensMissingFromFlow.value.map((row) => `${row.code} ${row.title}`).join('；'),
    })
  }

  issues.push({
    tone: 'success',
    title: annotationRemoteReady.value ? '健康面板使用云端 manifest 统计页面描述' : '健康面板当前使用本地兜底结果',
    detail: annotationRemoteReady.value
      ? '页面描述覆盖率来自 page-descriptions/manifest.json；注释数量来自注释 manifest；全量云端文件校验请运行 pnpm validate:remote。'
      : '当前未启用云端协作配置；pnpm validate 只检查本地兜底资料，pnpm validate:remote 才会主动读取 Gitee。',
  })

  return issues
})
let mobilePureMediaQuery: MediaQueryList | undefined
let overviewResizeObserver: ResizeObserver | undefined
const overviewPhoneWidth = 393
const overviewPhoneHeight = 852
const overviewGridGap = 24
const desktopBaseWidth = 1920
const desktopBaseHeight = 1080
const desktopFlowWidth = 640

function formatAnnotationTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

async function copyPageDescriptionSummary() {
  if (!pageDescriptionSummaryText.value) return
  try {
    await navigator.clipboard?.writeText(pageDescriptionSummaryText.value)
    pageDescriptionCopyNotice.value = '已复制页面描述'
  } catch {
    pageDescriptionCopyNotice.value = '复制失败，请手动复制'
  }
}

function loadPageDescriptionSectionSelection() {
  try {
    const stored = window.localStorage.getItem(PAGE_DESCRIPTION_SECTION_STORAGE_KEY)
    if (!stored) return
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return
    const availableIds = new Set(pageDescriptionSummarySections.value.map((section) => section.id))
    selectedPageDescriptionSectionIds.value = parsed.filter((id): id is string => typeof id === 'string' && availableIds.has(id))
  } catch {
    window.localStorage.removeItem(PAGE_DESCRIPTION_SECTION_STORAGE_KEY)
  }
}

function togglePageDescriptionSection(sectionId: string) {
  pageDescriptionCopyNotice.value = ''
  const next = selectedPageDescriptionSectionIds.value.includes(sectionId)
    ? selectedPageDescriptionSectionIds.value.filter((id) => id !== sectionId)
    : [...selectedPageDescriptionSectionIds.value, sectionId]
  selectedPageDescriptionSectionIds.value = pageDescriptionSummarySections.value
    .map((section) => section.id)
    .filter((id) => next.includes(id))
  window.localStorage.setItem(PAGE_DESCRIPTION_SECTION_STORAGE_KEY, JSON.stringify(selectedPageDescriptionSectionIds.value))
}

function selectAllPageDescriptionSections() {
  pageDescriptionCopyNotice.value = ''
  selectedPageDescriptionSectionIds.value = pageDescriptionSummarySections.value.map((section) => section.id)
  window.localStorage.setItem(PAGE_DESCRIPTION_SECTION_STORAGE_KEY, JSON.stringify(selectedPageDescriptionSectionIds.value))
}

function invertPageDescriptionSections() {
  pageDescriptionCopyNotice.value = ''
  const selectedIds = new Set(selectedPageDescriptionSectionIds.value)
  selectedPageDescriptionSectionIds.value = pageDescriptionSummarySections.value.map((section) => section.id).filter((id) => !selectedIds.has(id))
  window.localStorage.setItem(PAGE_DESCRIPTION_SECTION_STORAGE_KEY, JSON.stringify(selectedPageDescriptionSectionIds.value))
}

const overviewItemScale = computed(() => {
  const columns = Math.max(1, overviewColumns.value)
  const availableWidth = overviewStageWidth.value || window.innerWidth
  const itemWidth = (availableWidth - overviewGridGap * (columns - 1)) / columns
  return Math.min(1, Math.max(0.36, Number((itemWidth / overviewPhoneWidth).toFixed(3))))
})

const overviewItemWidth = computed(() => Math.round(overviewPhoneWidth * overviewItemScale.value * 100) / 100)
const overviewScreenHeight = computed(() => Math.round(overviewPhoneHeight * overviewItemScale.value * 100) / 100)

function desktopDisplayWidth() {
  if (presentationMode.value) {
    return Math.min(desktopBaseWidth, viewportWidth.value, Math.max(0, viewportHeight.value - 48) * 16 / 9)
  }
  if (effectiveMode.value === 'overview') return overviewItemWidth.value
  if (effectiveMode.value === 'flow') return desktopFlowWidth
  const availableWidth = overviewStageWidth.value || viewportWidth.value
  return Math.min(1440, availableWidth, Math.max(0, viewportHeight.value - 120) * 16 / 9)
}

function screenShellStyle(screen: DisplayScreen) {
  const baseStyle = effectiveMode.value === 'flow' ? flowNodeStyle(screen) : {}
  if (screen.platform !== 'pc') {
    if (!presentationMode.value) return baseStyle
    const width = Math.min(
      overviewPhoneWidth,
      viewportWidth.value,
      Math.max(0, viewportHeight.value - 48) * overviewPhoneWidth / overviewPhoneHeight,
    )
    const height = width * overviewPhoneHeight / overviewPhoneWidth
    return {
      ...baseStyle,
      '--presentation-phone-width': `${width}px`,
      '--presentation-phone-height': `${height}px`,
      '--presentation-phone-scale': String(width / overviewPhoneWidth),
    }
  }
  const width = Math.max(1, desktopDisplayWidth())
  const height = width * desktopBaseHeight / desktopBaseWidth
  return {
    ...baseStyle,
    '--desktop-display-width': `${width}px`,
    '--desktop-display-height': `${height}px`,
    '--desktop-preview-scale': String(width / desktopBaseWidth),
  }
}

const overviewGridStyle = computed(() => ({
  transform: `translate3d(${overviewPanX.value}px, ${overviewPanY.value}px, 0) scale(${overviewZoom.value})`,
  transformOrigin: 'left top',
  '--max-cols': overviewColumns.value,
  '--overview-item-scale': overviewItemScale.value,
  '--overview-item-width': `${overviewItemWidth.value}px`,
  '--overview-screen-height': `${overviewScreenHeight.value}px`,
}))

function clampOverviewZoom(value: number) {
  return Math.min(1.2, Math.max(0.25, Number(value.toFixed(2))))
}

function setOverviewZoomAtPoint(nextZoom: number, pointerX: number, pointerY: number) {
  const clamped = clampOverviewZoom(nextZoom)
  if (clamped === overviewZoom.value) return
  const worldX = (pointerX - overviewPanX.value) / overviewZoom.value
  const worldY = (pointerY - overviewPanY.value) / overviewZoom.value
  overviewZoom.value = clamped
  overviewPanX.value = pointerX - worldX * clamped
  overviewPanY.value = pointerY - worldY * clamped
}

function stepOverviewCanvasZoom(delta: number) {
  setOverviewZoomAtPoint(
    overviewZoom.value + delta,
    viewportWidth.value / 2,
    viewportHeight.value / 2,
  )
}

async function resetOverviewCanvasView() {
  overviewZoom.value = 1
  await nextTick()
  const worldWidth = overviewGridRef.value?.offsetWidth ?? 0
  overviewPanX.value = Math.max(32, (viewportWidth.value - worldWidth) / 2)
  overviewPanY.value = 120
}

function startOverviewPan(event: MouseEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, textarea, a, .phone-shell, .desktop-shell')) return
  isOverviewPanning.value = true
  overviewPanStart = { x: event.clientX, y: event.clientY, panX: overviewPanX.value, panY: overviewPanY.value }
}

function moveOverviewPan(event: MouseEvent) {
  if (!isOverviewPanning.value) return
  overviewPanX.value = overviewPanStart.panX + event.clientX - overviewPanStart.x
  overviewPanY.value = overviewPanStart.panY + event.clientY - overviewPanStart.y
}

function stopOverviewPan() {
  isOverviewPanning.value = false
}

function zoomOverviewAtPoint(event: WheelEvent) {
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  setOverviewZoomAtPoint(
    overviewZoom.value + (event.deltaY > 0 ? -0.04 : 0.04),
    event.clientX - rect.left,
    event.clientY - rect.top,
  )
}

function toggleHistoryDetail(hash: string) {
  expandedHistoryHash.value = expandedHistoryHash.value === hash ? '' : hash
}

function historyDetailLines(item: GitHistoryItem) {
  return item.details
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function updateInteractiveSideNavScroll() {
  const el = interactiveSideNavRef.value
  if (!el) {
    interactiveSideNavCanScrollUp.value = false
    interactiveSideNavCanScrollDown.value = false
    return
  }
  interactiveSideNavCanScrollUp.value = el.scrollTop > 2
  interactiveSideNavCanScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 2
}

function toggleInteractiveFlowNav() {
  interactiveFlowNavCollapsed.value = !interactiveFlowNavCollapsed.value
  if (!interactiveFlowNavCollapsed.value) {
    nextTick(updateInteractiveSideNavScroll)
  } else {
    interactiveSideNavCanScrollUp.value = false
    interactiveSideNavCanScrollDown.value = false
  }
}

watch(mode, async (m) => {
  if (m === 'interactive') {
    await nextTick()
    updateInteractiveSideNavScroll()
  }
  if (m === 'overview') await resetOverviewCanvasView()
})

watch(overviewColumns, async () => {
  if (mode.value === 'overview') await resetOverviewCanvasView()
})

watch(isMobilePureInteractive, (enabled) => {
  if (!enabled) return
  showThemePanel.value = false
  showUpdateHistory.value = false
  showPrototypeHealthPanel.value = false
  showFlowEditor.value = false
  cancelAnnotationDraft()
  closeAnnotationDialog()
  hoveredAnnotationId.value = ''
})

type VersionManifest = {
  version?: string
  builtAt?: string
}

const UPDATE_CHECK_INTERVAL = 60 * 1000
const currentAppVersion = __APP_VERSION__
const currentAppBuiltAt = __APP_BUILT_AT__
const showUpdatePrompt = ref(false)
const pendingUpdateVersion = ref('')
const dismissedUpdateVersion = ref('')
let updateCheckTimer: ReturnType<typeof window.setInterval> | undefined
let collaborationPollingTimer: ReturnType<typeof window.setInterval> | undefined

function stopCollaborationPolling() {
  if (!collaborationPollingTimer) return
  window.clearInterval(collaborationPollingTimer)
  collaborationPollingTimer = undefined
}

type ShortcutItem = {
  key: string
  label: string
  run: () => void
}

type ShortcutGroup = {
  title: string
  items: ShortcutItem[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: '模式切换',
    items: [
      { key: '1', label: '交互模式', run: () => { mode.value = 'interactive' } },
      { key: '2', label: '全图模式', run: () => { mode.value = 'overview' } },
      { key: '3', label: '流程模式', run: () => { mode.value = 'flow' } },
      { key: 'P', label: '进入 / 退出演示', run: togglePresentationMode },
    ],
  },
  {
    title: '组件控制',
    items: [
      { key: 'N', label: '展开 / 收起导航', run: () => { if (mode.value === 'interactive') toggleInteractiveFlowNav() } },
      { key: 'C', label: '展开 / 收起协作', run: () => { if (mode.value === 'interactive') annotationPanelCollapsed.value = !annotationPanelCollapsed.value } },
      { key: 'D', label: '展开 / 收起数据源', run: () => { dataSourcePanelCollapsed.value = !dataSourcePanelCollapsed.value } },
      { key: 'K', label: '展开 / 收起快捷键', run: () => { shortcutPanelCollapsed.value = !shortcutPanelCollapsed.value } },
    ],
  },
  {
    title: '快捷操作',
    items: [
      {
        key: 'A',
        label: '添加注释点',
        run: () => {
          mode.value = 'interactive'
          annotationPanelCollapsed.value = false
          activeCollaborationTab.value = 'annotations'
          startAnnotationPlacement()
        },
      },
      {
        key: 'E',
        label: '页面描述总览',
        run: () => {
          pageDescriptionSummaryVisible.value = !pageDescriptionSummaryVisible.value
          if (pageDescriptionSummaryVisible.value) pageDescriptionCopyNotice.value = ''
        },
      },
      { key: 'Esc', label: '退出 / 取消操作', run: cancelCurrentShortcutOperation },
    ],
  },
]

const shortcutByKey = new Map(
  shortcutGroups.flatMap((group) => group.items).map((item) => [item.key.toLowerCase(), item]),
)

function cancelCurrentShortcutOperation() {
  if (appRoute.value === 'bugs') {
    closeBugPage()
    return
  }
  if (presentationMode.value) {
    exitPresentationMode()
    return
  }
  if (pageDescriptionSummaryVisible.value) {
    pageDescriptionSummaryVisible.value = false
    return
  }
  if (showEnvironmentCheckPanel.value) {
    showEnvironmentCheckPanel.value = false
    return
  }
  if (isPlacingAnnotation.value || annotationDraft.value) cancelAnnotationDraft()
}

function isEditableShortcutTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}

function hasBlockingOverlay() {
  return showUpdateHistory.value
    || showPrototypeHealthPanel.value
    || showEnvironmentCheckPanel.value
    || showFlowEditor.value
    || pageDescriptionEditing.value
    || pageDescriptionSummaryVisible.value
    || annotationDialogMode.value !== 'view'
    || isPlacingAnnotation.value
    || Boolean(activeAnnotation.value)
    || Boolean(annotationDraft.value)
}

function handleShortcutKeydown(event: KeyboardEvent) {
  if (!isAuthenticated.value || isMobilePureInteractive.value) return
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return
  if (event.ctrlKey || event.altKey || event.metaKey || isEditableShortcutTarget(event.target)) return

  const key = event.key === 'Escape' ? 'esc' : event.key.toLowerCase()
  const shortcut = shortcutByKey.get(key)
  if (!shortcut) return
  if (key !== 'esc' && hasBlockingOverlay() && !(key === 'e' && pageDescriptionSummaryVisible.value)) return

  event.preventDefault()
  shortcut.run()
}

type StoredPanelState = {
  navigationCollapsed: boolean
  collaborationCollapsed: boolean
  dataSourceCollapsed: boolean
  shortcutsCollapsed: boolean
}

function isStoredPanelState(value: unknown): value is StoredPanelState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return ['navigationCollapsed', 'collaborationCollapsed', 'dataSourceCollapsed', 'shortcutsCollapsed']
    .every((key) => typeof state[key] === 'boolean')
}

function loadPanelState() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PANEL_STATE_STORAGE_KEY) ?? 'null') as unknown
    if (!isStoredPanelState(stored)) {
      if (stored !== null) window.localStorage.removeItem(PANEL_STATE_STORAGE_KEY)
      return
    }
    interactiveFlowNavCollapsed.value = stored.navigationCollapsed
    annotationPanelCollapsed.value = stored.collaborationCollapsed
    dataSourcePanelCollapsed.value = stored.dataSourceCollapsed
    shortcutPanelCollapsed.value = stored.shortcutsCollapsed
  } catch {
    console.warn('🧰 [面板状态] 本地缓存无效，已恢复默认展开状态')
    window.localStorage.removeItem(PANEL_STATE_STORAGE_KEY)
  }
}

watch(
  [interactiveFlowNavCollapsed, annotationPanelCollapsed, dataSourcePanelCollapsed, shortcutPanelCollapsed],
  ([navigationCollapsed, collaborationCollapsed, dataSourceCollapsed, shortcutsCollapsed]) => {
    const state: StoredPanelState = { navigationCollapsed, collaborationCollapsed, dataSourceCollapsed, shortcutsCollapsed }
    window.localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(state))
  },
)

function startCollaborationPolling() {
  stopCollaborationPolling()
  if (!annotationRemoteReady.value) return
  collaborationPollingTimer = window.setInterval(() => {
    console.info('🔄 [协作同步] 开始轮询注释、页面描述和流程')
    void refreshAllCollaborationData(true)
  }, annotationPollingIntervalSeconds.value * 1000)
}

watch(annotationPollingIntervalSeconds, () => {
  if (collaborationInitialized.value) startCollaborationPolling()
})

function startUpdateChecks() {
  if (updateCheckTimer) return
  checkForAppUpdate()
  updateCheckTimer = window.setInterval(checkForAppUpdate, UPDATE_CHECK_INTERVAL)
}

async function checkForAppUpdate() {
  const requestUrl = `/version.json?ts=${Date.now()}`

  console.info('🔎 [版本检测] 开始请求版本清单', {
    currentVersion: currentAppVersion,
    currentBuiltAt: currentAppBuiltAt,
    requestUrl,
  })

  try {
    const response = await fetch(requestUrl, {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn('⚠️ [版本检测] 请求失败，服务器未返回可用版本清单', {
        currentVersion: currentAppVersion,
        currentBuiltAt: currentAppBuiltAt,
        status: response.status,
        statusText: response.statusText,
      })
      return
    }

    const manifest = (await response.json()) as VersionManifest
    const remoteVersion = manifest.version?.trim()
    const remoteBuiltAt = manifest.builtAt?.trim()

    console.info('📦 [版本检测] 服务器版本清单', {
      currentVersion: currentAppVersion,
      currentBuiltAt: currentAppBuiltAt,
      remoteVersion,
      remoteBuiltAt,
      dismissedVersion: dismissedUpdateVersion.value || null,
    })

    if (!remoteVersion) {
      console.warn('⚠️ [版本检测] 服务器版本字段为空，无法判断是否更新', {
        currentVersion: currentAppVersion,
        currentBuiltAt: currentAppBuiltAt,
        remoteBuiltAt,
      })
      return
    }

    if (remoteVersion === dismissedUpdateVersion.value) {
      console.info('🙈 [版本检测] 服务器版本已被本次会话忽略，不再提示', {
        currentVersion: currentAppVersion,
        remoteVersion,
        remoteBuiltAt,
      })
      return
    }

    if (remoteVersion === currentAppVersion) {
      console.info('✅ [版本检测] 未发现新版本', {
        currentVersion: currentAppVersion,
        currentBuiltAt: currentAppBuiltAt,
        remoteVersion,
        remoteBuiltAt,
        builtAtChanged: remoteBuiltAt ? remoteBuiltAt !== currentAppBuiltAt : false,
        reason: '当前逻辑只比较 version；如果只重新 build 但没有新 commit，git hash 版本号不会变化。',
      })
      return
    }

    console.info('🔔 [版本检测] 检测到新版本，准备展示刷新提示', {
      currentVersion: currentAppVersion,
      currentBuiltAt: currentAppBuiltAt,
      remoteVersion,
      remoteBuiltAt,
    })

    pendingUpdateVersion.value = remoteVersion
    showUpdatePrompt.value = true
  } catch (error) {
    console.error('❌ [版本检测] 请求或解析版本清单失败', {
      currentVersion: currentAppVersion,
      currentBuiltAt: currentAppBuiltAt,
      error,
    })
    // 版本检测失败不影响主流程，下一轮轮询会继续尝试。
  }
}

function reloadForUpdate() {
  window.location.reload()
}

function dismissUpdatePrompt() {
  dismissedUpdateVersion.value = pendingUpdateVersion.value
  showUpdatePrompt.value = false
}

function syncAppRoute() {
  appRoute.value = window.location.hash === '#/bugs' ? 'bugs' : 'prototype'
}

function openBugPage() {
  window.location.hash = '#/bugs'
}

function closeBugPage() {
  window.location.hash = '#/prototype'
}

function openPrototypePage(nextMode?: typeof mode.value) {
  if (nextMode) mode.value = nextMode
  closeBugPage()
}

function openUpdateHistory() {
  openPrototypePage('interactive')
  showUpdateHistory.value = true
}

function openPrototypeHealth() {
  openPrototypePage('interactive')
  showPrototypeHealthPanel.value = true
}

function syncMobilePureInteractive(event: MediaQueryList | MediaQueryListEvent) {
  isMobileViewport.value = event.matches
}

function touchAverageY(touches: TouchList) {
  if (touches.length !== 2) return null
  return (touches[0].clientY + touches[1].clientY) / 2
}

function handleMobileGestureStart(event: TouchEvent) {
  if (!isMobilePureInteractive.value || mobilePagePickerVisible.value) return
  mobileGestureStartY.value = touchAverageY(event.touches)
  mobileGestureTriggered.value = false
}

function handleMobileGestureMove(event: TouchEvent) {
  if (mobileGestureStartY.value === null || mobileGestureTriggered.value) return
  const averageY = touchAverageY(event.touches)
  if (averageY === null || averageY - mobileGestureStartY.value < 72) return
  event.preventDefault()
  mobileGestureTriggered.value = true
  mobilePagePickerVisible.value = true
  mobilePagePickerQuery.value = ''
  mobilePagePickerExpandedIds.value = new Set([currentScreen.value])
}

function resetMobileGesture() {
  mobileGestureStartY.value = null
  mobileGestureTriggered.value = false
}

function closeMobilePagePicker() {
  mobilePagePickerVisible.value = false
  mobilePagePickerQuery.value = ''
}

function toggleMobilePagePickerScreen(screenId: string) {
  const next = new Set(mobilePagePickerExpandedIds.value)
  if (next.has(screenId)) next.delete(screenId)
  else next.add(screenId)
  mobilePagePickerExpandedIds.value = next
}

function selectMobilePage(screenId: DisplayScreen['id']) {
  go(screenId)
  closeMobilePagePicker()
}

function selectMobilePageState(screenId: DisplayScreen['id'], stateId: string) {
  go(screenId)
  setPrototypeState(screenId, stateId)
  closeMobilePagePicker()
}

function updateOverviewStageWidth() {
  overviewStageWidth.value = overviewStageRef.value?.clientWidth ?? window.innerWidth
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

function handleViewportResize() {
  updateOverviewStageWidth()
  if (mode.value === 'overview') void resetOverviewCanvasView()
}

onMounted(() => {
  syncAppRoute()
  loadPageDescriptionSectionSelection()
  loadPanelState()
  mobilePureMediaQuery = window.matchMedia('(max-width: 640px)')
  syncMobilePureInteractive(mobilePureMediaQuery)
  mobilePureMediaQuery.addEventListener('change', syncMobilePureInteractive)
  window.addEventListener('touchstart', handleMobileGestureStart, { passive: true })
  window.addEventListener('touchmove', handleMobileGestureMove, { passive: false })
  window.addEventListener('touchend', resetMobileGesture, { passive: true })
  window.addEventListener('touchcancel', resetMobileGesture, { passive: true })
  window.addEventListener('resize', handleViewportResize)
  window.addEventListener('hashchange', syncAppRoute)
  updateOverviewStageWidth()
  overviewResizeObserver = new ResizeObserver(updateOverviewStageWidth)
  if (overviewStageRef.value) {
    overviewResizeObserver.observe(overviewStageRef.value)
  }
  window.addEventListener('keydown', handleShortcutKeydown)

  isAuthenticated.value = runtimeConfig.auth?.enabled !== true || window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  if (isAuthenticated.value) {
    startAuthenticatedApp()
  } else if (!hasConfiguredCredentials()) {
    console.error('🔐 [前端认证] 已启用认证但未提供用户名或密码，访问页将无法登录')
  }
})

onBeforeUnmount(() => {
  stopCollaborationPolling()
  clearAnnotationPress()
  clearAnnotationPositionSaveTimers()
  mobilePureMediaQuery?.removeEventListener('change', syncMobilePureInteractive)
  mobilePureMediaQuery = undefined
  window.removeEventListener('touchstart', handleMobileGestureStart)
  window.removeEventListener('touchmove', handleMobileGestureMove)
  window.removeEventListener('touchend', resetMobileGesture)
  window.removeEventListener('touchcancel', resetMobileGesture)
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('hashchange', syncAppRoute)
  window.removeEventListener('keydown', handleShortcutKeydown)
  overviewResizeObserver?.disconnect()
  overviewResizeObserver = undefined
  if (updateCheckTimer) {
    window.clearInterval(updateCheckTimer)
  }
  if (interactionModeToastTimer) {
    window.clearTimeout(interactionModeToastTimer)
  }
})
</script>

<template>
  <main
    class="min-h-screen bg-canvas text-ink transition-[padding] duration-200"
    :class="[
      isMobilePureInteractive ? 'mobile-pure-interactive' : '',
      presentationMode ? 'presentation-mode' : (!isMobilePureInteractive && (showUpdatePrompt ? 'has-update-banner pt-[120px]' : 'pt-[68px]')),
    ]"
    :style="themeStyle"
  >
    <section v-if="!isAuthenticated" class="flex min-h-screen items-center justify-center px-5 py-10">
      <form
        class="w-full max-w-sm rounded-[28px] border border-line bg-panel p-6 text-center shadow-soft"
        @submit.prevent="handleAuthSubmit"
      >
        <h1 class="text-2xl font-semibold text-ink">产品原型访问</h1>
        <p class="mt-2 text-sm leading-6 text-muted">请输入访问账号和密码</p>
        <div class="mt-6 space-y-3 text-left">
          <label class="block">
            <span class="text-xs font-semibold text-muted">账号</span>
            <input
              v-model="authUsername"
              class="mt-2 w-full rounded-[16px] border border-line bg-soft px-4 py-3 text-sm text-ink outline-none transition focus:border-ocean focus:bg-panel"
              type="text"
              autocomplete="username"
            />
          </label>
          <label class="block">
            <span class="text-xs font-semibold text-muted">密码</span>
            <input
              v-model="authPassword"
              class="mt-2 w-full rounded-[16px] border border-line bg-soft px-4 py-3 text-sm text-ink outline-none transition focus:border-ocean focus:bg-panel"
              type="password"
              autocomplete="current-password"
            />
          </label>
        </div>
        <button class="primary-btn mt-5 w-full justify-center" type="submit">进入原型</button>
        <p v-if="authError" class="mt-4 text-sm font-semibold text-red-500">{{ authError }}</p>
      </form>
    </section>
    <template v-else>
    <div v-if="showUpdatePrompt && !isMobilePureInteractive" class="update-banner">
      <div class="update-banner-inner">
        <p>🔔 检测到新版本，刷新后即可使用最新页面</p>
        <div class="update-banner-actions">
          <button type="button" @click="reloadForUpdate">刷新</button>
          <button type="button" aria-label="关闭更新提示" @click="dismissUpdatePrompt">×</button>
        </div>
      </div>
    </div>
    <div v-if="!isMobilePureInteractive" class="top-chrome">
    <div class="apple-subnav">
      <div class="project-identity">
        <button class="project-title-btn" type="button" @click="openPrototypePage()">
          <p class="text-[21px] font-semibold leading-none">{{ t('prototypeTitle') }}</p>
          <p class="mt-1 text-xs text-muted">{{ t('prototypeSubtitle') }}</p>
        </button>
        <div class="core-version-stack" aria-label="原型内核版本">
          <p><span>当前</span><b>v{{ currentCoreVersion }}</b></p>
          <p><span>最新</span><b :class="{ 'text-warning': hasNewerCoreVersion }">{{ latestCoreVersionLabel }}</b></p>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2">
        <a
          class="mode-btn top-level-mode-btn rounded-full bg-panel ring-1 ring-line"
          href="https://altimodo-doc.doc.gominex.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          产品需求文档
        </a>
        <button class="mode-btn top-level-mode-btn rounded-full bg-panel ring-1 ring-line" :class="{ active: showUpdateHistory }" @click="openUpdateHistory">更新历史</button>
        <button class="mode-btn top-level-mode-btn rounded-full bg-panel ring-1 ring-line" :class="{ active: showPrototypeHealthPanel }" @click="openPrototypeHealth">
          健康检查
        </button>
        <button class="mode-btn bug-nav-btn rounded-full bg-panel ring-1 ring-line" :class="{ active: appRoute === 'bugs' }" @click="openBugPage">
          Bug
          <span v-if="unresolvedBugCount" class="bug-nav-badge">{{ unresolvedBugCount }}</span>
        </button>
        <div class="top-control-group flex rounded-full bg-panel ring-1 ring-line">
          <button class="mode-btn" :class="{ active: appRoute === 'prototype' && mode === 'interactive' }" @click="openPrototypePage('interactive')">交互模式</button>
          <button class="mode-btn" :class="{ active: appRoute === 'prototype' && mode === 'overview' }" @click="openPrototypePage('overview')">全图模式</button>
          <button class="mode-btn" :class="{ active: appRoute === 'prototype' && mode === 'flow' }" @click="openPrototypePage('flow')">流程模式</button>
        </div>
        <div class="top-control-group flex rounded-full bg-panel ring-1 ring-line">
          <button class="mode-btn" :class="{ active: lang === 'zh' }" @click="lang = 'zh'">中文</button>
          <button class="mode-btn" :class="{ active: lang === 'en' }" @click="lang = 'en'">English</button>
        </div>
        <div class="top-control-group relative flex rounded-full bg-panel ring-1 ring-line">
          <button class="mode-btn flex items-center gap-2" :class="{ active: showThemePanel }" @click="showThemePanel = !showThemePanel">
            <span class="theme-swatch" :style="{ '--swatch-color': activeThemeColors.ocean }" />
            {{ t('themeButton') }}
          </button>
          <div v-if="showThemePanel" class="theme-popover">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-ink">{{ t('themeTitle') }}</p>
                <p class="mt-1 text-xs leading-5 text-muted">{{ t('themeDescription') }}</p>
              </div>
              <button class="text-xs font-semibold text-ocean" @click="resetCustomTheme">{{ t('themeReset') }}</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="theme in themeOptions"
                :key="theme.id"
                class="theme-scheme-btn"
                :class="{ active: selectedThemeId === theme.id }"
                @click="selectTheme(theme.id)"
              >
                <span class="theme-swatch" :style="{ '--swatch-color': theme.colors.ocean }" />
                <span class="min-w-0">
                  <b>{{ t(theme.nameKey) }}</b>
                  <small>{{ t(theme.descriptionKey) }}</small>
                </span>
              </button>
            </div>
            <div class="mt-3 flex gap-2">
              <button class="theme-file-btn" @click="exportCustomTheme">{{ t('themeExport') }}</button>
              <button class="theme-file-btn" @click="themeImportInput?.click()">{{ t('themeImport') }}</button>
              <input ref="themeImportInput" class="hidden" type="file" accept="application/json,.json" @change="importCustomTheme" />
            </div>
            <div class="theme-color-grid">
              <label v-for="field in themeColorFields" :key="field.key" class="theme-color-field">
                <input
                  type="color"
                  :value="activeThemeColors[field.key]"
                  @input="updateCustomThemeColor(field.key, ($event.target as HTMLInputElement).value)"
                />
                <span>
                  <b>{{ t(field.labelKey) }}</b>
                  <small>{{ t(field.descKey) }}</small>
                </span>
                <input
                  type="text"
                  :value="activeThemeColors[field.key]"
                  @input="updateCustomThemeColor(field.key, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>

    <BugReportPage v-if="appRoute === 'bugs' && !isMobilePureInteractive" @close="closeBugPage" />

    <section
      v-if="appRoute === 'prototype'"
      class="prototype-stage mx-auto flex w-full flex-col gap-6 px-4 py-6 lg:px-8"
      :class="effectiveMode === 'overview' ? 'max-w-none' : effectiveMode === 'interactive' && currentScreenPlatform === 'pc' ? 'max-w-[1504px]' : 'max-w-7xl'"
    >
      <section v-if="!isMobilePureInteractive" class="apple-hero-copy">
        <button
          v-if="effectiveMode === 'interactive'"
          class="page-description-summary"
          type="button"
          @click="pageDescriptionSummaryVisible = true; pageDescriptionCopyNotice = ''"
        >
          <p><b>页面结构：</b>{{ pageDescriptionSummary.structure }}</p>
          <p><b>核心功能：</b>{{ pageDescriptionSummary.features }}</p>
        </button>
        <p v-else>{{ t('heroCopy') }}</p>
      </section>

      <div class="flex flex-col gap-6 lg:flex-row">
        <aside
          v-if="effectiveMode === 'interactive' && !isMobilePureInteractive"
          class="apple-side-nav interactive-side-nav"
          :class="{
            'can-scroll-up': interactiveSideNavCanScrollUp,
            'can-scroll-down': interactiveSideNavCanScrollDown,
            collapsed: interactiveFlowNavCollapsed,
          }"
        >
          <button
            class="annotation-panel-tab interactive-flow-nav-tab"
            type="button"
            @click="toggleInteractiveFlowNav"
          >
            {{ interactiveFlowNavCollapsed ? '展开导航' : '收起导航' }}
          </button>
          <div v-if="!interactiveFlowNavCollapsed" class="interactive-side-nav-scroll-wrap">
            <div
              ref="interactiveSideNavRef"
              class="interactive-side-nav-scroll"
              @scroll="updateInteractiveSideNavScroll"
            >
              <button
                v-for="screen in screens"
                :key="screen.id"
                class="nav-row"
                :class="{ active: currentScreen === screen.id }"
                @click="goToAnnotatedScreen(screen.id)"
              >
                <span
                  class="platform-badge"
                  :class="screen.platform === 'pc' ? 'is-pc' : 'is-mobile'"
                  aria-hidden="true"
                >{{ screen.platform === 'pc' ? 'P' : 'M' }}</span>
                <component :is="screen.icon" class="h-4 w-4" />
                <span
                  v-if="isScreenHighlighted(screen.id)"
                  class="screen-highlight-bookmark"
                  :style="{ backgroundColor: highlightColorForScreen(screen.id) }"
                  aria-hidden="true"
                />
                <span class="flex-1 text-left">{{ screen.code }} {{ screen.title }}</span>
                <div class="ml-auto flex items-center gap-2">
                  <span v-if="annotationCountByScreen(screen.id)" class="annotation-nav-badge">{{ annotationCountByScreen(screen.id) }}</span>
                </div>
              </button>
            </div>
            <svg v-if="interactiveSideNavCanScrollUp" class="side-nav-scroll-hint-top" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            <svg v-if="interactiveSideNavCanScrollDown" class="side-nav-scroll-hint-bottom" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </div>
        </aside>

        <aside v-if="effectiveMode === 'overview'" class="apple-side-nav overview-side-nav">
          <p class="px-2 pb-3 text-sm font-semibold text-muted">显示设置</p>
          <div class="px-2 pb-4">
            <label class="mb-2 block text-xs font-semibold text-muted">每行数量</label>
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted">3</span>
              <input v-model.number="overviewColumns" min="3" max="6" step="1" type="range" class="overview-range" aria-label="每行数量" />
              <span class="text-xs text-muted">6</span>
              <strong class="min-w-5 text-center text-xs font-semibold text-ink">{{ overviewColumns }}</strong>
            </div>
          </div>
          <div class="px-2">
            <label class="mb-2 block text-xs font-semibold text-muted">缩放</label>
            <div class="flex items-center gap-2">
              <button type="button" class="overview-zoom-btn" @click="stepOverviewCanvasZoom(-0.06)">−</button>
              <strong class="min-w-10 text-center text-xs font-semibold text-ink">{{ Math.round(overviewZoom * 100) }}%</strong>
              <button type="button" class="overview-zoom-btn" @click="stepOverviewCanvasZoom(0.06)">+</button>
              <button type="button" class="overview-zoom-btn" aria-label="重置画布" title="重置画布" @click="resetOverviewCanvasView">↺</button>
            </div>
          </div>
        </aside>

        <aside v-if="effectiveMode === 'flow'" class="apple-side-nav flow-side-nav lg:w-80">
          <div class="flex items-center justify-between px-2 pb-3">
            <p class="text-sm font-semibold text-muted">主流程</p>
            <button
              class="flex items-center gap-1 rounded-lg bg-soft px-2.5 py-1 text-xs font-medium text-ink hover:bg-canvas transition"
              @click="showFlowEditor = true"
            >
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              编辑流程
            </button>
          </div>
          <button
            v-for="flow in mainFlows"
            :key="flow.id"
            class="nav-row flow-nav-row"
            :class="{ active: selectedFlowId === flow.id }"
            @click="selectFlow(flow.id)"
          >
            <span class="flow-dot" />
            <span class="min-w-0 flex-1 text-left">
              <b>{{ flow.title }}</b>
              <small>{{ flow.subtitle }}</small>
            </span>
          </button>
        </aside>

        <section ref="overviewStageRef" class="flex-1 relative">
          <div v-if="effectiveMode === 'flow'" class="flow-toolbar">
            <div class="flow-zoom-controls">
              <button type="button" @click="stepFlowZoom(0.06)">+</button>
              <input v-model.number="flowZoom" min="0.25" max="0.9" step="0.01" type="range" aria-label="流程画布缩放" />
              <strong>{{ flowZoomPercent }}</strong>
              <button type="button" @click="stepFlowZoom(-0.06)">-</button>
              <button type="button" aria-label="重置画布" title="重置画布" @click="resetFlowView">↺</button>
            </div>
          </div>
          <div
            :class="[
              effectiveMode === 'overview' ? 'overview-canvas' : effectiveMode === 'flow' ? 'flow-grid' : 'grid gap-6 place-items-center',
              { 'is-flow-panning': isFlowPanning, 'is-overview-panning': isOverviewPanning },
            ]"
            :style="effectiveMode === 'flow' ? flowGridStyle : undefined"
            @mousedown="effectiveMode === 'flow' ? startFlowPan($event) : effectiveMode === 'overview' ? startOverviewPan($event) : undefined"
            @mousemove="effectiveMode === 'flow' ? moveFlowPan($event) : effectiveMode === 'overview' ? moveOverviewPan($event) : undefined"
            @mouseup="effectiveMode === 'flow' ? stopFlowPan() : stopOverviewPan()"
            @mouseleave="effectiveMode === 'flow' ? stopFlowPan() : stopOverviewPan()"
            @wheel="effectiveMode === 'flow' ? zoomFlowAtPoint($event) : effectiveMode === 'overview' ? zoomOverviewAtPoint($event) : undefined"
          >
            <div
              ref="overviewGridRef"
              :class="effectiveMode === 'overview' ? 'overview-grid' : 'contents'"
              :style="effectiveMode === 'overview' ? overviewGridStyle : undefined"
            >
            <div
              v-for="row in effectiveMode === 'flow' ? flowRows : []"
              :key="row.key"
              class="flow-row-label"
              :style="flowRowLabelStyle(row.row)"
            >
              <span>子流程</span>
              <strong>{{ row.label }}</strong>
            </div>
            <article
              v-for="screen in renderedScreens"
              :key="effectiveMode === 'flow' ? `${screen.id}-${screen.stateId ?? 'default'}-${screen.flowRow}-${screen.flowCol}` : `${screen.id}-${screen.stateId ?? 'default'}`"
              :class="[
                screen.platform === 'pc' ? 'desktop-shell' : 'phone-shell',
                {
                  'flow-phone-shell': effectiveMode === 'flow' && screen.platform === 'mobile',
                  'flow-desktop-shell': effectiveMode === 'flow' && screen.platform === 'pc',
                  'flow-has-next': effectiveMode === 'flow' && screen.hasNext,
                },
              ]"
              :style="screenShellStyle(screen)"
            >
              <div
                class="prototype-preview-scaler"
                :class="{
                  'overview-phone-scale': effectiveMode === 'overview' && screen.platform === 'mobile',
                  'overview-desktop-scale': effectiveMode === 'overview' && screen.platform === 'pc',
                }"
              >
                <PrototypeStateSwitcher
                  v-if="effectiveMode === 'interactive' && !isMobilePureInteractive && screen.platform === 'mobile' && prototypeStateOptions.length && activePrototypeStateId"
                  :title="t('prototypeStateSwitch')"
                  :options="prototypeStateOptions"
                  :active-id="activePrototypeStateId"
                  :count-for-state="(stateId) => annotationCountByState(currentScreen, stateId)"
                  :highlighted-colors="activeScreenHighlightedStateColors"
                  @change="setPrototypeState(currentScreen, $event)"
                />
                <div :class="screen.platform === 'pc' ? 'desktop-frame' : 'phone-screen'">
                  <div v-if="screen.platform === 'mobile' && !isMobilePureInteractive" class="status-bar">
                    <span>9:41</span>
                    <span>86%</span>
                  </div>
                  <div
                    class="screen-content"
                    :class="{
                      'desktop-screen-content': screen.platform === 'pc',
                      'tab-screen-content': screen.platform === 'mobile' && screen.hasTabBar,
                      'is-placing-annotation': effectiveMode === 'interactive' && !isMobilePureInteractive && isPlacingAnnotation,
                    }"
                    @click.capture="!isMobilePureInteractive && handleAnnotationCanvasClick($event, screen.id)"
                  >
                    <div class="screen-scroll-wrapper">
                      <ScreenRenderer :screen="screen" />
                      <div v-if="effectiveMode === 'interactive' && !isMobilePureInteractive && !presentationMode && activeCollaborationTab === 'annotations' && annotationPointsVisible" class="annotation-layer">
                        <div
                          v-for="(annotation, index) in currentScreenAnnotations"
                          :key="annotation.id"
                          :data-annotation-id="annotation.id"
                          class="annotation-point-wrap"
                          :class="{
                            'is-holding': annotationHoldId === annotation.id,
                            'is-dragging': annotationDragPreview?.id === annotation.id,
                            'is-syncing-position': annotationPositionSyncingIds.has(annotation.id),
                          }"
                          :style="annotationDisplayPointStyle(annotation)"
                          @mouseenter="handleAnnotationPointMouseEnter(annotation, $event)"
                          @mouseleave="scheduleHideAnnotationPopover"
                        >
                          <button
                            class="annotation-point"
                            type="button"
                            title="长按抓取后拖动位置"
                            :disabled="annotationPositionSyncingIds.has(annotation.id)"
                            @click.stop="handleAnnotationPointClick(annotation)"
                            @pointerdown.stop="handleAnnotationPointPointerDown(annotation, $event)"
                            @pointermove="handleAnnotationPointPointerMove"
                            @pointerup="handleAnnotationPointPointerUp"
                            @pointercancel="handleAnnotationPointPointerCancel"
                          >
                            {{ index + 1 }}
                          </button>
                        </div>
                        <div v-if="annotationDraftMatchesCurrentState" class="annotation-point-wrap draft" :style="annotationPointStyle(annotationDraft!)">
                          <button class="annotation-point" type="button">+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <TabBar v-if="screen.platform === 'mobile' && screen.hasTabBar" :active="selectedTab" :items="tabBarItems" @change="goTab" />
                </div>
              </div>
              <div v-if="effectiveMode === 'overview' || effectiveMode === 'flow'" class="prototype-screen-caption mt-3 text-center text-sm font-semibold text-muted" :class="{ 'flow-caption': effectiveMode === 'flow' }">
                <span
                  class="platform-badge is-small"
                  :class="screen.platform === 'pc' ? 'is-pc' : 'is-mobile'"
                  aria-hidden="true"
                >{{ screen.platform === 'pc' ? 'P' : 'M' }}</span>
                <br v-if="screen.platform === 'mobile'" />
                {{ screen.code }} · {{ screen.title }}<template v-if="screen.stateLabel"> · {{ screen.stateLabel }}</template>
              </div>
            </article>
            </div>
          </div>
        </section>
      </div>
    </section>
    <aside
      v-if="appRoute === 'prototype' && effectiveMode === 'interactive' && !isMobilePureInteractive"
      class="annotation-side-panel"
      :class="{ collapsed: annotationPanelCollapsed, 'description-view-mode': activeCollaborationTab === 'pageDescription' }"
    >
      <button class="annotation-panel-tab" type="button" @click="annotationPanelCollapsed = !annotationPanelCollapsed">
        {{ annotationPanelCollapsed ? t('annotationExpand') : t('annotationCollapse') }}
      </button>
      <template v-if="!annotationPanelCollapsed">
        <div class="annotation-panel-head">
          <div>
            <p>{{ t('annotationPanelTitle') }}</p>
            <span>{{ t('annotationPanelSubtitle') }} · {{ currentMeta.code }}<template v-if="currentPrototypeStateLabel"> · {{ currentPrototypeStateLabel }}</template></span>
          </div>
          <strong>{{ activeCollaborationTab === 'annotations' ? currentScreenAnnotations.length : currentPageDescription ? 1 : 0 }}</strong>
        </div>
        <div class="annotation-panel-tabs">
          <button type="button" :class="{ active: activeCollaborationTab === 'annotations' }" @click="activeCollaborationTab = 'annotations'">
            {{ t('annotationTabNotes') }}
          </button>
          <button type="button" :class="{ active: activeCollaborationTab === 'pageDescription' }" @click="activeCollaborationTab = 'pageDescription'; cancelAnnotationDraft()">
            {{ t('annotationTabDescription') }}
          </button>
        </div>
        <div v-if="activeCollaborationTab === 'annotations'" class="annotation-panel-actions">
          <button type="button" :class="{ active: isPlacingAnnotation }" @click="startAnnotationPlacement">
            {{ isPlacingAnnotation ? t('annotationCancelAdd') : t('annotationAdd') }}
          </button>
          <button type="button" @click="annotationPointsVisible = !annotationPointsVisible">
            {{ annotationPointsVisible ? t('annotationHidePoints') : t('annotationShowPoints') }}
          </button>
          <button type="button" :disabled="annotationSyncStatus === 'syncing'" @click="refreshPrototypeAnnotations()">
            {{ t('annotationRefresh') }}
          </button>
          <button type="button" @click="exportAnnotations">{{ t('annotationExport') }}</button>
        </div>
        <div v-else class="annotation-panel-actions description-actions">
          <button type="button" :disabled="annotationSyncStatus === 'syncing'" @click="refreshPageDescriptions()">
            {{ t('annotationRefresh') }}
          </button>
          <button type="button" @click="exportPageDescriptions">{{ t('pageDescriptionExport') }}</button>
          <button type="button" :class="{ active: pageDescriptionEditing }" @click="startPageDescriptionEdit">
            {{ currentPageDescription ? '编辑' : '新增' }}
          </button>
        </div>
        <div class="annotation-sync-row" :class="`is-${annotationSyncStatus}`">
          <span>{{ annotationRemoteReady ? annotationSyncLabel : t('annotationRemoteDisabled') }}</span>
        </div>
        <label class="annotation-author-field">
          <span>{{ t('annotationAuthorName') }}</span>
          <input v-model="annotationAuthorName" type="text" :placeholder="t('annotationAuthorPlaceholder')" />
        </label>
        <label class="annotation-polling-field">
          <span>{{ t('annotationPollingInterval') }}</span>
          <div class="annotation-polling-control">
            <input v-model.number="annotationPollingIntervalInput" min="10" max="300" step="5" type="number" />
            <small>{{ t('annotationPollingUnit') }}</small>
            <button type="button" :disabled="Number(annotationPollingIntervalInput) === annotationPollingIntervalSeconds" @click="saveAnnotationPollingInterval">
              {{ t('annotationPollingSave') }}
            </button>
          </div>
        </label>
        <p class="annotation-polling-notice">{{ annotationPollingNotice }}</p>
        <div v-if="activeCollaborationTab === 'annotations'" class="annotation-list">
          <p v-if="!currentScreenAnnotations.length" class="annotation-empty">{{ t('annotationEmpty') }}</p>
          <section v-for="(annotation, index) in currentScreenAnnotations" :key="annotation.id" @mouseenter="handleAnnotationListMouseEnter(annotation)" @mouseleave="scheduleHideAnnotationPopover">
            <span>{{ index + 1 }}</span>
            <div>
              <h3>{{ annotation.featureName }}</h3>
              <p>{{ annotation.featureDescription }}</p>
              <small>{{ annotation.specialNote }}</small>
              <small v-if="annotation.authorName || annotation.updatedAt">{{ annotation.authorName || '未署名' }}<template v-if="formatAnnotationTime(annotation.updatedAt)"> · {{ formatAnnotationTime(annotation.updatedAt) }}</template></small>
            </div>
            <div class="annotation-list-actions">
              <button class="annotation-list-edit" type="button" @click="openAnnotationDialog(annotation.id)">
                {{ t('editProfile') }}
              </button>
              <button
                class="annotation-list-delete annotation-delete-btn"
                type="button"
                :disabled="!annotationAuthorName.trim()"
                :title="!annotationAuthorName.trim() ? '请先输入昵称以删除注释' : ''"
                @click="removeAnnotation(annotation.id)"
              >
                {{ t('annotationDelete') }}
              </button>
            </div>
          </section>
        </div>
        <div v-else class="page-description-view">
          <p v-if="!currentPageDescription" class="annotation-empty">{{ t('pageDescriptionEmpty') }}</p>
          <template v-else>
            <small v-if="currentPageDescriptionUpdatedLabel" class="page-description-meta">{{ currentPageDescriptionUpdatedLabel }}</small>
            <section v-for="section in pageDescriptionSummarySections" :key="section.id">
              <h3>{{ section.label }}</h3>
              <p>{{ section.value }}</p>
            </section>
          </template>
        </div>
      </template>
    </aside>
    <section
      v-if="appRoute === 'prototype' && collaborationInitialized && !isMobilePureInteractive && !presentationMode"
      class="collaboration-source-card"
      :class="[`is-${collaborationSourceTone}`, { collapsed: dataSourcePanelCollapsed }]"
      aria-live="polite"
      aria-label="当前协作数据来源"
    >
      <button class="annotation-panel-tab collaboration-source-toggle" type="button" @click="dataSourcePanelCollapsed = !dataSourcePanelCollapsed">
        {{ dataSourcePanelCollapsed ? '展开数据源' : '收起数据源' }}
      </button>
      <template v-if="!dataSourcePanelCollapsed">
        <div class="collaboration-source-title">
          <span aria-hidden="true">{{ collaborationSourceTone === 'warning' || collaborationSourceTone === 'conflict' ? '⚠' : '●' }}</span>
          <strong>{{ collaborationCardTitle }}</strong>
          <small>· {{ collaborationBranchLabel }}<template v-if="collaborationTimeLabel"> · {{ collaborationTimeLabel }}</template></small>
        </div>
        <p>{{ collaborationKindSummary }}</p>
        <button
          v-if="canInitializeRemote"
          class="collaboration-initialize-btn"
          type="button"
          :disabled="collaborationBootstrapStatus === 'running'"
          @click="initializeRemoteCollaborationData"
        >
          {{ collaborationBootstrapStatus === 'running' ? `${collaborationBootstrapProgress.current}/${collaborationBootstrapProgress.total}` : collaborationAllRemote ? '检查远端资料' : '初始化到 Gitee' }}
        </button>
        <button class="environment-check-trigger" type="button" @click="showEnvironmentCheckPanel = true">
          检查本地环境变量
        </button>
      </template>
    </section>
    <div v-if="showEnvironmentCheckPanel" class="environment-check-backdrop" @click.self="showEnvironmentCheckPanel = false">
      <section class="environment-check-panel" role="dialog" aria-modal="true" aria-labelledby="environment-check-title">
        <header>
          <div>
            <h2 id="environment-check-title">环境变量检查</h2>
            <p :class="{ 'has-missing': environmentMissingCount > 0 }">
              {{ environmentConfiguredCount }} / {{ environmentCheckTotal }} 已配置
              <template v-if="environmentMissingCount"> · 缺失 {{ environmentMissingCount }} 项</template>
            </p>
          </div>
          <button type="button" aria-label="关闭环境变量检查" @click="showEnvironmentCheckPanel = false">×</button>
        </header>
        <div class="environment-check-groups">
          <section v-for="group in environmentCheckGroups" :key="group.id">
            <h3>{{ group.title }}</h3>
            <div v-for="item in group.items" :key="item.name" class="environment-check-row" :class="{ missing: !item.configured }">
              <span aria-hidden="true">{{ item.configured ? '✓' : '✕' }}</span>
              <code>{{ item.name }}</code>
              <b>{{ item.configured ? '已配置' : '请配置' }}</b>
            </div>
          </section>
        </div>
        <footer>仅检查配置是否存在，不读取、展示或记录任何配置值。</footer>
      </section>
    </div>
    <aside
      v-if="appRoute === 'prototype' && !isMobilePureInteractive && !presentationMode"
      class="shortcut-panel"
      :class="{ collapsed: shortcutPanelCollapsed }"
      aria-label="快捷键"
    >
      <button class="annotation-panel-tab shortcut-panel-toggle" type="button" @click="shortcutPanelCollapsed = !shortcutPanelCollapsed">
        <Keyboard class="h-4 w-4" />
        {{ shortcutPanelCollapsed ? '快捷键' : '收起快捷键' }}
      </button>
      <template v-if="!shortcutPanelCollapsed">
        <div class="shortcut-panel-head">
          <strong>当前面板快捷键</strong>
          <span>输入内容时自动停用</span>
        </div>
        <section v-for="group in shortcutGroups" :key="group.title" class="shortcut-group">
          <h3>{{ group.title }}</h3>
          <div v-for="item in group.items" :key="item.key" class="shortcut-row">
            <kbd>{{ item.key }}</kbd>
            <span>{{ item.label }}</span>
          </div>
        </section>
      </template>
    </aside>
    <Transition name="shortcut-toast">
      <div v-if="appRoute === 'prototype' && interactionModeToastVisible && !isMobilePureInteractive && !presentationMode" class="interaction-mode-toast" role="status">
        按快捷键 P 可以进入/退出演示模式
      </div>
    </Transition>
    <div v-if="appRoute === 'prototype' && pageDescriptionEditing && !isMobilePureInteractive" class="page-description-dialog-backdrop" @click.self="cancelPageDescriptionEdit">
      <section class="page-description-dialog">
        <div class="page-description-dialog-head">
          <div>
            <p>{{ currentPageDescription ? '编辑页面描述' : '新增页面描述' }}</p>
            <span>{{ currentMeta.code }} · {{ currentMeta.title }}<template v-if="currentPrototypeStateLabel"> · {{ currentPrototypeStateLabel }}</template></span>
          </div>
          <button type="button" aria-label="关闭页面描述编辑" @click="cancelPageDescriptionEdit">×</button>
        </div>
        <form class="page-description-form" @submit.prevent="handlePageDescriptionSave">
          <p v-if="!currentPageDescription" class="annotation-empty">{{ t('pageDescriptionEmpty') }}</p>
          <small v-else-if="currentPageDescriptionUpdatedLabel" class="page-description-meta">{{ currentPageDescriptionUpdatedLabel }}</small>
          <label class="page-description-highlight-field">
            <input v-model="pageDescriptionEditor.highlighted" type="checkbox" />
            <span>重点标注当前状态页</span>
          </label>
          <section v-if="pageDescriptionEditor.highlighted" class="page-description-highlight-colors">
            <span>标记颜色</span>
            <div class="page-description-highlight-swatches">
              <button
                v-for="color in [...presetHighlightColors, ...customHighlightColors]"
                :key="color"
                type="button"
                :class="{ active: pageDescriptionEditor.highlightColor === color }"
                :style="{ backgroundColor: color }"
                :aria-label="`选择颜色 ${color}`"
                :title="color"
                @click="selectHighlightColor(color)"
              />
            </div>
            <div class="page-description-custom-color">
              <input v-model="customHighlightColorInput" type="text" maxlength="7" placeholder="#12b981" @keydown.enter.prevent="addCustomHighlightColor" />
              <button type="button" @click="addCustomHighlightColor">新增</button>
            </div>
            <small v-if="customHighlightColorNotice">{{ customHighlightColorNotice }}</small>
          </section>
          <label>
            <span>{{ t('pageDescriptionPurpose') }}</span>
            <textarea v-model="pageDescriptionEditor.purpose" :placeholder="t('pageDescriptionPurposePlaceholder')" />
          </label>
          <label>
            <span>{{ t('pageDescriptionStructure') }}</span>
            <textarea v-model="pageDescriptionEditor.structure" :placeholder="t('pageDescriptionStructurePlaceholder')" />
          </label>
          <label>
            <span>{{ t('pageDescriptionFeatures') }}</span>
            <textarea v-model="pageDescriptionEditor.features" :placeholder="t('pageDescriptionFeaturesPlaceholder')" />
          </label>
          <label>
            <span>{{ t('pageDescriptionFlowPosition') }}</span>
            <textarea v-model="pageDescriptionEditor.flowPosition" :placeholder="t('pageDescriptionFlowPlaceholder')" />
          </label>
          <label>
            <span>交互规则</span>
            <textarea v-model="pageDescriptionEditor.interactionRules" placeholder="说明用户操作后的页面跳转、状态变化、按钮行为和不可直接跳过的流程。" />
          </label>
          <label>
            <span>状态判断依据</span>
            <textarea v-model="pageDescriptionEditor.stateCriteria" placeholder="用中文业务语义说明页面展示依赖哪些状态，不写接口字段名。" />
          </label>
          <label>
            <span>异常与边界</span>
            <textarea v-model="pageDescriptionEditor.edgeCases" placeholder="说明空态、失败态、权限、断连、重复点击、数据不足等边界。" />
          </label>
          <label>
            <span>开发验收</span>
            <textarea v-model="pageDescriptionEditor.acceptanceCriteria" placeholder="说明开发完成后如何判断页面、状态、流程和指标语义实现正确。" />
          </label>
          <label>
            <span>补充说明</span>
            <textarea v-model="pageDescriptionEditor.developmentNotes" :placeholder="t('pageDescriptionDevelopmentPlaceholder')" />
          </label>
          <div class="page-description-form-actions">
            <button type="button" @click="cancelPageDescriptionEdit">{{ t('annotationCancel') }}</button>
            <button type="submit" :disabled="annotationSyncStatus === 'syncing'">{{ t('pageDescriptionSave') }}</button>
          </div>
        </form>
      </section>
    </div>
    <div
      v-if="appRoute === 'prototype' && hoveredAnnotation && !isMobilePureInteractive && !presentationMode"
      class="annotation-popover annotation-floating-popover"
      :style="hoveredAnnotationPopoverStyle"
      @mouseenter="keepAnnotationPopover"
      @mouseleave="scheduleHideAnnotationPopover"
    >
      <div class="annotation-popover-head">
        <b>{{ hoveredAnnotation.featureName }}</b>
        <button
          class="annotation-delete-btn"
          type="button"
          :disabled="!annotationAuthorName.trim()"
          :title="!annotationAuthorName.trim() ? '请先输入昵称以删除注释' : ''"
          @click="removeAnnotation(hoveredAnnotation.id)"
        >
          {{ t('annotationDelete') }}
        </button>
      </div>
      <p>{{ hoveredAnnotation.featureDescription }}</p>
      <small>{{ hoveredAnnotation.specialNote }}</small>
    </div>
    <div v-if="appRoute === 'prototype' && annotationDraft && !isMobilePureInteractive" class="annotation-form-backdrop">
      <form class="annotation-form" @submit.prevent="saveAnnotationDraft">
        <h3>{{ t('annotationFormTitle') }}</h3>
        <label>
          <span>{{ t('annotationFeatureName') }}</span>
          <input v-model="annotationDraft.featureName" type="text" :placeholder="t('annotationNamePlaceholder')" />
        </label>
        <label>
          <span>{{ t('annotationFeatureDescription') }}</span>
          <textarea v-model="annotationDraft.featureDescription" :placeholder="t('annotationDescPlaceholder')" />
        </label>
        <label>
          <span>{{ t('annotationSpecialNote') }}</span>
          <textarea v-model="annotationDraft.specialNote" :placeholder="t('annotationNotePlaceholder')" />
        </label>
        <label>
          <span>{{ t('annotationAuthorName') }}</span>
          <input v-model="annotationAuthorName" type="text" :placeholder="t('annotationAuthorPlaceholder')" />
        </label>
        <div class="annotation-form-actions">
          <button type="button" @click="cancelAnnotationDraft">{{ t('annotationCancel') }}</button>
          <button
            type="submit"
            :disabled="!annotationDraft.featureName.trim() || !annotationDraft.featureDescription.trim() || !annotationDraft.specialNote.trim() || !annotationAuthorName.trim()"
          >
            {{ t('annotationSave') }}
          </button>
        </div>
      </form>
    </div>
    <div v-if="appRoute === 'prototype' && activeAnnotation && !isMobilePureInteractive" class="annotation-form-backdrop">
      <form class="annotation-form" @submit.prevent="saveAnnotationEdit">
        <h3>{{ annotationDialogMode === 'edit' ? t('annotationEditTitle') : t('annotationDetailTitle') }}</h3>
        <label>
          <span>{{ t('annotationFeatureName') }}</span>
          <input v-model="annotationEditor.featureName" type="text" :readonly="annotationDialogMode === 'view'" />
        </label>
        <label>
          <span>{{ t('annotationFeatureDescription') }}</span>
          <textarea v-model="annotationEditor.featureDescription" :readonly="annotationDialogMode === 'view'" />
        </label>
        <label>
          <span>{{ t('annotationSpecialNote') }}</span>
          <textarea v-model="annotationEditor.specialNote" :readonly="annotationDialogMode === 'view'" />
        </label>
        <label v-if="annotationDialogMode === 'edit'">
          <span>{{ t('annotationAuthorName') }}</span>
          <input v-model="annotationAuthorName" type="text" :placeholder="t('annotationAuthorPlaceholder')" />
        </label>
        <div class="annotation-form-actions" :class="{ single: annotationDialogMode === 'view' }">
          <button type="button" @click="closeAnnotationDialog">{{ annotationDialogMode === 'edit' ? t('annotationCancel') : t('close') }}</button>
          <button
            v-if="annotationDialogMode === 'edit'"
            type="submit"
            :disabled="!annotationEditor.featureName.trim() || !annotationEditor.featureDescription.trim() || !annotationEditor.specialNote.trim() || !annotationAuthorName.trim()"
          >
            {{ t('annotationSave') }}
          </button>
        </div>
      </form>
    </div>
    <div v-if="appRoute === 'prototype' && pageDescriptionSummaryVisible && !isMobilePureInteractive" class="page-description-summary-backdrop" @click.self="pageDescriptionSummaryVisible = false">
      <section class="page-description-summary-dialog">
        <div class="page-description-summary-head">
          <div>
            <p>页面描述</p>
            <span>{{ currentMeta.code }} · {{ currentMeta.title }}<template v-if="currentPrototypeStateLabel"> · {{ currentPrototypeStateLabel }}</template></span>
          </div>
          <button type="button" aria-label="关闭页面描述" @click="pageDescriptionSummaryVisible = false">×</button>
        </div>
        <div class="page-description-summary-options" aria-label="选择展示的页面描述部分">
          <div class="page-description-summary-options-head">
            <p>展示内容</p>
          </div>
          <div class="page-description-summary-bulk-actions">
            <button type="button" @click="selectAllPageDescriptionSections">全选</button>
            <button type="button" @click="invertPageDescriptionSections">反选</button>
          </div>
          <div>
            <label v-for="section in pageDescriptionSummarySections" :key="section.id">
              <input
                type="checkbox"
                :checked="selectedPageDescriptionSectionIds.includes(section.id)"
                @change="togglePageDescriptionSection(section.id)"
              />
              <span>{{ section.label }}</span>
            </label>
          </div>
        </div>
        <div class="page-description-summary-body">
          <p v-if="!selectedPageDescriptionSections.length" class="page-description-summary-empty">请选择要展示的描述部分。</p>
          <p v-for="section in selectedPageDescriptionSections" v-else :key="section.id"><b>{{ section.label }}：</b>{{ section.value }}</p>
        </div>
        <div class="page-description-summary-actions">
          <small>{{ pageDescriptionCopyNotice }}</small>
          <button type="button" :disabled="!selectedPageDescriptionSections.length" @click="copyPageDescriptionSummary">复制选中内容</button>
        </div>
      </section>
    </div>
    <div v-if="appRoute === 'prototype' && showPrototypeHealthPanel && !isMobilePureInteractive" class="prototype-health-backdrop" @click.self="showPrototypeHealthPanel = false">
      <section class="prototype-health-panel" role="dialog" aria-modal="true" aria-label="原型健康检查">
        <div class="prototype-health-head">
          <div>
            <p>原型健康检查</p>
            <span>页面描述覆盖率优先读取云端 manifest；云端文件全量检查请运行 pnpm validate:remote</span>
          </div>
          <button type="button" aria-label="关闭健康检查" @click="showPrototypeHealthPanel = false">×</button>
        </div>

        <div class="prototype-health-tabs">
          <button type="button" :class="{ active: prototypeHealthTab === 'overview' }" @click="prototypeHealthTab = 'overview'">总览</button>
          <button type="button" :class="{ active: prototypeHealthTab === 'matrix' }" @click="prototypeHealthTab = 'matrix'">页面/状态矩阵</button>
        </div>

        <template v-if="prototypeHealthTab === 'overview'">
          <div class="prototype-health-stat-grid">
            <section v-for="stat in prototypeHealthStats" :key="stat.label">
              <span>{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
              <small>{{ stat.detail }}</small>
            </section>
          </div>

          <div class="prototype-health-section">
            <div class="prototype-health-section-head">
              <p>问题清单</p>
              <span>{{ prototypeHealthIssues.filter((issue) => issue.tone !== 'success').length }} 个待关注项</span>
            </div>
            <div class="prototype-health-issues">
              <section v-for="issue in prototypeHealthIssues" :key="issue.title" :class="`is-${issue.tone}`">
                <b>{{ issue.title }}</b>
                <p>{{ issue.detail }}</p>
              </section>
            </div>
          </div>
        </template>

        <div v-else class="prototype-health-section prototype-health-matrix-section">
          <div class="prototype-health-section-head">
            <p>页面/状态矩阵</p>
            <span>按页面聚合状态、流程覆盖、描述覆盖和注释数量</span>
          </div>
          <div class="prototype-health-table-wrap">
            <table class="prototype-health-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>页面</th>
                  <th>状态</th>
                  <th>流程</th>
                  <th>描述</th>
                  <th>注释</th>
                  <th>缺失描述</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in prototypeMatrixRows" :key="row.id" :class="{ 'has-gap': row.describedCount < row.stateCount || !row.inFlow }">
                  <td>{{ row.code }}</td>
                  <td>
                    <b>{{ row.title }}</b>
                    <small>{{ row.id }}</small>
                  </td>
                  <td>{{ row.stateCount }}</td>
                  <td>{{ row.inFlow ? `${row.flowCount} 个节点` : '未覆盖' }}</td>
                  <td>{{ row.descriptionRatio }}</td>
                  <td>{{ row.annotationCount }}</td>
                  <td>{{ row.missingDescriptions.length ? row.missingDescriptions.join('、') : '完整' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
    <div v-if="appRoute === 'prototype' && showUpdateHistory && !isMobilePureInteractive" class="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 px-4" @click.self="showUpdateHistory = false">
      <section class="w-full max-w-xl rounded-[24px] border border-line bg-panel p-5 text-left shadow-[0_24px_70px_rgb(0_0_0/0.18)]">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-ink">更新历史</h2>
            <p class="mt-1 text-xs text-muted">最近一次更新时间：{{ latestUpdateTime }}</p>
          </div>
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft text-base font-semibold text-ink" @click="showUpdateHistory = false">
            ×
          </button>
        </div>
        <div class="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <section v-for="item in gitHistory" :key="item.hash" class="overflow-hidden rounded-[16px] bg-soft transition">
            <button type="button" class="w-full p-3 text-left" @click="toggleHistoryDetail(item.hash)">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-ink">{{ item.date }}</p>
                <div class="flex shrink-0 items-center gap-2">
                  <code class="rounded-full bg-panel px-2 py-1 text-xs text-muted">{{ item.hash }}</code>
                  <span class="text-sm text-muted transition-transform duration-200" :class="{ 'rotate-180': expandedHistoryHash === item.hash }">⌄</span>
                </div>
              </div>
              <p class="mt-2 text-sm leading-5 text-muted">{{ item.message }}</p>
            </button>
            <div v-if="expandedHistoryHash === item.hash" class="border-t border-line bg-panel/60 px-3 py-3">
              <div v-if="historyDetailLines(item).length" class="space-y-2">
                <p v-for="line in historyDetailLines(item)" :key="`${item.hash}-${line}`" class="rounded-[12px] bg-panel px-3 py-2 text-xs leading-5 text-muted">
                  {{ line }}
                </p>
              </div>
              <p v-else class="rounded-[12px] bg-panel px-3 py-2 text-xs leading-5 text-muted">暂无更多修改细节</p>
            </div>
          </section>
          <p v-if="!gitHistory.length" class="rounded-[16px] bg-soft p-3 text-sm text-muted">暂无提交记录</p>
        </div>
      </section>
    </div>

    <div
      v-if="appRoute === 'prototype' && mobilePagePickerVisible && isMobilePureInteractive"
      class="mobile-page-picker-backdrop"
      @click.self="closeMobilePagePicker"
    >
      <section class="mobile-page-picker">
        <div class="mobile-page-picker-handle" />
        <header class="mobile-page-picker-head">
          <div>
            <h2>快速切换页面</h2>
            <p>选择页面或页面状态，直接进入目标画面</p>
          </div>
          <button type="button" @click="closeMobilePagePicker">关闭</button>
        </header>
        <input v-model="mobilePagePickerQuery" class="mobile-page-picker-search" type="search" placeholder="搜索 P 编号、页面或状态" />
        <div class="mobile-page-picker-list">
          <section v-for="item in mobilePagePickerItems" :key="item.screen.id" class="mobile-page-picker-item">
            <button
              type="button"
              class="mobile-page-picker-screen"
              :class="{ active: currentScreen === item.screen.id }"
              @click="item.states.length ? toggleMobilePagePickerScreen(item.screen.id) : selectMobilePage(item.screen.id)"
            >
              <span class="mobile-page-picker-code">{{ item.screen.code }}</span>
              <span class="mobile-page-picker-copy">
                <b>{{ item.screen.title }}</b>
                <small>{{ item.screen.subtitle }}</small>
              </span>
              <span v-if="item.states.length" class="mobile-page-picker-count">{{ item.states.length }}</span>
            </button>
            <div v-if="item.states.length && (item.forceExpanded || mobilePagePickerExpandedIds.has(item.screen.id))" class="mobile-page-picker-states">
              <button
                v-for="state in item.states"
                :key="state.id"
                type="button"
                :class="{ active: currentScreen === item.screen.id && activePrototypeStateId === state.id }"
                @click="selectMobilePageState(item.screen.id, state.id)"
              >
                <span />
                {{ state.label }}
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>

    <button
      v-if="appRoute === 'prototype' && presentationMode"
      type="button"
      class="presentation-exit-btn"
      @click="exitPresentationMode"
    >
      退出演示 (Esc)
    </button>

    <!-- 流程编辑器 -->
    <FlowEditor
      v-if="appRoute === 'prototype' && showFlowEditor && !isMobilePureInteractive"
      :flows="mainFlows"
      :screens="screens"
      :state-options-by-screen="getPrototypeStateOptions"
      :can-push-remote="canPushFlowsToRemote"
      @close="showFlowEditor = false"
      @save="handleFlowSave"
      @push="handleFlowPush"
      @export="exportFlows"
    />
    </template>
  </main>
</template>
