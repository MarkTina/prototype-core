# 原型消费者实施与操作手册

本手册供人或 AI 在独立的**消费者项目**中接入 `@marktowin/prototype-core`、创建业务页面并完成后续配置。它是操作路由，不是业务需求文档；字段的实时权威定义以消费者实际安装版本的类型声明，以及内核 `src/core/productAdapter.ts`、`src/types/prototype.ts` 为准。

## 1. 手册目标与边界

读完本手册后，执行者应能回答：

1. 用户的关键词触发了哪类操作。
2. 应在消费者项目的哪个文件实施。
3. 页面写完后必须同步哪些注册、状态、流程和协作资源。
4. 哪些动作只保存本地，哪些动作会写入 Gitee 或 OSS。
5. 如何证明操作已经完成，而不是只证明“文件改过了”。

始终遵守以下边界：

- 业务页面、状态、文案、流程、种子数据、资源和运行配置属于消费者项目，不得写入 `prototype-core` 或 `examples/basic`。
- 消费者通过 npm 包使用内核，不复制内核 `App.vue`、协作客户端、流程编辑器或 Bug 工具源码。
- 内核不会扫描页面目录。新增组件必须显式导入并注册到 `PrototypeProductDefinition.pages`。
- `componentPath` 只是元数据，不能代替 `component` 导入。
- 未读取需求、页面实现或真实配置时，未知内容必须标记为“未知”，不得根据页面名称编造规则。

已挂载内核的消费者应用可通过固定 Hash 路由 `#/prototype-core-help` 直接读取本手册。手册原文随内核构建进入发布包，页面支持复制全文；该公开帮助路由不读取或展示消费者业务数据、协作内容与运行配置。

## 2. 触发词与操作路由

用户表达不必与表格完全一致；语义命中即可进入对应流程。一次请求命中多项时，按依赖顺序组合执行。

| 操作类型 | 常见触发词 | 首要定位 | 必须完成 |
| --- | --- | --- | --- |
| 接入内核 | “接入脚手架”“初始化原型”“搭建消费者项目”“安装内核” | `package.json`、入口文件、产品定义 | 安装依赖、挂载内核、建立产品定义、完成基线构建 |
| 再次进入已有项目 | “继续原型”“接着做”“检查当前项目”“冷启动” | `AGENTS.md`、`HANDOFF.md`、`package.json`、入口、产品定义 | 确认版本、未提交改动、页面/状态/流程真值和运行配置来源 |
| 新增页面 | “新增页面”“创建页面”“实现页面”“还原设计稿” | 消费者页面目录、产品定义 | UI 确认、组件实现、页面注册、状态/文案、跳转、流程、页面描述、验证 |
| 修改页面 | “调整页面”“改 UI”“修改交互”“修复页面” | 目标组件及调用方 | 保持 ID，局部修改；同步受影响状态、流程和页面描述 |
| 页面状态 | “新增状态”“空状态”“加载态”“失败态”“弹窗态” | 页面组件、`product.states`、双语文案 | 注册状态 ID、实现展示条件、补流程引用和状态级页面描述 |
| 页面跳转 | “跳转”“返回”“Tab 切换”“进入详情” | 事件处理与 `usePrototypeContext` | 目标已注册；实现 `go/goTab`；检查流程节点一致性 |
| 流程编排 | “新增流程”“修改流程”“流程图”“推送流程” | 产品定义或本地 `flows.json`、流程编辑器 | 节点引用合法；本地保存；明确需要时推送 Gitee；回读验证 |
| 页面描述 | “补全页面描述”“页面说明”“重点标注”“验收标准” | `page-descriptions.json`、当前页面/状态 | 按 scope 补全字段；本地种子与远端真值按任务要求同步；精确验证 |
| 注释批注 | “加注释”“批注”“标注点”“移动注释” | 原型协作面板 | 按当前 scope 操作；更新远端文件和 manifest；核对坐标与计数 |
| Bug 管理 | “提 Bug”“更新 Bug”“修改状态”“上传截图” | 内核 Bug 工具 | 写 Bug 真值；附件先传 OSS；回读 Bug 与附件元数据 |
| 访问认证 | “加登录”“原型密码”“访问账号” | 消费者环境注入、`runtimeConfig.auth` | 显式启用、映射变量、验证门禁与环境检查 |
| Gitee 协作 | “配置协作”“同步 Gitee”“初始化远端” | `runtimeConfig.collaboration` | 注入连接和分支上下文；验证读写；不得硬编码真实值 |
| OSS | “配置 OSS”“Bug 图片”“上传附件” | `runtimeConfig.oss` | 注入四项配置；验证上传和访问 URL；说明浏览器端暴露风险 |
| 部署检查 | “部署变量”“环境检测”“测试服/正式服” | 构建配置、`runtimeConfig.environment` | 只传存在状态布尔值；比较构建产物、远端上下文和域名缓存 |
| 升级内核 | “升级脚手架”“更新内核”“使用最新版” | `package.json`、锁文件 | 更新依赖、检查类型/API 变化、完整回归，不复制源码 |
| 验证交付 | “验证”“验收”“回归”“提交” | 消费者脚本和运行页面 | 执行项目命令、三模式回归、协作资源验证、报告 Git 状态 |

依赖顺序：

```text
接入内核
  → 产品定义
    → 页面组件
      → 状态与文案
        → 页面跳转
          → 流程
            → 页面描述/注释
              → 运行配置与远端协作
                → 验证与交付
```

## 3. 进入消费者项目后的固定检查

无论任务大小，首次进入或上下文压缩后都按以下顺序恢复事实：

1. 读取消费者 `AGENTS.md` 和 `HANDOFF.md`；没有则读取 README。
2. 运行 `git status --short --branch`，现有改动默认属于用户。
3. 读取 `package.json`，确认 Vue、Vite、包管理器、验证命令和实际安装的内核版本。
4. 读取入口文件，确认 `mountPrototypeApp`、内核样式和 `runtimeConfig` 的组装位置。
5. 读取产品定义，建立页面、状态、文案、流程的 ID 对照。
6. 读取目标页面及其直接依赖、跳转调用和状态数据；不要只看搜索结果。
7. 只检查环境变量名和是否存在，不打印真实 Token、密码或 AccessKey。
8. 运行最小基线验证；基线已失败时先报告，不把旧失败归因于本次修改。

建议的消费者结构（沿用既有项目结构优先，不为符合示例而重构）：

```text
consumer-project/
├─ src/
│  ├─ main.ts                 # 挂载内核、注入 runtimeConfig
│  ├─ product.ts              # 页面、状态、文案、流程注册
│  ├─ screens/ 或 pages/      # 业务页面组件
│  └─ components/             # 消费者业务组件
├─ public/
│  ├─ flows.json              # 可选：流程本地种子
│  ├─ annotations.json        # 可选：注释本地种子
│  └─ page-descriptions.json  # 可选：页面描述本地种子
└─ package.json
```

## 4. 首次接入内核

### 4.1 安装

```bash
pnpm add @marktowin/prototype-core vue @lucide/vue
```

Vue 和 `@lucide/vue` 是 peer dependencies。消费者应复用单一实例，不把内核源码复制进项目。

### 4.2 入口挂载

```ts
import { mountPrototypeApp } from '@marktowin/prototype-core'
import '@marktowin/prototype-core/style.css'
import { product } from './product'

void mountPrototypeApp({
  target: '#app',
  product,
  // runtimeConfig, // 只有需求和配置来源明确时才传入
})
```

接入完成判定：

- 页面能启动，控制台没有阻断错误。
- 交互、全图和流程模式都能打开。
- 默认无 `runtimeConfig` 时认证关闭、协作使用本地模式。
- 开发与预览服务监听 `0.0.0.0`。

## 5. 产品定义与 ID 契约

产品定义集中维护页面、状态、双语文案和流程：

```ts
import { Home } from '@lucide/vue'
import type { PrototypeProductDefinition } from '@marktowin/prototype-core'
import HomeScreen from './screens/HomeScreen.vue'

export const product: PrototypeProductDefinition = {
  pages: [
    {
      id: 'home',
      platform: 'mobile',
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

ID 规则：

- `screenId` 全局唯一，并在页面注册、状态、流程、跳转和协作 scope 中完全一致。
- `stateId` 只属于对应页面，必须在页面实现、状态注册、流程和页面描述中一致。
- 已产生注释、描述或流程数据后，不随意改 ID；改 ID 属于数据迁移，不是普通重命名。
- 无真实状态或流程时使用空对象、空数组，不为“看起来完整”而虚构数据。
- 页面描述/注释默认 scope 为 `<screenId>`；状态级 scope 为 `<screenId>__<stateId>`。

## 6. 创建一个页面的标准生命周期

### 6.1 建立页面事实

先列出并确认：

| 字段 | 必须回答 |
| --- | --- |
| 页面身份 | `screenId`、code、标题、mobile/pc |
| 进入方式 | 从哪里进入，使用普通跳转还是 Tab |
| 离开方式 | 可到哪些已注册页面 |
| 状态 | 默认、加载、空、失败、弹窗等真实状态 |
| 数据 | 来源、模拟方式、边界值 |
| 流程 | 属于哪条主流程、前后节点 |
| 描述 | 页面目的、结构、功能、规则和验收标准 |

信息不足、存在多个合理布局或会改变公共交互时暂停确认。

### 6.2 UI 先确认再编码

页面布局或交互流程变化前先给 ASCII 草图，例如：

```text
┌──────── 页面标题 ────────┐
│ 主要信息区               │
│ ┌──── 卡片/列表 ──────┐ │
│ └─────────────────────┘ │
│                         │
│ [次操作]      [主操作]  │
└──────── TabBar ─────────┘
```

用户确认后再实施；纯文案、颜色或已确定样式的局部修正可直接修改。

### 6.3 编写业务组件

- 页面只实现业务内容，不复制手机外框、顶部模式栏、协作面板等内核 UI。
- 页内弹窗、输入、展开、加载等使用普通 Vue 状态。
- 跨页面、Tab 和评审状态切换使用内核上下文。
- 页面组件会收到 `screen` 属性；需要元数据时显式声明 prop。
- 保持消费者现有组件库、尺寸体系和样式约定，不顺手重构其他页面。

### 6.4 注册页面

页面文件创建后立即：

1. 在产品定义中导入组件。
2. 添加唯一 `pages` 项。
3. 按真实需求设置 `platform` 与 `hasTabBar`。
4. 启动应用确认不再落入空页面。

仅创建 `.vue` 文件不算完成。

### 6.5 注册状态与双语文案

每个真实状态都要同时具备：

- `states[screenId]` 中的状态 ID。
- `copy.zh` 与 `copy.en` 对应 `labelKey`。
- 页面组件根据 `activePrototypeStateId` 呈现该状态。
- 流程需要时引用同一 `stateId`。
- 状态级页面描述使用相同 scope。

### 6.6 实现跳转

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

- `go` 与 `goTab` 只接收已注册 ID。
- 当前不是 Vue Router，不假设 URL、历史栈、参数、守卫或文件路由。
- 流程节点不会自动生成点击逻辑；页面事件与流程数据必须分别实现并保持一致。

### 6.7 补入流程

- 新页面属于既有流程时，插入正确行列并标明真实状态。
- 页面有跳转不代表流程自动更新；流程有节点也不代表页面自动可点击。
- 删除页面时同步删除或替换所有流程引用。
- 本地流程编辑器“保存”只写缓存草稿；需要团队共享时必须显式推送 Gitee。

### 6.8 补全页面描述

页面或状态完成后，根据实际实现补齐：

- `purpose`：页面目的。
- `structure`：区域和层级。
- `features`：核心功能。
- `flowPosition`：流程位置。
- `interactionRules`：点击、输入、跳转和反馈。
- `stateCriteria`：进入当前状态的条件。
- `edgeCases`：异常与边界。
- `acceptanceCriteria`：可验证的验收标准。
- `developmentNotes`：实现约束。

描述必须与代码和流程相符，不写空泛宣传语。状态页必须使用状态级 scope；若任务要求同步协作真值，还要写入 Gitee 对应 scope 并更新 manifest。

### 6.9 页面完成判定

一个页面只有同时满足以下条件才算完成：

- 组件已实现并显式注册。
- 状态和中英文标签完整。
- 所有跳转目标存在。
- 流程节点与点击逻辑一致。
- 页面/状态描述已补全。
- 交互、全图、流程模式均可展示。
- 移动端/PC 尺寸、滚动、遮挡和交互已回归。
- 相关协作资源已按任务要求完成本地与远端验证。

## 7. 核心操作规范

### 7.1 新增或修改状态

标准动作：确认状态语义 → 注册 ID → 补双语标签 → 实现页面展示 → 更新跳转/流程 → 补状态描述 → 回归连续切换。

禁止：只在组件中写字符串状态、只改 UI 不注册、复用含义不同的旧状态 ID。

### 7.2 删除页面或状态

删除前搜索并确认：产品注册、组件导入、跳转调用、流程节点、本地描述/注释种子、Gitee scope 和 manifest。删除云端数据属于不可逆操作，必须明确说明范围与回滚方式并等待授权。

### 7.3 页面描述与注释

写入路径由消费者 `projectId/codeBranch` 和当前 scope 决定：

```text
projects/<projectId>/branches/<branchKey>/
├─ page-descriptions/<scopeId>.json
├─ page-descriptions/manifest.json
├─ annotations/<scopeId>.json
└─ annotations/manifest.json
```

标准动作：读取当前远端 revision → 只修改目标 scope → 写 scope 文件 → 合并 manifest → 精确回读 scope 与 manifest。冲突时刷新后重新判断，不覆盖其他人的更新。

AI 直接补充消费者 `page-descriptions.json` 后，不得只等待缓存自行失效。在已挂载且启用 Gitee 协作的消费者页面中执行：

```js
await window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson()
```

该指令会重新读取 JSON，逐 scope 写入 Gitee、合并 manifest、精确回读并刷新当前上下文缓存。JSON 中未出现的远端 scope 不会被删除；任一 scope 或 manifest 失败时指令会报错，不得宣称同步完成。

### 7.4 流程

```text
本地编辑
  → 保存缓存草稿（dirty）
  → 人工检查节点
  → 显式推送 Gitee
  → 回读 flows.json
  → 清除 dirty
```

导出 `flows.json` 只是下载，不代表已经更新消费者种子或 Gitee。

### 7.5 Bug 与附件

- Bug 真值位于 `bugs/bugs.json`，以远端当前数组为基础执行变换后写回。
- 图片先上传 OSS，Bug 数据只保存 URL、objectKey 和元数据。
- Gitee/OSS 不可用时必须明确当前是否只保存在本地；不得把本地缓存称为团队已同步。
- 删除 Bug、替换附件或清理 OSS 对象前说明不可逆影响。

### 7.6 初始化与迁移

- 初始化只创建缺失文件；远端存在不同内容时保护远端，不借初始化覆盖。
- 迁移前列出源/目标项目、远端分支、代码分支、文件数量和回滚方式。
- 迁移默认只读预检；只有用户明确授权才执行写入。
- 部署不会自动把 `public/*.json` 写入 Gitee。

## 8. runtimeConfig 接入流程

### 8.1 配置原则

1. 默认不传 `runtimeConfig`；只启用明确需要的分组。
2. 配置值由消费者构建系统注入，不由内核读取消费者 `.env`。
3. 禁止把 Token、密码、AccessKey、真实仓库或服务器地址硬编码到源码、示例、日志和公开提交。
4. 浏览器端认证、Gitee Token 和 OSS 密钥最终对用户可见，只能用于明确接受风险的原型环境。
5. 修改 `.env` 后必须重启开发服务或重新构建；运行中的 Vite 不保证重新注入。

### 8.2 配置结构

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

`runtimeEnv` 与 `deployEnv` 是消费者构建配置已经完成校验的结果，不是内核全局变量。

### 8.3 各分组完成判定

| 分组 | 完成判定 |
| --- | --- |
| `auth` | `enabled` 与账号密码映射正确；未认证显示门禁；正确/错误凭据行为已验证 |
| `collaboration` | provider、仓库、远端分支、项目和代码分支明确；能读取并写回测试 scope；缓存键隔离正确 |
| `oss` | 测试图片上传成功，返回 URL 可访问，Bug 中只保存元数据 |
| `tools` | 删除口令读取正确，错误口令不会删除 |
| `environment.deployment` | 只传布尔存在状态，环境面板显示正确，浏览器包中不含真实部署值 |

## 9. 本地种子、缓存与 Gitee 的关系

```text
启动：本地种子 + 当前上下文缓存
               ↓
        有缓存先显示缓存
               ↓
       Gitee 可读则远端覆盖
               ↓
       成功后更新本地缓存
```

- 本地种子：随消费者构建发布，供新浏览器和离线场景兜底。
- localStorage：按域名和协作上下文隔离；页面描述与注释按 scope 保存独立 revision，流程与 Bug 按整文件保存。缓存状态区分 `synced/pending/stale/error`。
- Gitee：远端协作启用后的团队真值。
- JSON 是初始化种子和 AI 编辑载体，不是启用 Gitee 后的第二真值；AI 修改页面描述 JSON 后必须执行同步指令并以远端回读为完成依据。
- 测试服与正式服显示不一致时，依次比较构建版本、静态种子、`runtimeConfig`、Gitee scope 和各域名缓存。
- 汇总 manifest 正确不代表每个 scope 文件都存在；关键修改必须逐文件回读。

## 10. 升级内核

触发“升级脚手架/更新内核”后：

1. 检查当前版本、目标版本和发布说明。
2. 更新 `@marktowin/prototype-core` 及锁文件，不修改无关依赖。
3. 检查消费者入口、公共类型和构建错误。
4. 回归交互、全图、流程、页面状态、注释、页面描述和 Bug。
5. 使用真实安装包验证，不通过复制 `dist` 或源码模拟升级。
6. 将内核升级作为边界清晰的提交，报告目标版本和回归结果。

## 11. 验证分层

### 11.1 静态一致性

- 页面和状态 ID 唯一。
- 所有流程节点和跳转目标存在。
- 双语 `labelKey` 完整。
- 页面描述、注释 scope 引用合法。

### 11.2 项目命令

按消费者 `package.json` 的真实脚本执行，通常包括类型检查、项目校验、远端校验和构建。不得发明不存在的命令。

### 11.3 运行时回归

- 交互模式：点击、输入、弹窗、跳转、Tab、状态切换。
- 全图模式：所有页面和状态可见，缩放与布局正常。
- 流程模式：节点、顺序、分支与页面实现一致。
- 批注模式：任意位置可落点，交互组件不会抢占标注点击。
- 演示模式：移动端保持基准比例整体缩放。
- 协作工具：读、写、冲突、失败降级和轮询行为符合预期。

### 11.4 远端精确验证

`validate:remote` 等汇总命令只是基础检查。发生远端写入时，还必须回读本次修改的 scope 文件及 manifest/总文件，核对实际字段、数量与 revision/sha。

## 12. 统一交付格式

交付结论必须分项报告：

```text
页面实现：完成 / 未完成
页面注册：完成 / 未完成
状态与文案：完成 / 不适用 / 未完成
跳转与流程：完成 / 不适用 / 未完成
页面描述：本地完成；Gitee 已同步 / 未授权 / 失败
注释与 Bug：完成 / 不适用 / 未完成
验证命令：<命令与结果>
运行时回归：<已验证模式>
Git 状态：未提交 / 已提交 / 已推送
未验证项：<内容与影响>
```

禁止使用以下替代完成证明：

- “文件已经创建”代替页面已注册并可运行。
- “构建通过”代替交互和流程已回归。
- “JSON 已修改”代替 Gitee 已同步。
- “manifest 数量正确”代替 scope 文件已验证。
- “已经推送代码”代替部署或远端协作数据已生效。

## 13. 最终验收清单

- [ ] 消费者通过 npm 包接入，未复制内核源码。
- [ ] 页面清单、状态清单和流程清单来自真实需求。
- [ ] 每个页面有唯一 ID、正确端型和组件注册。
- [ ] 页面状态、双语文案、流程节点和跳转调用完全一致。
- [ ] 页面 UI 方案已确认，页内与跨页交互均实现。
- [ ] 页面/状态描述与真实实现一致。
- [ ] 本地种子、缓存和 Gitee 真值的状态已区分报告。
- [ ] 交互、全图、流程、批注和演示模式均按影响范围回归。
- [ ] 启用的认证、协作、OSS、工具和部署检查逐项验证。
- [ ] 消费者类型检查、校验和构建通过。
- [ ] 仓库不包含意外 Secret、构建产物、日志或无关改动。
- [ ] 交付报告明确列出所有未完成与未验证项。
