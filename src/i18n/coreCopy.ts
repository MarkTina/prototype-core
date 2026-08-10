import type { Lang } from '../types/prototype'

export const coreCopy = {
  prototypeStateSwitch: '切换业务状态',
  annotationExpand: '展开注释面板',
  annotationCollapse: '收起注释面板',
  annotationPanelTitle: '原型协作',
  annotationPanelSubtitle: '当前页面',
  annotationTabNotes: '注释',
  annotationTabDescription: '页面描述',
  annotationCancelAdd: '取消添加',
  annotationAdd: '添加注释',
  annotationHidePoints: '隐藏注释点',
  annotationShowPoints: '显示注释点',
  annotationRefresh: '刷新',
  annotationExport: '导出注释',
  annotationRemoteDisabled: '远端协作未启用，当前使用本地数据',
  annotationAuthorName: '协作者昵称',
  annotationAuthorPlaceholder: '请输入协作者昵称',
  annotationPollingInterval: '自动同步间隔',
  annotationPollingUnit: '秒',
  annotationPollingSave: '保存',
  annotationEmpty: '当前页面暂无注释',
  annotationDelete: '删除',
  annotationCancel: '取消',
  annotationSave: '保存',
  annotationFormTitle: '新增注释',
  annotationEditTitle: '编辑注释',
  annotationDetailTitle: '注释详情',
  annotationFeatureName: '功能名称',
  annotationNamePlaceholder: '请输入功能名称',
  annotationFeatureDescription: '功能描述',
  annotationDescPlaceholder: '请输入功能描述',
  annotationSpecialNote: '特别说明',
  annotationNotePlaceholder: '请输入特别说明',
  pageDescriptionExport: '导出页面描述',
  pageDescriptionEmpty: '当前页面暂无页面描述',
  pageDescriptionPurpose: '页面目的',
  pageDescriptionPurposePlaceholder: '说明页面解决的问题和目标。',
  pageDescriptionStructure: '页面结构',
  pageDescriptionStructurePlaceholder: '说明页面区域、内容层级和布局关系。',
  pageDescriptionFeatures: '核心功能',
  pageDescriptionFeaturesPlaceholder: '说明当前页面承载的核心功能。',
  pageDescriptionFlowPosition: '流程位置',
  pageDescriptionFlowPlaceholder: '说明页面在业务流程中的位置及前后关系。',
  pageDescriptionDevelopmentPlaceholder: '补充开发实现和验收时需要注意的内容。',
  editProfile: '编辑',
  close: '关闭',
  testCaseTitle: '测试用例',
  testCaseSubtitle: '按页面状态维护可执行、可追溯的测试场景',
  testCaseBack: '返回原型',
  testCaseSearchScope: '搜索页面或状态',
  testCaseCurrent: '当前状态',
  testCaseAll: '全部用例',
  testCaseSearchCase: '搜索 7 个业务字段',
  testCaseAdd: '新增用例',
  testCaseEmpty: '当前范围暂无测试用例',
  testCaseEdit: '编辑用例',
  testCaseCreate: '新增用例',
  testCaseSave: '保存用例',
  testCaseCancel: '取消',
  testCaseAuthor: '协作者昵称',
  testCaseModule: '所属模块',
  testCaseItem: '测试项',
  testCasePoint: '测试要点',
  testCasePreconditions: '前置条件',
  testCaseSteps: '测试步骤',
  testCaseExpected: '预期结果',
  testCaseActual: '实际结果',
  testCaseJson: '导出 JSON',
  testCaseExcel: '导出 Excel',
  testCaseRefresh: '刷新',
  testCaseDelete: '删除',
  testCaseAddStep: '新增步骤',
  testCaseClose: '关闭编辑器',
  testCaseMoveUp: '上移步骤',
  testCaseMoveDown: '下移步骤',
  testCaseRemoveStep: '删除步骤',
  testCaseUnknown: '未知页面或状态',
} as const

export type CoreCopyKey = keyof typeof coreCopy
export type ProductCopy = Record<Lang, Record<string, string>>

export function coreText(key: CoreCopyKey): string {
  const value = coreCopy[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`🈶 [内核文案] 缺少中文文案：${key}`)
  }
  return value
}

export function readProductText(copy: ProductCopy, lang: Lang, key: string, fallback = key): string {
  return copy[lang][key] ?? copy.zh[key] ?? fallback
}
