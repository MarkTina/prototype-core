# Prototype Core

面向移动端与 PC Web 产品原型的 Vue 评审内核，提供交互、全图、流程、流程编排、测试用例、主题、i18n、注释、页面描述、健康检查和协作能力。

## 安装

```bash
pnpm add @marktowin/prototype-core vue @lucide/vue
```

## 使用

```ts
import { mountPrototypeApp } from '@marktowin/prototype-core'
import '@marktowin/prototype-core/style.css'
import { product } from './product'

void mountPrototypeApp({
  target: '#app',
  product,
})
```

完整接入方式见 `examples/basic`。默认关闭访问认证并使用本地协作模式；需要云端协作时通过 `runtimeConfig` 显式注入配置。

应用可通过顶部“测试用例”或固定路由 `#/test-cases` 打开工作台。测试用例按页面/状态 scope 管理：有状态页面使用 `<screenId>__<stateId>`，无状态页面使用 `<screenId>`。消费者可在 `public/test-cases.json` 提供数组种子，也可直接使用工作台导出的 `{ version, testCases }`；启用 Gitee 后，远端 `test-cases/<scopeId>.json` 和 `test-cases/manifest.json` 是协作真值。工作台支持整体导出 JSON 和带筛选、冻结表头的 `.xlsx`，导出不代表已写入消费者种子或 Gitee。

人或 AI 在消费者项目中执行接入、新建页面、状态、流程、页面描述、协作配置与验收时，统一参照 [消费者原型实施操作手册](https://github.com/MarkTina/prototype-core/blob/main/AI-PROTOTYPE-GUIDE.md) 的“触发词 → 标准动作 → 完成判定”流程。

已挂载内核的应用可直接访问 `#/prototype-core-help` 阅读并复制同一份手册；该帮助路由只包含公开通用规则，不读取消费者业务数据。

涉及 UI 或主题实现时，可访问 `#/prototype-core-theme` 阅读并复制主题实现准则；该页面内容来自构建时内嵌的 `DESIGN-TOKENS.md`。

消费者可通过 `runtimeConfig.versionUpdate` 注册业务构建版本。内核会在启动、每分钟轮询和页面恢复可见时读取 `version.json`，发现新版本后通知所有已打开窗口刷新；同源窗口会通过 `BroadcastChannel` 加速同步。当前页面版本与 `version.json.version` 必须由消费者同一次构建生成，完整 Vite 接入、部署顺序和缓存规则见 `AI-PROTOTYPE-GUIDE.md` 的“业务版本注册与升级通知”。未注册 `currentVersion` 时该检测关闭。

AI 修改消费者 `page-descriptions.json` 后，可在已启用 Gitee 协作的应用页面上下文执行 `await window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson()`。该指令只写入远端缺失或内容变化的 scope，完成 manifest 合并、远端回读和缓存刷新；不会删除 JSON 中未列出的远端 scope。指定单个 scope 时传入 `await window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson({ scopeIds: ['home'] })`。返回值分别列出 `syncedScopes`、`skippedScopes` 和 `failedScopes`，单个 scope 失败不会中止其余目标。

也可从消费者项目终端执行同一类差异同步和精确回读。Token 只从 `AGENT_GITEE_ACCESS_TOKEN` 或 `GITEE_TOKEN` 读取：

```bash
pnpm exec prototype-core-sync-page-descriptions \
  --owner <owner> --repo <repo> \
  --project-id <projectId> --code-branch <codeBranch> \
  --scope <scopeId>
```

可用 `--file` 指定 JSON（默认 `public/page-descriptions.json`），用 `--remote-branch` 指定 Gitee 分支（默认 `master`），重复 `--scope` 可同步多个 scope。存在失败项时命令输出完整成功、跳过和失败列表，并以非零状态退出。

数据源面板会根据 `runtimeConfig` 检查 Gitee、OSS、原型访问和 Bug 删除密码是否齐全。部署变量不能在浏览器中直接读取，消费者只能传入是否存在，禁止传入真实值：

```ts
runtimeConfig: {
  environment: {
    deployment: {
      host: Boolean(__DEPLOY_ENV_STATUS__.host),
      port: Boolean(__DEPLOY_ENV_STATUS__.port),
      username: Boolean(__DEPLOY_ENV_STATUS__.username),
      password: Boolean(__DEPLOY_ENV_STATUS__.password),
      path: Boolean(__DEPLOY_ENV_STATUS__.path),
      backupPath: Boolean(__DEPLOY_ENV_STATUS__.backupPath),
    },
  },
}
```

`__DEPLOY_ENV_STATUS__` 应由消费者构建配置根据 `DEPLOY_*` 是否存在生成，且只能包含布尔值。

## 开发

```bash
pnpm install
pnpm build
pnpm dev
pnpm pack:check
```

## 发布

发布标签格式为 `v<package.version>`。GitHub Actions 会验证、构建、发布到 npmjs，并创建带 `.tgz` 的 GitHub Release。

本项目采用 [MIT](LICENSE) 许可证。
