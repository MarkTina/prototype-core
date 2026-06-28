export type BugType = '功能异常' | 'UI/文案' | '流程阻塞' | '数据/报告' | '设备/蓝牙' | '性能/稳定性' | '兼容性' | '其他'
export type BugSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type BugSourceSide = '安卓侧' | 'iOS 侧' | '后端'
export type BugOwnerRole = '后端开发' | 'iOS 开发' | '安卓开发' | '产品经理' | '算法开发' | '硬件嵌入式开发'
export type BugStatus = '待处理' | '已确认' | '修复中' | '已修复' | '已验证' | '无需处理'

export interface ProductBugHistoryEntry {
  id: string
  fromStatus: BugStatus
  toStatus: BugStatus
  operatorName: string
  fixerName?: string
  note?: string
  createdAt: string
}

export interface ProductBugAttachment {
  id: string
  name: string
  objectKey: string
  url: string
  mimeType: string
  size: number
  originalSize: number
  uploaderName: string
  createdAt: string
}

export interface ProductBug {
  id: string
  title: string
  type: BugType
  severity: BugSeverity
  sourceSide: BugSourceSide
  sourceSideVersion?: string
  ownerRole: BugOwnerRole
  status: BugStatus
  description: string
  reporterName: string
  fixerName?: string
  createdAt: string
  updatedAt: string
  attachments?: ProductBugAttachment[]
  history: ProductBugHistoryEntry[]
}
