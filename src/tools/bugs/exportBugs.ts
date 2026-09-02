import type { Workbook, Worksheet } from 'exceljs'
import type { ProductBug, ProductBugAttachment } from './types'

const HEADER_FILL = 'FF1D1D1F'
const HEADER_TEXT = 'FFFFFFFF'
const BORDER_COLOR = 'FFE0E0E0'
const LINK_COLOR = 'FF0066CC'
const EXPORT_PREVIEW_PROCESS = 'x-oss-process=image/resize,w_240/quality,q_75/format,png'

export interface BugThumbnail {
  base64: string
  extension: 'png' | 'jpeg' | 'gif'
  width: number
  height: number
}

export type BugThumbnailLoader = (attachment: ProductBugAttachment) => Promise<BugThumbnail>

export interface BuildBugsWorkbookOptions {
  thumbnailLoader?: BugThumbnailLoader
}

export interface BugExportResult {
  bugCount: number
  attachmentCount: number
  thumbnailFailureCount: number
}

function exportPreviewUrl(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${EXPORT_PREVIEW_PROCESS}`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

export async function loadBugThumbnail(attachment: ProductBugAttachment): Promise<BugThumbnail> {
  const response = await fetch(exportPreviewUrl(attachment.url), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
  })
  if (!response.ok) throw new Error(`读取附件缩略图失败：${response.status}`)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    return {
      base64: await blobToDataUrl(blob),
      extension: 'png',
      width: bitmap.width,
      height: bitmap.height,
    }
  } finally {
    bitmap.close()
  }
}

function excelDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date
}

function styleWorksheet(worksheet: Worksheet, lastColumn: string) {
  worksheet.autoFilter = { from: 'A1', to: `${lastColumn}1` }
  const header = worksheet.getRow(1)
  header.height = 24
  header.font = { bold: true, color: { argb: HEADER_TEXT } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER_COLOR } } }
      if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm:ss'
    })
    if (rowNumber > 1 && !row.height) row.height = 36
  })
}

function addBugSheet(workbook: Workbook, bugs: ProductBug[]) {
  const worksheet = workbook.addWorksheet('Bug 明细', { views: [{ state: 'frozen', ySplit: 1 }] })
  worksheet.columns = [
    { header: 'Bug ID', key: 'id', width: 14 },
    { header: '标题', key: 'title', width: 32 },
    { header: '类型', key: 'type', width: 16 },
    { header: '等级', key: 'severity', width: 10 },
    { header: '发生侧', key: 'sourceSide', width: 12 },
    { header: '发生侧版本', key: 'sourceSideVersion', width: 18 },
    { header: '归属', key: 'ownerRole', width: 18 },
    { header: '状态', key: 'status', width: 12 },
    { header: '问题描述', key: 'description', width: 52 },
    { header: '提报人', key: 'reporterName', width: 14 },
    { header: '修复人', key: 'fixerName', width: 14 },
    { header: '创建时间', key: 'createdAt', width: 21 },
    { header: '更新时间', key: 'updatedAt', width: 21 },
    { header: '附件数量', key: 'attachmentCount', width: 12 },
    { header: '历史数量', key: 'historyCount', width: 12 },
  ]
  worksheet.addRows(bugs.map((bug) => ({
    id: bug.id,
    title: bug.title,
    type: bug.type,
    severity: bug.severity,
    sourceSide: bug.sourceSide,
    sourceSideVersion: bug.sourceSideVersion ?? '',
    ownerRole: bug.ownerRoles.join('、'),
    status: bug.status,
    description: bug.description,
    reporterName: bug.reporterName,
    fixerName: bug.fixerName ?? '',
    createdAt: excelDate(bug.createdAt),
    updatedAt: excelDate(bug.updatedAt),
    attachmentCount: bug.attachments?.length ?? 0,
    historyCount: bug.history.length,
  })))
  styleWorksheet(worksheet, 'O')
}

async function addAttachmentSheet(
  workbook: Workbook,
  bugs: ProductBug[],
  thumbnailLoader: BugThumbnailLoader,
) {
  const worksheet = workbook.addWorksheet('附件', { views: [{ state: 'frozen', ySplit: 1 }] })
  worksheet.columns = [
    { header: 'Bug ID', key: 'bugId', width: 14 },
    { header: 'Bug 标题', key: 'bugTitle', width: 32 },
    { header: '附件名', key: 'name', width: 28 },
    { header: '上传人', key: 'uploaderName', width: 14 },
    { header: '上传时间', key: 'createdAt', width: 21 },
    { header: '文件大小（字节）', key: 'size', width: 18 },
    { header: '原始大小（字节）', key: 'originalSize', width: 18 },
    { header: '原图链接', key: 'url', width: 48 },
    { header: '缩略图', key: 'thumbnail', width: 24 },
  ]

  let attachmentCount = 0
  let thumbnailFailureCount = 0
  for (const bug of bugs) {
    for (const attachment of bug.attachments ?? []) {
      attachmentCount += 1
      const row = worksheet.addRow({
        bugId: bug.id,
        bugTitle: bug.title,
        name: attachment.name,
        uploaderName: attachment.uploaderName,
        createdAt: excelDate(attachment.createdAt),
        size: attachment.size,
        originalSize: attachment.originalSize,
        url: { text: attachment.url, hyperlink: attachment.url },
        thumbnail: '',
      })
      row.getCell('url').font = { color: { argb: LINK_COLOR }, underline: true }
      try {
        const thumbnail = await thumbnailLoader(attachment)
        const scale = Math.min(160 / Math.max(thumbnail.width, 1), 96 / Math.max(thumbnail.height, 1), 1)
        const width = Math.max(1, Math.round(thumbnail.width * scale))
        const height = Math.max(1, Math.round(thumbnail.height * scale))
        const imageId = workbook.addImage({ base64: thumbnail.base64, extension: thumbnail.extension })
        worksheet.addImage(imageId, {
          tl: { col: 8.1, row: row.number - 0.9 },
          ext: { width, height },
        })
        row.height = Math.max(36, height * 0.75 + 8)
      } catch {
        thumbnailFailureCount += 1
        row.getCell('thumbnail').value = '缩略图读取失败，请打开原图链接'
      }
    }
  }
  styleWorksheet(worksheet, 'I')
  return { attachmentCount, thumbnailFailureCount }
}

function addHistorySheet(workbook: Workbook, bugs: ProductBug[]) {
  const worksheet = workbook.addWorksheet('状态历史', { views: [{ state: 'frozen', ySplit: 1 }] })
  worksheet.columns = [
    { header: 'Bug ID', key: 'bugId', width: 14 },
    { header: 'Bug 标题', key: 'bugTitle', width: 32 },
    { header: '原状态', key: 'fromStatus', width: 12 },
    { header: '新状态', key: 'toStatus', width: 12 },
    { header: '操作人', key: 'operatorName', width: 14 },
    { header: '修复人', key: 'fixerName', width: 14 },
    { header: '备注', key: 'note', width: 42 },
    { header: '变更时间', key: 'createdAt', width: 21 },
  ]
  worksheet.addRows(bugs.flatMap((bug) => bug.history.map((entry) => ({
    bugId: bug.id,
    bugTitle: bug.title,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    operatorName: entry.operatorName,
    fixerName: entry.fixerName ?? '',
    note: entry.note ?? '',
    createdAt: excelDate(entry.createdAt),
  }))))
  styleWorksheet(worksheet, 'H')
}

export async function buildBugsWorkbook(
  bugs: ProductBug[],
  options: BuildBugsWorkbookOptions = {},
) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '@marktowin/prototype-core'
  workbook.created = new Date()
  addBugSheet(workbook, bugs)
  const attachmentResult = await addAttachmentSheet(workbook, bugs, options.thumbnailLoader ?? loadBugThumbnail)
  addHistorySheet(workbook, bugs)
  return { workbook, ...attachmentResult }
}

export function bugExportFilename(now = new Date()) {
  const part = (value: number) => String(value).padStart(2, '0')
  return `bugs-${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}.xlsx`
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function exportBugsExcel(
  bugs: ProductBug[],
  options: BuildBugsWorkbookOptions = {},
): Promise<BugExportResult> {
  const { workbook, attachmentCount, thumbnailFailureCount } = await buildBugsWorkbook(bugs, options)
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    bugExportFilename(),
  )
  return { bugCount: bugs.length, attachmentCount, thumbnailFailureCount }
}
