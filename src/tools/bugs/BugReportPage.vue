<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { AlertTriangle, Bug, CheckCircle2, CircleDot, FileSpreadsheet, Filter, ImagePlus, Plus, RefreshCw, Search, Trash2, X } from '@lucide/vue'
import { useProductBugs } from './useProductBugs'
import { getPrototypeRuntime } from '../../core/productAdapter'
import { getCollaborationContext } from '../../prototype/collaborationStore'
import { collaborationCacheKey } from '../../prototype/collaborationPolicy'
import { ossPreviewUrl, ossUploadEnabled, uploadImageToOss } from './ossClient'
import { bugIdExists, normalizeBugId } from './bugPolicy'
import { exportBugsExcel } from './exportBugs'
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
  unresolvedBugStatuses,
  unresolvedBugCount,
  bugRemoteReady,
  bugSyncStatus,
  bugSyncMessage,
  refreshBugs,
  persistBugs,
  loadLatestBugsForExport,
  nextBugId: generateNextBugId,
} = useProductBugs()

const statusTone: Record<BugStatus, string> = {
  待处理: 'danger',
  已确认: 'warning',
  修复中: 'progress',
  已修复: 'fixed',
  已验证: 'success',
  无需处理: 'muted',
}
const severityTone: Record<BugSeverity, string> = {
  P0: 'p0',
  P1: 'p1',
  P2: 'p2',
  P3: 'p3',
  P4: 'p4',
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
const DEFAULT_USER_STORAGE_KEY = 'prototype-core-annotation-author'
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
  ownerRole: BugOwnerRole
  description: string
}

interface StoredBugSubmissionDraft {
  version: typeof BUG_SUBMISSION_DRAFT_VERSION
  submissionId: string
  form: BugSubmissionForm
  attachments: ProductBugAttachment[]
  updatedAt: string
}

function readDefaultUserName() {
  try {
    return window.localStorage.getItem(DEFAULT_USER_STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

function saveDefaultUserName(value: string) {
  const next = value.trim()
  if (!next) return
  try {
    window.localStorage.setItem(DEFAULT_USER_STORAGE_KEY, next)
  } catch {
    // 本地默认用户仅用于协作提效，写入失败不影响 Bug 提交。
  }
}

const submitForm = reactive<BugSubmissionForm>({
  reporterName: readDefaultUserName(),
  title: '',
  type: '功能异常' as BugType,
  severity: 'P2' as BugSeverity,
  sourceSide: '安卓侧' as BugSourceSide,
  sourceSideVersion: '',
  ownerRole: '后端开发' as BugOwnerRole,
  description: '',
})
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
  type: '全部' as BugType | '全部',
  severity: '全部' as BugSeverity | '全部',
  sourceSide: '全部' as BugSourceSide | '全部',
  sourceSideVersion: '全部',
  ownerRole: '全部' as BugOwnerRole | '全部',
  status: '未修复' as BugStatus | '未修复' | '全部',
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
  ownerRole: '后端开发' as BugOwnerRole,
  description: '',
})
const editAttachments = ref<ProductBugAttachment[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<PendingBugImage[]>([])
const imageNotice = ref('')
const exportingBugs = ref(false)
const exportNotice = ref('')
const exportNoticeTone = ref<'success' | 'error'>('success')
const activeImagePreview = ref<ProductBugAttachment | null>(null)
const ossReady = ossUploadEnabled()

function handleImagePreviewKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !activeImagePreview.value) return
  event.preventDefault()
  event.stopPropagation()
  activeImagePreview.value = null
}

function createSubmissionId(): string {
  return crypto.randomUUID?.() ?? `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function submissionDraftStorageKey() {
  const context = getCollaborationContext()
  return collaborationCacheKey(
    [context.provider || 'local', context.owner || 'none', context.repo || 'none', context.remoteBranch, context.projectId, context.branchKey],
    'bug-submit-draft',
  )
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
    const form = value?.form
    if (value?.version !== BUG_SUBMISSION_DRAFT_VERSION || typeof value.submissionId !== 'string' || !value.submissionId.trim() || !form) return null
    if (typeof form.reporterName !== 'string' || typeof form.title !== 'string' || typeof form.sourceSideVersion !== 'string' || typeof form.description !== 'string') return null
    if (!bugTypes.includes(form.type) || !bugSeverities.includes(form.severity) || !bugSourceSides.includes(form.sourceSide) || !bugOwnerRoles.includes(form.ownerRole)) return null
    return {
      version: BUG_SUBMISSION_DRAFT_VERSION,
      submissionId: value.submissionId,
      form: { ...form },
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

function saveSubmissionDraft() {
  try {
    if (!hasSubmissionDraftContent()) {
      window.localStorage.removeItem(submissionDraftStorageKey())
      return
    }
    const draft: StoredBugSubmissionDraft = {
      version: BUG_SUBMISSION_DRAFT_VERSION,
      submissionId: submissionId.value,
      form: { ...submitForm },
      attachments: uploadedSubmitAttachments.value,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(submissionDraftStorageKey(), JSON.stringify(draft))
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

const restoredSubmissionDraft = readSubmissionDraft()
if (restoredSubmissionDraft) {
  Object.assign(submitForm, restoredSubmissionDraft.form)
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

watch(submitForm, saveSubmissionDraft, { deep: true })
watch(uploadedSubmitAttachments, saveSubmissionDraft, { deep: true })

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
const fixedCount = computed(() => bugs.value.filter((bug) => bug.status === '已修复' || bug.status === '已验证').length)
const closedCount = computed(() => bugs.value.filter((bug) => bug.status === '无需处理').length)
const sourceSideVersionSuggestions = computed(() =>
  Array.from(new Set(bugs.value.map((bug) => bug.sourceSideVersion?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
)
const filteredBugs = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return bugs.value.filter((bug) => {
    if (filters.type !== '全部' && bug.type !== filters.type) return false
    if (filters.severity !== '全部' && bug.severity !== filters.severity) return false
    if (filters.sourceSide !== '全部' && bug.sourceSide !== filters.sourceSide) return false
    if (filters.sourceSideVersion !== '全部' && bug.sourceSideVersion !== filters.sourceSideVersion) return false
    if (filters.ownerRole !== '全部' && bug.ownerRole !== filters.ownerRole) return false
    if (filters.status === '未修复' && !unresolvedBugStatuses.includes(bug.status)) return false
    if (filters.status !== '全部' && filters.status !== '未修复' && bug.status !== filters.status) return false
    if (!keyword) return true
    return [bug.id, bug.title, bug.description, bug.reporterName, bug.fixerName, bug.type, bug.severity, bug.sourceSide, bug.sourceSideVersion, bug.ownerRole, bug.status]
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

async function addImageFiles(files: File[]) {
  imageNotice.value = ''
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  if (!imageFiles.length) return
  const existingCount = isEditingBug.value ? editAttachments.value.length : 0
  const available = MAX_PENDING_IMAGES - pendingImages.value.length - existingCount
  if (available <= 0) {
    imageNotice.value = `每个 Bug 最多上传 ${MAX_PENDING_IMAGES} 张图片`
    return
  }

  for (const file of imageFiles.slice(0, available)) {
    try {
      pendingImages.value = [...pendingImages.value, await prepareImageFile(file)]
    } catch (error) {
      imageNotice.value = error instanceof Error ? error.message : '图片处理失败'
    }
  }
  if (imageFiles.length > available) imageNotice.value = `已达到 ${MAX_PENDING_IMAGES} 张图片上限`
}

function handleImageInput(event: Event) {
  const input = event.target as HTMLInputElement
  void addImageFiles(Array.from(input.files ?? []))
  input.value = ''
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  if (!files.length) return
  event.preventDefault()
  void addImageFiles(files)
}

function removePendingImage(id: string) {
  const target = pendingImages.value.find((image) => image.id === id)
  if (target) URL.revokeObjectURL(target.previewUrl)
  if (target?.uploadedAttachment && !isEditingBug.value) {
    uploadedSubmitAttachments.value = uploadedSubmitAttachments.value.filter((attachment) => attachment.id !== target.uploadedAttachment?.id)
  }
  pendingImages.value = pendingImages.value.filter((image) => image.id !== id)
}

function removeEditAttachment(id: string) {
  editAttachments.value = editAttachments.value.filter((attachment) => attachment.id !== id)
}

async function uploadPendingImages(scopeId: string, uploaderName: string) {
  if (!pendingImages.value.length) return []
  if (!ossReady) throw new Error('缺少 OSS 上传配置，无法上传图片')
  const attachments: ProductBugAttachment[] = []

  for (const image of pendingImages.value) {
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

async function submitBug() {
  submitError.value = ''
  imageNotice.value = ''
  const reporterName = submitForm.reporterName.trim()
  const title = submitForm.title.trim()
  const description = submitForm.description.trim()
  const sourceSideVersion = submitForm.sourceSideVersion.trim()
  if (!reporterName || !title || !description) {
    submitError.value = '请填写提报人姓名、标题和问题描述'
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
      ownerRole: submitForm.ownerRole,
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
  saveDefaultUserName(reporterName)
  submitForm.reporterName = reporterName
  submitForm.title = ''
  submitForm.sourceSideVersion = sourceSideVersion
  submitForm.description = ''
  selectedBugLocator.value = committedBugLocator
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImagePreviewKeydown, true)
  saveSubmissionDraft()
  clearPendingImages()
})

onMounted(() => {
  window.addEventListener('keydown', handleImagePreviewKeydown, true)
})

function openBug(bug: ProductBug) {
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
  statusForm.operatorName = defaultUserName
  statusForm.fixerName = bug.fixerName ?? defaultUserName
  statusForm.note = ''
  statusError.value = ''
}

function closeDetail() {
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
  editForm.ownerRole = bug.ownerRole
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
  const bug = selectedBug.value
  const locator = selectedBugLocator.value
  if (!bug || !locator || !canStartBugEdit.value) return
  const id = editForm.id.trim()
  const title = editForm.title.trim()
  const description = editForm.description.trim()
  const sourceSideVersion = editForm.sourceSideVersion.trim()
  const operatorName = statusForm.operatorName.trim() || readDefaultUserName() || bug.reporterName
  if (!id || !title || !description) {
    editError.value = '请填写 Bug ID、标题和问题描述'
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
            ownerRole: selectedBugEditable.value ? editForm.ownerRole : item.ownerRole,
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

  const now = new Date().toISOString()
  const nextHistory = {
    id: `bug-history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fromStatus: bug.status,
    toStatus: statusForm.status,
    operatorName,
    fixerName: fixerName || undefined,
    note: statusForm.note.trim() || undefined,
    createdAt: now,
  }

  const saved = await persistBugs(operatorName, '变更 Bug 状态', (current) => {
    const targetIndex = findBugIndex(current, locator)
    if (targetIndex < 0) throw new Error('目标 Bug 已变化，请刷新后重试')
    return current.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            status: statusForm.status,
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
  statusForm.operatorName = readDefaultUserName()
  statusForm.note = ''
}

async function handleExportBugs() {
  exportingBugs.value = true
  exportNotice.value = ''
  try {
    const latestBugs = await loadLatestBugsForExport()
    const result = await exportBugsExcel(latestBugs)
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
        <button class="bug-back-btn" type="button" @click="emit('close')">返回原型</button>
        <h1>Bug 管理</h1>
        <p>面向测试和协作同事的产品 Bug 提报、筛选与状态流转。</p>
      </div>
      <div class="bug-head-actions">
        <button class="bug-refresh-btn" type="button" :disabled="bugSyncStatus === 'loading' || exportingBugs" @click="refreshBugs">
          <span class="bug-refresh-main">
            <RefreshCw class="h-4 w-4" />
            <span>刷新</span>
          </span>
          <span class="bug-refresh-status" :class="`is-${bugSyncStatus}`">{{ bugSyncMessage || 'Bug 数据已就绪' }}</span>
        </button>
        <button class="bug-export-btn" type="button" :disabled="!bugRemoteReady || bugSyncStatus === 'loading' || exportingBugs" @click="handleExportBugs">
          <span class="bug-refresh-main">
            <FileSpreadsheet class="h-4 w-4" />
            <span>{{ exportingBugs ? '导出中' : '导出 Excel' }}</span>
          </span>
          <span class="bug-export-status" :class="`is-${exportNoticeTone}`">{{ exportNotice || (bugRemoteReady ? '读取 Gitee 最新数据' : '未启用 Gitee') }}</span>
        </button>
      </div>
    </header>

    <section class="bug-stat-grid">
      <article class="bug-stat-card danger">
        <AlertTriangle class="h-5 w-5" />
        <span>未修复</span>
        <strong>{{ unresolvedBugCount }}</strong>
      </article>
      <article class="bug-stat-card success">
        <CheckCircle2 class="h-5 w-5" />
        <span>已修复/验证</span>
        <strong>{{ fixedCount }}</strong>
      </article>
      <article class="bug-stat-card muted">
        <CircleDot class="h-5 w-5" />
        <span>无需处理</span>
        <strong>{{ closedCount }}</strong>
      </article>
      <article class="bug-stat-card sync" :class="`is-${bugSyncStatus}`">
        <Bug class="h-5 w-5" />
        <span>{{ bugRemoteReady ? 'Gitee 同步' : '本地兜底' }}</span>
        <strong>{{ bugSyncStatus === 'loading' ? '同步中' : bugs.length }}</strong>
      </article>
    </section>

    <section class="bug-workspace">
      <form class="bug-submit-panel" @submit.prevent="submitBug" @paste="handlePaste">
        <datalist id="bug-source-side-version-options">
          <option v-for="version in sourceSideVersionSuggestions" :key="version" :value="version" />
        </datalist>
        <div class="bug-section-title">
          <Plus class="h-4 w-4" />
          <span>提报 Bug</span>
        </div>
        <label>
          <span>提报人姓名</span>
          <input v-model="submitForm.reporterName" type="text" placeholder="请输入姓名" />
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
          <label>
            <span>归属</span>
            <select v-model="submitForm.ownerRole">
              <option v-for="role in bugOwnerRoles" :key="role" :value="role">{{ role }}</option>
            </select>
          </label>
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
        <button class="bug-primary-btn" type="submit" :disabled="bugSyncStatus === 'loading'">提交 Bug</button>
      </form>

      <section class="bug-list-panel">
        <div class="bug-filter-bar">
          <div class="bug-section-title">
            <Filter class="h-4 w-4" />
            <span>筛选</span>
          </div>
          <div class="bug-filter-grid">
            <select v-model="filters.status">
              <option value="未修复">未修复</option>
              <option value="全部">全部状态</option>
              <option v-for="status in bugStatuses" :key="status" :value="status">{{ status }}</option>
            </select>
            <select v-model="filters.type">
              <option value="全部">全部类型</option>
              <option v-for="type in bugTypes" :key="type" :value="type">{{ type }}</option>
            </select>
            <select v-model="filters.severity">
              <option value="全部">全部等级</option>
              <option v-for="severity in bugSeverities" :key="severity" :value="severity">{{ severity }}</option>
            </select>
            <select v-model="filters.ownerRole">
              <option value="全部">全部归属</option>
              <option v-for="role in bugOwnerRoles" :key="role" :value="role">{{ role }}</option>
            </select>
            <select v-model="filters.sourceSide">
              <option value="全部">全部发生侧</option>
              <option v-for="side in bugSourceSides" :key="side" :value="side">{{ side }}</option>
            </select>
            <select v-model="filters.sourceSideVersion">
              <option value="全部">全部发生侧版本</option>
              <option v-for="version in sourceSideVersionSuggestions" :key="version" :value="version">{{ version }}</option>
            </select>
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

        <div class="bug-list">
          <p v-if="!filteredBugs.length" class="bug-empty">当前筛选条件下暂无 Bug。</p>
          <article v-for="bug in paginatedBugs" :key="bugRowKey(bug)" class="bug-list-item" :class="`is-${statusTone[bug.status]}`">
            <div class="bug-list-main">
              <div class="bug-list-meta">
                <b>#{{ bug.id }}</b>
                <span>{{ bug.type }}</span>
                <span :class="`severity-${severityTone[bug.severity]}`">{{ bug.severity }}</span>
                <span>发生侧：{{ bug.sourceSide }}</span>
                <span v-if="bug.sourceSideVersion">版本：{{ bug.sourceSideVersion }}</span>
                <span>归属：{{ bug.ownerRole }}</span>
                <i :class="`status-${statusTone[bug.status]}`">{{ bug.status }}</i>
              </div>
              <h2>{{ bug.title }}</h2>
              <p>{{ bug.description }}</p>
              <div v-if="bug.attachments?.length" class="bug-list-images">
                <button v-for="attachment in bug.attachments.slice(0, 3)" :key="attachment.id" type="button" @click="activeImagePreview = attachment">
                  <img :src="ossPreviewUrl(attachment.url)" :alt="attachment.name" loading="lazy" />
                </button>
                <span v-if="bug.attachments.length > 3">+{{ bug.attachments.length - 3 }}</span>
              </div>
              <small>提报人：{{ bug.reporterName }} · {{ formatTime(bug.createdAt) }}<template v-if="bug.fixerName"> · 修复人：{{ bug.fixerName }}</template></small>
            </div>
            <button type="button" @click="openBug(bug)">查看/变更状态</button>
          </article>
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

    <div v-if="selectedBug" class="bug-detail-backdrop">
      <aside class="bug-detail-panel">
        <div class="bug-detail-head">
          <div>
            <span>#{{ selectedBug.id }}</span>
            <h2>{{ selectedBug.title }}</h2>
          </div>
          <button type="button" aria-label="关闭详情" @click="closeDetail"><X class="h-5 w-5" /></button>
        </div>
        <div class="bug-detail-summary">
          <span>{{ selectedBug.type }}</span>
          <span :class="`severity-${severityTone[selectedBug.severity]}`">{{ selectedBug.severity }}</span>
          <span>发生侧：{{ selectedBug.sourceSide }}</span>
          <span v-if="selectedBug.sourceSideVersion">版本：{{ selectedBug.sourceSideVersion }}</span>
          <span>归属：{{ selectedBug.ownerRole }}</span>
          <span :class="`status-${statusTone[selectedBug.status]}`">{{ selectedBug.status }}</span>
        </div>
        <div class="bug-detail-actions">
          <div>
            <button v-if="canStartBugEdit && !isEditingBug" class="bug-edit-entry-btn" type="button" @click="startBugEdit">编辑 Bug</button>
            <span v-else-if="!canStartBugEdit">已完结 Bug 不支持编辑</span>
          </div>
          <button v-if="!isEditingBug" class="bug-delete-entry-btn" type="button" @click="startDeleteBug">
            <Trash2 class="h-4 w-4" />
            删除 Bug
          </button>
        </div>
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
            <label>
              <span>归属</span>
              <select v-model="editForm.ownerRole" :disabled="!selectedBugEditable">
                <option v-for="role in bugOwnerRoles" :key="role" :value="role">{{ role }}</option>
              </select>
            </label>
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
                <button type="button" class="bug-edit-image-preview" @click="activeImagePreview = attachment">
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
        <p v-else class="bug-detail-description">{{ selectedBug.description }}</p>
        <p class="bug-detail-meta">提报人：{{ selectedBug.reporterName }} · {{ formatTime(selectedBug.createdAt) }}</p>
        <section v-if="!isEditingBug && selectedBug.attachments?.length" class="bug-detail-images">
          <h3>问题截图</h3>
          <div>
            <button v-for="attachment in selectedBug.attachments" :key="attachment.id" type="button" @click="activeImagePreview = attachment">
              <img :src="ossPreviewUrl(attachment.url)" :alt="attachment.name" loading="lazy" />
              <span>{{ attachment.name }}</span>
            </button>
          </div>
        </section>

        <form class="bug-status-form" @submit.prevent="updateBugStatus">
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
              <input v-model="statusForm.operatorName" type="text" placeholder="必填" />
            </label>
            <label>
              <span>修复人姓名</span>
              <input v-model="statusForm.fixerName" type="text" :placeholder="statusForm.status === '已修复' ? '已修复时必填' : '选填'" />
            </label>
          </div>
          <label>
            <span>备注</span>
            <textarea v-model="statusForm.note" placeholder="说明修复内容、验证结论或无需处理原因" />
          </label>
          <p v-if="statusError" class="bug-form-error">{{ statusError }}</p>
          <button class="bug-primary-btn" type="submit" :disabled="bugSyncStatus === 'loading'">提交状态变更</button>
        </form>

        <section class="bug-history">
          <h3>处理记录</h3>
          <p v-if="!selectedBug.history.length" class="bug-empty">暂无状态变更记录。</p>
          <article v-for="entry in selectedBug.history" :key="entry.id">
            <b>{{ entry.fromStatus }} → {{ entry.toStatus }}</b>
            <span>{{ entry.operatorName }} · {{ formatTime(entry.createdAt) }}</span>
            <p v-if="entry.fixerName">修复人：{{ entry.fixerName }}</p>
            <p v-if="entry.note">{{ entry.note }}</p>
          </article>
        </section>
      </aside>
    </div>
    <div v-if="activeImagePreview" class="bug-image-preview-backdrop" @click.self="activeImagePreview = null">
      <section class="bug-image-preview-dialog">
        <div>
          <p>{{ activeImagePreview.name }}</p>
          <button type="button" aria-label="关闭图片预览" @click="activeImagePreview = null"><X class="h-5 w-5" /></button>
        </div>
        <img :src="activeImagePreview.url" :alt="activeImagePreview.name" />
      </section>
    </div>
  </main>
</template>
