# Handoff — 项目连续性记录

> 新会话冷启动先读本文件。项目变化后同步维护当前现状、待处理事项和决策记录，不写过程日志。

## 项目心智模型

- 这是从原业务仓库净化提取的公开 Vue 原型评审内核，npm 包名为 `@marktowin/prototype-core`。
- 内核提供交互、全图、流程、流程编排、主题、i18n、注释、页面描述、健康检查和协作能力；产品内容由消费者注入。
- GitHub 仓库使用全新公开历史，不能与原私有业务仓库共享包含凭据的历史。

## 设计原则

- 依赖方向单向：产品依赖内核，内核不认识具体产品页面、状态或资源。
- 公共入口使用 `mountPrototypeApp({ product, runtimeConfig })`；无配置时关闭访问认证并使用本地协作模式。
- npm 包只发布编译后的 `dist`，Vue 与 Lucide 保持 peer dependencies。
- 版本遵循 SemVer；标签触发 npmjs 公共发布和 GitHub Release，安装端不需要 Token。
- 公开安全优先于迁移便利，任何真实环境值和历史凭据都不得进入仓库。

## 当前现状与限制

- 内核与移动端/PC 最小示例均可构建，现有协作策略测试为 8 项。
- 包可生成 `.tgz`，包含 ESM、声明文件和完整 CSS，不包含产品文件或源仓库配置。
- 顶部导航展示当前内核包版本，并在应用启动后从 npm `latest` 查询最新版本；查询失败只降级显示，不影响原型主流程。
- 数据源面板可检查 Gitee、OSS、部署、原型访问和 Bug 删除密码共 20 项配置；只展示变量名与存在状态，不读取或显示敏感值。
- Gitee 与 OSS 配置已改为运行时注入；这些浏览器端能力只适用于原型，不构成生产级秘密保护。
- npm 公共发布已可用；当前 latest 为 `@marktowin/prototype-core@1.2.2`。Trusted Publisher 必须与 `MarkTina/prototype-core` 和 `publish.yml` 精确绑定；本地 Token 发布需显式关闭 provenance。
- 页面描述支持 `highlighted` 与可选 `highlightColor` 重点标注；导航和状态页切换以名称前的彩色书签展示，旧数据默认使用红色。自定义颜色列表按项目缓存在浏览器本地。
- 移动端演示模式保持 `393×852` 基准画布并按视口整体等比缩放，不会因演示尺寸变化触发业务页面响应式重排。
- 添加注释点时，页面内所有内容统一使用十字光标，点击交互组件只创建标注并阻止其业务操作；取消添加后恢复正常交互。
- 注释点支持可选 `color` 字段；新增和编辑弹窗可选择颜色，旧数据无颜色时继续使用主题主色。
- 主题面板已从配色切换升级为主题切换：以 `DESIGN.md` 为事实来源、`DESIGN-TOKENS.md` 为实现索引，运行时新增 `--ds-*` 颜色、字体、圆角、间距和阴影变量；旧 `--color-*` 与旧版主题 JSON 继续兼容；`#/prototype-core-theme` 提供公开主题准则页，入口在主题切换弹层。
- Gitee 协作路径、scope、缓存和写入动作均由内核通用契约约束；消费者标识和资源只能通过产品定义与 `runtimeConfig` 注入，不进入内核文档或源码。
- 协作缓存使用 schema v3：页面描述与注释按 scope 保存独立 revision，流程与 Bug 按整文件保存，并区分 `synced/pending/stale/error`；旧 v2 缓存会保守迁移为 `stale`。
- 页面描述 JSON 由 AI 修改后，可通过 `window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson()` 执行“写 Gitee → 合并 manifest → 精确回读 → 更新缓存”；JSON 不作为启用远端协作后的第二真值。
- `AI-PROTOTYPE-GUIDE.md` 是消费者原型实施操作手册，以触发词路由接入、页面、状态、跳转、流程、协作配置、升级和验收，并为每项操作定义固定动作与完成判定。
- 内核提供公开的 `#/prototype-core-help` 路由和顶部紧凑文档图标，构建时内嵌操作手册 Markdown，供人或 AI 直接读取和复制，不依赖消费者认证或静态文件部署。

## 演进方向

- 以真实消费者安装测试守住公共 API，而不是继续扩大内核能力。
- 首个产品迁移稳定后，再评估是否拆分协作适配器或按需加载大型工具模块。

## 待处理事项

- [x] 创建并公开 `MarkTina/prototype-core`，确认公开历史通过 Secret 扫描。
- [x] 完成 `@marktowin/prototype-core@1.0.0` 首次 npmjs 发布并配置 Trusted Publisher。
- [ ] 在首个业务产品中安装公共包，接入部署环境布尔状态，并完成交互、全图、流程和流程编排回归。

## 决策记录

- 2026-06-28：使用独立公开 GitHub 仓库和 npmjs 公共包，不使用 GitHub Packages。原因：GitHub Packages 的公开 npm 包安装仍要求 Token，不能满足免认证安装。
- 2026-06-28：新仓库采用全新 Git 历史并使用 MIT 许可证。原因：原仓库历史含已填写环境配置，且公开工具需要清晰复用授权。
- 2026-06-28：包名确定为 `@marktowin/prototype-core`，源码仓库为 `MarkTina/prototype-core`。原因：npm 与 GitHub 账号不同，分别使用实际拥有的命名空间。
- 2026-06-30：环境诊断只允许传递配置存在状态，不允许把部署密码等值注入浏览器。原因：浏览器无法安全读取 Node 环境，诊断功能不得扩大秘密暴露面。
- 2026-07-01：重点标注颜色随页面描述协作数据保存，自定义色板仅按项目缓存在本地；导航使用名称前的彩色书签，避免与右侧注释数量争抢空间。
- 2026-07-03：协作资源规范统一使用 `<projectId>/<branchKey>/<scopeId>` 参数化表达，内核只维护通用读写机制。原因：避免消费者命名空间和业务数据反向污染公开内核。

### DR-20260703-01: Gitee 作为协作数据唯一真值

- **背景**: 整表缓存会遮挡新版 JSON，且按 scope 远端文件与整表 revision 粒度不一致。
- **决策**: 缓存升级为 schema v3；页面描述与注释按 scope 缓存，流程与 Bug 按整文件缓存，所有远端写入以精确回读结果确认。
- **原因**: 缓存只能承担快速展示和本地暂存，不能形成独立于 Gitee 的第二真值。
- **影响**: AI 修改页面描述 JSON 后必须显式同步 Gitee；远端失败保留 stale 缓存并允许重试。
- **日期**: 2026-07-03。

### DR-20260707-01: 主题切换引入设计系统语义 token

- **背景**: 旧主题面板只暴露 `ocean/ink/muted` 等内核颜色，无法和 `DESIGN.md` 的颜色、字体、圆角、间距和阴影用途一一对应。
- **决策**: 保留旧 `colors` 与 `--color-*` 兼容层，同时新增 `designColors/typography/radius/spacing/shadow` 与运行时 `--ds-*` 变量。
- **原因**: 低风险地给 AI 和人工实现 UI 提供明确设计系统入口，避免重写历史 CSS 或破坏旧主题导入。
- **影响**: 新增 UI 应优先查 `DESIGN-TOKENS.md` 并使用 `--ds-*`；消费者页面建议使用 token，但内核不强制扫描或改写业务代码。
- **日期**: 2026-07-07。

<!-- fresh-meta
last-updated: 2026-07-07
trigger-reason: 完成主题切换与设计系统 token 兼容层
updated-by: handoff-maintainer
next-review: 当主题 token 接入首个真实消费者页面、主题准则路由内容变化或公共主题 API 再次变化时
-->
