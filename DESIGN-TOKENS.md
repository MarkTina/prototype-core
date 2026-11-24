# Design Tokens

本文件是 `DESIGN.md` 的实现索引。`DESIGN.md` 保持为设计系统事实来源；本文件记录内核和消费者原型页面在编码时应优先使用的变量名及相关实现约束。

## 使用规则

- 新增 UI 时先查本文件和 `DESIGN.md`，已有 token 能表达的颜色、字体、圆角、间距和阴影不得无理由硬编码。
- 消费者使用公开主题变量 `--ds-*`；历史 `--color-*` 保留作兼容，两者的推荐替代关系不代表各预设下的值始终相等。
- `--pc-*` 是内核工作台私有变量，不是消费者主题接口。业务页面不应读写这些变量，内核也不强制扫描或改写消费者业务代码。
- 无法用现有 token 表达的新设计值，应先补充本文件，再进入实现。

## 工作台主题面板

- 从右上角「主题切换」进入；主题准则通过面板内的书本按钮打开（`#/prototype-core-theme`）。面板限宽，在空间不足时配置项改为单列，内容在面板内纵向滚动。
- 「导出主题」保存浏览器中维护的自定义主题配置（v2 JSON），并非当前选中预设的快照。「导入主题」读取内核识别的字段并切到「自定义」，兼容旧版 `colors` 字段。

## 内核工作台角色（内部）

`src/workbench/workbench.css` 集中声明 `--pc-*`，仅由内核工具使用。默认预设映射为「纸面」；现有 `spotify` 深色预设映射为「沉墨」；其他预设及自定义从现有 `--ds-color-*` 映射主要表面、文字和操作色。消费者画布仍读取原有主题，现有主题 JSON、ID、浏览器记忆和 `--color-*` 保持兼容。不要把 Open Artifact 的十六进制值直接写入接收 RGB 通道的运行时变量。

| 角色 | 变量 | 使用范围 |
| --- | --- | --- |
| 工作区与界面 | `--pc-canvas`、`--pc-panel`、`--pc-quiet`、`--pc-rail` | 画布、面板、表头、全局横梁 |
| 操作及反馈 | `--pc-action`、`--pc-on-action`、`--pc-hover`、`--pc-selected`、`--pc-focus` | 主按钮、选择、悬停、焦点 |
| 协作状态 | `--pc-success`、`--pc-warning`、`--pc-danger` 及其 `-bg` | 已同步、待处理、失败；配合可见文字 |
| 密度 | `--pc-control`、`--pc-row`、`--pc-body-size`、`--pc-table-size`、`--pc-meta-size` | 桌面控件、表格行、正文、表格和元信息 |
| 层级 | `--pc-r-control`、`--pc-r-panel`、`--pc-r-pill`、`--pc-shadow` | 控件、浮层、状态标签、浮层阴影 |
| 工作区尺寸 | `--pc-record-max`、`--pc-record-gutter`、`--pc-bug-detail-w`、`--pc-footer-popover-w`、`--pc-theme-popover-w` | Bug 与用例的居中限宽和页边距、Bug 详情宽度、底栏和主题浮层宽度上限 |

## 图标实现约束

- 消费者新增或替换的常规 UI 图标统一使用 Iconify，默认 `lucide` 图标集；用 `@iconify/vue` 配合 `@iconify-icons/lucide` 单图标本地导入并按需打包，不默认在线加载或整库注册。
- 禁止为常规图标手写 SVG 路径、CSS 拼图、Canvas，或用 Emoji、Unicode 字符替代；品牌 Logo、产品专属插画和业务图表使用提供的素材或专项实现，缺少资源时说明缺口，不自行仿画。
- 单色图标继承 `currentColor`，通过父级或图标 class 的 `color` 使用颜色表中的 token；图标尺寸与至少 `44 × 44px` 的按钮热区分别设置，仅图标按钮有可访问名称，装饰性图标设 `aria-hidden="true"`。
- `pages[].icon` 仍接收 Vue 组件；消费者封装必须透传 `class`、`style`、`width`、`height` 和 `aria-*`，允许导航及 TabBar 控制尺寸与颜色。
- 完整安装与组件示例见 `AI-PROTOTYPE-GUIDE.md` 第 6.3.1 节，也可从 `#/prototype-core-help` 读取。内核现有 Lucide 实现及必需的 `@lucide/vue` peer dependency 保留，不要求迁移历史页面。

## 颜色

下表十六进制是设计基线参考，不保证等于任一运行时预设的实际值。运行时 `--ds-color-*` 和 `--color-*` 保存 RGB 通道，CSS 写作 `rgb(var(--ds-color-primary))`，需要透明度时可用 `rgb(var(--ds-color-primary) / 12%)`。

| Token | 基线参考 | 用途 |
| --- | --- | --- |
| `--ds-color-primary` | `#0066cc` | 主操作、链接、焦点根色 |
| `--ds-color-primary-focus` | `#0071e3` | 键盘焦点和选中边框 |
| `--ds-color-primary-on-dark` | `#2997ff` | 深色背景上的链接 |
| `--ds-color-canvas` | `#ffffff` | 主页面画布 |
| `--ds-color-canvas-parchment` | `#f5f5f7` | 浅灰分区、页脚和默认背景 |
| `--ds-color-surface-pearl` | `#fafafc` | 次级胶囊按钮、浅色控件填充 |
| `--ds-color-surface-tile-1` | `#272729` | 深色主分区 |
| `--ds-color-surface-tile-2` | `#2a2a2c` | 相邻深色分区微差 |
| `--ds-color-surface-tile-3` | `#252527` | 深色底部分区和播放器背景 |
| `--ds-color-surface-black` | `#000000` | 真黑导航、视频背景 |
| `--ds-color-surface-chip-translucent` | `#d2d2d7` | 图片上方半透明圆形控件基色 |
| `--ds-color-ink` | `#1d1d1f` | 浅色背景标题和正文 |
| `--ds-color-body` | `#1d1d1f` | 默认正文 |
| `--ds-color-body-on-dark` | `#ffffff` | 深色背景正文 |
| `--ds-color-body-muted` | `#cccccc` | 深色背景次级正文 |
| `--ds-color-ink-muted-80` | `#333333` | 浅色次级文字 |
| `--ds-color-ink-muted-48` | `#7a7a7a` | 禁用和法律说明 |
| `--ds-color-divider-soft` | `#f0f0f0` | 柔和分隔线、按钮软边 |
| `--ds-color-hairline` | `#e0e0e0` | 1px 卡片边框 |
| `--ds-color-success` | `#22c55e` | 成功状态 |
| `--ds-color-warning` | `#f59e0b` | 警告状态 |
| `--ds-color-danger` | `#c93c37` | 危险和错误状态 |

## 字体

| Token | 默认值 | 用途 |
| --- | --- | --- |
| `--ds-font-display-family` | `SF Pro Display, system-ui, -apple-system, sans-serif` | 标题和展示文字 |
| `--ds-font-body-family` | `SF Pro Text, system-ui, -apple-system, sans-serif` | 正文、按钮、表单 |
| `--ds-font-hero-size` | `56px` | Hero 标题 |
| `--ds-font-display-lg-size` | `40px` | 产品分区标题 |
| `--ds-font-display-md-size` | `34px` | 小型标题 |
| `--ds-font-lead-size` | `28px` | 大号说明文字 |
| `--ds-font-body-size` | `17px` | 默认正文 |
| `--ds-font-caption-size` | `14px` | 次级说明和按钮 |
| `--ds-font-fine-print-size` | `12px` | 页脚和法律说明 |
| `--ds-font-display-weight` | `600` | 标题字重 |
| `--ds-font-body-weight` | `400` | 正文字重 |
| `--ds-font-light-weight` | `300` | 少量轻盈大字号文本 |
| `--ds-font-body-line-height` | `1.47` | 正文行高 |

## 圆角、间距和阴影

| Token | 默认值 | 用途 |
| --- | --- | --- |
| `--ds-rounded-none` | `0px` | 全幅分区 |
| `--ds-rounded-xs` | `5px` | 极小芯片 |
| `--ds-rounded-sm` | `8px` | 紧凑按钮、内嵌图片 |
| `--ds-rounded-md` | `11px` | 次级胶囊按钮 |
| `--ds-rounded-lg` | `18px` | 卡片、网格容器 |
| `--ds-rounded-pill` | `9999px` | 主按钮、搜索框、可点击胶囊 |
| `--ds-spacing-xs` | `8px` | 紧凑间距 |
| `--ds-spacing-sm` | `12px` | 小间距 |
| `--ds-spacing-md` | `17px` | 正文节奏 |
| `--ds-spacing-lg` | `24px` | 卡片内边距 |
| `--ds-spacing-xl` | `32px` | 大间距 |
| `--ds-spacing-section` | `80px` | 分区上下留白 |
| `--ds-shadow-product` | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0` | 仅用于产品图片 |
| `--ds-shadow-soft` | `0 16px 40px rgba(17, 24, 39, 0.08)` | 内核现有轻量浮层兼容 |

## 兼容映射

| 历史变量 | 推荐新变量 | 当前用途 |
| --- | --- | --- |
| `--color-ocean` | `--ds-color-primary` | 主操作、焦点、强调 |
| `--color-ink` | `--ds-color-ink` | 主要文字 |
| `--color-muted` | `--ds-color-ink-muted-48` | 次级文字 |
| `--color-line` | `--ds-color-hairline` | 边框 |
| `--color-canvas` | `--ds-color-canvas-parchment` | 内核页面背景 |
| `--color-soft` | `--ds-color-surface-pearl` | 控件浅底 |
| `--color-panel` | `--ds-color-canvas` | 面板 |
| `--color-dark` | `--ds-color-surface-tile-3` | 深色块 |
| `--color-device` | `--ds-color-ink` | 设备边框 |
| `--color-head` | `--ds-color-canvas-parchment` | 顶部浅底 |
