<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { AlertTriangle, Bug, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDot, FileSpreadsheet, Filter, ImageOff, ImagePlus, Minus, Plus, RefreshCw, RotateCcw, Search, Tag, Trash2, X } from '@lucide/vue'
import { useProductBugs } from './useProductBugs'
import BugMultiSelect from './BugMultiSelect.vue'
import { getPrototypeRuntime } from '../../core/productAdapter'
import { collaborationContextStorageKey } from '../../prototype/collaborationStore'
import { currentUserName, readDefaultUserName, rememberFixerName, defaultFixerName } from '../../prototype/personNameMemory'
import { ossPreviewUrl, ossUploadEnabled, uploadImageToOss } from './ossClient'
import { bugIdExists, bugSubmissionDraftKind, formatReportedBugId, maxBugVersionNameLength, normalizeBugId } from './bugPolicy'
import { exportBugsExcel } from './exportBugs'
import { normalizeBugOwnerRoles } from './bugModel'
import type { BugOwnerRole, BugSeverity, BugSourceSide, BugStatus, BugType, ProductBug, ProductBugAttachment } from './types'

const emit = defineEmits<{
  close: []
}>()

const {
  bugs,
  bugTypes,
  bugSeverities,
  bugSourceSides,
  bugOwnerRoles,
  bugStatuses,
  bugRemoteReady,
  bugMutating,
  bugVersions,
  activeBugVersion,
  bugSyncStatus,
  bugSyncMessage,
  refreshBugs,
  selectBugVersion,
  createBugVersion,
  persistBugs,
  loadLatestBugsForExport,
  nextBugId: generateNextBugId,
} = useProductBugs()

const statusTone: Record<BugStatus, string> = {
  待处理: 'danger',
  已确认: 'warning',
  修复中: 'progress',
  待部署: 'warning',
  已修复: 'fixed',
  已验证: 'success',
  暂不处理: 'muted',
  无需处理: 'muted',
}
const severityWeight: Record<BugSeverity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
}
const sortOptions = [
  { value: 'createdDesc', label: '创建时间 新→旧' },
  { value: 'createdAsc', label: '创建时间 旧→新' },
  { value: 'updatedDesc', label: '更新时间 新→旧' },
  { value: 'updatedAsc', label: '更新时间 旧→新' },
  { value: 'severityAsc', label: '等级 P0→P4' },
  { value: 'severityDesc', label: '等级 P4→P0' },
] as const
const pageSizeOptions = [10, 20, 50, 100] as const
type BugSortKey = (typeof sortOptions)[number]['value']
type BugPageSize = (typeof pageSizeOptions)[number]
const BUG_SUBMISSION_DRAFT_VERSION = 1 as const
const MAX_PENDING_IMAGES = 10
const deleteBugCode = getPrototypeRuntime().tools?.bugDeleteCode?.trim() ?? ''

interface PendingBugImage {
  id: string
  name: string
  file: Blob
  previewUrl: string
  mimeType: string
  size: number
  originalSize: number
  status: 'ready' | 'uploading' | 'uploaded' | 'error'
  error?: string
  uploadedAttachment?: ProductBugAttachment
}

interface BugSubmissionForm {
  reporterName: string
  title: string
  type: BugType
  severity: BugSeverity
  sourceSide: BugSourceSide
  sourceSideVersion: string
  ownerRoles: BugOwnerRole[]
  description: string
}

interface StoredBugSubmissionDraft {
  version: typeof BUG_SUBMISSION_DRAFT_VERSION
  submissionId: string
  form: BugSubmissionForm
  attachments: ProductBugAttachment[]
  updatedAt: string
}

const emptySubmissionForm = (): BugSubmissionForm => ({
  reporterName: readDefaultUserName(),
  title: '',
  type: '功能异常' as BugType,
  severity: 'P2' as BugSeverity,
  sourceSide: '安卓侧' as BugSourceSide,
  sourceSideVersion: '',
  ownerRoles: ['后端开发'] as BugOwnerRole[],
  description: '',
})
const submitForm = reactive(emptySubmissionForm())
const submissionId = ref(createSubmissionId())
const uploadedSubmitAttachments = ref<ProductBugAttachment[]>([])
const submitError = ref('')
interface BugLocator {
  id: string
  createdAt: string
  title: string
  reporterName: string
  occurrence: number
}

const selectedBugLocator = ref<BugLocator | null>(null)
const filters = reactive({
  type: [] as BugType[],
  severity: [] as BugSeverity[],
  sourceSide: [] as BugSourceSide[],
  sourceSideVersion: [] as string[],
  ownerRole: [] as BugOwnerRole[],
  status: ['待处理'] as BugStatus[],
  keyword: '',
})
const bugSort = ref<BugSortKey>('createdDesc')
const pageSize = ref<BugPageSize>(10)
const currentPage = ref(1)
const statusForm = reactive({
  status: '已确认' as BugStatus,
  operatorName: '',
  fixerName: '',
  note: '',
})
const statusError = ref('')
const editError = ref('')
const deleteError = ref('')
const isConfirmingDelete = ref(false)
const deleteSecret = ref('')
const isEditingBug = ref(false)
const editForm = reactive({
  id: '',
  title: '',
  type: '功能异常' as BugType,
  severity: 'P2' as BugSeverity,
  sourceSide: '安卓侧' as BugSourceSide,
  sourceSideVersion: '',
  ownerRoles: ['后端开发'] as BugOwnerRole[],
  description: '',
})
const editAttachments = ref<ProductBugAttachment[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<PendingBugImage[]>([])
const imageNotice = ref('')
const statusImageInputRef = ref<HTMLInputElement | null>(null)
const statusPendingImages = ref<PendingBugImage[]>([])
const statusImageNotice = ref('')
const statusSubmitting = ref(false)
const savingForm = ref(false)
const preparingImages = ref(0)
const exportingBugs = ref(false)
const exportNotice = ref('')
const exportNoticeTone = ref<'success' | 'error'>('success')
const activeImagePreview = ref<ProductBugAttachment | null>(null)
const previewAttachments = ref<ProductBugAttachment[]>([])
const previewIndex = ref(0)
const previewZoom = ref(1)
const previewOffset = reactive({ x: 0, y: 0 })
const previewDrag = ref<{ pointerId: number; x: number; y: number } | null>(null)
const previewCloseButton = ref<HTMLButtonElement | null>(null)
let previewTrigger: HTMLElement | null = null
const listPreviewLimit = 2
const ossReady = ossUploadEnabled()
const versionFormOpen = ref(false)
const reportFormOpen = ref(false)
const versionName = ref('')
const versionMessage = ref('')
const versionNameInput = ref<HTMLInputElement | null>(null)
const versionBusy = computed(() => bugMutating.value || savingForm.value || statusSubmitting.value || preparingImages.value > 0 || exportingBugs.value)

function versionSwitchMessage() {
  if (pendingImages.value.some((image) => image.status !== 'uploaded') || statusPendingImages.value.length) return '请先提交或移除待处理的截图，再切换版本。'
  if (isEditingBug.value || isConfirmingDelete.value || statusForm.note.trim() && selectedBugLocator.value) return '请先保存或关闭正在处理的 Bug，再切换版本。'
  return ''
}

async function handleVersionChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const next = select.value
  versionMessage.value = versionSwitchMessage()
  if (versionBusy.value || versionMessage.value) {
    select.value = activeBugVersion.value.id
    return
  }
  await selectBugVersion(next)
}

async function openVersionForm() {
  versionMessage.value = versionSwitchMessage()
  if (versionBusy.value || versionMessage.value) return
  versionFormOpen.value = true
  await nextTick()
  versionNameInput.value?.focus()
}

function closeVersionForm() {
  versionFormOpen.value = false
  versionName.value = ''
  versionMessage.value = ''
}

async function saveVersion() {
  versionMessage.value = versionSwitchMessage()
  if (versionBusy.value || versionMessage.value) return
  try {
    await createBugVersion(versionName.value, readDefaultUserName() || 'Bug 工作台')
    closeVersionForm()
  } catch (error) {
    versionMessage.value = error instanceof Error ? error.message : 'Bug 版本保存失败，请重试'
  }
}

async function handleRefreshBugs() {
  versionMessage.value = versionSwitchMessage()
  if (!versionBusy.value && !versionMessage.value) await refreshBugs()
}

function displayedBugId(id: string) {
  return formatReportedBugId(activeBugVersion.value, id)
}

function handleImagePreviewKeydown(event: KeyboardEvent) {
  if (!activeImagePreview.value) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    changePreviewImage(event.key === 'ArrowLeft' ? -1 : 1)
    return
  }
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  closeImagePreview()
}

function openImagePreview(attachments: ProductBugAttachment[], index: number) {
  const attachment = attachments[index]
  if (!attachment) return
  previewTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previewAttachments.value = attachments
  previewIndex.value = index
  activeImagePreview.value = attachment
  resetPreviewZoom()
  void nextTick(() => previewCloseButton.value?.focus({ preventScroll: true }))
}

function closeImagePreview() {
  activeImagePreview.value = null
  previewAttachments.value = []
  previewDrag.value = null
  const trigger = previewTrigger
  previewTrigger = null
  if (trigger) void nextTick(() => trigger.focus({ preventScroll: true }))
}

function showListPreviewFallback(event: Event) {
  if (event.currentTarget instanceof HTMLImageElement) event.currentTarget.hidden = true
}

function resetPreviewZoom() {
  previewZoom.value = 1
  previewOffset.x = 0
  previewOffset.y = 0
  previewDrag.value = null
}

function changePreviewImage(direction: number) {
  const next = previewIndex.value + direction
  if (next < 0 || next >= previewAttachments.value.length) return
  previewIndex.value = next
  activeImagePreview.value = previewAttachments.value[next] ?? null
  resetPreviewZoom()
}

function changePreviewZoom(direction: number) {
  previewZoom.value = Math.min(4, Math.max(0.5, Math.round((previewZoom.value + direction * 0.25) * 100) / 100))
  if (previewZoom.value <= 1) {
    previewOffset.x = 0
    previewOffset.y = 0
  }
}

function handlePreviewWheel(event: WheelEvent) {
  changePreviewZoom(event.deltaY < 0 ? 1 : -1)
}

function startPreviewDrag(event: PointerEvent) {
  if (previewZoom.value <= 1) return
  previewDrag.value = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function movePreviewDrag(event: PointerEvent) {
  const drag = previewDrag.value
  if (!drag || drag.pointerId !== event.pointerId) return
  previewOffset.x += event.clientX - drag.x
  previewOffset.y += event.clientY - drag.y
  drag.x = event.clientX
  drag.y = event.clientY
}

function stopPreviewDrag() {
  previewDrag.value = null
}

function createSubmissionId(): string {
  return crypto.randomUUID?.() ?? `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function submissionDraftStorageKey(versionId = activeBugVersion.value.id) {
  return collaborationContextStorageKey(bugSubmissionDraftKind(versionId))
}

function validStoredAttachment(value: unknown): value is ProductBugAttachment {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ProductBugAttachment>
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.objectKey === 'string'
    && typeof item.url === 'string'
    && typeof item.mimeType === 'string'
    && typeof item.size === 'number'
    && typeof item.originalSize === 'number'
    && typeof item.uploaderName === 'string'
    && typeof item.createdAt === 'string'
}

function readSubmissionDraft(): StoredBugSubmissionDraft | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(submissionDraftStorageKey()) ?? 'null') as Partial<StoredBugSubmissionDraft> | null
    const form = value?.form as (Partial<BugSubmissionForm> & { ownerRole?: unknown; ownerRoles?: unknown }) | undefined
    if (value?.version !== BUG_SUBMISSION_DRAFT_VERSION || typeof value.submissionId !== 'string' || !value.submissionId.trim() || !form) return null
    if (typeof form.reporterName !== 'string' || typeof form.title !== 'string' || typeof form.sourceSideVersion !== 'string' || typeof form.description !== 'string') return null
    const ownerRoles = normalizeBugOwnerRoles(form.ownerRoles, form.ownerRole)
    if (!bugTypes.includes(form.type as BugType) || !bugSeverities.includes(form.severity as BugSeverity) || !bugSourceSides.includes(form.sourceSide as BugSourceSide) || !ownerRoles) return null
    return {
      version: BUG_SUBMISSION_DRAFT_VERSION,
      submissionId: value.submissionId,
      form: {
        reporterName: form.reporterName,
        title: form.title,
        type: form.type as BugType,
        severity: form.severity as BugSeverity,
        sourceSide: form.sourceSide as BugSourceSide,
        sourceSideVersion: form.sourceSideVersion,
        ownerRoles,
        description: form.description,
      },
      attachments: Array.isArray(value.attachments) ? value.attachments.filter(validStoredAttachment) : [],
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    }
  } catch {
    return null
  }
}

function hasSubmissionDraftContent() {
  return Boolean(
    submitForm.title.trim()
    || submitForm.description.trim()
    || uploadedSubmitAttachments.value.length,
  )
}

function saveSubmissionDraft(versionId = activeBugVersion.value.id) {
  try {
    if (!hasSubmissionDraftContent()) {
      window.localStorage.removeItem(submissionDraftStorageKey(versionId))
      return
    }
    const draft: StoredBugSubmissionDraft = {
      version: BUG_SUBMISSION_DRAFT_VERSION,
      submissionId: submissionId.value,
      form: { ...submitForm },
      attachments: uploadedSubmitAttachments.value,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(submissionDraftStorageKey(versionId), JSON.stringify(draft))
  } catch {
    // 草稿缓存失败不阻断用户继续提交。
  }
}

function clearSubmissionDraft() {
  try {
    window.localStorage.removeItem(submissionDraftStorageKey())
  } catch {
    // 远端已成功时，本地清理失败不影响提交结果。
  }
  uploadedSubmitAttachments.value = []
  submissionId.value = createSubmissionId()
}

function restoreSubmissionDraft() {
  const restoredSubmissionDraft = readSubmissionDraft()
  reporterNameEdited = Boolean(restoredSubmissionDraft?.form.reporterName.trim())
  if (!restoredSubmissionDraft) return
  Object.assign(submitForm, restoredSubmissionDraft.form)
  submitForm.reporterName = restoredSubmissionDraft.form.reporterName.trim() || readDefaultUserName()
  submissionId.value = restoredSubmissionDraft.submissionId
  uploadedSubmitAttachments.value = restoredSubmissionDraft.attachments
  pendingImages.value = restoredSubmissionDraft.attachments.map((attachment) => ({
    id: `restored-${attachment.id}`,
    name: attachment.name,
    file: new Blob([], { type: attachment.mimeType }),
    previewUrl: ossPreviewUrl(attachment.url),
    mimeType: attachment.mimeType,
    size: attachment.size,
    originalSize: attachment.originalSize,
    status: 'uploaded',
    uploadedAttachment: attachment,
  }))
  if (restoredSubmissionDraft.attachments.length) imageNotice.value = `已恢复 ${restoredSubmissionDraft.attachments.length} 张待提交图片`
}

let reporterNameEdited = false
restoreSubmissionDraft()
watch(submitForm, () => saveSubmissionDraft(), { deep: true })
watch(uploadedSubmitAttachments, () => saveSubmissionDraft(), { deep: true })
watch(() => activeBugVersion.value.id, (_next, previous) => {
  saveSubmissionDraft(previous)
  closeDetail()
  closeImagePreview()
  Object.assign(submitForm, emptySubmissionForm())
  submissionId.value = createSubmissionId()
  uploadedSubmitAttachments.value = []
  submitError.value = ''
  exportNotice.value = ''
  filters.sourceSideVersion = []
  currentPage.value = 1
  restoreSubmissionDraft()
}, { flush: 'sync' })

let operatorNameEdited = false

function rememberUserInput(field: 'reporter' | 'operator', value: string) {
  if (field === 'reporter') reporterNameEdited = true
  else operatorNameEdited = true
  currentUserName.value = value
}

watch(currentUserName, () => {
  if (!reporterNameEdited && !hasSubmissionDraftContent()) submitForm.reporterName = readDefaultUserName()
  if (selectedBugLocator.value && !operatorNameEdited) statusForm.operatorName = readDefaultUserName()
}, { flush: 'sync' })

function hasSameBugIdentity(bug: ProductBug, locator: Omit<BugLocator, 'occurrence'>) {
  return bug.id === locator.id
    && bug.createdAt === locator.createdAt
    && bug.title === locator.title
    && bug.reporterName === locator.reporterName
}

function createBugLocator(bug: ProductBug, current = bugs.value): BugLocator {
  const base = { id: bug.id, createdAt: bug.createdAt, title: bug.title, reporterName: bug.reporterName }
  const matches = current.filter((item) => hasSameBugIdentity(item, base))
  return { ...base, occurrence: Math.max(0, matches.indexOf(bug)) }
}

function findBugIndex(current: ProductBug[], locator: BugLocator | null) {
  if (!locator) return -1
  const matches = current
    .map((bug, index) => ({ bug, index }))
    .filter(({ bug }) => hasSameBugIdentity(bug, locator))
  return matches[locator.occurrence]?.index ?? -1
}

function bugRowKey(bug: ProductBug) {
  const locator = createBugLocator(bug)
  return [locator.id, locator.createdAt, locator.title, locator.reporterName, locator.occurrence].join(':')
}

const selectedBug = computed(() => {
  const index = findBugIndex(bugs.value, selectedBugLocator.value)
  return index >= 0 ? bugs.value[index] : null
})
const selectedBugHasDuplicateId = computed(() => {
  const bug = selectedBug.value
  return Boolean(bug && bugs.value.filter((item) => normalizeBugId(item.id) === normalizeBugId(bug.id)).length > 1)
})
const selectedBugEditable = computed(() => Boolean(selectedBug.value && !['已验证', '无需处理'].includes(selectedBug.value.status)))
const canStartBugEdit = computed(() => selectedBugEditable.value || selectedBugHasDuplicateId.value)
const bugStatusCounts = computed<Record<BugStatus, number>>(() => {
  const counts = Object.fromEntries(bugStatuses.map((status) => [status, 0])) as Record<BugStatus, number>
  for (const bug of bugs.value) counts[bug.status] += 1
  return counts
})
const sourceSideVersionSuggestions = computed(() =>
  Array.from(new Set(bugs.value.map((bug) => bug.sourceSideVersion?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
)

function ownerRolesLabel(ownerRoles: BugOwnerRole[]) {
  return ownerRoles.join('、')
}

function isLastSelectedOwnerRole(ownerRoles: BugOwnerRole[], role: BugOwnerRole) {
  return ownerRoles.length === 1 && ownerRoles[0] === role
}

const filteredBugs = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return bugs.value.filter((bug) => {
    if (filters.type.length && !filters.type.includes(bug.type)) return false
    if (filters.severity.length && !filters.severity.includes(bug.severity)) return false
    if (filters.sourceSide.length && !filters.sourceSide.includes(bug.sourceSide)) return false
    if (filters.sourceSideVersion.length && !filters.sourceSideVersion.includes(bug.sourceSideVersion ?? '')) return false
    if (filters.ownerRole.length && !filters.ownerRole.some((role) => bug.ownerRoles.includes(role))) return false
    if (filters.status.length && !filters.status.includes(bug.status)) return false
    if (!keyword) return true
    return [displayedBugId(bug.id), bug.title, bug.description, bug.reporterName, bug.fixerName, bug.type, bug.severity, bug.sourceSide, bug.sourceSideVersion, ownerRolesLabel(bug.ownerRoles), bug.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})
const sortedBugs = computed(() => {
  const next = [...filteredBugs.value]
  return next.sort((a, b) => {
    if (bugSort.value === 'createdAsc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (bugSort.value === 'updatedDesc') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    if (bugSort.value === 'updatedAsc') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    if (bugSort.value === 'severityAsc') return severityWeight[a.severity] - severityWeight[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (bugSort.value === 'severityDesc') return severityWeight[b.severity] - severityWeight[a.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
})
const totalPages = computed(() => Math.max(1, Math.ceil(sortedBugs.value.length / pageSize.value)))
const paginatedBugs = computed(() => sortedBugs.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const pageStart = computed(() => (sortedBugs.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0))
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, sortedBugs.value.length))

watch(
  () => [filters.type, filters.severity, filters.sourceSide, filters.sourceSideVersion, filters.ownerRole, filters.status, filters.keyword, bugSort.value, pageSize.value],
  () => {
    currentPage.value = 1
  },
)

watch(totalPages, (nextTotal) => {
  if (currentPage.value > nextTotal) currentPage.value = nextTotal
})

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(value / 1024))}KB`
}

function safeFileName(value: string) {
  const stem = value.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
  return stem.slice(0, 48)
}

function imageExtension(image: PendingBugImage) {
  const matched = /\.([a-zA-Z0-9]+)$/.exec(image.name)
  if (matched) return matched[1].toLowerCase()
  if (image.mimeType === 'image/jpeg') return 'jpg'
  if (image.mimeType === 'image/png') return 'png'
  if (image.mimeType === 'image/webp') return 'webp'
  return 'png'
}

function imageObjectKey(scopeId: string, image: PendingBugImage) {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `bugs/${scopeId}/${timestamp}-${image.id}-${safeFileName(image.name)}.${imageExtension(image)}`
}

async function prepareImageFile(file: File): Promise<PendingBugImage> {
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) throw new Error('仅支持 png、jpg、jpeg、webp 图片')
  return {
    id: `pending-image-${createSubmissionId()}`,
    name: file.name || `clipboard-${Date.now()}.png`,
    file,
    previewUrl: URL.createObjectURL(file),
    mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
    size: file.size,
    originalSize: file.size,
    status: 'ready',
  }
}

async function addImageFiles(files: File[], forStatus = false) {
  if (savingForm.value || bugMutating.value || bugSyncStatus.value === 'loading') return
  preparingImages.value += 1
  try {
    await prepareSelectedImages(files, forStatus)
  } finally {
    preparingImages.value -= 1
  }
}

async function prepareSelectedImages(files: File[], forStatus: boolean) {
  if (forStatus && (statusSubmitting.value || isEditingBug.value || isConfirmingDelete.value || bugSyncStatus.value === 'loading')) return
  const images = forStatus ? statusPendingImages : pendingImages
  const notice = forStatus ? statusImageNotice : imageNotice
  notice.value = ''
  if (forStatus && !ossReady) {
    notice.value = '未配置图片上传服务，可仅填写备注并提交状态变更'
    return
  }
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  if (!imageFiles.length) return
  const existingCount = !forStatus && isEditingBug.value ? editAttachments.value.length : 0
  const available = MAX_PENDING_IMAGES - images.value.length - existingCount
  if (available <= 0) {
    notice.value = forStatus ? `每次状态变更最多上传 ${MAX_PENDING_IMAGES} 张备注图片` : `每个 Bug 最多上传 ${MAX_PENDING_IMAGES} 张图片`
    return
  }

  for (const file of imageFiles.slice(0, available)) {
    try {
      const image = await prepareImageFile(file)
      if (images.value.length + existingCount >= MAX_PENDING_IMAGES) {
        URL.revokeObjectURL(image.previewUrl)
        notice.value = `已达到 ${MAX_PENDING_IMAGES} 张图片上限`
        break
      }
      images.value = [...images.value, image]
    } catch (error) {
      notice.value = error instanceof Error ? error.message : '图片处理失败'
    }
  }
  if (imageFiles.length > available) notice.value = `已达到 ${MAX_PENDING_IMAGES} 张图片上限`
}

function handleImageInput(event: Event, forStatus = false) {
  const input = event.target as HTMLInputElement
  void addImageFiles(Array.from(input.files ?? []), forStatus)
  input.value = ''
}

function handlePaste(event: ClipboardEvent, forStatus = false) {
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  if (!files.length) return
  event.preventDefault()
  void addImageFiles(files, forStatus)
}

function removePendingImage(id: string, forStatus = false) {
  if (forStatus && statusSubmitting.value) return
  const images = forStatus ? statusPendingImages : pendingImages
  const target = images.value.find((image) => image.id === id)
  if (target) URL.revokeObjectURL(target.previewUrl)
  if (target?.uploadedAttachment && !forStatus && !isEditingBug.value) {
    uploadedSubmitAttachments.value = uploadedSubmitAttachments.value.filter((attachment) => attachment.id !== target.uploadedAttachment?.id)
  }
  images.value = images.value.filter((image) => image.id !== id)
}

function removeEditAttachment(id: string) {
  editAttachments.value = editAttachments.value.filter((attachment) => attachment.id !== id)
}

async function uploadPendingImages(scopeId: string, uploaderName: string, images = pendingImages.value) {
  if (!images.length) return []
  if (!ossReady) throw new Error('缺少 OSS 上传配置，无法上传图片')
  const attachments: ProductBugAttachment[] = []

  for (const image of images) {
    if (image.uploadedAttachment) {
      attachments.push(image.uploadedAttachment)
      continue
    }
    image.status = 'uploading'
    image.error = ''
    try {
      const uploaded = await uploadImageToOss(imageObjectKey(scopeId, image), image.file)
      image.status = 'uploaded'
      image.uploadedAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: image.name,
        objectKey: uploaded.objectKey,
        url: uploaded.url,
        mimeType: image.mimeType,
        size: image.size,
        originalSize: image.originalSize,
        uploaderName,
        createdAt: new Date().toISOString(),
      }
      attachments.push(image.uploadedAttachment)
    } catch (error) {
      image.status = 'error'
      image.error = error instanceof Error ? error.message : '上传失败'
      throw error
    }
  }

  return attachments
}

function clearPendingImages() {
  pendingImages.value.forEach((image) => URL.revokeObjectURL(image.previewUrl))
  pendingImages.value = []
}

function clearStatusImages() {
  statusPendingImages.value.forEach((image) => URL.revokeObjectURL(image.previewUrl))
  statusPendingImages.value = []
  statusImageNotice.value = ''
}

async function submitBug() {
  if (versionBusy.value || bugSyncStatus.value === 'loading') return
  savingForm.value = true
  try {
    await saveSubmission()
  } finally {
    savingForm.value = false
  }
}

async function saveSubmission() {
  submitError.value = ''
  imageNotice.value = ''
  const reporterName = submitForm.reporterName.trim()
  const title = submitForm.title.trim()
  const description = submitForm.description.trim()
  const sourceSideVersion = submitForm.sourceSideVersion.trim()
  if (!reporterName || !title || !description || !submitForm.ownerRoles.length) {
    submitError.value = '请填写提报人姓名、标题、归属和问题描述'
    return
  }

  saveSubmissionDraft()
  let attachments = [...uploadedSubmitAttachments.value]

  if (pendingImages.value.length) {
    try {
      const uploaded = await uploadPendingImages(`pending/${submissionId.value}`, reporterName)
      attachments = Array.from(new Map([...attachments, ...uploaded].map((attachment) => [attachment.id, attachment])).values())
      uploadedSubmitAttachments.value = attachments
      saveSubmissionDraft()
    } catch (error) {
      imageNotice.value = error instanceof Error ? error.message : '图片上传失败，Bug 未提交'
      return
    }
  }

  let committedBugLocator: BugLocator | null = null
  const saved = await persistBugs(reporterName, '新增 Bug', (current) => {
    const now = new Date().toISOString()
    const assignedBugId = generateNextBugId(current)
    const nextBug: ProductBug = {
      id: assignedBugId,
      title,
      type: submitForm.type,
      severity: submitForm.severity,
      sourceSide: submitForm.sourceSide,
      sourceSideVersion: sourceSideVersion || undefined,
      ownerRole: submitForm.ownerRoles[0],
      ownerRoles: [...submitForm.ownerRoles],
      status: '待处理',
      description,
      reporterName,
      createdAt: now,
      updatedAt: now,
      attachments,
      history: [],
    }
    committedBugLocator = createBugLocator(nextBug, [nextBug, ...current])
    return [nextBug, ...current]
  })
  if (!saved) {
    saveSubmissionDraft()
    if (bugSyncStatus.value === 'conflict') {
      await refreshBugs()
      submitError.value = '远端 Bug 数据已更新，当前草稿和附件已保留，请再次提交'
    } else {
      submitError.value = `${bugSyncMessage.value || 'Bug 提交失败'}，当前草稿已保留`
    }
    return
  }
  clearPendingImages()
  clearSubmissionDraft()
  reporterNameEdited = false
  submitForm.reporterName = readDefaultUserName()
  submitForm.title = ''
  submitForm.sourceSideVersion = sourceSideVersion
  submitForm.description = ''
  const committedIndex = committedBugLocator ? findBugIndex(bugs.value, committedBugLocator) : -1
  if (committedIndex >= 0) openBug(bugs.value[committedIndex]!)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImagePreviewKeydown, true)
  saveSubmissionDraft()
  clearPendingImages()
  clearStatusImages()
})

onMounted(() => {
  window.addEventListener('keydown', handleImagePreviewKeydown, true)
})

function openBug(bug: ProductBug) {
  if (statusSubmitting.value) return
  clearStatusImages()
  const defaultUserName = readDefaultUserName()
  selectedBugLocator.value = createBugLocator(bug)
  isEditingBug.value = false
  editError.value = ''
  deleteError.value = ''
  isConfirmingDelete.value = false
  deleteSecret.value = ''
  editAttachments.value = []
  clearPendingImages()
  imageNotice.value = ''
  statusForm.status = bug.status === '待处理' ? '已确认' : bug.status
  operatorNameEdited = false
  statusForm.operatorName = defaultUserName
  statusForm.fixerName = defaultFixerName(bug.fixerName)
  statusForm.note = ''
  statusError.value = ''
}

function closeDetail() {
  if (statusSubmitting.value) return
  clearStatusImages()
  selectedBugLocator.value = null
  isEditingBug.value = false
  editError.value = ''
  deleteError.value = ''
  isConfirmingDelete.value = false
  deleteSecret.value = ''
  editAttachments.value = []
  clearPendingImages()
  imageNotice.value = ''
}

function startBugEdit() {
  if (statusSubmitting.value) return
  const bug = selectedBug.value
  if (!bug || !canStartBugEdit.value) return
  isConfirmingDelete.value = false
  deleteError.value = ''
  deleteSecret.value = ''
  editForm.id = bug.id
  editForm.title = bug.title
  editForm.type = bug.type
  editForm.severity = bug.severity
  editForm.sourceSide = bug.sourceSide
  editForm.sourceSideVersion = bug.sourceSideVersion ?? ''
  editForm.ownerRoles = [...bug.ownerRoles]
  editForm.description = bug.description
  editAttachments.value = [...(bug.attachments ?? [])]
  clearPendingImages()
  imageNotice.value = ''
  editError.value = ''
  isEditingBug.value = true
}

function cancelBugEdit() {
  isEditingBug.value = false
  editError.value = ''
  editAttachments.value = []
  clearPendingImages()
  imageNotice.value = ''
}

function startDeleteBug() {
  if (statusSubmitting.value) return
  isEditingBug.value = false
  editError.value = ''
  editAttachments.value = []
  clearPendingImages()
  imageNotice.value = ''
  deleteError.value = ''
  deleteSecret.value = ''
  isConfirmingDelete.value = true
}

function cancelDeleteBug() {
  deleteError.value = ''
  deleteSecret.value = ''
  isConfirmingDelete.value = false
}

async function deleteBug() {
  const bug = selectedBug.value
  const locator = selectedBugLocator.value
  if (!bug || !locator) return
  if (!deleteBugCode || deleteSecret.value.trim() !== deleteBugCode) {
    deleteError.value = '密钥不正确'
    return
  }

  const operatorName = statusForm.operatorName.trim() || readDefaultUserName() || '管理员'
  const saved = await persistBugs(operatorName, `删除 Bug ${bug.id}`, (current) => {
    const targetIndex = findBugIndex(current, locator)
    if (targetIndex < 0) throw new Error('目标 Bug 已变化，请刷新后重试')
    return current.filter((_, index) => index !== targetIndex)
  })
  if (!saved) deleteError.value = bugSyncMessage.value || 'Bug 删除失败'
  if (!saved) return
  closeDetail()
}

async function saveBugEdit() {
  if (versionBusy.value || bugSyncStatus.value === 'loading') return
  savingForm.value = true
  try {
    await persistBugEdit()
  } finally {
    savingForm.value = false
  }
}

async function persistBugEdit() {
  const bug = selectedBug.value
  const locator = selectedBugLocator.value
  if (!bug || !locator || !canStartBugEdit.value) return
  const id = editForm.id.trim()
  const title = editForm.title.trim()
  const description = editForm.description.trim()
  const sourceSideVersion = editForm.sourceSideVersion.trim()
  const operatorName = statusForm.operatorName.trim() || readDefaultUserName() || bug.reporterName
  if (!id || !title || !description || !editForm.ownerRoles.length) {
    editError.value = '请填写 Bug ID、标题、归属和问题描述'
    return
  }

  let nextAttachments = [...editAttachments.value]
  imageNotice.value = ''
  if (pendingImages.value.length) {
    try {
      nextAttachments = [...nextAttachments, ...(await uploadPendingImages(bug.id, operatorName))]
    } catch (error) {
      imageNotice.value = error instanceof Error ? error.message : '图片上传失败，Bug 修改未保存'
      return
    }
  }

  const now = new Date().toISOString()
  const saved = await persistBugs(operatorName, '编辑 Bug 内容', (current) => {
    const targetIndex = findBugIndex(current, locator)
    if (targetIndex < 0) throw new Error('目标 Bug 已变化，请刷新后重试')
    if (bugIdExists(current, id, targetIndex)) throw new Error(`Bug ID ${id} 已存在，请改为唯一 ID`)
    return current.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            id,
            title: selectedBugEditable.value ? title : item.title,
            type: selectedBugEditable.value ? editForm.type : item.type,
            severity: selectedBugEditable.value ? editForm.severity : item.severity,
            sourceSide: selectedBugEditable.value ? editForm.sourceSide : item.sourceSide,
            sourceSideVersion: selectedBugEditable.value ? sourceSideVersion || undefined : item.sourceSideVersion,
            ownerRole: selectedBugEditable.value ? editForm.ownerRoles[0] : item.ownerRole,
            ownerRoles: selectedBugEditable.value ? [...editForm.ownerRoles] : item.ownerRoles,
            description: selectedBugEditable.value ? description : item.description,
            attachments: selectedBugEditable.value ? nextAttachments : item.attachments,
            updatedAt: now,
          }
        : item,
    )
  })
  if (!saved) {
    editError.value = bugSyncMessage.value || 'Bug 修改失败'
    return
  }
  // 保存成功后关闭详情抽屉，让用户明确感知提交已完成
  closeDetail()
}

async function updateBugStatus() {
  if (versionBusy.value || isEditingBug.value || isConfirmingDelete.value || bugSyncStatus.value === 'loading') return
  statusError.value = ''
  const bug = selectedBug.value
  const locator = selectedBugLocator.value
  if (!bug || !locator) return
  const operatorName = statusForm.operatorName.trim()
  const fixerName = statusForm.fixerName.trim()
  if (!operatorName) {
    statusError.value = '请填写操作人姓名'
    return
  }
  if (statusForm.status === '已修复' && !fixerName) {
    statusError.value = '状态变更为已修复时，请填写修复人姓名'
    return
  }

  const toStatus = statusForm.status
  const note = statusForm.note.trim() || undefined
  statusSubmitting.value = true
  try {
    const attachments = await uploadPendingImages(bug.id, operatorName, [...statusPendingImages.value])
    const now = new Date().toISOString()
    const nextHistory = {
      id: `bug-history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fromStatus: bug.status,
      toStatus,
      operatorName,
      fixerName: fixerName || undefined,
      note,
      ...(attachments.length ? { attachments } : {}),
      createdAt: now,
    }

    const saved = await persistBugs(operatorName, '变更 Bug 状态', (current) => {
      const targetIndex = findBugIndex(current, locator)
      if (targetIndex < 0) throw new Error('目标 Bug 已变化，请刷新后重试')
      return current.map((item, index) =>
        index === targetIndex
          ? {
              ...item,
              status: toStatus,
              fixerName: fixerName || item.fixerName,
              updatedAt: now,
              history: [nextHistory, ...item.history],
            }
          : item,
      )
    })
    if (!saved) {
      statusError.value = bugSyncMessage.value || 'Bug 状态修改失败'
      return
    }
    statusForm.note = ''
    clearStatusImages()
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : '备注图片上传失败，状态变更未保存'
  } finally {
    statusSubmitting.value = false
  }
}

async function handleExportBugs() {
  if (versionBusy.value) return
  const version = activeBugVersion.value
  exportingBugs.value = true
  exportNotice.value = ''
  try {
    const latestBugs = await loadLatestBugsForExport()
    const result = await exportBugsExcel(latestBugs.map((bug) => ({ ...bug, id: formatReportedBugId(version, bug.id) })))
    exportNoticeTone.value = 'success'
    exportNotice.value = `已导出 ${result.bugCount} 条 Bug、${result.attachmentCount} 个附件${result.thumbnailFailureCount ? `，${result.thumbnailFailureCount} 张缩略图读取失败，已保留原图链接` : ''}`
  } catch (error) {
    exportNoticeTone.value = 'error'
    exportNotice.value = error instanceof Error ? error.message : 'Bug Excel 导出失败'
  } finally {
    exportingBugs.value = false
  }
}
</script>

<template>
  <main class="bug-page">
    <header class="bug-page-head">
      <div>
        <p class="pc-eyebrow">QUALITY REGISTER / BUG</p>
        <button class="bug-back-btn" type="button" @click="emit('close')">返回原型</button>
        <h1>Bug 管理</h1>
        <div class="bug-version-controls">
          <label class="bug-version-picker" for="bug-report-version" :title="activeBugVersion.name">
            <Tag :size="16" aria-hidden="true" />
            <span class="bug-version-label">提报版本</span>
            <strong class="bug-version-value" aria-hidden="true">{{ activeBugVersion.name }}</strong>
            <ChevronDown :size="16" aria-hidden="true" />
            <select id="bug-report-version" :value="activeBugVersion.id" :disabled="versionBusy || versionFormOpen" @change="handleVersionChange">
              <option v-for="version in bugVersions" :key="version.id" :value="version.id">{{ version.name }}</option>
            </select>
          </label>
          <button type="button" class="bug-version-button" :disabled="versionBusy || versionFormOpen || bugSyncStatus === 'loading'" @click="openVersionForm">
            <Plus :size="16" aria-hidden="true" /> 新建版本
          </button>
        </div>
        <form v-if="versionFormOpen" class="bug-version-controls bug-version-form" @submit.prevent="saveVersion" @keydown.esc.prevent="!versionBusy && closeVersionForm()">
          <label class="sr-only" for="bug-version-name">版本名称</label>
          <input id="bug-version-name" ref="versionNameInput" v-model="versionName" type="text" placeholder="例如 2.1" :maxlength="maxBugVersionNameLength" :disabled="versionBusy" required />
          <button type="submit" class="bug-primary-btn bug-version-create" :disabled="versionBusy">{{ bugMutating ? '保存中' : '创建' }}</button>
          <button type="button" class="bug-version-button" :disabled="versionBusy" @click="closeVersionForm">取消</button>
        </form>
        <p v-if="versionMessage" class="bug-version-message" role="alert">{{ versionMessage }}</p>
      </div>
      <div class="bug-head-actions">
        <button class="pc-tool-button pc-primary bug-report-toggle" type="button" :aria-expanded="reportFormOpen" aria-controls="workbench-bug-report" @click="reportFormOpen = !reportFormOpen"><Plus class="h-4 w-4" aria-hidden="true" />{{ reportFormOpen ? '收起提报' : '提报 Bug' }}</button>
        <button class="bug-refresh-btn" type="button" :disabled="bugSyncStatus === 'loading' || versionBusy" @click="handleRefreshBugs">
          <span class="bug-refresh-main">
            <RefreshCw class="h-4 w-4" />
            <span>刷新</span>
          </span>
          <span class="bug-refresh-status" :class="`is-${bugSyncStatus}`" :title="bugSyncMessage">{{ bugSyncMessage || 'Bug 数据已就绪' }}</span>
        </button>
        <button class="bug-export-btn" type="button" :disabled="!bugRemoteReady || bugSyncStatus === 'loading' || versionBusy" @click="handleExportBugs">
          <span class="bug-refresh-main">
            <FileSpreadsheet class="h-4 w-4" />
            <span>{{ exportingBugs ? '导出中' : '导出 Excel' }}</span>
          </span>
          <span class="bug-export-status" :class="`is-${exportNoticeTone}`" :title="exportNotice">{{ exportNotice || (bugRemoteReady ? '仅导出当前版本' : '未启用 Gitee') }}</span>
        </button>
      </div>
    </header>

    <section class="bug-stat-grid">
      <article class="bug-stat-card danger">
        <AlertTriangle class="h-5 w-5" />
        <span>待处理</span>
        <strong>{{ bugStatusCounts['待处理'] }}</strong>
      </article>
      <article class="bug-stat-card warning">
        <CircleDot class="h-5 w-5" />
        <span>已确认</span>
        <strong>{{ bugStatusCounts['已确认'] }}</strong>
      </article>
      <article class="bug-stat-card progress">
        <Bug class="h-5 w-5" />
        <span>修复中</span>
        <strong>{{ bugStatusCounts['修复中'] }}</strong>
      </article>
      <article class="bug-stat-card warning">
        <CircleDot class="h-5 w-5" />
        <span>待部署</span>
        <strong>{{ bugStatusCounts['待部署'] }}</strong>
      </article>
      <article class="bug-stat-card is-fixed">
        <CheckCircle2 class="h-5 w-5" />
        <span>已修复</span>
        <strong>{{ bugStatusCounts['已修复'] }}</strong>
      </article>
      <article class="bug-stat-card success">
        <CheckCircle2 class="h-5 w-5" />
        <span>已验证</span>
        <strong>{{ bugStatusCounts['已验证'] }}</strong>
      </article>
      <article class="bug-stat-card muted">
        <X class="h-5 w-5" />
        <span>无需处理</span>
        <strong>{{ bugStatusCounts['无需处理'] }}</strong>
      </article>
    </section>

    <section class="bug-workspace" :class="{ 'pc-report-open': reportFormOpen }">
      <form id="workbench-bug-report" class="bug-submit-panel" @submit.prevent="submitBug" @paste="handlePaste">
        <datalist id="bug-source-side-version-options">
          <option v-for="version in sourceSideVersionSuggestions" :key="version" :value="version" />
        </datalist>
        <div class="bug-section-title">
          <Plus class="h-4 w-4" />
          <span>提报 Bug · {{ activeBugVersion.name }}</span>
        </div>
        <label>
          <span>提报人姓名</span>
          <input v-model="submitForm.reporterName" type="text" placeholder="请输入姓名" @input="rememberUserInput('reporter', ($event.target as HTMLInputElement).value)" />
        </label>
        <label>
          <span>标题</span>
          <input v-model="submitForm.title" type="text" placeholder="用一句话描述问题" />
        </label>
        <div class="bug-form-row">
          <label>
            <span>类型</span>
            <select v-model="submitForm.type">
              <option v-for="type in bugTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>
          <label>
            <span>等级</span>
            <select v-model="submitForm.severity">
              <option v-for="severity in bugSeverities" :key="severity" :value="severity">{{ severity }}</option>
            </select>
          </label>
          <label>
            <span>发生侧</span>
            <select v-model="submitForm.sourceSide">
              <option v-for="side in bugSourceSides" :key="side" :value="side">{{ side }}</option>
            </select>
          </label>
          <label>
            <span>发生侧版本</span>
            <input v-model="submitForm.sourceSideVersion" type="text" list="bug-source-side-version-options" placeholder="如 iOS 1.2.3 / 后端 2026.06" />
          </label>
          <div class="bug-field">
            <span class="bug-field-label">归属</span>
            <details class="bug-owner-picker">
              <summary>{{ ownerRolesLabel(submitForm.ownerRoles) }}</summary>
              <div class="bug-owner-options">
                <label v-for="role in bugOwnerRoles" :key="role">
                  <input
                    v-model="submitForm.ownerRoles"
                    type="checkbox"
                    :value="role"
                    :disabled="isLastSelectedOwnerRole(submitForm.ownerRoles, role)"
                  />
                  <span>{{ role }}</span>
                </label>
              </div>
            </details>
          </div>
        </div>
        <label>
          <span>问题描述</span>
          <textarea v-model="submitForm.description" placeholder="描述复现步骤、实际结果和期望结果" />
        </label>
        <section class="bug-image-uploader">
          <div class="bug-section-title">
            <ImagePlus class="h-4 w-4" />
            <span>问题截图</span>
          </div>
          <button class="bug-image-picker" type="button" :disabled="pendingImages.length >= MAX_PENDING_IMAGES" @click="imageInputRef?.click()">
            选择图片 / 粘贴截图
          </button>
          <input ref="imageInputRef" class="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="handleImageInput" />
          <p class="bug-image-hint">支持 png、jpg、webp；最多 10 张；图片将按原文件直接上传 OSS。</p>
          <div v-if="pendingImages.length" class="bug-pending-images">
            <article v-for="image in pendingImages" :key="image.id" :class="`is-${image.status}`">
              <img :src="image.previewUrl" :alt="image.name" />
              <div>
                <b>{{ image.name }}</b>
                <span>{{ formatFileSize(image.size) }}<template v-if="image.originalSize !== image.size"> / 原图 {{ formatFileSize(image.originalSize) }}</template></span>
                <small v-if="image.error">{{ image.error }}</small>
              </div>
              <button type="button" :disabled="image.status === 'uploading'" @click="removePendingImage(image.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </article>
          </div>
          <p v-if="imageNotice" class="bug-form-error">{{ imageNotice }}</p>
        </section>
        <p v-if="submitError" class="bug-form-error">{{ submitError }}</p>
        <button class="bug-primary-btn" type="submit" :disabled="bugSyncStatus === 'loading' || versionBusy">提交 Bug</button>
      </form>

      <section class="bug-list-panel">
        <div class="bug-filter-bar">
          <div class="bug-section-title">
            <Filter class="h-4 w-4" />
            <span>Bug 列表 · {{ activeBugVersion.name }}</span>
          </div>
          <div class="bug-filter-grid">
            <BugMultiSelect v-model="filters.status" label="状态" :options="bugStatuses" />
            <BugMultiSelect v-model="filters.type" label="类型" :options="bugTypes" />
            <BugMultiSelect v-model="filters.severity" label="等级" :options="bugSeverities" />
            <BugMultiSelect v-model="filters.ownerRole" label="归属" :options="bugOwnerRoles" />
            <BugMultiSelect v-model="filters.sourceSide" label="发生侧" :options="bugSourceSides" />
            <BugMultiSelect v-model="filters.sourceSideVersion" label="发生侧版本" :options="sourceSideVersionSuggestions" />
            <label class="bug-search-field">
              <Search class="h-4 w-4" />
              <input v-model="filters.keyword" type="search" placeholder="搜索标题、描述、人员、发生侧版本" />
            </label>
          </div>
          <div class="bug-list-controls">
            <label>
              <span>排序</span>
              <select v-model="bugSort">
                <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>每页</span>
              <select v-model.number="pageSize">
                <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }} 条</option>
              </select>
            </label>
          </div>
        </div>

        <div v-if="filteredBugs.length" class="bug-pagination bug-pagination-top">
          <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ sortedBugs.length }} 条</span>
          <div>
            <button type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">上一页</button>
            <strong>{{ currentPage }} / {{ totalPages }}</strong>
            <button type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">下一页</button>
          </div>
        </div>

        <div class="bug-list pc-record-scroll">
          <p v-if="!filteredBugs.length" class="bug-empty" role="status">
            {{ bugSyncStatus === 'loading' ? '正在读取当前版本…' : bugSyncStatus === 'error' || bugSyncStatus === 'conflict' ? (bugSyncMessage || '无法读取当前版本，请刷新重试。') : '当前筛选条件下暂无 Bug。' }}
          </p>
          <table v-else class="pc-record-table" aria-label="当前提报版本工单">
            <thead><tr><th scope="col">编号</th><th scope="col">工单标题</th><th scope="col">状态</th><th scope="col">等级</th><th scope="col">归属 / 发生侧</th><th scope="col">提报信息</th></tr></thead>
            <tbody>
              <tr v-for="bug in paginatedBugs" :key="bugRowKey(bug)">
                <td class="pc-record-id">{{ displayedBugId(bug.id) }}</td>
                <td>
                  <button type="button" class="pc-record-link" @click="openBug(bug)">{{ bug.title }}</button>
                  <small>{{ bug.type }}<template v-if="bug.attachments?.length"> · {{ bug.attachments.length }} 张截图</template></small>
                  <div v-if="bug.attachments?.length" class="bug-record-previews" role="group" :aria-label="`${bug.title}的截图`">
                    <button v-for="(attachment, index) in bug.attachments.slice(0, listPreviewLimit)" :key="attachment.id" type="button" :aria-label="`查看截图 ${index + 1}：${attachment.name}`" :title="attachment.name" @click="openImagePreview(bug.attachments, index)">
                      <img :key="attachment.url" :src="ossPreviewUrl(attachment.url)" alt="" loading="lazy" decoding="async" @error="showListPreviewFallback" />
                      <span class="bug-record-image-fallback"><ImageOff class="h-4 w-4" aria-hidden="true" /><span>加载失败</span></span>
                    </button>
                    <button v-if="bug.attachments.length > listPreviewLimit" type="button" :aria-label="`查看其余 ${bug.attachments.length - listPreviewLimit} 张截图`" @click="openImagePreview(bug.attachments, listPreviewLimit)">+{{ bug.attachments.length - listPreviewLimit }}</button>
                  </div>
                </td>
                <td><span class="pc-record-tag" :data-tone="statusTone[bug.status]">{{ bug.status }}</span></td>
                <td>{{ bug.severity }}</td>
                <td>{{ ownerRolesLabel(bug.ownerRoles) }}<small>{{ bug.sourceSide }}<template v-if="bug.sourceSideVersion"> · {{ bug.sourceSideVersion }}</template></small></td>
                <td>{{ bug.reporterName }}<small>{{ formatTime(bug.createdAt) }}<template v-if="bug.fixerName"> · 修复人 {{ bug.fixerName }}</template></small></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="filteredBugs.length" class="bug-pagination">
          <span>第 {{ pageStart }}-{{ pageEnd }} 条，共 {{ sortedBugs.length }} 条</span>
          <div>
            <button type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">上一页</button>
            <strong>{{ currentPage }} / {{ totalPages }}</strong>
            <button type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">下一页</button>
          </div>
        </div>
      </section>
    </section>

    <div v-if="selectedBug" class="bug-detail-backdrop pc-scrim">
      <aside class="bug-detail-panel pc-dialog" role="dialog" aria-label="Bug 详情">
        <header class="bug-detail-head">
          <div class="bug-detail-topline">
            <span class="pc-record-id">#{{ displayedBugId(selectedBug.id) }}</span>
            <button class="pc-tool-button" type="button" aria-label="关闭详情" :disabled="statusSubmitting" @click="closeDetail">
              <X class="h-4 w-4" aria-hidden="true" />关闭
            </button>
          </div>
          <div class="bug-detail-title-row">
            <h2>{{ selectedBug.title }}</h2>
            <span class="pc-record-tag" :data-tone="statusTone[selectedBug.status]">{{ selectedBug.status }}</span>
          </div>
          <div class="bug-detail-summary">
            <span>{{ selectedBug.type }}</span>
            <span><span aria-hidden="true">· </span>{{ selectedBug.severity }}</span>
            <span><span aria-hidden="true">· </span>发生侧：{{ selectedBug.sourceSide }}</span>
            <span v-if="selectedBug.sourceSideVersion"><span aria-hidden="true">· </span>版本：{{ selectedBug.sourceSideVersion }}</span>
            <span><span aria-hidden="true">· </span>归属：{{ ownerRolesLabel(selectedBug.ownerRoles) }}</span>
          </div>
          <div v-if="!isEditingBug || !canStartBugEdit" class="bug-detail-actions">
            <button v-if="canStartBugEdit && !isEditingBug" class="pc-tool-button" type="button" :disabled="statusSubmitting" @click="startBugEdit">编辑 Bug</button>
            <span v-else-if="!canStartBugEdit">已完结 Bug 不支持编辑</span>
            <button v-if="!isEditingBug" class="pc-tool-button bug-delete-entry-btn" type="button" :disabled="statusSubmitting" @click="startDeleteBug">
              <Trash2 class="h-4 w-4" aria-hidden="true" />删除 Bug
            </button>
          </div>
        </header>
        <form v-if="isConfirmingDelete" class="bug-delete-form" @submit.prevent="deleteBug">
          <div>
            <b>删除确认</b>
            <span>请输入管理密钥，删除后会从 Bug 列表移除。</span>
          </div>
          <label>
            <span>管理密钥</span>
            <input v-model="deleteSecret" type="password" autocomplete="off" placeholder="请输入密钥" />
          </label>
          <p v-if="deleteError" class="bug-form-error">{{ deleteError }}</p>
          <div>
            <button type="button" @click="cancelDeleteBug">取消</button>
            <button type="submit" :disabled="bugSyncStatus === 'loading'">确认删除</button>
          </div>
        </form>
        <form v-if="isEditingBug" class="bug-edit-form" @submit.prevent="saveBugEdit" @paste="handlePaste">
          <label>
            <span>Bug ID</span>
            <input v-model="editForm.id" type="text" autocomplete="off" />
            <small v-if="selectedBugHasDuplicateId" class="bug-id-warning">此 ID 与另一条 Bug 重复，请改为唯一值</small>
          </label>
          <label>
            <span>标题</span>
            <input v-model="editForm.title" type="text" :disabled="!selectedBugEditable" />
          </label>
          <div class="bug-form-row">
            <label>
              <span>类型</span>
              <select v-model="editForm.type" :disabled="!selectedBugEditable">
                <option v-for="type in bugTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </label>
            <label>
              <span>等级</span>
              <select v-model="editForm.severity" :disabled="!selectedBugEditable">
                <option v-for="severity in bugSeverities" :key="severity" :value="severity">{{ severity }}</option>
              </select>
            </label>
            <label>
              <span>发生侧</span>
              <select v-model="editForm.sourceSide" :disabled="!selectedBugEditable">
                <option v-for="side in bugSourceSides" :key="side" :value="side">{{ side }}</option>
              </select>
            </label>
            <label>
              <span>发生侧版本</span>
              <input v-model="editForm.sourceSideVersion" type="text" list="bug-source-side-version-options" placeholder="如 iOS 1.2.3 / 后端 2026.06" :disabled="!selectedBugEditable" />
            </label>
            <div class="bug-field">
              <span class="bug-field-label">归属</span>
              <details class="bug-owner-picker" :class="{ 'is-disabled': !selectedBugEditable }">
                <summary @click="!selectedBugEditable && $event.preventDefault()">{{ ownerRolesLabel(editForm.ownerRoles) }}</summary>
                <div class="bug-owner-options">
                  <label v-for="role in bugOwnerRoles" :key="role">
                    <input
                      v-model="editForm.ownerRoles"
                      type="checkbox"
                      :value="role"
                      :disabled="!selectedBugEditable || isLastSelectedOwnerRole(editForm.ownerRoles, role)"
                    />
                    <span>{{ role }}</span>
                  </label>
                </div>
              </details>
            </div>
          </div>
          <label>
            <span>问题描述</span>
            <textarea v-model="editForm.description" :disabled="!selectedBugEditable" />
          </label>
          <section class="bug-edit-images">
            <div class="bug-section-title">
              <ImagePlus class="h-4 w-4" />
              <span>问题截图</span>
            </div>
            <button class="bug-image-picker" type="button" :disabled="!selectedBugEditable || pendingImages.length + editAttachments.length >= MAX_PENDING_IMAGES" @click="imageInputRef?.click()">
              添加图片 / 粘贴截图
            </button>
            <div v-if="editAttachments.length" class="bug-edit-existing-images">
              <article v-for="attachment in editAttachments" :key="attachment.id">
                <button type="button" class="bug-edit-image-preview" @click="openImagePreview(editAttachments, editAttachments.indexOf(attachment))">
                  <img :src="ossPreviewUrl(attachment.url)" :alt="attachment.name" loading="lazy" />
                </button>
                <div>
                  <b>{{ attachment.name }}</b>
                  <span>{{ formatFileSize(attachment.size) }}</span>
                </div>
                <button type="button" aria-label="删除图片" :disabled="!selectedBugEditable" @click="removeEditAttachment(attachment.id)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </article>
            </div>
            <div v-if="pendingImages.length" class="bug-pending-images">
              <article v-for="image in pendingImages" :key="image.id" :class="`is-${image.status}`">
                <img :src="image.previewUrl" :alt="image.name" />
                <div>
                  <b>{{ image.name }}</b>
                  <span>{{ formatFileSize(image.size) }}</span>
                  <small v-if="image.error">{{ image.error }}</small>
                </div>
                <button type="button" :disabled="image.status === 'uploading'" @click="removePendingImage(image.id)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </article>
            </div>
            <p v-if="imageNotice" class="bug-image-hint">{{ imageNotice }}</p>
          </section>
          <p v-if="editError" class="bug-form-error">{{ editError }}</p>
          <div class="bug-edit-actions">
            <button type="button" @click="cancelBugEdit">取消</button>
            <button type="submit" :disabled="bugSyncStatus === 'loading'">保存修改</button>
          </div>
        </form>
        <section v-else class="bug-detail-description">
          <h3>问题描述</h3>
          <p>{{ selectedBug.description }}</p>
        </section>
        <p class="bug-detail-meta">提报人：{{ selectedBug.reporterName }} · {{ formatTime(selectedBug.createdAt) }}</p>
        <section v-if="!isEditingBug && selectedBug.attachments?.length" class="bug-detail-images">
          <h3>问题截图</h3>
          <div>
            <button v-for="(attachment, index) in selectedBug.attachments" :key="attachment.id" type="button" @click="openImagePreview(selectedBug.attachments, index)">
              <img :src="ossPreviewUrl(attachment.url)" :alt="attachment.name" loading="lazy" />
              <span>{{ attachment.name }}</span>
            </button>
          </div>
        </section>

        <form class="bug-status-form" @submit.prevent="updateBugStatus" @paste="handlePaste($event, true)">
          <fieldset class="bug-status-fields" :disabled="statusSubmitting || isEditingBug || isConfirmingDelete || bugSyncStatus === 'loading'">
          <div class="bug-section-title">
            <CircleDot class="h-4 w-4" />
            <span>状态变更</span>
          </div>
          <label>
            <span>目标状态</span>
            <select v-model="statusForm.status">
              <option v-for="status in bugStatuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <div class="bug-form-row">
            <label>
              <span>操作人姓名</span>
              <input v-model="statusForm.operatorName" type="text" placeholder="必填" @input="rememberUserInput('operator', ($event.target as HTMLInputElement).value)" />
            </label>
            <label>
              <span>修复人姓名</span>
              <input v-model="statusForm.fixerName" type="text" :placeholder="statusForm.status === '已修复' ? '已修复时必填' : '选填'" @input="rememberFixerName(($event.target as HTMLInputElement).value)" />
            </label>
          </div>
          <label>
            <span>备注</span>
            <textarea v-model="statusForm.note" placeholder="说明修复内容、验证结论或无需处理原因" />
          </label>
          <section class="bug-image-uploader">
            <div class="bug-section-title">
              <ImagePlus class="h-4 w-4" />
              <span>备注图片（选填）</span>
            </div>
            <button class="bug-image-picker" type="button" :disabled="!ossReady || statusPendingImages.length >= MAX_PENDING_IMAGES" @click="statusImageInputRef?.click()">
              添加图片 / 粘贴截图
            </button>
            <input ref="statusImageInputRef" class="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="handleImageInput($event, true)" />
            <p class="bug-image-hint">支持 png、jpg、webp；每次最多 10 张；不上传图片也可提交。</p>
            <p v-if="!ossReady" class="bug-image-hint">未配置图片上传服务，可仅填写备注并提交状态变更。</p>
            <div v-if="statusPendingImages.length" class="bug-pending-images">
              <article v-for="image in statusPendingImages" :key="image.id" :class="`is-${image.status}`">
                <img :src="image.previewUrl" :alt="image.name" />
                <div>
                  <b>{{ image.name }}</b>
                  <span>{{ formatFileSize(image.size) }}</span>
                  <small v-if="image.error">{{ image.error }}</small>
                </div>
                <button type="button" aria-label="移除备注图片" :disabled="statusSubmitting" @click="removePendingImage(image.id, true)">
                  <Trash2 class="h-4 w-4" />
                </button>
              </article>
            </div>
            <p v-if="statusImageNotice" class="bug-form-error">{{ statusImageNotice }}</p>
          </section>
          <p v-if="statusError" class="bug-form-error">{{ statusError }}</p>
          <button class="bug-primary-btn" type="submit">{{ statusSubmitting ? '正在提交…' : '提交状态变更' }}</button>
          </fieldset>
        </form>

        <section class="bug-history">
          <h3>处理记录</h3>
          <p v-if="!selectedBug.history.length" class="bug-empty">暂无状态变更记录。</p>
          <article v-for="entry in selectedBug.history" :key="entry.id">
            <b>{{ entry.fromStatus }} → {{ entry.toStatus }}</b>
            <span>{{ entry.operatorName }} · {{ formatTime(entry.createdAt) }}</span>
            <p v-if="entry.fixerName">修复人：{{ entry.fixerName }}</p>
            <p v-if="entry.note">{{ entry.note }}</p>
            <div v-if="entry.attachments?.length" class="bug-history-images">
              <span>备注图片</span>
              <div>
                <button v-for="(attachment, index) in entry.attachments" :key="attachment.id" type="button" :aria-label="`查看备注图片 ${index + 1}：${attachment.name}`" @click="openImagePreview(entry.attachments, index)">
                  <img :src="ossPreviewUrl(attachment.url)" :alt="attachment.name" loading="lazy" />
                </button>
              </div>
            </div>
          </article>
        </section>
      </aside>
    </div>
    <div v-if="activeImagePreview" class="bug-image-preview-backdrop" @click.self="closeImagePreview">
      <section class="bug-image-preview-dialog" role="dialog" aria-label="截图预览">
        <div class="bug-image-preview-toolbar">
          <p>{{ activeImagePreview.name }}</p>
          <span>{{ previewIndex + 1 }} / {{ previewAttachments.length }}</span>
          <div class="bug-image-preview-controls">
            <button type="button" aria-label="缩小图片" title="缩小图片" :disabled="previewZoom <= 0.5" @click="changePreviewZoom(-1)"><Minus class="h-4 w-4" /></button>
            <span>{{ Math.round(previewZoom * 100) }}%</span>
            <button type="button" aria-label="放大图片" title="放大图片" :disabled="previewZoom >= 4" @click="changePreviewZoom(1)"><Plus class="h-4 w-4" /></button>
            <button type="button" aria-label="重置缩放" title="重置缩放" @click="resetPreviewZoom"><RotateCcw class="h-4 w-4" /></button>
            <button ref="previewCloseButton" type="button" aria-label="关闭图片预览" title="关闭图片预览" @click="closeImagePreview"><X class="h-5 w-5" /></button>
          </div>
        </div>
        <div class="bug-image-preview-stage" @wheel.prevent="handlePreviewWheel" @pointerdown="startPreviewDrag" @pointermove="movePreviewDrag" @pointerup="stopPreviewDrag" @pointercancel="stopPreviewDrag" @lostpointercapture="stopPreviewDrag">
          <button v-if="previewAttachments.length > 1" class="bug-image-preview-nav is-previous" type="button" aria-label="上一张截图" title="上一张截图" :disabled="previewIndex === 0" @click="changePreviewImage(-1)"><ChevronLeft class="h-5 w-5" /></button>
          <img :src="activeImagePreview.url" :alt="activeImagePreview.name" draggable="false" :class="{ 'is-draggable': previewZoom > 1, 'is-dragging': previewDrag }" :style="{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewZoom})` }" />
          <button v-if="previewAttachments.length > 1" class="bug-image-preview-nav is-next" type="button" aria-label="下一张截图" title="下一张截图" :disabled="previewIndex === previewAttachments.length - 1" @click="changePreviewImage(1)"><ChevronRight class="h-5 w-5" /></button>
        </div>
      </section>
    </div>
  </main>
</template>
