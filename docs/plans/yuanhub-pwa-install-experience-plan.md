# YuanHub「添加到桌面 / PWA」体验实施规划

> 状态：P0 / P1 核心实施完成，等待 Android / iPhone 真机最终验收  
> 目标：在不改变 YuanHub 现有 Vue 3 + Vite 架构的前提下，为手机端补齐类似 `v.buguoguo.cn` 的「可安装 PWA + 主动安装提示 + Android 原生安装 + iOS 教程兜底 + 独立窗口运行」完整体验。  
> 原则：复用其产品逻辑，不复制其视觉、代码或品牌表达；YuanHub 继续遵守暖纸本、书卷气、社区共建的视觉系统。

---

## 0. 实施进度（2026-09-09）

已完成：

- [x] `vite-plugin-pwa`、Manifest、Service Worker
- [x] 192 / 512 / maskable / Apple Touch Icon
- [x] Android Chromium `beforeinstallprompt` 一键安装链路
- [x] iPhone / iPad 手动“添加到主屏幕”引导
- [x] 全局手机端底部安装浮层
- [x] 关闭后 7 天冷却
- [x] standalone / 已安装状态判断
- [x] `/install` Android / iPhone 教程页
- [x] 手机导航长期“桌面”入口
- [x] PWA 专项单元测试与生产构建
- [x] Chrome 390×844 Android / iPhone UA 浏览器验证

仍需发布前人工完成：

- [ ] Android Chrome 真机点击“立即添加”并确认桌面图标、独立窗口
- [ ] iPhone Safari 真机执行“分享 → 添加到主屏幕”并确认独立窗口

本轮未扩展 P2 离线增强、业务数据缓存或离线同步；这些不属于“添加到桌面”核心范围。

---

## 1. 结论先行

YuanHub 建议做成完整的 PWA 安装体验，而不是只增加一个「添加到桌面」教程链接。

最终用户体验应包含四层：

1. **PWA 基础能力**：Web App Manifest、应用图标、theme color、standalone display、Service Worker。
2. **手机端主动提示**：首次满足条件时，在页面底部出现 YuanHub 风格的「添加到桌面」浮层。
3. **平台适配安装动作**：
   - Android / Chromium：点击「立即添加」直接调用浏览器原生安装弹窗。
   - iPhone / iPad：不能程序化拉起安装弹窗，改为展示 Safari「分享 → 添加到主屏幕」操作说明。
   - 其他浏览器：提供浏览器菜单安装说明和完整教程入口。
4. **独立教程页**：新增 `/install` 页面，作为任何自动安装失败、浏览器不支持或用户主动查看说明时的可靠兜底。

不建议第一版就追求「全站完全离线可用」。YuanHub 有登录态、动态库存、密探数据、后台管理等能力，第一阶段只需要做到 **可安装 + 静态壳层可靠缓存**，不要把 API 响应和用户数据默认缓存进 Service Worker。

---

## 2. 参考站实际调研结果

2026-09-09 已使用真实 Chrome 页面和 390 × 844 手机视口检查 `v.buguoguo.cn`。

参考站当前实现包含：

- `<link rel="manifest" href="/manifest.webmanifest">`
- `apple-touch-icon`
- PWA 应用图标
- 手机端固定底部安装提示
- 「立即添加」按钮
- 「查看详细教程」入口
- `/install/` 独立教程页
- Android / iPhone / iPad 分平台教程
- Android 支持页面内直接触发浏览器安装
- 关闭安装提示后 7 天内不再显示
- 安装后从桌面图标进入，并以独立窗口运行
- 移动端导航和页脚还保留「添加到桌面」长期入口

参考站的核心产品思路值得复用：

> **主动发现 → 一键安装 → 教程兜底 → 长期入口**

YuanHub 不复制参考站的红黑科技视觉；对应视觉应完全改为 YuanHub 现有设计系统。

---

## 3. YuanHub 当前状态审计

当前仓库：

```text
/Users/mrsnake/Desktop/yituliu/YuanHub
```

技术栈：

```text
Vue 3
Vite 6
vue-router 4
```

当前已经具备：

- `index.html` 已设置 `viewport-fit=cover`
- 已有 `theme-color = #F6EDD0`
- 已有移动端适配基础
- 已使用 `createWebHistory()`
- 全局应用根组件为 `src/App.vue`
- 应用入口为 `src/main.js`
- 路由统一维护在 `src/router/routes.js`
- 全站设计规范为 `docs/standards/design-system.md`

当前缺少：

- Web App Manifest
- PWA 图标体系
- Apple Touch Icon
- Service Worker
- Service Worker 注册
- `beforeinstallprompt` 捕获与状态管理
- `appinstalled` 监听
- standalone 模式判断
- 安装提示组件
- `/install` 教程页
- 安装提示关闭状态记忆
- Android / iOS 分平台安装说明

因此当前应视为：

> **一个移动端适配良好的普通 SPA，但还不是完整可安装 PWA。**

---

# 4. 产品目标

## 4.1 必须达到

用户第一次使用手机打开 YuanHub 时，在合适条件下看到一个不打扰主操作的底部浮层：

```text
[ YuanHub 图标 ]  把 YuanHub 放到桌面
                 下次直接从桌面打开，查密探、库存和星石更方便。

[ 立即添加 / 查看添加方法 ]   [ 查看详细教程 ]
                                           ×
```

安装后：

- 桌面出现 YuanHub 图标。
- 点击图标直接进入 YuanHub。
- 使用独立窗口展示，不带普通浏览器地址栏。
- 登录态仍按现有 Web 登录机制工作。
- 已安装状态下不再展示安装浮层。

## 4.2 不做

第一阶段不要做：

- 把 YuanHub 包装成原生 APK / IPA。
- App Store / 应用商店发布。
- 强制用户安装。
- 首次加载立刻全屏弹窗。
- API 响应的激进离线缓存。
- 登录 token、账户数据、库存数据等写入 Service Worker Cache。
- 为 PWA 单独设计第二套暗色或科技风 UI。

---

# 5. 推荐的信息架构

建议由 4 个层次组成。

## 5.1 全局 PWA 状态层

新增：

```text
src/utils/pwaInstall.js
```

职责：

- 尽早监听 `beforeinstallprompt`
- 保存 deferred install prompt
- 监听 `appinstalled`
- 判断是否 standalone
- 判断 iOS / iPadOS
- 判断是否移动端环境
- 判断当前是否应显示安装提示
- 处理 7 天关闭状态
- 暴露安装动作给 Vue 组件

不要把安装逻辑散落到多个页面组件里。

建议状态模型：

```text
unsupported
manual
installable
installed
dismissed
ios
```

其中：

### `installable`

满足 Chromium `beforeinstallprompt` 条件，页面可以真正调用浏览器安装框。

### `ios`

iPhone / iPad Web 浏览器环境，需要走手动「添加到主屏幕」说明。

### `manual`

移动端浏览器但没有可用的 `beforeinstallprompt`，仍可通过浏览器菜单完成安装或快捷方式添加。

### `installed`

已在 standalone 模式中运行，或已收到 `appinstalled`。

### `dismissed`

用户主动关闭提示，且仍在冷却时间内。

---

## 5.2 全局手机端安装浮层

新增：

```text
src/components/MobileInstallPrompt.vue
```

建议挂在：

```text
src/App.vue
```

与：

```text
AccountEventToasts
AppDialog
```

同级，作为真正的全站组件。

这样无论用户从 `/operator`、`/inventory`、`/star` 或分享链接进入，都能获得一致安装体验。

### 显示条件

必须同时满足：

```text
是手机 / 平板环境
AND 未以 standalone 模式运行
AND 当前不在 7 天关闭冷却期
AND 当前环境存在可解释的安装路径
```

不要仅根据 viewport 宽度判断设备。

建议综合：

- `navigator.userAgent`
- `navigator.platform`
- touch points
- `matchMedia('(display-mode: standalone)')`
- `window.navigator.standalone`（iOS 兼容判断）
- `beforeinstallprompt` 是否实际发生

### 不显示情况

- 已安装并从桌面打开。
- 桌面普通浏览器访问。
- 用户 7 天内主动关闭。
- 页面正处于不适合遮挡的特殊全屏交互时，可后续增加临时隐藏机制。

---

## 5.3 独立教程页

新增：

```text
src/pages/install/index.vue
```

路由：

```text
/install
```

在 `src/router/routes.js` 注册：

```text
display: false
```

不要强行塞进现有顶部主导航。

长期入口可后续放到：

- 移动端侧栏 / 更多菜单
- 页脚「关于 / 帮助」区域
- 安装浮层中的「查看详细教程」

教程页建议自动识别平台并默认选择对应 Tab，同时允许手动切换：

```text
Android

iPhone / iPad

其他浏览器
```

---

## 5.4 Manifest + Service Worker

推荐引入：

```text
vite-plugin-pwa
```

而不是自行维护一套手写 Service Worker 注册和 manifest 注入流程。

原因：

- 与当前 Vite 6 架构契合。
- 可统一生成 manifest 与 service worker。
- 第一阶段使用 `generateSW` 足够。
- 后续若需要高级缓存再升级为 `injectManifest`。

第一版建议：

```text
strategies: generateSW
```

不要一开始直接上 `injectManifest`。

---

# 6. PWA Manifest 设计

建议 Manifest 核心信息：

```text
name: YuanHub · 鸢鸢相抱
short_name: YuanHub
start_url: /
scope: /
display: standalone
background_color: #F6EDD0
theme_color: #F6EDD0
lang: zh-CN
```

推荐：

```text
display_override:
  - window-controls-overlay
  - standalone
```

但 `standalone` 必须作为可靠兜底。

## 6.1 应用名称

桌面图标下建议优先显示：

```text
YuanHub
```

完整安装名称：

```text
YuanHub · 鸢鸢相抱
```

原因：手机桌面空间有限，中文全称过长会被系统截断。

---

# 7. PWA 图标策略

YuanHub 正式 Logo 当前尚未最终定稿，因此 **PWA 功能不应被 Logo 阻塞**。

第一版使用临时统一识别符号即可。

建议固定资产路径：

```text
public/pwa/icon-192.png
public/pwa/icon-512.png
public/pwa/icon-maskable-512.png
public/pwa/apple-touch-icon.png
```

可额外准备：

```text
public/pwa/favicon-32.png
public/pwa/favicon-16.png
```

设计要求：

- 使用当前「YuanHub 字标 + 临时识别符号」体系。
- 不使用参考站红底 V。
- 主背景优先纸张米色 / 茶褐 / 暖白。
- 保持高对比、小尺寸可识别。
- maskable 图标必须预留安全区。
- 正式 Logo 定稿后只替换同路径资源，不改变代码结构。

建议 manifest 同时配置：

```text
purpose: any
purpose: maskable
```

---

# 8. 手机安装浮层 UX

## 8.1 推荐视觉

参考目标站的结构，不参考它的颜色。

YuanHub 建议：

- 浮层：暖白 `#FFFDF6`
- 描边：茶棕低透明度或 `--line`
- 顶部小装饰：蜜金 / 金橙
- 标题：暖棕宋体
- 正文：墨褐
- 主按钮：茶棕底 + 奶油字
- 次按钮：暖白 / 米纸底 + 茶棕描边
- 关闭按钮：右上角轻量 ×
- 图标：52px 左右
- 圆角与现有 YuanHub 卡片一致
- 阴影柔和，不使用黑色重阴影
- 底部考虑 `env(safe-area-inset-bottom)`

建议定位：

```css
position: fixed;
left: 12px;
right: 12px;
bottom: max(12px, env(safe-area-inset-bottom));
z-index: 全局浮层层级但低于 AppDialog；
```

最大宽度：

```text
520px
```

大屏手机 / 平板居中。

---

## 8.2 推荐文案

### 标题

```text
把 YuanHub 放到桌面
```

比单纯「添加到桌面」更自然，也更有品牌识别。

### 正文

推荐：

```text
下次直接从桌面打开，查密探、库存和星石更方便。
```

如果希望更克制：

```text
添加后可从桌面直接打开 YuanHub，并以独立窗口使用。
```

第一版推荐使用第二句，信息最准确。

---

## 8.3 Android / Chromium 按钮

当捕获到 `beforeinstallprompt`：

```text
[ 立即添加 ] [ 查看详细教程 ]
```

点击「立即添加」：

1. 调用保存的 install prompt `prompt()`。
2. 等待用户选择。
3. accepted：隐藏安装浮层。
4. dismissed：本次隐藏；是否立即进入 7 天冷却可根据产品策略决定。

推荐：

- 点击右上角 × → 7 天冷却。
- 系统安装框点取消 → 仅本次会话不再主动弹，不直接记 7 天。

这样不会因为用户误触「立即添加」后取消而一周无法再看到入口。

---

## 8.4 iPhone / iPad 按钮

iOS 不支持通过 `beforeinstallprompt` 由网页直接调起 PWA 安装，因此不要显示假的「立即添加」。

推荐：

```text
[ 查看添加方法 ] [ 详细教程 ]
```

点击「查看添加方法」后，在当前浮层展开简版 3 步说明：

```text
1. 点击 Safari 底部 / 顶部的「分享」
2. 选择「添加到主屏幕」
3. 点击右上角「添加」
```

如果当前不是 Safari：

```text
建议使用 Safari 打开 YuanHub 后，再选择「添加到主屏幕」。
```

不要假装能够从 Chrome iOS 页面直接弹出系统安装确认框。

---

## 8.5 其他 Android 浏览器

如果：

```text
没有 beforeinstallprompt
但属于 Android 移动端
```

显示：

```text
[ 查看添加方法 ] [ 详细教程 ]
```

简版说明：

```text
打开浏览器菜单，寻找「安装应用」或「添加到主屏幕」。
```

不要因没有事件就完全隐藏 PWA 教育入口。

---

# 9. 关闭与重复展示策略

参考站采用关闭后 7 天不再提示，YuanHub 建议沿用这个尺度。

localStorage key：

```text
yuanhub:pwa-install-prompt-dismissed-until:v1
```

值：

```text
Unix timestamp / ISO timestamp
```

规则：

```text
用户点击 ×
→ now + 7 days
→ 7 天内不主动展示底部浮层
```

但 `/install` 页面、菜单和页脚长期入口始终可访问。

### 安装成功

监听：

```text
appinstalled
```

成功后：

- 立即关闭安装浮层。
- 清空 deferred prompt。
- 可记录 `yuanhub:pwa-installed:v1` 作为辅助状态，但最终仍以运行时 display mode 为准。

---

# 10. standalone 运行判断

至少处理：

```js
window.matchMedia('(display-mode: standalone)').matches
```

以及 iOS：

```js
window.navigator.standalone === true
```

已安装环境下：

- 不再展示安装浮层。
- `/install` 页面仍允许访问，但顶部显示：

```text
YuanHub 当前已从桌面独立运行。
```

避免用户误以为还需要再次安装。

---

# 11. `/install` 教程页结构

建议页面顶部：

```text
添加到桌面

把 YuanHub 固定到手机桌面，下次无需再从浏览器里寻找。
安装后可以独立窗口打开，原有账号和登录方式不变。
```

然后平台 Tab：

```text
Android
iPhone / iPad
```

可选第三项：

```text
其他浏览器
```

---

## 11.1 Android 教程

### 01 打开 YuanHub

```text
推荐使用 Chrome、Edge 或支持 PWA 安装的 Android 浏览器打开 YuanHub。
```

如果当前有 deferred prompt，在教程顶部直接显示：

```text
[ 立即添加到桌面 ]
```

### 02 打开浏览器菜单

```text
点击浏览器右上角 ⋮ 或菜单按钮。
```

### 03 选择安装

```text
选择「安装应用」或「添加到主屏幕」。不同品牌浏览器文字可能略有区别。
```

### 04 确认

```text
在系统弹窗中确认安装。
```

### 05 从桌面启动

```text
安装完成后，从 YuanHub 图标直接进入，页面会以独立窗口运行。
```

---

## 11.2 iPhone / iPad 教程

### 01 使用 Safari 打开 YuanHub

```text
建议先使用 Safari 打开本站。
```

### 02 点击分享

```text
点击 Safari 工具栏中的「分享」按钮。
```

### 03 添加到主屏幕

```text
在分享菜单中找到「添加到主屏幕」。
```

### 04 确认名称

```text
保持 YuanHub 名称，点击「添加」。
```

### 05 从桌面进入

```text
之后直接点击桌面 YuanHub 图标即可。
```

页面可使用 Lucide 的 `Share` / `SquarePlus` / `MoreVertical` 等图标辅助说明，但不要使用未经授权的系统截图作为核心依赖。

---

# 12. Service Worker 第一阶段策略

## 12.1 目标

第一阶段 Service Worker 只承担：

- PWA 安装基础能力
- 构建产物静态资源 precache
- 版本更新时清理旧缓存

不要承担：

- 用户业务数据永久缓存
- 登录接口缓存
- 管理后台接口缓存
- POST / PUT / PATCH / DELETE 离线队列

---

## 12.2 推荐策略

使用 `vite-plugin-pwa` 默认 `generateSW`。

建议配置方向：

```text
registerType: autoUpdate 或 prompt
```

YuanHub 更推荐第一版使用：

```text
prompt
```

原因：

YuanHub 是工具型应用，用户可能正在编辑库存、配置密探或处理后台数据。Service Worker 新版本如果自动刷新页面，有概率打断用户正在进行的操作。

推荐后续单独提供：

```text
发现新版本
[ 刷新更新 ]
```

而不是无感强制 reload。

如果当前产品并没有实现更新提示组件，则 P0 可以先注册但暂不自动强制刷新；实现时必须确认插件的更新行为不会破坏用户编辑状态。

---

## 12.3 API 缓存规则

P0 / P1：

```text
不为 /api/** 配 RuntimeCaching
```

也不要缓存：

```text
Authorization 响应
账户信息
库存数据
密探养成数据
反馈中心
管理员 API
```

保持这些请求完全沿用当前网络逻辑。

---

# 13. 推荐代码文件改动清单

## P0 — 可安装基础

### 修改

```text
package.json
package-lock.json
vite.config.js
index.html
```

### 新增

```text
public/pwa/icon-192.png
public/pwa/icon-512.png
public/pwa/icon-maskable-512.png
public/pwa/apple-touch-icon.png
src/utils/pwaInstall.js
```

### 目标

- Manifest 正常生成。
- Service Worker 正常注册。
- Chrome Application 面板识别为可安装应用。
- Android 满足条件时触发 `beforeinstallprompt`。
- 桌面安装后使用正确名称、图标、主题色。

---

## P1 — 手机安装提示

### 新增

```text
src/components/MobileInstallPrompt.vue
```

### 修改

```text
src/App.vue
src/main.js（如需要更早注册 PWA install listener）
```

### 目标

- Android 可一键调系统安装框。
- iOS 展示手动步骤。
- 关闭后 7 天不再主动显示。
- standalone 下不显示。
- 不阻挡 AppDialog。
- safe-area 正常。

---

## P1 — 安装教程页

### 新增

```text
src/pages/install/index.vue
```

### 修改

```text
src/router/routes.js
```

可选：

```text
src/components/IslandSidebar.vue
```

如果侧栏当前有合适的「更多 / 关于」区域，再增加长期入口；不要为了这一个链接破坏现有主导航结构。

### 路由建议

```text
path: /install
name: install
text: 添加到桌面
display: false
module: about/help
```

---

## P2 — 更新体验

新增：

```text
src/components/PwaUpdatePrompt.vue
```

目标：

```text
新版本可用
[稍后] [刷新更新]
```

不要和「安装提示」混成同一个组件。

---

## P2 — 离线增强（可选）

只在完成线上使用观察后再做。

可以考虑：

- 页面静态骨架离线打开。
- 无网络时显示清晰的离线状态。
- 已加载过的帮助页 / 教程页可访问。

暂不考虑：

- 离线编辑库存后自动同步。
- 离线修改密探数据。
- 离线管理员操作。

这些属于另一套数据同步工程，不应附带在 PWA 安装功能里实现。

---

# 14. `pwaInstall.js` 推荐接口

实现时建议保持简单，不引入新状态管理库。

概念接口：

```js
pwaInstallState
initPwaInstall()
canPromptInstall()
requestInstall()
dismissInstallPrompt()
clearInstallDismissal()
isStandalone()
isIos()
isMobileLike()
```

状态对象可使用 Vue `reactive()`：

```js
{
  initialized: false,
  installable: false,
  installed: false,
  standalone: false,
  ios: false,
  mobile: false,
  deferredPrompt: null,
  dismissedUntil: null
}
```

注意：

`beforeinstallprompt` 不是所有浏览器都支持，因此整个架构必须是渐进增强，不能把它当作跨浏览器标准 API。

---

# 15. `beforeinstallprompt` 正确使用方式

Chromium 环境：

```text
window beforeinstallprompt
↓
event.preventDefault()
↓
保存 event
↓
显示 YuanHub 自定义安装 UI
↓
用户主动点击「立即添加」
↓
event.prompt()
↓
读取 outcome
↓
清空本次 event
```

关键约束：

- 不要页面加载后自动调用 `prompt()`。
- 必须由用户点击按钮触发。
- 一个 deferred prompt 不应反复调用。
- 不支持时自然降级到教程。

---

# 16. 安装提示出现时机

不建议「页面一渲染就立刻盖住内容」。

推荐第一版：

```text
首次进入后 1.5 ~ 3 秒
AND 当前没有 AppDialog / 强提示
AND install 状态已经初始化
```

或者更稳妥：

```text
首个页面完成稳定渲染后再展示
```

不要基于用户滚动几十秒或访问 N 次才出现，YuanHub 的工具型场景里安装入口本身有实际价值，没有必要过度隐藏。

如果 `beforeinstallprompt` 比 UI 初始化更晚到达，则事件到达后再进入可展示状态。

---

# 17. 与现有全局浮层的层级关系

当前 YuanHub 已存在：

```text
AccountEventToasts
AppDialog
route loading
```

PWA 浮层应遵守：

```text
AppDialog > 关键阻塞操作 > PWA Install Prompt > 普通 Toast / 页面内容
```

如果 AppDialog 打开：

- PWA prompt 不抢焦点。
- 最好暂时隐藏或保持在遮罩层下。

无障碍要求：

- `role="region"`
- `aria-label="添加 YuanHub 到桌面"`
- 关闭按钮有明确 `aria-label`
- Tab 可到达按钮
- focus-visible 遵守现有样式
- 不自动抢焦点

---

# 18. 移动端适配细节

必须测试：

```text
320px
360px
375px
390px
412px
430px
768px
```

注意：

- iPhone Home Indicator 安全区。
- Android 浏览器底部工具栏变化导致的动态 viewport。
- 横屏时不要覆盖大面积内容。
- 键盘弹出时安装浮层应避免顶到输入框区域。

建议当：

```text
visualViewport.height 明显因软键盘缩小时
```

暂时隐藏安装浮层，键盘关闭后恢复。

这项可 P1 后半完成，不阻塞最小实现。

---

# 19. 图标与正式 Logo 尚未确定的处理

不等待正式 Logo。

本功能与品牌 Logo 解耦：

```text
先用 YuanHub 临时识别图标上线 PWA
↓
正式 Logo 定稿
↓
覆盖 public/pwa 同名图标
↓
重新构建发布
```

需要提醒：

部分手机系统会缓存已安装 PWA 图标，因此正式 Logo 替换后，已经安装的用户不一定立即刷新桌面图标。

因此临时图标不要做得过于随意，至少应达到「可作为 Beta / 预热阶段图标长期使用一段时间」的质量。

---

# 20. 测试方案

## 20.1 构建测试

```bash
npm run build
npm run test
```

确认：

- 构建无错误。
- 原测试全通过。
- dist 中生成 manifest / service worker 相关产物。

---

## 20.2 Chrome DevTools

Application → Manifest：

检查：

- name
- short_name
- icon
- maskable icon
- theme color
- display
- start URL

Application → Service Workers：

检查：

- 已注册
- scope 正确
- 更新正常

---

## 20.3 Android 真机

至少测试 Chrome：

### 场景 A：首次访问

- 出现底部安装浮层。
- 主按钮为「立即添加」。

### 场景 B：点击立即添加

- 出现浏览器 / 系统安装确认框。

### 场景 C：安装成功

- 桌面出现 YuanHub。
- 图标正确。
- 名称正确。
- 点击后独立窗口运行。
- 不再次显示安装浮层。

### 场景 D：关闭浮层

- 刷新不再出现。
- 新开页面不再出现。
- localStorage 记录 7 天冷却。

---

## 20.4 iPhone 真机

Safari：

- 显示「查看添加方法」，而不是假的「立即添加」。
- 分享 → 添加到主屏幕步骤与教程一致。
- 添加后桌面图标正确。
- 从桌面启动后不再显示安装提示。

Chrome / Edge iOS：

- 不错误宣称可以直接触发 Chromium Android 式安装。
- 明确提供 Safari / 系统添加方式说明。

---

## 20.5 回归测试

必须确认 PWA 不影响：

- 登录 / 注册
- 登录态刷新恢复
- 密探页面
- 库存页面
- 星石页面
- 分享链接
- 管理后台
- API 请求
- 文件上传
- 页面刷新后的 history fallback
- 路由懒加载

尤其检查 Service Worker 不应把接口错误响应缓存成长期数据。

---

# 21. 验收标准

## P0 验收

- [ ] Manifest 可被浏览器正常识别
- [ ] Android Chrome 认为 YuanHub 可安装
- [ ] 192 / 512 / maskable / Apple Touch Icon 完整
- [ ] `display: standalone`
- [ ] Service Worker 正常注册
- [ ] 不缓存业务 API
- [ ] `npm run build` 通过
- [ ] `npm run test` 通过

## P1 安装浮层验收

- [ ] 只在适合的移动环境主动展示
- [ ] 已安装状态不展示
- [ ] Android 可直接调起安装
- [ ] iOS 使用教程引导
- [ ] 关闭后 7 天不再主动出现
- [ ] 不遮挡系统安全区
- [ ] 不抢 AppDialog 焦点
- [ ] 视觉符合 YuanHub 设计规范

## P1 教程页验收

- [ ] `/install` 可直接访问和刷新
- [ ] Android / iOS 教程分开
- [ ] 自动默认正确平台
- [ ] 用户可手动切换平台
- [ ] Android 可安装时教程页也提供「立即添加」
- [ ] standalone 环境显示已安装状态
- [ ] 页面在 320px 宽度正常

## P2 验收

- [ ] 新版本更新不会突然打断用户正在编辑的数据
- [ ] Service Worker 老缓存可清理
- [ ] 离线状态有明确反馈

---

# 22. 推荐实施顺序

严格按以下顺序执行，不要并行乱改：

## Step 1 — PWA 骨架

```text
vite-plugin-pwa
manifest
icons
service worker
```

先让浏览器真正认为 YuanHub 是一个可以安装的 Web App。

## Step 2 — 安装状态管理

```text
pwaInstall.js
beforeinstallprompt
appinstalled
standalone
iOS detection
7-day dismissal
```

先把逻辑做对，再做 UI。

## Step 3 — 手机安装浮层

```text
MobileInstallPrompt.vue
App.vue 挂载
Android/iOS 分支
```

## Step 4 — `/install` 教程页

```text
install/index.vue
route
Android/iOS tab
```

## Step 5 — 真机验证

```text
Android Chrome
iPhone Safari
```

不要只在桌面 DevTools 模拟完成后就认定功能结束。

## Step 6 — 更新策略

在安装流程稳定后，再决定是否增加 `PwaUpdatePrompt.vue`。

---

# 23. 最终推荐架构

```text
YuanHub
├─ vite.config.js
│  └─ VitePWA
│
├─ public/
│  └─ pwa/
│     ├─ icon-192.png
│     ├─ icon-512.png
│     ├─ icon-maskable-512.png
│     └─ apple-touch-icon.png
│
├─ src/
│  ├─ App.vue
│  ├─ main.js
│  │
│  ├─ utils/
│  │  └─ pwaInstall.js
│  │
│  ├─ components/
│  │  ├─ MobileInstallPrompt.vue
│  │  └─ PwaUpdatePrompt.vue       # P2
│  │
│  └─ pages/
│     └─ install/
│        └─ index.vue
│
└─ docs/
   └─ plans/
      └─ yuanhub-pwa-install-experience-plan.md
```

---

# 24. 实施决策摘要

以下作为后续 AI / Codex 执行时的固定决策：

1. **做完整 PWA，不只做教程页。**
2. **沿用目标站「主动提示 + 直接安装 + 教程兜底 + 长期入口」的产品逻辑。**
3. **不复制目标站视觉。**
4. **YuanHub 使用暖纸本、暖白卡、茶褐、蜜金体系。**
5. **首版推荐 `vite-plugin-pwa + generateSW`。**
6. **首版不缓存业务 API。**
7. **安装事件统一由 `src/utils/pwaInstall.js` 管理。**
8. **手机浮层统一挂在 `App.vue`。**
9. **Android Chromium 有事件时显示真正的「立即添加」。**
10. **iOS 不伪造一键安装，改为 Safari 添加到主屏幕教程。**
11. **关闭提示后 7 天不再主动显示。**
12. **已 standalone 运行时不显示安装提示。**
13. **新增 `/install` 独立教程页，路由 `display: false`。**
14. **正式 Logo 未定不阻塞开发，先使用质量合格的临时 YuanHub PWA 图标，并固定资源路径。**
15. **必须 Android + iPhone 真机验收，桌面模拟不作为最终验收。**
16. **PWA 更新机制不得自动刷新并打断用户正在编辑的业务数据。**

---

# 25. 外部技术依据

规划实现时参考以下资料：

- MDN：Making PWAs installable
- MDN：Window `beforeinstallprompt` event
- MDN：Trigger installation from your PWA
- Vite PWA：Getting Started
- Vite PWA：Service Worker Strategies and Behaviors

其中必须记住：

- `beforeinstallprompt` 并非跨浏览器标准能力，属于渐进增强路径。
- iOS 不支持通过该事件直接触发安装。
- Vite PWA 提供 `generateSW` 与 `injectManifest` 两种 Service Worker 策略；当前 YuanHub 首版没有自定义 Service Worker 的必要，优先 `generateSW`。

---

## 完成定义

当用户在手机上第一次打开 YuanHub，能够自然发现「添加到桌面」；Android 可以真正一键安装，iPhone 有明确可靠的添加步骤；安装后从桌面以独立窗口进入；同时现有登录、密探、库存、星石和后台数据链路均不受影响，即认为本功能完成。
