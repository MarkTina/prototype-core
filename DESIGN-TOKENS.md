# Design Tokens

本文件是 `DESIGN.md` 的实现索引。`DESIGN.md` 保持为设计系统事实来源；本文件只记录内核和消费者原型页面在编码时应优先使用的变量名。

## 使用规则

- 新增 UI 时先查本文件和 `DESIGN.md`，已有 token 能表达的颜色、字体、圆角、间距和阴影不得无理由硬编码。
- 内核运行时主题变量统一使用 `--ds-*`；历史 `--color-*` 变量继续保留为兼容别名。
- 消费者页面也应优先使用这些 token，但内核不强制扫描或改写消费者业务代码。
- 无法用现有 token 表达的新设计值，应先补充本文件，再进入实现。

## 颜色

| Token | 默认值 | 用途 |
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
