# 双 BOX 弹窗视觉还原与人工验收

本轮以用户提供的第二张合成图中的卡片和步骤结构为主，第一张图中的奶油色及紧凑信息密度为补充。背景、宣传文字、扫码和最近访问不在范围内。风险等级 L2：调整局部弹窗 DOM、响应式排列和展示状态，不改变业务控制器、路由或 API。

## 实现计划与边界

1. 梳理模板、作用域和真实调用方，对照目标图明确结构差异。
2. 在 `AccountShareManager` 的 compact 模式内重建权限卡、链接卡；在弹窗宿主内重建隐私卡和独立底栏。
3. 在 `OperatorShareContent` 的 embedded 模式内补齐输入步骤、公开内容步骤和空状态；复用现有查询及只读结果。
4. 使用命名容器查询处理窄屏排列，保留移动全屏、Visual Viewport、焦点与滚动恢复机制。
5. 更新组件测试，执行受影响组件及公开路由的非浏览器测试、定向 SFC/CSS 编译和 diff 检查。真实视觉由用户验收。

调用范围：`OperatorShareManager` 使用 compact 管理器；星石页 `src/pages/star/index.vue` 使用普通管理器。`OperatorBoxViewer` 使用 embedded 查看组件；公开分享页 `src/pages/operator/share.vue` 使用普通查看组件。新增外观限定在 compact/embedded 模式，没有新增配置、依赖、导出或业务 fixture。

## 可观察差异与实现对照

| 目标图设计点 | 修改前实际代码 | 本轮实现及选择器 | 非浏览器验证与限制 |
| --- | --- | --- | --- |
| 分享：紧凑标题、账号副标题、右上关闭 | 宿主已有结构，20px 标题、20px 水平边距 | `OperatorShareManager.vue`、`operatorShareManagerDesktop.css`：780px 弹窗、22px 标题、24px 水平边距、14px 圆角 | SFC/CSS 编译；居中与实际字体待人工验收 |
| 分享：状态点、状态标题、独立说明 | `.share-summary` 横向 flex，说明可能与状态同排 | `AccountShareManager.vue`：`.is-compact .share-summary` 改为 grid，绿色状态点、下行说明；`.share-overview` 加细分隔线 | 组件测试确认状态与说明；实际密度待人工验收 |
| 分享：带图标的双权限卡 | `.share-scope` 只有文字、状态和开关 | `.share-scope-icon` 使用 Users/Gem；`.share-scope-copy` 包含功能说明和真实状态；宽容器双列，窄容器单列 | 测试确认类型说明、状态、开关、独立更新和普通模式保护 |
| 分享：上名称、下链接、右侧小操作 | `.share-values label` 宽屏使用 `max-content minmax(0,1fr)` 横排 | `.is-compact .share-values` 为紧凑奶油色卡片；label 固定上下排、readonly 输入去边框、右侧复制/访问 | 测试确认完整 URL、全选、复制回退与真实访问地址；像素溢出待人工验收 |
| 分享：整行隐私折叠卡 | `.operator-share-help summary` 为原生三角及文字 | `.operator-share-privacy`：ShieldCheck、标题与摘要、ChevronDown、背景边框；marker 隐藏、hover/focus/open 状态 | 测试确认摘要、完整隐私内容及默认折叠；箭头绘制待人工验收 |
| 分享：底部管理操作 | 管理折叠卡接在正文末尾，与正文一起滚动 | `OperatorShareManager.vue`：`.operator-share-footer` 独立于滚动正文，左侧直接显示重新生成/全部撤销，右侧关闭；通过 management 插槽复用原操作和确认流程 | 测试确认按钮位于 footer、正文内无管理按钮、Tab约束、底部关闭、确认取消及确认中账号切换 |
| 查看：标题、副标题、右上关闭 | 已有标题结构，输入弹窗640px | `OperatorBoxViewer.vue`：660px、22px 标题、24px 水平边距、14px 圆角，结果扩宽机制保留 | 关闭/焦点/滚动恢复组件测试；真实居中待人工验收 |
| 查看：第一步和同行输入操作 | `.share-entry label` 无编号，按钮无图标 | `OperatorShareContent.vue`：`.box-step-title`、`.box-step-number`；Search 图标；`box-content` 容器宽度至少480px时同行 | 三个模拟宽度下验证输入和查询；jsdom 不计算像素布局 |
| 查看：第二步和输入前空状态 | 无第二步或空状态 | `.box-preview`、`.box-preview-empty`、`.box-preview-art`：BookUser/Search 装饰及引导；查询后原区域显示结果步骤与已有只读列表 | 测试确认空状态→结果→重新输入，保留筛选/刷新/异常 |
| 查看：奶油色提示卡 | `.share-entry-notice` 为普通段落 | `.share-entry-notice`：ShieldCheck、公开访问说明与只读保护提示 | 测试确认文案及只读查询边界；对比度待人工验收 |

## 样式链路检查

- 分享宿主样式只负责宿主和其拥有的插槽 DOM；管理器内部在自己的 scoped 样式中实现，避免宿主选择器跨组件失效。
- 原生 details 保留键盘与隐藏内容语义；隐私卡及共享管理器默认折叠入口的 summary 同时处理 `list-style`、`::marker`、`::-webkit-details-marker`，并为 `[open]` 旋转各自箭头。
- 管理器原容器查询仅在窄容器改变链接排布，宽屏反而保留名称/URL 横排。本轮默认上下层级，580px以上只增强外层卡片及权限卡的排列。
- 查看组件先加载页面级 Desktop/Mobile 样式，末尾 embedded scoped 规则负责弹窗外观。输入区改用 `box-content` 命名查询，避免匿名查询选择到更近的卡片容器。密探卡片内部 DOM 和卡片样式不变。
- 全站 `main.css` 的 iOS 输入最小16px规则继续生效，未通过局部规则抵消。真实 iOS 下链接摘要可能比桌面更早截断，仍保留完整值和复制操作。

## 最小非浏览器验证

```sh
cd /Users/snake/Desktop/YuanHub-All/YuanHub
npx --no-install vitest run behavior/operatorShareManager.spec.js behavior/operatorShareModal.spec.js behavior/operatorBoxViewer.spec.js behavior/operatorSharePage.spec.js behavior/starSharePage.spec.js
```

这些测试使用 mock API 和 jsdom；不访问真实业务服务，也不能证明视觉布局。没有运行全量测试、生产 build 或浏览器自动化。

上一轮执行结果：上列5个测试文件、83项测试全部通过。另对4个受影响 SFC 的脚本、模板和21个样式块（含外部 CSS）进行定向编译，全部通过；编译产物保留 scoped marker 隐藏选择器和命名容器查询。`git diff --check` 通过。本次底栏修正重新执行 `npx --no-install vitest run behavior/operatorShareModal.spec.js behavior/operatorShareManager.spec.js`，2个测试文件、30项全部通过；2个受影响 SFC 及4个样式块定向编译通过。下一步为下列人工验收。

## 人工验收

1. **桌面1440px**：从密探名册打开分享，检查780px居中面板、标题/账号上下排、双权限卡、两张等高链接卡；展开隐私，确认整行可点击、无原生三角、箭头反向；滚动正文，确认底栏按钮保持可见，底部关闭可用且Tab焦点受限于弹窗。
2. **桌面查询**：打开查看他人 BOX，检查660px居中面板、两步标题、同行输入按钮、装饰空状态和提示卡；输入有效分享码后确认空状态切换为原只读卡片，搜索、筛选、刷新、失效码和重新输入仍可用。
3. **中间宽度768px及640/641px边界**：检查权限卡、链接操作与输入行随可用空间重排，内容没有水平溢出，切换前后输入和状态不丢失。
4. **手机390px，补看320px及横屏**：检查全屏、单列权限卡、复制/访问、长链接全选、底栏管理与关闭；弹出键盘后内容可滚动、焦点不被遮住、安全区域正常。
5. **数据和宿主保护**：切换账号确认链接归属；对真实重新生成/撤销仅在愿意让旧链接失效时确认。检查关闭后回到原页面、筛选与滚动保留、焦点回到入口；打开星石页普通分享管理和外部公开分享路由确认原展示可用。

仍可能与参考图不同：空状态采用已有 Lucide 图标组合而非侦探吉祥物；分享弹窗增加参考图中的底部关闭，查看弹窗仍仅保留右上关闭且不新增清空输入；权限卡把真实开关状态放在说明下方；字体、阴影、卡片实际高度及 iOS 键盘表现须人工确认，不宣称已达到设计图效果。
