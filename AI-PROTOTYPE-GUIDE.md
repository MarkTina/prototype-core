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
| 测试用例 | “测试用例”“测试场景”“导出 Excel” | `test-cases.json`、`#/test-cases` | 按页面/状态 scope 编辑；核对 7 个业务字段；远端写入后精确回读；整体导出验证范围完整 |
| Bug 管理 | “提 Bug”“更新 Bug”“修改状态”“上传截图” | 内核 Bug 工具 | 写 Bug 真值；附件先传 OSS；回读 Bug 与附件元数据 |
| 访问认证 | “加登录”“原型密码”“访问账号” | 消费者环境注入、`runtimeConfig.auth` | 显式启用、映射变量、验证门禁与环境检查 |
| Gitee 协作 | “配置协作”“同步 Gitee”“初始化远端” | `runtimeConfig.collaboration` | 注入连接和分支上下文；验证读写；不得硬编码真实值 |
| OSS | “配置 OSS”“Bug 图片”“上传附件” | `runtimeConfig.oss` | 注入四项配置；验证上传和访问 URL；说明浏览器端暴露风险 |
| 部署检查 | “部署变量”“环境检测”“测试服/正式服” | 构建配置、`runtimeConfig.environment` | 只传存在状态布尔值；比较构建产物、远端上下文和域名缓存 |
| 产品文档配置 | “产品需求文档”“文档地址”“顶部标题”“顶部描述” | `PrototypeProductDefinition.document` | 配置文档标题、描述和 URL；验证按钮在新标签页打开目标文档 |
| 更新历史 | “更新历史”“提交记录”“Git 历史” | Vite 构建配置、`PrototypeProductDefinition.updateHistory` | 构建时读取消费者仓库提交；注入产品定义；验证最新和历史记录 |
| 业务版本通知 | “版本推送”“升级通知”“提醒刷新”“version.json” | Vite 构建配置、入口、部署缓存 | 同次构建生成唯一版本指纹；注册 `runtimeConfig.versionUpdate`；发布 `version.json`；验证旧窗口提示 |
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
│  ├─ page-descriptions.json  # 可选：页面描述本地种子
│  └─ test-cases.json         # 可选：测试用例本地种子
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
  document: {
    title: '示例产品',
    description: '示例产品需求文档',
    url: 'https://example.com/product-requirements',
  },
  updateHistory: __BUSINESS_UPDATE_HISTORY__,
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

### 5.1 顶部产品文档配置

顶部左侧的标题和描述用于说明当前产品文档，右侧“产品需求文档”按钮读取同一份 `document` 配置。配置属于消费者产品定义，不应写入内核源码或 `runtimeConfig`：

```ts
export const product: PrototypeProductDefinition = {
  document: {
    title: '产品名称或文档标题',
    description: '当前产品需求文档的简短说明',
    url: 'https://example.com/product-requirements',
  },
  // pages、states、copy、flows...
}
```

字段说明：

| 字段 | 是否必填 | 用途 |
| --- | --- | --- |
| `title` | 配置 `document` 时必填 | 顶部左侧主标题，描述当前产品文档 |
| `description` | 配置 `document` 时必填 | 顶部左侧副标题，补充当前产品文档范围或用途 |
| `url` | 可选 | “产品需求文档”按钮的新标签页目标地址 |

- `document` 为兼容旧消费者保持可选；新接入或升级后的消费者应显式配置。
- 未配置 `url` 或内容为空时，点击按钮不会打开新标签页，而是提示在 `PrototypeProductDefinition.document.url` 中配置。
- URL 应由消费者业务侧维护。公开仓库和示例只能使用公开地址或虚构值，不得写入 Token、口令或带鉴权参数的私有链接。
- 标题区域仍用于返回原型首页；打开文档使用右侧“产品需求文档”按钮。

完成判定：顶部标题和描述与配置一致；点击按钮能在新标签页打开目标文档；临时移除 `url` 后点击只显示未配置提示，不产生空白标签页。

### 5.2 业务更新历史接入

顶部“更新历史”展示消费者业务仓库的 Git 提交标题和正文，不展示内核仓库提交。历史属于当前业务构建的产品内容，通过 `PrototypeProductDefinition.updateHistory` 注入；不放入 `runtimeConfig`，也不由浏览器调用 GitHub/Gitee API。

在消费者 `vite.config.ts` 构建时读取当前 `HEAD` 最近 20 条提交：

```ts
import { execFileSync } from 'node:child_process'

const updateHistory = (() => {
  try {
    const output = execFileSync(
      'git',
      ['log', '-20', '--date=short', '--pretty=format:%h%x1f%ad%x1f%s%x1f%b%x1e', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return output
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [hash = '', date = '', message = '', ...detailParts] = record.split('\x1f')
        return { hash, date, message, details: detailParts.join('\x1f').trim() }
      })
      .filter((item) => item.hash && item.date && item.message)
  } catch (error) {
    console.warn('⚠️ [更新历史] 无法读取消费者 Git 提交记录，将使用空历史', error)
    return []
  }
})()

export default defineConfig({
  // 保留消费者已有 plugins、server 和其他配置。
  define: {
    __BUSINESS_UPDATE_HISTORY__: JSON.stringify(updateHistory),
  },
})
```

在消费者 `src/vite-env.d.ts` 声明构建常量：

```ts
declare const __BUSINESS_UPDATE_HISTORY__: Array<{
  hash: string
  date: string
  message: string
  details: string
}>
```

在产品定义中注册：

```ts
export const product: PrototypeProductDefinition = {
  updateHistory: __BUSINESS_UPDATE_HISTORY__,
  // document、pages、states、copy、flows...
}
```

- `message` 来自提交标题，`details` 来自提交正文；需要有可读详情时，应在提交 body 中记录变更点。
- 只包含已提交到当前构建 `HEAD` 的记录，不包含未提交工作区内容。
- CI checkout 必须保留足够历史；GitHub Actions 使用 `actions/checkout` 时应设置 `fetch-depth: 20` 或 `0`，否则浅克隆可能只能生成一条记录。
- Git 不可用时构建降级为空数组并输出警告；不得改为浏览器携带 Token 读取远端仓库。
- 未配置 `updateHistory` 时，弹窗明确提示业务侧尚未接入；显式配置空数组时显示“暂无提交记录”。

完成判定：弹窗第一条与当前构建 `HEAD` 一致；提交标题、日期、短 SHA 和多行正文正确；历史顺序由新到旧；CI 构建产物不因浅克隆缺失预期记录。

### 5.3 ID 规则

- `screenId` 全局唯一，并在页面注册、状态、流程、跳转和协作 scope 中完全一致。
- `stateId` 只属于对应页面，必须在页面实现、状态注册、流程和页面描述中一致。
- 已产生注释、描述或流程数据后，不随意改 ID；改 ID 属于数据迁移，不是普通重命名。
- 无真实状态或流程时使用空对象、空数组，不为“看起来完整”而虚构数据。
- 页面描述、注释和测试用例默认 scope 为 `<screenId>`；状态级 scope 为 `<screenId>__<stateId>`。

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

#### 6.2.1 手机画布与消费者容器边界

内核负责手机外框、状态栏、滚动容器和 TabBar 预留空间，消费者负责手机画布内的业务页面。实现移动端页面前必须先检查当前安装版本的内核样式，确认 `.screen-content` 已提供的横向、顶部和底部留白；不得在业务页面根节点机械重复同等 padding。当前默认手机预览内容区已有 `20px` 横向留白，实际值仍以消费者安装版本为准。

- 页面背景需要覆盖完整业务画布时，把背景设置在页面根节点，并确保根节点至少覆盖可用高度；不要只给内部内容块着色，形成四周或底部断层。
- 需要全幅背景、全幅标题或贴边分区时，只在一个共享页面根类中统一抵消内核留白，并在交互、全图、流程和演示模式中验证；不要让每个页面分别硬编码负边距。
- 需要保留画布留白时，卡片、标题和表单只增加业务层间距；先检查父级，再决定是否增加子级 padding，禁止层层叠加导致组件宽度被挤压。
- 背景颜色不同的相邻区域必须选择一种清晰关系：全幅分区使用 `--ds-rounded-none` 并铺满边界；内嵌卡片与画布保持明确间距，并使用统一的 `--ds-rounded-*` 圆角。不得让异色矩形直接贴住手机边框，也不得只处理上圆角或下圆角。
- 同一产品中重复出现的普通标题、返回标题、状态摘要等结构应封装为消费者公共组件；标题、返回热区、边距、圆角和深浅色变体从同一处维护。
- TabBar 由内核渲染时不得在业务页面重复实现。必须按实际 Tab 数量检查等宽分栏、选中态和点击热区；项目 Tab 数量与内核当前布局不匹配时，应明确记录为内核兼容问题，不通过压缩业务内容掩盖。
- 颜色、圆角、间距和阴影优先使用 `--ds-*` token。触控目标不小于 `44 × 44px`，并在 `393 × 852` 基准画布及至少 `375px` 宽度检查溢出、滚动、固定底栏和键盘遮挡。

### 6.3 编写业务组件

- 页面只实现业务内容，不复制手机外框、顶部模式栏、协作面板等内核 UI。
- 页内弹窗、输入、展开、加载等使用普通 Vue 状态。
- 跨页面、Tab 和评审状态切换使用内核上下文。
- 页面组件会收到响应式 `screen: DisplayScreen` 属性；状态页面必须显式声明该 prop，并以 `screen.stateId` 渲染当前页面实例。
- 保持消费者现有组件库、尺寸体系和样式约定，不顺手重构其他页面。
- 定时器、`requestAnimationFrame`、音频、Canvas 绘制任务和设备监听必须在重新开始前先清理，并在 `onBeforeUnmount` 中释放；不得假设状态切换后组件实例仍然存在。
- 状态评审数据与真实业务数据分离。状态按钮用于展示空、失败、加载等评审结果时，不得写入真实缓存、最近记录、导入草稿或正式报告；真实业务动作只在明确的确认点写入。

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
- `copy.zh/en` 只维护消费者业务文案；注释、页面描述、协作状态、数据源和测试工具等内核文案固定为中文，不得复制到消费者配置中。
- 页面组件根据传入实例的 `screen.stateId` 呈现该状态；不得把 `activePrototypeStateId` 作为页面内容的首要展示来源。
- 流程需要时引用同一 `stateId`。
- 状态级页面描述使用相同 scope。

#### 6.5.1 `screen.stateId` 与 `activePrototypeStateId`

两者用途不同：

| 值 | 含义 | 正确用途 |
| --- | --- | --- |
| `screen.stateId` | 当前这一张 `DisplayScreen` 页面实例要展示的状态 | 消费者页面模板、计算属性、状态数据选择和状态级 UI |
| `activePrototypeStateId` | 当前交互页面在内核中的活动状态 | 没有 `screen` prop 的外围控制、当前协作 scope 或主动状态控制 |

交互模式通常只渲染当前页面，因此两个值看起来可能相同；全图模式会同时为同一页面生成多张不同 `stateId` 的卡片，流程模式也会按节点传入各自状态。此时如果业务组件读取全局 `activePrototypeStateId`，多张卡片会错误地显示成同一个状态。

状态页面使用以下模式：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { usePrototypeContext } from '@marktowin/prototype-core'
import type { DisplayScreen } from '@marktowin/prototype-core'

const props = defineProps<{ screen: DisplayScreen }>()
const { setPrototypeState } = usePrototypeContext()

const stateId = computed(() => props.screen.stateId ?? 'ready')
const isEmpty = computed(() => stateId.value === 'empty')

function showEmptyState() {
  setPrototypeState(props.screen.id, 'empty')
}
</script>

<template>
  <p v-if="isEmpty">暂无数据</p>
  <p v-else>正常内容</p>
  <button type="button" @click="showEmptyState">显示空状态</button>
</template>
```

禁止以下实现：

- 只在 `setup` 初始化时执行 `ref(props.screen.stateId === 'empty')`，后续状态切换不会自动同步。
- 仅在 `mode === 'overview'` 时读取 `screen.stateId`，导致交互模式的状态按钮只改变标签、不改变页面内容。
- 页面内容优先读取 Store，只有 Store 为空时才读取状态 ID，导致“空状态”仍显示真实数据。
- 为了展示评审状态而修改真实业务 Store、`localStorage` 或 `sessionStorage`。

当状态需要演示数据时，为各状态提供只读预览数据；非运行态的评审展示由当前页面实例的 `screen.stateId` 决定。真实业务流程可以通过显式的 `runtimeDriven`（或同义状态）暂时展示 Store 中的实时结果，但手动切换评审状态时必须退出运行态并恢复为 `screen.stateId` 驱动，不能让 Store 静默覆盖状态选择器。编辑、删除和确认操作必须明确区分“预览数据”与“真实草稿”。

#### 6.5.2 状态切换与长任务生命周期

内核当前使用包含 `screen.id` 和 `screen.stateId` 的 key 渲染页面实例。调用 `setPrototypeState` 后，消费者页面可能被卸载并重新创建；组件内的计时器、采样进度、Canvas 动画和局部 ref 不会自动延续。

- 纯展示状态可以直接调用 `setPrototypeState`。
- 采集、上传、轮询、倒计时等运行中阶段，如果任务依赖组件本地计时器，不要在每个中间阶段调用 `setPrototypeState`；先用页内 Vue 状态推进，任务结束并清理资源后再同步终态或跳转。
- 如果评审面板必须实时反映“进行中”状态，应把任务、时间基准和可恢复进度移到组件外的 Store 或独立 composable；组件重建后从外部状态恢复，而不是依赖旧实例继续运行。
- 页面离开、手动切换评审状态或重新测试时，必须停止旧任务。Canvas 不可用或绘制失败时，文字状态和业务判定仍应保留。

### 6.6 实现跳转

```vue
<script setup lang="ts">
import { usePrototypeContext } from '@marktowin/prototype-core'

const { go, goTab, setPrototypeState } = usePrototypeContext()

// go('detail')：跳转到已注册页面
// goTab('home')：按 Tab 语义切换到已注册页面
// setPrototypeState('empty')：切换当前页面状态
// setPrototypeState('detail', 'loading')：预设指定页面状态
</script>
```

- `go` 与 `goTab` 只接收已注册 ID。
- 当前不是 Vue Router，不假设 URL、历史栈、参数、守卫或文件路由。
- 流程节点不会自动生成点击逻辑；页面事件与流程数据必须分别实现并保持一致。
- `go/goTab` 修改当前页面，但不应被当作“自动退出全图/流程模式”的承诺。业务按钮以交互模式为主要运行环境；如果产品明确要求从其他模式触发业务跳转，应先显式切回 `interactive`，并回归状态面板、页面导航和业务按钮的点击层级。

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
- 每个状态切换后，手机内容、状态文案、按钮可用性和演示数据同步变化，而不只是状态按钮的选中样式变化。
- 页面根背景铺满预期画布，未出现重复内边距、异色直角贴边、局部背景断层或 TabBar 非等宽布局。
- 长任务可从开始推进到终态；状态切换、重新开始和页面离开后没有残留计时器、绘制任务或设备监听。
- 相关协作资源已按任务要求完成本地与远端验证。

## 7. 核心操作规范

### 7.1 新增或修改状态

标准动作：确认状态语义 → 注册 ID → 补双语标签 → 使用 `screen.stateId` 实现响应式展示 → 隔离预览与真实数据 → 更新跳转/流程 → 补状态描述 → 回归连续切换和组件重建。

禁止：只在组件中写字符串状态、只改 UI 不注册、复用含义不同的旧状态 ID、只改变状态按钮选中态而不改变页面内容、用评审状态覆盖真实业务缓存。

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
await window.__PROTOTYPE_CORE__.syncPageDescriptionsFromJson({ scopeIds: ['<scopeId>'] })
```

不传 `scopeIds` 时会检查 JSON 中的全部 scope，但只写入远端缺失或内容发生变化的项。每项写入前读取最新 SHA，Scope 写入并回读成功后才合并 manifest。返回值分别列出成功、跳过和失败 Scope；单项失败不会中止后续项，存在 `failedScopes` 时不得宣称同步完成。

需要在终端执行时，使用包提供的 `prototype-core-sync-page-descriptions` 命令并显式传入 owner、repo、projectId、codeBranch 和目标 scope。Token 只允许通过 `AGENT_GITEE_ACCESS_TOKEN` 或 `GITEE_TOKEN` 提供；命令会精确回读 Scope 与 manifest，失败时以非零状态退出。

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

### 7.5 测试用例

- 通过 `#/test-cases` 进入独立工作台；打开时默认定位当前页面和状态。
- 固定业务字段为：所属模块、测试项、测试要点、前置条件、测试步骤、预期结果、实际结果。没有真实执行证据时，实际结果保持“未执行”。
- 新增、编辑和删除都以单条用例显式保存；启用远端时必须回读 `test-cases/<scopeId>.json` 并合并更新 `test-cases/manifest.json`。冲突时停止，不用本地内容静默覆盖远端。
- Gitee 不可写时只保存为本地 `pending` 缓存，并明确报告“尚未同步”。
- JSON 与 Excel 都是整体导出；远端协作启用时，内核按 manifest 读取全部 scope，任何 scope 失败都会中止导出。导出文件不代表消费者种子或 Gitee 已更新。
- 页面或状态被删除后，历史用例不会自动删除；工作台会以未知页面/状态保留，后续迁移或删除需单独确认。

### 7.6 Bug 与附件

- Bug 真值位于 `bugs/bugs.json`，以远端当前数组为基础执行变换后写回。
- 图片先上传 OSS，Bug 数据只保存 URL、objectKey 和元数据。
- Gitee/OSS 不可用时必须明确当前是否只保存在本地；不得把本地缓存称为团队已同步。
- 删除 Bug、替换附件或清理 OSS 对象前说明不可逆影响。

### 7.7 初始化与迁移

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
  versionUpdate: {
    currentVersion: __BUSINESS_APP_VERSION__,
    builtAt: __BUSINESS_APP_BUILT_AT__,
  },
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
| `versionUpdate` | 当前页面版本与 `version.json.version` 来自同一次构建；旧窗口能发现新版本；刷新后不重复提示 |

### 8.4 业务版本注册与升级通知

当用户提到“业务升级通知、版本推送、提醒旧窗口刷新、`version.json`”时，业务侧 AI 必须检查并补齐本节。该机制是静态部署友好的轮询通知：每个窗口启动时、固定间隔以及页面恢复可见时读取版本清单；一个窗口发现更新后通过 `BroadcastChannel` 通知同源其他窗口。它不要求业务服务维护 WebSocket。

#### 首次注册

消费者构建必须生成一次唯一版本指纹，并把同一个值同时注入运行页面和 `version.json`。禁止分别调用两次 `Date.now()`。可在消费者 `vite.config.ts` 中使用以下模式，已有构建插件时按现有结构合并，不要机械覆盖：

```ts
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const builtAt = new Date().toISOString()
const commitHash = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'nogit'
  }
})()
const appVersion = process.env.BUILD_VERSION?.trim() || `${commitHash}-${builtAt}`
const versionManifest = JSON.stringify({ version: appVersion, builtAt }, null, 2)

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'prototype-version-manifest',
      configureServer(server) {
        server.middlewares.use('/version.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json;charset=UTF-8')
          response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          response.end(versionManifest)
        })
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: versionManifest })
      },
    },
  ],
  define: {
    __BUSINESS_APP_VERSION__: JSON.stringify(appVersion),
    __BUSINESS_APP_BUILT_AT__: JSON.stringify(builtAt),
  },
})
```

在消费者 `src/vite-env.d.ts` 声明构建常量：

```ts
/// <reference types="vite/client" />

declare const __BUSINESS_APP_VERSION__: string
declare const __BUSINESS_APP_BUILT_AT__: string
```

入口注册：

```ts
const runtimeConfig: PrototypeRuntimeConfig = {
  versionUpdate: {
    currentVersion: __BUSINESS_APP_VERSION__,
    builtAt: __BUSINESS_APP_BUILT_AT__,
    // manifestUrl: '/version.json', // 默认按 runtimeConfig.baseUrl 解析
    // intervalMs: 60_000,           // 最小 10 秒，默认 60 秒
  },
}
```

未注册 `currentVersion` 时，内核会关闭业务版本检测，不请求无意义的清单。`BUILD_VERSION` 建议由 CI 提供；没有 CI 构建号时才回退到 commit 与构建时间组合。同一 commit 重新部署也需要通知时，版本指纹必须包含构建号或构建时间。

#### 每次业务发布

首次接入完成后，不需要在内核手工登记更新内容。业务侧 AI 只需执行消费者已有构建与部署流程，并确认：

1. 新构建产物中的页面当前版本与 `dist/version.json.version` 完全相同。
2. 先上传带内容 hash 的 JS/CSS/图片，再发布 `index.html`，最后发布 `version.json`。
3. `version.json` 使用 `Cache-Control: no-cache, no-store, must-revalidate`。
4. `index.html` 禁止长期缓存或要求每次重新验证；带 hash 的静态资源可长期 `immutable`。
5. CDN 不得缓存旧 `version.json`；必要时在发布后单独刷新该路径。

#### 完成判定

- 旧窗口保持打开，部署新构建后能在轮询周期内出现刷新提示。
- 同源其他窗口能通过广播同步出现提示；不同浏览器或设备分别通过轮询发现。
- 页面从后台恢复可见时立即检查一次。
- 点击刷新后加载新版本，不再次提示同一版本。
- 关闭提示后只忽略当前远端版本；下一次新版本仍会提示。
- 清单 404、超时或格式错误只记录日志，不阻断原型主流程。
- 子路径部署时，实际请求地址位于 `runtimeConfig.baseUrl` 下，或由 `manifestUrl` 明确覆盖。

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
- localStorage：按域名和协作上下文隔离；页面描述、注释与测试用例按 scope 保存独立 revision，流程与 Bug 按整文件保存。缓存状态区分 `synced/pending/stale/error`。
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
- 页面描述、注释和测试用例 scope 引用合法。

### 11.2 项目命令

按消费者 `package.json` 的真实脚本执行，通常包括类型检查、项目校验、远端校验和构建。不得发明不存在的命令。

### 11.3 运行时回归

- 交互模式：点击、输入、弹窗、跳转、Tab、状态切换；逐个状态确认页面内容确实变化，不能只看状态按钮是否选中。
- 全图模式：所有页面和状态可见，每张卡片按自身 `screen.stateId` 独立渲染，缩放与布局正常。
- 流程模式：节点、顺序、分支与页面实现一致；同一页面的不同流程状态不得显示成同一内容。
- 批注模式：任意位置可落点，交互组件不会抢占标注点击。
- 演示模式：移动端保持基准比例整体缩放。
- 动态任务：采集、上传、轮询、倒计时和 Canvas 动画能完整到达终态；重新开始、切换状态和离开页面后旧任务停止。
- 移动端视觉：在基准画布和窄屏检查根背景、有效内容宽度、滚动、键盘、固定底栏、圆角过渡和触控热区；展开的内核面板不得遮挡状态按钮或页面导航。
- 协作工具：注释、页面描述、测试用例和流程的读、写、冲突、失败降级和轮询行为符合预期。

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
测试用例：本地完成；Gitee 已同步 / 未授权 / 失败；整体导出已验证 / 未验证
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
- [ ] 状态页面以响应式 `screen.stateId` 渲染；全图和流程中的同页多状态可以同时显示不同内容。
- [ ] 页面 UI 方案已确认，页内与跨页交互均实现。
- [ ] 页面根背景、有效内容宽度、内边距、圆角和 TabBar 分栏已在基准画布及窄屏验证。
- [ ] 状态预览不污染真实缓存；长任务在组件重建、重新开始和页面离开后可以正确继续或清理。
- [ ] 页面/状态描述与真实实现一致。
- [ ] 测试用例按页面/状态 scope 维护，远端真值和整体导出范围已核对。
- [ ] 本地种子、缓存和 Gitee 真值的状态已区分报告。
- [ ] 交互、全图、流程、批注和演示模式均按影响范围回归。
- [ ] 启用的认证、协作、OSS、工具和部署检查逐项验证。
- [ ] 已注册业务构建版本，页面版本与 `version.json` 一致，旧窗口升级提示已验证。
- [ ] 消费者类型检查、校验和构建通过。
- [ ] 仓库不包含意外 Secret、构建产物、日志或无关改动。
- [ ] 交付报告明确列出所有未完成与未验证项。
