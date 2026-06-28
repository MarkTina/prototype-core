# AGENTS.md

本文件是公开原型内核仓库的新会话冷启动指南。使用说明见 `README.md`，连续性判断见 `HANDOFF.md`；命令和版本以 `package.json` 为准。

## 工作方式

- 全程使用中文回答和注释，所有读写、执行与解析统一使用 UTF-8。
- 编码前先说明实现思路；UI 改动先给 ASCII 布局草图并等待用户确认。
- 日志以贴合内容的 emoji 开头；每次回复以“【🫡报告,长官】”开头。
- 精准修改，不顺手重构、不增加未要求的配置能力；现有未提交改动默认属于用户。

## 项目一句话

这是发布为 `@marktowin/prototype-core` 的 Vue 原型评审内核；产品页面、业务状态、资源和协作数据由消费者项目提供。

## 冷启动读取顺序

1. `HANDOFF.md`：确认稳定边界、当前限制和待办。
2. `README.md`：确认安装、公共 API 和发布方式。
3. `src/core/` 与 `src/types/prototype.ts`：确认公共契约。
4. 涉及运行行为时再检查 `src/prototype/`、`src/App.vue` 和 `examples/basic/`。
5. 修改前运行 `git status --short`，不要覆盖用户改动。

## 关键事实与陷阱

- 内核禁止导入产品目录或写死具体 `screenId`；产品只能通过 `PrototypeProductDefinition` 和 `runtimeConfig` 注入。
- 发布包只允许包含 `dist`、README、LICENSE 和包元数据；不得发布源码仓库配置、种子或环境文件。
- 仓库公开，禁止提交 `.env`、Token、口令、服务器地址或真实协作配置；示例只能使用虚构值。
- Vue 与 `@lucide/vue` 是 peer dependencies，禁止打入运行包造成重复实例。
- `examples/basic` 是端到端契约测试，不承载真实产品需求。
- 开发与预览服务必须监听 `0.0.0.0`；启动前检查端口，只关闭本次启动的进程。

## 验证规则

```bash
pnpm check:architecture
pnpm test
pnpm build
pnpm pack:check
```

- 公共 API 或类型变化：必须构建内核和示例，并用 `.tgz` 做独立消费者安装测试。
- 发布前检查 tarball 内容、运行 Secret 扫描，并确认标签严格等于 `v<package.version>`。
- 项目现状、限制或长期决策变化时，按 `handoff-maintainer` 更新 `HANDOFF.md`。

## 修改禁区

- 不恢复原业务仓库历史，不复制原仓库 `.env*` 或部署脚本。
- 不把业务逻辑合入内核，不让示例成为第二套产品模板。
- 不提交 `dist/`、`.packages/`、`node_modules/`、日志或测试临时目录。

## 提交规范

- 提交所有未被 `.gitignore` 忽略且属于本次范围的文件。
- title 概括改动，detail 逐条列出且不超过 200 字。
