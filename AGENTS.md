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
3. 涉及消费者项目接入或业务原型实施时，完整阅读 `AI-PROTOTYPE-GUIDE.md`。
4. `src/core/` 与 `src/types/prototype.ts`：确认公共契约。
5. 涉及运行行为时再检查 `src/prototype/`、`src/App.vue` 和 `examples/basic/`。
6. 修改前运行 `git status --short`，不要覆盖用户改动。

## 关键事实与陷阱

- 内核禁止导入产品目录或写死具体 `screenId`；产品只能通过 `PrototypeProductDefinition` 和 `runtimeConfig` 注入。
- 发布包只允许包含 `dist`、README、LICENSE 和包元数据；不得发布源码仓库配置、种子或环境文件。
- 仓库公开，禁止提交 `.env`、Token、口令、服务器地址或真实协作配置；示例只能使用虚构值。
- Vue 与 `@lucide/vue` 是 peer dependencies，禁止打入运行包造成重复实例。
- `examples/basic` 是端到端契约测试，不承载真实产品需求。
- 开发与预览服务必须监听 `0.0.0.0`；启动前检查端口，只关闭本次启动的进程。
- `#/prototype-core-help` 是公开通用帮助路由，内容来自构建时内嵌的 `AI-PROTOTYPE-GUIDE.md`；不得在帮助页混入消费者数据或运行配置。

## Gitee 协作资源通用契约

- 本节只定义内核行为，不保存任何消费者名称、页面 ID、仓库地址或真实配置。所有远端上下文必须来自消费者注入的 `runtimeConfig.collaboration`。
- 远端根路径统一为 `projects/<projectId>/branches/<branchKey>/`；`branchKey` 由 `codeBranch` 稳定计算。默认页 scope 为 `<screenId>`，状态页 scope 为 `<screenId>__<stateId>`。
- 消费者随构建提供的 `annotations.json`、`page-descriptions.json`、`flows.json` 是本地种子；浏览器 `localStorage` 是按 provider、仓库、远端分支、项目和代码分支隔离的缓存；Gitee 文件是启用远端协作后的协作真值。部署、导出 JSON 和写缓存都不等于写入 Gitee。

### 资源路径与写入动作

| 资源 | Gitee 路径 | 标准写入动作 |
| --- | --- | --- |
| 页面描述 | `page-descriptions/<scopeId>.json`、`page-descriptions/manifest.json` | 先保存当前 scope 文件，再合并更新 manifest 对应 scope 与页面汇总；保留其他 scope，不整表覆盖 |
| 注释 | `annotations/<scopeId>.json`、`annotations/manifest.json` | 基于远端当前数组执行新增、编辑、移动或删除，再合并更新 manifest 计数；冲突时停止并要求刷新 |
| 流程 | `flows.json` | 编辑器本地保存只生成缓存草稿；只有显式“推送 Gitee”才写远端完整流程文件，成功后清除 dirty 标记 |
| Bug | `bugs/bugs.json` | 基于远端当前数组执行变换后整体写回；附件先上传消费者注入的 OSS，再把 URL 与元数据写入 Bug |

### 读取与回退顺序

1. 启动时读取消费者静态种子和当前上下文缓存；存在有效缓存时优先作为即时界面数据，否则使用种子。
2. `runtimeConfig.collaboration` 完整且 `codeBranch` 可识别时，再读取 Gitee：页面描述与注释按当前 scope 加载，流程和 Bug 读取各自总文件。
3. Gitee 读取成功后覆盖对应内存数据并刷新缓存；读取失败时保留已有缓存或种子并显示错误，不得把回退数据宣称为已同步。
4. 页面或状态切换后重新读取当前页面描述和注释；轮询期间若对应资源正在编辑，应延迟覆盖。

### AI 执行与完成判定

1. 修改内核协作能力前，先从 `src/prototype/annotationClient.ts`、`collaborationStore.ts`、`collaborationPolicy.ts` 和 `src/tools/bugs/` 追踪路径、队列、冲突与缓存行为；禁止仅凭 UI 文案修改。
2. 涉及消费者协作数据时，只能在用户明确指定的消费者项目和远端上下文内操作；不得把消费者数据复制进本仓库，也不得在内核写死产品标识。
3. 用户授权写 Gitee 后，先说明资源类型、`projectId/branchKey/scopeId` 和目标路径；只修改本次 scope。权限、网络或冲突失败时停止，不退化为本地成功。
4. 写入完成必须精确回读本次 scope 文件及 manifest/总文件，核对内容、revision/sha 和索引；只运行汇总校验或只看到 UI 成功提示不算完成。
5. 初始化只创建缺失文件；远端已有不同内容时必须保护真值。迁移属于独立高风险任务，需明确源、目标、影响范围与回滚方式。
6. 交付分别报告：本地种子、Gitee 真值、远端精确验证、构建/测试、Git 状态；未完成项必须单列。

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

## 发布与密钥

- npm 发布 Token 存在当前设备用户级环境变量 `AGENT_NPM_ACCESS_TOKEN`；兼容名为 `NPM_TOKEN`、`NODE_AUTH_TOKEN`。
- GitHub Actions 自动发布读取 Repository Secret `NPM_TOKEN`，workflow 内注入为 `NODE_AUTH_TOKEN`；不要改成明文环境变量。
- 新会话需要查找该变量时，使用 `env-var-manager` skill；本机备份索引在 `~/.agent-env/registry.sqlite3`。
- 禁止把 npm Token 明文写入仓库、`.npmrc`、日志、提交信息或文档；只允许记录变量名和查找方式。

## 修改禁区

- 不恢复原业务仓库历史，不复制原仓库 `.env*` 或部署脚本。
- 不把业务逻辑合入内核，不让示例成为第二套产品模板。
- 不提交 `dist/`、`.packages/`、`node_modules/`、日志或测试临时目录。

## 提交规范

- 提交所有未被 `.gitignore` 忽略且属于本次范围的文件。
- title 概括改动，detail 逐条列出且不超过 200 字。
