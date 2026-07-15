import type { PrototypeTestCase } from '../../types/prototype'
import type { TestCaseScope } from './model'

function workbookRows(testCases: PrototypeTestCase[], scopes: TestCaseScope[]) {
  const scopeMap = new Map(scopes.map((scope) => [scope.id, scope]))
  return testCases.map((item) => {
    const scope = scopeMap.get(item.stateId ? `${item.screenId}__${item.stateId}` : item.screenId)
    return {
      screenCode: scope?.screenCode ?? item.screenId,
      screenTitle: scope?.screenTitle ?? '未知页面',
      stateLabel: scope?.stateLabel ?? (item.stateId || '未知状态'),
      module: item.module,
      testItem: item.testItem,
      testPoint: item.testPoint,
      preconditions: item.preconditions,
      steps: item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
      expectedResult: item.expectedResult,
      actualResult: item.actualResult,
    }
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function exportTestCasesJson(testCases: PrototypeTestCase[]) {
  downloadBlob(
    new Blob([JSON.stringify({ version: '1.0.0', testCases }, null, 2)], { type: 'application/json;charset=utf-8' }),
    'test-cases.json',
  )
}

export async function buildTestCasesWorkbook(testCases: PrototypeTestCase[], scopes: TestCaseScope[]) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '@marktowin/prototype-core'
  const worksheet = workbook.addWorksheet('测试用例', { views: [{ state: 'frozen', ySplit: 1 }] })
  worksheet.columns = [
    { header: '页面编号', key: 'screenCode', width: 14 },
    { header: '页面名称', key: 'screenTitle', width: 22 },
    { header: '状态名称', key: 'stateLabel', width: 20 },
    { header: '所属模块', key: 'module', width: 22 },
    { header: '测试项', key: 'testItem', width: 24 },
    { header: '测试要点', key: 'testPoint', width: 32 },
    { header: '前置条件', key: 'preconditions', width: 32 },
    { header: '测试步骤', key: 'steps', width: 48 },
    { header: '预期结果', key: 'expectedResult', width: 42 },
    { header: '实际结果', key: 'actualResult', width: 32 },
  ]
  worksheet.addRows(workbookRows(testCases, scopes))
  worksheet.autoFilter = { from: 'A1', to: 'J1' }
  const header = worksheet.getRow(1)
  header.height = 24
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D1D1F' } }
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 54
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } }
    })
  })
  return workbook
}

export async function exportTestCasesExcel(testCases: PrototypeTestCase[], scopes: TestCaseScope[]) {
  const workbook = await buildTestCasesWorkbook(testCases, scopes)
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'test-cases.xlsx')
}
