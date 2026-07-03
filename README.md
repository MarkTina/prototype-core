# Prototype Core

面向移动端与 PC Web 产品原型的 Vue 评审内核，提供交互、全图、流程、流程编排、主题、i18n、注释、页面描述、健康检查和协作能力。

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

人或 AI 在消费者项目中执行接入、新建页面、状态、流程、页面描述、协作配置与验收时，统一参照 [消费者原型实施操作手册](https://github.com/MarkTina/prototype-core/blob/main/AI-PROTOTYPE-GUIDE.md) 的“触发词 → 标准动作 → 完成判定”流程。

已挂载内核的应用可直接访问 `#/prototype-core-help` 阅读并复制同一份手册；该帮助路由只包含公开通用规则，不读取消费者业务数据。

AI 修改消费者 `page-descriptions.json` 后，可在已启用 Gitee 协作的应用页面上下文执行 `await window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson()`。该指令以 Gitee 为唯一真值，完成逐 scope 写入、manifest 合并、远端回读和缓存刷新；不会删除 JSON 中未列出的远端 scope。

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
