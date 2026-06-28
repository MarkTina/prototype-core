<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { AlertTriangle, Bug, CheckCircle2, CircleDot, Filter, ImagePlus, Plus, RefreshCw, Search, Trash2, X } from '@lucide/vue'
import { useProductBugs } from './useProductBugs'
import { getPrototypeRuntime } from '../../core/productAdapter'
import { ossPreviewUrl, ossUploadEnabled, uploadImageToOss } from './ossClient'
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

const submitForm = reactive({
  reporterName: readDefaultUserName(),
  title: '',
  type: '功能异常' as BugType,
  severity: 'P2' as BugSeverity,
  sourceSide: '安卓侧' as BugSourceSide,
  sourceSideVersion: '',
  ownerRole: '后端开发' as BugOwnerRole,
  description: '',
})
const submitError = ref('')
const selectedBugId = ref('')
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
const activeImagePreview = ref<ProductBugAttachment | null>(null)
const ossReady = ossUploadEnabled()

const selectedBug = computed(() => bugs.value.find((bug) => bug.id === selectedBugId.value) ?? null)
const selectedBugEditable = computed(() => Boolean(selectedBug.value && !['已验证', '无需处理'].includes(selectedBug.value.status)))
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

function imageObjectKey(bugId: string, image: PendingBugImage) {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `bugs/${bugId}/${timestamp}-${safeFileName(image.name)}.${imageExtension(image)}`
}

async function prepareImageFile(file: File): Promise<PendingBugImage> {
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) throw new Error('仅支持 png、jpg、jpeg、webp 图片')
  return {
    id: `pending-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
  pendingImages.value = pendingImages.value.filter((image) => image.id !== id)
}

function removeEditAttachment(id: string) {
  editAttachments.value = editAttachments.value.filter((attachment) => attachment.id !== id)
}

async function uploadPendingImages(bugId: string, uploaderName: string) {
  if (!pendingImages.value.length) return []
  if (!ossReady) throw new Error('缺少 OSS 上传配置，无法上传图片')
  const attachments: ProductBugAttachment[] = []

  for (const image of pendingImages.value) {
    image.status = 'uploading'
    image.error = ''
    try {
      const uploaded = await uploadImageToOss(imageObjectKey(bugId, image), image.file)
      image.status = 'uploaded'
      attachments.push({
        id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: image.name,
        objectKey: uploaded.objectKey,
        url: uploaded.url,
        mimeType: image.mimeType,
        size: image.size,
        originalSize: image.originalSize,
        uploaderName,
        createdAt: new Date().toISOString(),
      })
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

  const nextBugId = generateNextBugId(bugs.value)
  let attachments: ProductBugAttachment[] = []

  if (pendingImages.value.length) {
    try {
      attachments = await uploadPendingImages(nextBugId, reporterName)
    } catch (error) {
      imageNotice.value = error instanceof Error ? error.message : '图片上传失败，Bug 未提交'
      return
    }
  }

  const saved = await persistBugs(reporterName, '新增 Bug', (current) => {
    const now = new Date().toISOString()
    const nextBug: ProductBug = {
      id: nextBugId,
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
    return [nextBug, ...current]
  })
  if (!saved) return
  clearPendingImages()
  saveDefaultUserName(reporterName)
  submitForm.reporterName = reporterName
  submitForm.title = ''
  submitForm.sourceSideVersion = sourceSideVersion
  submitForm.description = ''
  selectedBugId.value = nextBugId
}

onBeforeUnmount(() => {
  clearPendingImages()
})

function openBug(bug: ProductBug) {
  const defaultUserName = readDefaultUserName()
  selectedBugId.value = bug.id
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
  selectedBugId.value = ''
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
  if (!bug || !selectedBugEditable.value) return
  isConfirmingDelete.value = false
  deleteError.value = ''
  deleteSecret.value = ''
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
  if (!bug) return
  if (!deleteBugCode || deleteSecret.value.trim() !== deleteBugCode) {
    deleteError.value = '密钥不正确'
    return
  }

  const operatorName = statusForm.operatorName.trim() || readDefaultUserName() || '管理员'
  const saved = await persistBugs(operatorName, `删除 Bug ${bug.id}`, (current) => current.filter((item) => item.id !== bug.id))
  if (!saved) return
  closeDetail()
}

async function saveBugEdit() {
  const bug = selectedBug.value
  if (!bug || !selectedBugEditable.value) return
  const title = editForm.title.trim()
  const description = editForm.description.trim()
  const sourceSideVersion = editForm.sourceSideVersion.trim()
  const operatorName = statusForm.operatorName.trim() || readDefaultUserName() || bug.reporterName
  if (!title || !description) {
    editError.value = '请填写标题和问题描述'
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
  const saved = await persistBugs(operatorName, '编辑 Bug 内容', (current) =>
    current.map((item) =>
      item.id === bug.id
        ? {
            ...item,
            title,
            type: editForm.type,
            severity: editForm.severity,
            sourceSide: editForm.sourceSide,
            sourceSideVersion: sourceSideVersion || undefined,
            ownerRole: editForm.ownerRole,
            description,
            attachments: nextAttachments,
            updatedAt: now,
          }
        : item,
    ),
  )
  if (!saved) return
  isEditingBug.value = false
  editAttachments.value = []
  clearPendingImages()
  imageNotice.value = ''
  editError.value = ''
}

async function updateBugStatus() {
  statusError.value = ''
  const bug = selectedBug.value
  if (!bug) return
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

  const saved = await persistBugs(operatorName, '变更 Bug 状态', (current) =>
    current.map((item) =>
      item.id === bug.id
        ? {
            ...item,
            status: statusForm.status,
            fixerName: fixerName || item.fixerName,
            updatedAt: now,
            history: [nextHistory, ...item.history],
          }
        : item,
    ),
  )
  if (!saved) return
  saveDefaultUserName(fixerName || operatorName)
  statusForm.operatorName = readDefaultUserName()
  statusForm.note = ''
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
      <button class="bug-refresh-btn" type="button" :disabled="bugSyncStatus === 'loading'" @click="refreshBugs">
        <span class="bug-refresh-main">
          <RefreshCw class="h-4 w-4" />
          <span>刷新</span>
        </span>
        <span class="bug-refresh-status" :class="`is-${bugSyncStatus}`">{{ bugSyncMessage || 'Bug 数据已就绪' }}</span>
      </button>
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

        <div class="bug-list">
          <p v-if="!filteredBugs.length" class="bug-empty">当前筛选条件下暂无 Bug。</p>
          <article v-for="bug in paginatedBugs" :key="bug.id" class="bug-list-item" :class="`is-${statusTone[bug.status]}`">
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

    <div v-if="selectedBug" class="bug-detail-backdrop" @click.self="closeDetail">
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
            <button v-if="selectedBugEditable && !isEditingBug" class="bug-edit-entry-btn" type="button" @click="startBugEdit">编辑 Bug</button>
            <span v-else-if="!selectedBugEditable">已完结 Bug 不支持编辑</span>
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
            <span>标题</span>
            <input v-model="editForm.title" type="text" />
          </label>
          <div class="bug-form-row">
            <label>
              <span>类型</span>
              <select v-model="editForm.type">
                <option v-for="type in bugTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </label>
            <label>
              <span>等级</span>
              <select v-model="editForm.severity">
                <option v-for="severity in bugSeverities" :key="severity" :value="severity">{{ severity }}</option>
              </select>
            </label>
            <label>
              <span>发生侧</span>
              <select v-model="editForm.sourceSide">
                <option v-for="side in bugSourceSides" :key="side" :value="side">{{ side }}</option>
              </select>
            </label>
            <label>
              <span>发生侧版本</span>
              <input v-model="editForm.sourceSideVersion" type="text" list="bug-source-side-version-options" placeholder="如 iOS 1.2.3 / 后端 2026.06" />
            </label>
            <label>
              <span>归属</span>
              <select v-model="editForm.ownerRole">
                <option v-for="role in bugOwnerRoles" :key="role" :value="role">{{ role }}</option>
              </select>
            </label>
          </div>
          <label>
            <span>问题描述</span>
            <textarea v-model="editForm.description" />
          </label>
          <section class="bug-edit-images">
            <div class="bug-section-title">
              <ImagePlus class="h-4 w-4" />
              <span>问题截图</span>
            </div>
            <button class="bug-image-picker" type="button" :disabled="pendingImages.length + editAttachments.length >= MAX_PENDING_IMAGES" @click="imageInputRef?.click()">
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
                <button type="button" aria-label="删除图片" @click="removeEditAttachment(attachment.id)">
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
