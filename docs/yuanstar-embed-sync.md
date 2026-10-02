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

## 2026-10-02：正式源码 CaptureBatch provenance 与边缘残片同步

### 源码与构建来源

- 源码仓：私有 YuanStar 源码仓（公开访问返回 404，故不在本仓库记录链接）。
- 集成工作树：同步者本机工作树（绝对路径属本机信息，不入库）。
- branch：`fix/import-draft-lifecycle`。
- source commit：`fd1cf7c89919a495203d0b8e2596572fa920633b`。
- 父 commit：`f8382de4508f1f3b3ffdcd318eb0c3b27d67e459`。
- 构建入口：`web/src/yuanstar-embed.ts`。
- 生成命令：在 `web/` 下执行 embed 构建（Windows 为 `npm.cmd run build:embed`）。
- 完整镜像 `web/dist/embed/` 到 `public/yuanstar-embed/`，共 12 个文件。
- **完整性状态**：12 个文件的 SHA-256 记录在 `docs/yuanstar-embed-manifest.json`，
  并与工作树逐文件比对通过（`test/yuanstarEmbedProvenance.test.js`）。
  源码仓目前不可公开访问，"由同一次上游构建产出、未经手改"这一点在本仓库
  **无法独立验证**，只能依赖同步者声明与上述产物哈希。
- 新 worker：`browser-vision-worker-Bt0Z67D1.js`（数字 `0`），
  已删除旧 `browser-vision-worker-Ci-YovYF.js`，没有旧 hashed worker 残留。
- 所有 embed 产物通过 `.gitattributes` 的 `-text` 原样保存构建字节，
  避免 Windows checkout 换行转换改变 hash；保留构建中资源原有的 LF 或 CRLF。
  `models/ppocrv6_chars.txt`、`models/README.md`、`ort/.gitkeep` 相对旧 Git blob
  仅保留本次 build 原有的 CRLF，资源内容没有变化。

产物哈希以 `docs/yuanstar-embed-manifest.json` 为唯一来源（12 个文件全覆盖）；
`test/yuanstarEmbedProvenance.test.js` 会逐文件比对，本节不再重复硬编码，避免文档与
测试各存一份、更新时漏改。

### 宿主可见变化

1. `CaptureBatch.gameVersion` 仅作为合法值受检的兼容 metadata 原样传递，
   不再因与 workspace 不同阻止原始截图导入；当前 workspace/account 的游戏版本
   继续决定 OCR context 和持久化。
2. MaaYuan 自动 CaptureBatch 带明确的 `maayuan_capture` provenance，
   进入内部 `layoutHint: maayuan_mumu`；不通过尺寸、filename 或 sourceImageId 猜来源。
3. 仅在 provenance、720×1280、full viewport、`phone_9_16_v1` 条件全部满足时
   使用 MuMu fast path；canonical top 为 `272 / 1280`，bottom 为 `1044 / 1280`。
4. 自动滚动产生的上下边缘残片在 worker 内为 `excluded_partial`，进入宿主后映射为
   `fragment`（review tier 2，`inventoryAction: exclude_fragment`），不进入普通 Tier1 review。
5. manual upload 保持 generic 保守路径，CaptureBatch 与 manual path provenance 不泄漏。
6. 已删除此前慢版 footer OCR 路径，不引入额外 footer OCR；源码侧真实批次回归显示
   structured OCR 总耗时接近 baseline，没有此前慢版回归。
7. 不自动触发 OCR，仍由用户手动点击识别；import / commit / consume 宿主契约不变。

### 已有源码侧回归证据（源码侧证据，本仓库无法复核）

以下为本次同步所依据的已完成源码侧真实回归，本轮宿主 vendoring 不重复执行。
这些数字来自源码侧回归环境，本仓库既无源码也无法重跑，**只能作为同步者提供的
证据引用，不构成本仓库可验证的结论**：
8 个真实自动采集 batch、101 张 main/support 截图、28 张 manual 对照，共 1,661 candidates。
fragment 从 135 到 140（top 59 到 64，bottom 76 不变）；Tier1 从 5 到 1。
剩余一条是独立的 `hierarchical_level_order_conflict`，不属于 fragment，仍待后续处理。
其它 1,520 accepted 结果的 name / level / quality / status 不变，manual generic path 无变化，
provenance 无泄漏，extra footer OCR = 0；structured 总耗时约 276.2s，前轮约 277.4s。

## 待办

- 公开的 YuanStar 仓库目前没有嵌入构建入口（`mountYuanStar`、`src/product-import-draft.ts`
  等只存在于构建产物中）。建议把嵌入构建入口与其 CI 一起公开，或改为由 CI 从
  YuanStar 构建后发布到本仓库，从而让 embed 差异可被 review。
- `browser-vision-worker-<hash>.js` 每次重建都会改文件名，等于每次同步都往 git 历史
  再压一个约 36 MB 的对象；建议改为不带内容 hash 的固定文件名 + 外部存储。
