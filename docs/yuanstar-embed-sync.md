# YuanStar embed 同步说明

`public/yuanstar-embed/` 下的文件**不是**本仓库的源码，而是 YuanStar 浏览器产品（嵌入构建）
的构建产物，由维护者在同步时手工复制进来：

| 路径 | 来源 |
| --- | --- |
| `public/yuanstar-embed/yuanstar-embed.js` | YuanStar 嵌入构建的 ESM 入口（`export { mountYuanStar }`） |
| `public/yuanstar-embed/yuanstar-embed.css` | 同一次构建的样式产物 |
| `public/yuanstar-embed/assets/browser-vision-worker-<hash>.js` | 同一次构建的浏览器视觉 worker（约 36 MB） |
| `public/yuanstar-embed/models/`、`ort/`、`reference/` | 运行时模型与 ONNX Runtime 资源 |

本仓库内没有构建这些产物的脚本，公开的 YuanStar 仓库也不包含嵌入构建入口，
**因此本仓库无法复现或审计这两份 JS 的源码差异**。这也正是它们被标记为
`linguist-generated` / `-diff`（见 `.gitattributes`）的原因。

## 同步时必须记录

每次更新 embed，请在 PR 描述里给出：

1. YuanStar 侧的仓库、分支与 commit（或 tag）；
2. 生成命令（YuanStar web 构建命令）；
3. 本次同步涉及的宿主可见行为变化。

## 宿主 ↔ embed 契约（宿主依赖，改动需同批同步）

宿主 `src/pages/star/index.vue` 依赖以下行为，缺少任一项会退化成错误状态：

- `importCaptureBatch(batch)`：必须等 Draft 真正持久化后才 resolve；
  **若批次被其他操作顶掉、没有写入 Draft，必须返回 `false` 或 reject**，
  不能静默 resolve。宿主据此抛出 `star_capture_import_superseded` 并保留
  pendingCapture（旧版 embed 返回 `undefined`，宿主按“已受理”兼容处理）。
- `onCaptureCommitted({ source: 'maayuan', accountId, captureId, jobId })`：
  在 OCR 结果提交且 Import Draft 退休之后触发；宿主收到后才 consume 后端临时截图。
- `getActiveTab()` / `setActiveTab(tab)`、`setHostAccount(accountId)`：
  宿主切换账号与标签页时使用。

## 待办

- 公开的 YuanStar 仓库目前没有嵌入构建入口（`mountYuanStar`、`src/product-import-draft.ts`
  等只存在于构建产物中）。建议把嵌入构建入口与其 CI 一起公开，或改为由 CI 从
  YuanStar 构建后发布到本仓库，从而让 embed 差异可被 review。
- `browser-vision-worker-<hash>.js` 每次重建都会改文件名，等于每次同步都往 git 历史
  再压一个约 36 MB 的对象；建议改为不带内容 hash 的固定文件名 + 外部存储。
