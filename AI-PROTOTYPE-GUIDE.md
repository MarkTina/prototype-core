# AI 业务原型实施手册

本手册用于指导 AI 在独立的**消费者项目**中接入 `@marktowin/prototype-core` 并实现业务原型。字段的实时权威定义以消费者安装包类型和本仓库 `src/core/productAdapter.ts`、`src/types/prototype.ts` 为准。

## 适用范围与完成标准

业务页面、产品状态、图片资源和运行配置都属于消费者项目，不得写入本内核或 `examples/basic`。

本项目采用显式注册机制：新增 `.vue` 文件后，必须导入组件并登记到 `PrototypeProductDefinition.pages`；内核不会扫描目录，`componentPath` 也不会加载组件。只有页面可以启动，并且交互、全图、流程、状态与批注模式均已回归，才算原型可用。

## 固定实施流程

1. **建立事实**：读取用户提供的需求、设计稿、资源和消费者项目；检查其 `package.json`、入口、构建工具、现有页面、样式与未提交修改。未知内容标记为未知，不根据名称猜业务规则。
2. **形成页面清单**：列出页面 ID、端型、标题、状态、跳转目标和所属流程；检查同一 ID 在页面、状态、跳转和流程中的含义是否一致。
3. **确认 UI 方案**：每个 UI 页面先给 ASCII 布局草图并等待用户确认。存在多个合理布局或交互方案时暂停说明差异与风险。
4. **准备消费者项目**：优先沿用已有 Vue 3 + Vite 项目。新项目安装 `@marktowin/prototype-core`、`vue`、`@lucide/vue`，并确保开发与预览服务监听 `0.0.0.0`。不得复制本仓库内部源码代替安装包。
5. **建立接入文件**：创建或修改消费者入口、产品定义和业务页面目录；入口导入内核样式并调用 `mountPrototypeApp`，产品定义集中维护页面、状态、文案与流程。
6. **实现页面**：按已确认草图编写 Vue 组件。弹窗、表单、显隐和加载等页内行为使用普通 Vue 状态；跨页、Tab 和评审状态切换使用内核上下文。保持消费者现有组件库与样式约定，不顺手重构。
7. **显式注册**：导入每个页面组件并登记到 `pages`；同步维护 `states`、中英文状态文案和 `flows`。无实际状态或流程时使用空对象、空数组，不虚构业务内容。
8. **按需配置运行能力**：默认不传 `runtimeConfig`，即关闭访问认证并使用本地协作。只有用户明确提供目标和配置来源后，才接入认证、Gitee 协作、OSS、删除口令或部署状态。
9. **验证原型**：先运行消费者项目已有的类型检查和构建，再启动页面回归交互模式、全图模式、流程模式、状态切换和批注落点。启动前检查端口，只关闭本次启动的进程。
10. **交付报告**：逐项说明已完成页面、已验证命令和结果；单列未验证项、缺失资源、缺失配置及其影响。不得用“已写页面”代替“已验证可用”。

## 最小接入契约

消费者入口参考：

```ts
import { mountPrototypeApp } from '@marktowin/prototype-core'
import '@marktowin/prototype-core/style.css'
import { product } from './product'

void mountPrototypeApp({
  target: '#app',
  product,
  // runtimeConfig, // 仅在确有需要且已确认安全边界时传入
})
```

产品定义参考：

```ts
import { Home } from '@lucide/vue'
import type { PrototypeProductDefinition } from '@marktowin/prototype-core'
import HomeScreen from './screens/HomeScreen.vue'

export const product: PrototypeProductDefinition = {
  pages: [
    {
      id: 'home',
      platform: 'mobile', // 只能是 mobile 或 pc
      code: 'M1',
      title: '首页',
      subtitle: '首页说明',
      icon: Home,
      component: HomeScreen,
      hasTabBar: true,
    },
  ],
  states: {
    home: [
      { id: 'ready', labelKey: 'stateReady' },
      { id: 'empty', labelKey: 'stateEmpty' },
    ],
  },
  copy: {
    zh: { stateReady: '正常态', stateEmpty: '空状态' },
    en: { stateReady: 'Ready', stateEmpty: 'Empty' },
  },
  flows: {
    version: '1.0.0',
    flows: [
      {
        id: 'mainFlow',
        title: '主流程',
        subtitle: '主流程说明',
        rows: [[{ screenId: 'home', stateId: 'ready' }]],
      },
    ],
  },
}
```

页面交互参考：

```vue
<script setup lang="ts">
import { usePrototypeContext } from '@marktowin/prototype-core'

const { activePrototypeStateId, go, goTab, setPrototypeState } = usePrototypeContext()

// go('detail')：跳转到已注册页面
// goTab('home')：按 Tab 语义切换到已注册页面
// setPrototypeState('empty')：切换当前页面状态
// setPrototypeState('detail', 'loading')：预设指定页面状态
</script>
```

- 页面组件会收到 `screen` 属性；需要页面元数据时应显式声明对应 prop。
- `screenId` 必须唯一，并在 `pages`、`states`、`flows` 和所有跳转调用中完全一致；状态 ID 也必须与所属页面注册值一致。
- `go` 与 `goTab` 只接收已注册页面 ID。当前不是 Vue Router，不假设 URL、历史栈、路由参数、守卫或文件路由能力。
- `hasTabBar` 只用于需要内核移动端 TabBar 的页面。移动端与 PC 页面均由同一渲染器加载；尺寸与滚动策略按已确认设计实现，PC 可参考 `examples/basic` 的 1920×1080 基准画布，但不擅自套用到不同需求。
- `flows` 是评审展示数据，不会自动生成页面点击逻辑；页面事件与流程节点必须分别实现并保持一致。

## runtimeConfig 配置边界

允许的配置结构以 `PrototypeRuntimeConfig` 类型为准，当前分为：

- `auth`：原型访问认证开关、用户名和密码。
- `collaboration`：Gitee 协作所需 provider、owner、repo、remoteBranch、projectId、codeBranch、token。
- `oss`：Bug 图片上传所需 bucket、baseUrl、accessKeyId、accessKeySecret。
- `tools.bugDeleteCode`：Bug 删除口令。
- `environment.deployment`：部署配置是否存在的布尔状态，不接收部署配置原值。

配置规则：

1. 默认使用本地协作；不为“配置完整”而创建无需求配置。
2. 禁止把 Token、密码、AccessKey、真实仓库或服务器信息硬编码进源码、示例、日志或提交。变量名和注入方式应沿用消费者构建系统。
3. 浏览器端注入的认证信息、协作 Token 和 OSS 密钥对最终用户可见，只能用于用户明确接受该风险的原型环境，不能宣称为生产级秘密保护。
4. `environment.deployment` 只能由消费者构建配置把 `DEPLOY_*` 是否存在转换为布尔值；禁止把真实部署值传入浏览器。
5. 配置来源未知、权限范围不清或需要修改公共契约时，停止实施并向用户说明已知事实、缺口、风险与推荐方案。

只传入实际启用的分组；以下结构用于核对字段，不得照抄虚构值或把秘密直接写入文件：

```ts
import type { PrototypeRuntimeConfig } from '@marktowin/prototype-core'

export const runtimeConfig: PrototypeRuntimeConfig = {
  auth: {
    enabled: runtimeEnv.authEnabled,
    username: runtimeEnv.authUsername,
    password: runtimeEnv.authPassword,
  },
  collaboration: {
    provider: runtimeEnv.provider,
    owner: runtimeEnv.owner,
    repo: runtimeEnv.repo,
    remoteBranch: runtimeEnv.remoteBranch,
    projectId: runtimeEnv.projectId,
    codeBranch: runtimeEnv.codeBranch,
    token: runtimeEnv.token,
  },
  oss: {
    bucket: runtimeEnv.ossBucket,
    baseUrl: runtimeEnv.ossBaseUrl,
    accessKeyId: runtimeEnv.ossAccessKeyId,
    accessKeySecret: runtimeEnv.ossAccessKeySecret,
  },
  tools: { bugDeleteCode: runtimeEnv.bugDeleteCode },
  environment: {
    deployment: {
      host: Boolean(deployEnv.host),
      port: Boolean(deployEnv.port),
      username: Boolean(deployEnv.username),
      password: Boolean(deployEnv.password),
      path: Boolean(deployEnv.path),
      backupPath: Boolean(deployEnv.backupPath),
    },
  },
}
```

其中 `runtimeEnv` 和 `deployEnv` 代表消费者构建配置已经完成校验的注入结果，不是内核提供的全局变量；未启用的整个分组应删除。若消费者尚无安全的注入方式，保持本地默认模式并报告配置缺口。

## 原型验收清单

- [ ] 消费者通过安装包接入，入口正确导入内核样式，未复制内核源码。
- [ ] 每个业务页面都有唯一 ID、正确端型、组件导入和 `pages` 注册。
- [ ] 页面状态、双语标签、流程节点和代码中的跳转 ID 相互一致。
- [ ] 页内交互、跨页跳转、Tab 切换和状态切换符合已确认需求。
- [ ] 移动端与 PC 页面分别检查尺寸、滚动、遮挡和基本响应表现。
- [ ] 交互、全图和流程模式都能显示预期页面，流程顺序正确。
- [ ] 不同页面及状态下的批注落点和隔离符合预期；需要时检查页面描述。
- [ ] 本地模式无云端配置也可运行；启用的远端能力逐项验证成功与失败降级。
- [ ] 消费者项目的类型检查和构建通过，控制台无影响使用的错误。
- [ ] 仓库中无真实秘密、构建产物、日志或无关改动；交付报告明确列出未验证项。
