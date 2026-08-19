import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { bugExportFilename, buildBugsWorkbook } from '../src/tools/bugs/exportBugs.ts'
import { requireRemoteBugsForExport } from '../src/tools/bugs/bugModel.ts'
import type { ProductBug, ProductBugAttachment } from '../src/tools/bugs/types.ts'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function attachment(id: string): ProductBugAttachment {
  return {
    id,
    name: `${id}.png`,
    objectKey: `bugs/${id}.png`,
    url: `https://example.test/${id}.png`,
    mimeType: 'image/png',
    size: 1200,
    originalSize: 2400,
    uploaderName: '测试员',
    createdAt: '2026-08-19T01:02:03.000Z',
  }
}

function bug(overrides: Partial<ProductBug> = {}): ProductBug {
  return {
    id: 'BUG-001',
    title: '页面无法提交',
    type: '功能异常',
    severity: 'P1',
    sourceSide: 'iOS 侧',
    sourceSideVersion: '1.2.3',
    ownerRole: 'iOS 开发',
    status: '修复中',
    description: '点击提交后无响应',
    reporterName: '测试员',
    fixerName: '开发员',
    createdAt: '2026-08-18T01:02:03.000Z',
    updatedAt: '2026-08-19T02:03:04.000Z',
    attachments: [attachment('image-1'), attachment('image-2')],
    history: [
      {
        id: 'history-1',
        fromStatus: '待处理',
        toStatus: '已确认',
        operatorName: '产品经理',
        note: '已复现',
        createdAt: '2026-08-18T03:04:05.000Z',
      },
      {
        id: 'history-2',
        fromStatus: '已确认',
        toStatus: '修复中',
        operatorName: '开发员',
        fixerName: '开发员',
        createdAt: '2026-08-19T02:03:04.000Z',
      },
    ],
    ...overrides,
  }
}

test('Bug 工作簿包含明细、附件和状态历史三张表', async () => {
  const result = await buildBugsWorkbook([bug()], {
    thumbnailLoader: async (item) => {
      if (item.id === 'image-2') throw new Error('模拟图片读取失败')
      return { base64: pixel, extension: 'png', width: 200, height: 100 }
    },
  })

  assert.deepEqual(result.workbook.worksheets.map((sheet) => sheet.name), ['Bug 明细', '附件', '状态历史'])
  assert.equal(result.attachmentCount, 2)
  assert.equal(result.thumbnailFailureCount, 1)

  const bugSheet = result.workbook.getWorksheet('Bug 明细')
  assert.ok(bugSheet)
  assert.deepEqual(Array.from(bugSheet.getRow(1).values as unknown[]).slice(1), [
    'Bug ID', '标题', '类型', '等级', '发生侧', '发生侧版本', '归属', '状态', '问题描述', '提报人', '修复人', '创建时间', '更新时间', '附件数量', '历史数量',
  ])
  assert.equal(bugSheet.rowCount, 2)
  assert.equal(bugSheet.getCell('A2').value, 'BUG-001')
  assert.ok(bugSheet.getCell('L2').value instanceof Date)
  assert.equal(bugSheet.getCell('L2').numFmt, 'yyyy-mm-dd hh:mm:ss')
  assert.equal(bugSheet.views[0]?.state, 'frozen')
  assert.ok(bugSheet.autoFilter)

  const attachmentSheet = result.workbook.getWorksheet('附件')
  assert.ok(attachmentSheet)
  assert.equal(attachmentSheet.rowCount, 3)
  assert.deepEqual(attachmentSheet.getCell('H2').value, {
    text: 'https://example.test/image-1.png',
    hyperlink: 'https://example.test/image-1.png',
  })
  assert.equal(attachmentSheet.getImages().length, 1)
  assert.equal(attachmentSheet.getCell('I3').value, '缩略图读取失败，请打开原图链接')

  const historySheet = result.workbook.getWorksheet('状态历史')
  assert.ok(historySheet)
  assert.equal(historySheet.rowCount, 3)
  assert.equal(historySheet.getCell('A3').value, 'BUG-001')
  assert.equal(historySheet.getCell('D3').value, '修复中')

  const buffer = await result.workbook.xlsx.writeBuffer()
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(buffer)
  assert.deepEqual(reopened.worksheets.map((sheet) => sheet.name), ['Bug 明细', '附件', '状态历史'])
  assert.equal(reopened.getWorksheet('附件')?.getImages().length, 1)
})

test('远端导出数据保留全部状态并按更新时间从新到旧排序', () => {
  const remote = {
    value: [
      bug({ id: 'BUG-001', status: '已验证', updatedAt: '2026-08-18T00:00:00.000Z' }),
      bug({ id: 'BUG-002', status: '待处理', updatedAt: '2026-08-19T00:00:00.000Z' }),
    ],
    sha: 'latest-sha',
    exists: true,
    legacy: false,
  }
  const all = requireRemoteBugsForExport(remote)
  assert.deepEqual(all.map((item) => item.id), ['BUG-002', 'BUG-001'])
  assert.deepEqual(all.map((item) => item.status), ['待处理', '已验证'])
})

test('远端不可用、文件缺失或数据无效时中止导出', () => {
  assert.throws(() => requireRemoteBugsForExport(null, false), /未启用 Gitee/)
  assert.throws(() => requireRemoteBugsForExport(null), /文件不存在/)
  assert.throws(() => requireRemoteBugsForExport({ value: [{} as ProductBug], sha: 'bad', exists: true, legacy: false }), /无效记录/)
  assert.throws(() => requireRemoteBugsForExport({
    value: [bug({ attachments: [{} as ProductBugAttachment] })],
    sha: 'bad-attachment',
    exists: true,
    legacy: false,
  }), /无效附件或状态历史/)
  assert.deepEqual(requireRemoteBugsForExport({ value: [], sha: 'empty', exists: true, legacy: false }), [])
})

test('空数据仍生成完整表头并使用时间戳文件名', async () => {
  const result = await buildBugsWorkbook([], { thumbnailLoader: async () => { throw new Error('不应加载图片') } })
  assert.deepEqual(result.workbook.worksheets.map((sheet) => sheet.rowCount), [1, 1, 1])
  assert.equal(bugExportFilename(new Date(2026, 7, 19, 9, 8, 7)), 'bugs-20260819-090807.xlsx')
})
