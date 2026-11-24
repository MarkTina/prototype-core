import desktopScreenshot from './bug-demo-desktop.svg?url'
import mobileScreenshot from './bug-demo-mobile.svg?url'

export const bugDemoProjectId = 'prototype-core-bug-demo'

export function seedBugDemo() {
  const cacheKey = `prototype-collaboration:v2:local:none:none:master:${bugDemoProjectId}:unknown:bugs`
  const demoBug = {
    status: '待处理',
    reporterName: '本地演示',
    history: [],
  }
  const createdAt = '2026-11-23T08:30:00.000Z'
  const attachments = [
    { name: '桌面端 · 刷新后筛选重置.svg', url: desktopScreenshot },
    { name: '移动端 · 状态筛选对照.svg', url: mobileScreenshot },
  ].map((image, index) => ({
    ...image,
    id: `demo-${index + 1}`,
    objectKey: `example/bug-demo-${index + 1}.svg`,
    mimeType: 'image/svg+xml',
    uploaderName: demoBug.reporterName,
    createdAt,
  }))
  try {
    if (localStorage.getItem(cacheKey) !== null) return
    localStorage.setItem(cacheKey, JSON.stringify({
      schemaVersion: 3,
      revision: null,
      lastRemoteSyncAt: null,
      cachedAt: createdAt,
      status: 'pending',
      value: [
        {
          ...demoBug,
          id: 'BUG-002',
          type: '功能异常',
          severity: 'P2',
          sourceSide: 'web 端',
          sourceSideVersion: 'Web 0.8.2',
          ownerRoles: ['前端开发'],
          title: '带图样例：刷新后筛选条件被重置',
          description: '选择“仅待处理”后刷新，列表恢复为全部。附件是用于验收展示的虚构桌面和移动端截图。',
          createdAt,
          updatedAt: createdAt,
          attachments,
        },
        {
          ...demoBug,
          id: 'BUG-001',
          type: 'UI/文案',
          severity: 'P3',
          sourceSide: '安卓侧',
          ownerRoles: ['UI设计'],
          title: '无图样例：离线提示文案缺少重试说明',
          description: '断网后打开页面，提示应说明恢复网络后可以重试。此工单用于对照无附件行。',
          createdAt: '2026-11-23T08:26:00.000Z',
          updatedAt: '2026-11-23T08:26:00.000Z',
        },
        {
          ...demoBug,
          id: 'BUG-003',
          type: 'UI/文案',
          severity: 'P3',
          sourceSide: 'iOS 侧',
          sourceSideVersion: 'iOS 0.8.2',
          ownerRoles: ['iOS 开发', 'UI设计'],
          title: '单图样例：窄屏下筛选标题被截断',
          description: '在窄屏设备打开任务列表，检查筛选标题是否完整显示。附图为虚构的移动端参考界面。',
          createdAt: '2026-11-23T08:28:00.000Z',
          updatedAt: '2026-11-23T08:28:00.000Z',
          attachments: [attachments[1]],
        },
        {
          ...demoBug,
          id: 'BUG-004',
          status: '修复中',
          type: '流程阻塞',
          severity: 'P1',
          sourceSide: 'web 端',
          sourceSideVersion: 'Web 0.8.2',
          ownerRoles: ['前端开发'],
          title: '保存失败后无法继续编辑草稿',
          description: '保存失败时应保留已填写的内容，并让用户继续编辑或重试。',
          createdAt: '2026-11-23T08:20:00.000Z',
          updatedAt: '2026-11-23T09:10:00.000Z',
        },
        {
          ...demoBug,
          id: 'BUG-005',
          status: '已验证',
          type: '数据/报告',
          severity: 'P2',
          sourceSide: '后端',
          ownerRoles: ['后端开发'],
          title: '分页后列表总数与统计不一致',
          description: '切换每页条数后，工单总数应保持不变。已按同一组筛选条件复核。',
          createdAt: '2026-11-23T08:12:00.000Z',
          updatedAt: '2026-11-23T09:30:00.000Z',
        },
      ],
    }))
  } catch {
    return
  }
}
