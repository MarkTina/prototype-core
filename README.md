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
