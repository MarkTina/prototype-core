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

- 内核与移动端/PC 最小示例均可构建，现有协作策略测试为 7 项。
- 包可生成 `.tgz`，包含 ESM、声明文件和完整 CSS，不包含产品文件或源仓库配置。
- Gitee 与 OSS 配置已改为运行时注入；这些浏览器端能力只适用于原型，不构成生产级秘密保护。
- npm 首次发布尚未完成；Trusted Publisher 必须在 npmjs 的包设置中与 `MarkTina/prototype-core` 和 `publish.yml` 精确绑定。

## 演进方向

- 以真实消费者安装测试守住公共 API，而不是继续扩大内核能力。
- 首个产品迁移稳定后，再评估是否拆分协作适配器或按需加载大型工具模块。

## 待处理事项

- [x] 创建并公开 `MarkTina/prototype-core`，确认公开历史通过 Secret 扫描。
- [ ] 完成 `@marktowin/prototype-core@1.0.0` 首次 npmjs 发布并配置 Trusted Publisher。
- [ ] 在首个业务产品中安装公共包，完成交互、全图、流程和流程编排回归。

## 决策记录

- 2026-06-28：使用独立公开 GitHub 仓库和 npmjs 公共包，不使用 GitHub Packages。原因：GitHub Packages 的公开 npm 包安装仍要求 Token，不能满足免认证安装。
- 2026-06-28：新仓库采用全新 Git 历史并使用 MIT 许可证。原因：原仓库历史含已填写环境配置，且公开工具需要清晰复用授权。
- 2026-06-28：包名确定为 `@marktowin/prototype-core`，源码仓库为 `MarkTina/prototype-core`。原因：npm 与 GitHub 账号不同，分别使用实际拥有的命名空间。
