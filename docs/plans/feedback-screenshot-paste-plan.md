# 反馈中心截图粘贴功能实施规划

## 1. 背景

YuanHub 反馈中心目前已经支持通过文件选择器添加截图，但用户在 Windows / macOS 上完成截图后，仍需要先保存图片或打开文件选择器后再选择文件，操作链路偏长。

本规划拟在不改变现有后端协议和上传接口的前提下，为反馈中心增加“直接从剪贴板粘贴截图”的能力，使用户可以在反馈描述或回复输入框内直接使用：

- Windows：`Ctrl + V`
- macOS：`Command + V`

将剪贴板中的截图直接加入现有截图附件列表。

> 本文档仅用于调研与实施规划，不包含实际业务代码修改。

---

## 2. 目标

### 2.1 功能目标

在以下三个反馈输入场景中支持直接粘贴截图：

1. 用户新建反馈。
2. 用户对已有反馈追加消息。
3. 管理员回复反馈。

粘贴后的截图应与现有“添加截图”按钮选择的文件完全复用同一套：

- 数量限制；
- MIME 类型校验；
- 文件大小校验；
- 本地预览；
- 删除附件；
- 上传；
- `media_ids` 提交；
- Object URL 生命周期管理。

### 2.2 非目标

本次规划不包括：

- 浏览器主动截屏能力；
- `getDisplayMedia` 屏幕录制或屏幕捕获；
- 拖拽上传；
- 修改后端上传接口；
- 修改数据库结构；
- 修改反馈 `media_ids` 数据协议；
- 新增独立剪贴板上传 API；
- 修改反馈附件展示协议。

---

## 3. 当前实现调研

### 3.1 用户反馈页面

文件：

`src/pages/feedback/index.vue`

当前存在两套独立媒体状态：

- `newMedia = useFeedbackMedia()`：新建反馈；
- `replyMedia = useFeedbackMedia()`：用户追加消息。

当前截图入口均使用：

```vue
<input
  type="file"
  :accept="FEEDBACK_MEDIA_ACCEPT"
  multiple
  @change="xxxMedia.selectFiles"
/>
```

新建反馈和追加消息最终都会先调用：

```js
media.uploadAll()
```

取得上传后的媒体 ID，再通过反馈接口提交。

### 3.2 管理员反馈工作台

文件：

`src/pages/feedback/manage.vue`

管理员回复同样使用：

```js
const replyMedia = useFeedbackMedia()
```

截图选择、预览、移除、上传逻辑与用户侧复用同一个 `useFeedbackMedia()`。

因此粘贴截图能力应该继续放在统一媒体层，而不是分别在三个页面实现三套逻辑。

### 3.3 统一媒体状态

文件：

`src/utils/feedbackMedia.js`

当前主要职责：

```text
selectFiles(event)
  ↓
读取 input.files
  ↓
数量校验
  ↓
MIME 类型校验
  ↓
文件大小校验
  ↓
URL.createObjectURL()
  ↓
加入 items
  ↓
uploadAll()
  ↓
上传媒体文件
```

当前限制：

- 支持 `image/jpeg`；
- 支持 `image/png`；
- 支持 `image/webp`；
- 最多 3 张截图；
- 单张最大 10 MiB。

当前待上传项数据结构：

```js
{
  file,
  previewUrl,
  mediaId: null
}
```

该结构天然兼容从剪贴板获得的 `File` 对象。

### 3.4 上传接口

文件：

`src/api/media.js`

现有上传逻辑：

```js
const formData = new FormData()
formData.append('file', file)
```

然后请求：

```text
POST /v1/media/upload
```

因此只要剪贴板图片最终能够转换为浏览器 `File`，即可原样复用当前接口。

不需要修改：

- `src/api/media.js`；
- `src/api/feedback.js`；
- 后端媒体上传接口；
- 后端反馈接口。

---

## 4. 推荐技术方案

## 4.1 抽取统一 `addFiles(files)`

当前 `selectFiles(event)` 同时承担“获取文件”和“处理文件”两类职责。

建议在：

`src/utils/feedbackMedia.js`

中抽出内部统一入口，例如：

```js
function addFiles(files) {
  // 数量校验
  // MIME 校验
  // 文件大小校验
  // 创建预览
  // 写入 items
}
```

然后将原有文件选择逻辑改为：

```text
selectFiles(event)
  ↓
读取 event.target.files
  ↓
清空 input.value
  ↓
addFiles(files)
```

这样粘贴和文件选择不会产生两套校验逻辑。

### 设计原则

所有进入反馈截图队列的文件，无论来源是：

- `<input type="file">`；
- 剪贴板；

都必须统一经过 `addFiles()`。

---

## 4.2 新增 `handlePaste(event)`

在 `useFeedbackMedia()` 内增加：

```js
function handlePaste(event) {
  // 从 ClipboardEvent 中获取图片 File
  // 没有图片时直接 return
  // 有图片时阻止图片被插入 textarea
  // 调用 addFiles(files)
}
```

推荐优先读取：

```js
event.clipboardData?.items
```

从中筛选：

```js
item.kind === 'file'
```

并通过：

```js
item.getAsFile()
```

得到浏览器 `File`。

推荐流程：

```text
ClipboardEvent
  ↓
clipboardData.items
  ↓
筛选 kind === file
  ↓
getAsFile()
  ↓
得到 File[]
  ↓
addFiles(files)
```

如有兼容性需要，可将：

```js
clipboardData.files
```

作为 fallback。

---

## 4.3 仅在确实粘贴图片时阻止默认行为

这是本功能的重要交互要求。

不能直接在 Vue 模板中使用：

```vue
@paste.prevent="..."
```

否则用户在反馈输入框中复制普通文字后再粘贴时，浏览器默认文字粘贴也会被禁止。

正确策略：

```text
粘贴事件
  ↓
是否包含图片？
  ├─ 否 → 不处理，不 preventDefault，正常粘贴文字
  └─ 是 → preventDefault，再加入截图队列
```

即只在成功识别到图片附件后调用：

```js
event.preventDefault()
```

这样可以保证：

- 普通文本粘贴完全不受影响；
- 图片不会作为浏览器默认内容插入输入区域；
- 截图进入统一附件预览区。

---

## 5. 页面接入范围

## 5.1 新建反馈

文件：

`src/pages/feedback/index.vue`

在“详细描述” textarea 上绑定：

```vue
@paste="newMedia.handlePaste"
```

用户在该输入框获得焦点时即可直接粘贴截图。

## 5.2 用户追加消息

同文件：

`src/pages/feedback/index.vue`

在追加消息 textarea 上绑定：

```vue
@paste="replyMedia.handlePaste"
```

## 5.3 管理员回复

文件：

`src/pages/feedback/manage.vue`

在管理员回复 textarea 上绑定：

```vue
@paste="replyMedia.handlePaste"
```

### 为什么三处应同时接入

三处本身都已经复用 `useFeedbackMedia()`，核心功能只需实现一次。

如果仅在新建反馈中加入粘贴，会造成明显的交互不一致：

- 新建反馈可以粘贴；
- 用户追加不能粘贴；
- 管理员回复不能粘贴。

因此建议一次性覆盖全部三个输入场景。

---

## 6. 不采用全局 paste 监听

不建议：

```js
window.addEventListener('paste', ...)
```

原因是反馈工作区同时存在：

- 搜索框；
- 筛选输入；
- 新建反馈弹窗；
- 回复输入框；
- 其他可能需要正常粘贴文字的控件。

如果使用全局监听，用户可能仅仅在搜索框中粘贴内容，却意外把剪贴板图片加入当前反馈。

推荐原则：

> 只有反馈正文或回复 textarea 当前拥有输入焦点时，粘贴截图才生效。

这也与用户直觉一致。

---

## 7. 提交期间的竞态处理

当前文件选择器已经通过：

```vue
:disabled="submitting || media.uploading"
```

或：

```vue
:disabled="replying || media.uploading"
```

阻止上传 / 提交过程中继续选择图片。

但 textarea 当前仍可能继续触发粘贴事件。

新增粘贴能力后需要避免如下情况：

```text
点击提交
  ↓
uploadAll() 开始上传已有截图
  ↓
上传结束，uploading = false
  ↓
反馈请求仍在提交，submitting / replying = true
  ↓
用户再次粘贴截图
  ↓
新截图没有进入当前请求
  ↓
成功回调 clear() 后被直接清除
```

### 推荐处理方式

页面层负责判断业务提交状态，不将 `submitting` / `replying` 传入 `useFeedbackMedia()`。

原因是：

- `submitting` / `replying` 属于页面业务状态；
- `useFeedbackMedia()` 应保持媒体管理职责单一；
- 避免 composable 与具体反馈页面状态强耦合。

实施时可以采用轻量包装事件，例如根据页面状态决定是否调用媒体粘贴处理。

目标行为：

- 上传中不可继续添加；
- 提交中不可继续添加；
- 回复发送中不可继续添加。

---

## 8. UI 提示建议

当前截图区域主要显示：

```text
截图        0 / 3
[添加截图]
```

建议增加一条轻量辅助提示，例如：

```text
也可在描述框中使用 Ctrl/⌘ + V 粘贴截图
```

或者：

```text
支持直接 Ctrl/⌘ + V 粘贴截图
```

该提示应保持次级文字样式，不需要增加大型拖拽区域或新的视觉模块。

本功能不需要改变现有 MaaYuan 暖色纸张视觉体系，也不需要新增大面积品牌色组件。

---

## 9. 文件改动范围

预计实际实施仅涉及：

```text
src/utils/feedbackMedia.js
src/pages/feedback/index.vue
src/pages/feedback/manage.vue
```

### 不需要修改

```text
src/api/media.js
src/api/feedback.js
后端上传接口
数据库结构
反馈 media_ids 协议
```

如果最终决定为此功能增加专门的单元测试，则可能额外修改或新增测试文件。

---

## 10. 建议实施顺序

### Step 1：重构媒体文件入口

在 `feedbackMedia.js` 中将现有文件校验和入队逻辑从 `selectFiles()` 中抽到统一 `addFiles(files)`。

要求：

- 行为与当前文件选择完全一致；
- 不改变现有错误文案；
- 不改变当前“整批校验失败则整批不添加”的行为；
- 不改变 `items` 数据结构。

### Step 2：增加剪贴板解析

实现 `handlePaste(event)`：

- 检测 ClipboardEvent；
- 提取图片 File；
- 无图片时完全不干预；
- 有图片时调用 `preventDefault()`；
- 交给统一 `addFiles()`。

### Step 3：接入用户新建反馈

在新建反馈“详细描述” textarea 接入粘贴事件。

### Step 4：接入用户追加消息

在追加消息 textarea 接入同一功能。

### Step 5：接入管理员回复

在管理员回复 textarea 接入同一功能。

### Step 6：补充交互提示

在截图区域增加“支持 Ctrl/⌘ + V 粘贴截图”的辅助说明。

### Step 7：处理提交期间竞态

确保：

- `submitting` 时不接受新截图；
- `replying` 时不接受新截图；
- `media.uploading` 时不接受新截图。

### Step 8：最小验证

仅运行与该功能直接相关的测试或构建，不执行全仓库 ESLint / Prettier / 自动格式化。

---

## 11. 边界情况

实施时需要明确覆盖以下场景。

### 11.1 纯文本粘贴

预期：

- 正常进入 textarea；
- 不增加截图；
- 不调用 `preventDefault()`；
- 不产生媒体错误。

### 11.2 单张截图

预期：

- PNG / JPEG / WebP 正常加入；
- 立即生成预览；
- 数量计数更新；
- 最终正常上传。

### 11.3 一次粘贴多张图片

如果剪贴板提供多个图片 File，应继续遵循当前总数量限制。

### 11.4 超过最大数量

例如：

```text
当前已有 2 张
一次粘贴 2 张
```

当前媒体逻辑采用整批拒绝策略，因此建议继续保持：

- 新的 2 张均不添加；
- 提示“最多添加 3 张截图”。

不建议在粘贴来源中偷偷改变为“只添加剩余 1 张”，否则文件选择和剪贴板行为不一致。

### 11.5 不支持的 MIME

例如：

- GIF；
- SVG；
- 非图片文件；
- `file.type` 为空的未知格式。

预期继续使用现有提示：

```text
仅支持 JPEG、PNG 或 WebP 图片
```

### 11.6 单张超过 10 MiB

预期继续沿用：

```text
单张图片不能超过 10 MiB
```

### 11.7 图片与文本同时存在于剪贴板

如果剪贴板事件同时包含：

- 图片 File；
- 文本表示；

需要以“检测到图片附件”为截图粘贴场景处理。

实施时应确认最终产品预期是：

- 仅添加截图；
- 还是截图和文字同时写入。

默认建议：

> 检测到图片时只添加图片并阻止默认粘贴，避免截图工具携带的额外文本或路径污染正文。

### 11.8 正在上传或提交

预期：

- 不再接受新的剪贴板截图；
- 不改变当前请求附件列表；
- 不出现“粘贴成功但提交后消失”的假成功状态。

### 11.9 删除粘贴截图

与文件选择图片一致：

- 从 `items` 移除；
- 调用 `URL.revokeObjectURL()`；
- 清除对应预览资源。

### 11.10 关闭弹窗 / 取消回复 / 页面卸载

继续通过现有：

```js
clear()
onBeforeUnmount(clear)
```

释放粘贴图片生成的 Object URL。

---

## 12. 测试建议

当前项目已有反馈 API 契约测试，但暂未发现针对：

- `useFeedbackMedia()`；
- ClipboardEvent；
- 反馈截图 UI；

的专门测试。

如实施时补充测试，优先覆盖媒体 composable，而不是创建大量页面级 UI 测试。

### 建议测试项

1. `addFiles()` 接收正常 PNG。
2. `addFiles()` 拒绝 GIF。
3. `addFiles()` 拒绝 >10 MiB 图片。
4. 已有 2 张时加入 2 张，整体拒绝。
5. 纯文本 paste 不调用 `preventDefault()`。
6. 图片 paste 调用 `preventDefault()`。
7. 图片 paste 最终进入 `items`。
8. 粘贴后的 File 可以正常传入 `uploadAll()`。
9. `uploadAll()` 仍然使用 multipart 字段 `file`。
10. 已上传项目具有 `mediaId` 时不会重复上传。
11. remove / clear 会释放 Object URL。

---

## 13. 验收标准

功能完成后应满足以下验收条件。

### 用户新建反馈

- 光标位于详细描述输入框；
- 从系统截图工具截图；
- 按 `Ctrl + V` / `Command + V`；
- 截图立即出现在下方预览列表；
- 无需先保存本地文件。

### 用户追加消息

同样可以直接粘贴截图并正常发送。

### 管理员回复

同样可以直接粘贴截图并正常发送。

### 文字粘贴

复制普通文字后：

- `Ctrl + V` / `Command + V` 仍正常粘贴文字；
- 不生成截图附件。

### 附件限制

粘贴截图严格遵守现有：

- JPEG / PNG / WebP；
- 最多 3 张；
- 单张最大 10 MiB。

### 上传协议

粘贴图片继续通过：

```text
POST /v1/media/upload
FormData.file
```

上传。

反馈提交仍使用现有：

```text
media_ids
```

不引入任何新后端协议。

---

## 14. 风险评估

整体风险：**低**。

原因：

1. 后端完全不需要改动；
2. 数据协议不需要改动；
3. 上传 API 不需要改动；
4. Clipboard 图片最终仍然是标准浏览器 `File`；
5. 三个页面已经统一复用 `useFeedbackMedia()`；
6. 核心改造集中于媒体输入层。

主要风险集中在前端交互细节：

- 错误使用 `@paste.prevent` 导致文字无法粘贴；
- 提交过程中仍允许继续粘贴导致附件竞态；
- 三个输入场景接入不完整造成体验不一致；
- 粘贴来源绕过现有文件校验。

只要坚持“所有文件统一进入 `addFiles()`”这一原则，上述风险都比较容易控制。

---

## 15. 最终推荐结构

实施完成后，推荐媒体层形成如下结构：

```text
useFeedbackMedia()

├── addFiles(files)
│   ├── 最大数量校验
│   ├── MIME 校验
│   ├── 文件大小校验
│   ├── createObjectURL
│   └── 写入 items
│
├── selectFiles(event)
│   └── input.files → addFiles()
│
├── handlePaste(event)
│   └── clipboard → File[] → addFiles()
│
├── remove(index)
├── clear()
└── uploadAll()
```

核心原则：

> 文件选择和剪贴板只是两种“输入来源”，后续媒体校验、状态、预览和上传必须保持同一条链路。

这样可以用最小改动实现截图粘贴，同时保持 YuanHub 当前反馈媒体架构清晰、可维护。