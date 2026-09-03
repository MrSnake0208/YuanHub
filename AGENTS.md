# AGENTS.md — MaaYuan Share（YuanHub）

本仓库是 **MaaYuan Share 作业分享站**（Vue 3 + Vite + vue-router 4）的复刻/自建实现。

本仓库必须能够在被单独 clone 后独立开发，因此所有开发必需规范均以仓库内文件为准，不依赖父目录或外部工作区文件。

## 权威规范

任何新增或修改页面、组件、样式、配色、视觉元素前，必须先读取并遵守：

1. 前端设计规范：`docs/standards/design-system.md`
2. 页面开发流程：`docs/standards/page-development.md`
3. 功能开关发布规则：`docs/standards/feature-flags.md`

以上规范是详细规则的唯一权威来源。`AGENTS.md` 只保留必须首先看到的硬约束摘要；详细色板、字体、组件、页面流程与功能开关规则不要在这里重复维护。

## 关键硬约束

- 页面统一放在 `src/pages/<模块>/` 下，新页面必须在 `src/router/routes.js` 注册。
- `src/router/index.js` 只负责创建路由实例并导入 `routes`，不要另建第二套路由注册体系。
- 新增页面、组件或视觉样式前必须读取 `docs/standards/design-system.md`。
- 禁止使用纯黑、黑底黄字、荧光黄大标题块，以及大面积 `brand-blue` 填充。
- 标题体系使用设计规范指定的宋体方向；正文保持项目既有中文无衬线字体体系；数字按规范使用 Archivo。
- 页面必须保留 MaaYuan 的暖色纸张背景体系和 `/maayuan/maayuan-pattern.webp` 吉祥物背景，不得在无明确设计变更要求时移除。
- 运行时资源必须来自本仓库 `public/`，不要依赖仓库外的图片、原型目录或绝对路径。
- 延后开放的前端功能必须注册到 `src/config/features.js`，生产构建默认关闭，并通过 `FEATURE_KEYS` 与 `isFeatureEnabled` 接入。
- 该功能开关是构建时的前端展示控制，不是认证或安全边界；后端限制必须单独实现。

## 设计资源约定

运行时资源以本仓库以下目录为准：

- 吉祥物 / 共建方图标：`public/icons/`
- MaaYuan 背景图：`public/maayuan/maayuan-pattern.webp`

历史原型名称（如 `index.html`、`detail.html`）可能仍出现在 README、注释或数据说明中，它们只表示设计来源，不代表运行时依赖。

## 改动前自查

- [ ] 已读取 `docs/standards/design-system.md`
- [ ] 涉及页面新增或路由调整时已读取 `docs/standards/page-development.md`
- [ ] 新页面位于 `src/pages/<模块>/` 并注册到 `src/router/routes.js`
- [ ] 未引入第二套设计规范或重复路由体系
- [ ] 未违反纯黑 / 黑底黄字 / 大面积蓝色等设计禁令
- [ ] 背景与吉祥物资源仍来自本仓库 `public/`
- [ ] 没有新增指向父目录、个人绝对路径或其他本地工作区的开发依赖
