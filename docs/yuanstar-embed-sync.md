# YuanStar embed 同步说明

`public/yuanstar-embed/` 下的文件**不是**本仓库的源码，而是 YuanStar 浏览器产品（嵌入构建）
的构建产物，由维护者在同步时手工复制进来：

| 路径 | 来源 |
| --- | --- |
| `public/yuanstar-embed/yuanstar-embed.js` | YuanStar 嵌入构建的 ESM 入口（`export { mountYuanStar }`） |
| `public/yuanstar-embed/yuanstar-embed.css` | 同一次构建的样式产物 |
| `public/yuanstar-embed/assets/browser-vision-worker-<hash>.js` | 同一次构建的浏览器视觉 worker（本轮 120,560 bytes，约 0.115 MiB） |
| `public/yuanstar-embed/models/`、`ort/`、`reference/` | 运行时模型与 ONNX Runtime 资源 |

本仓库内没有构建这些产物的脚本，公开的 YuanStar 仓库也不包含嵌入构建入口，
**因此本仓库无法复现或审计这两份 JS 的源码差异**。这也正是它们被标记为
`linguist-generated` / `-diff`（见 `.gitattributes`）的原因。

## 同步时必须记录

每次更新 embed，请在 PR 描述里给出：

1. YuanStar 侧的仓库、分支与 commit（或 tag）；
2. 生成命令（YuanStar web 构建命令）；
3. 本次同步涉及的宿主可见行为变化。

## 2026-10-05：宿主导入确认与移动端衔接

- 当前 embed/sourceCommit 保持下节的 `91ce034f4aae2a68a4b3c387e44149fe6302a922`。
  本机没有 YuanStar 源码；本轮只改宿主、测试与说明，没有手改生成产物或重建 embed。
- 宿主不再无条件把 `importCaptureBatch` 的 `undefined` 当成功：只有当前账号的
  schemaVersion=1 Draft，transport.source/captureId、全局图片顺序、图片 metadata 与持久化 Blob
  均匹配该批次，才受理旧产物的空返回。确认在一个 readonly transaction 内完成，复用现有
  无创建/无升级的 IndexedDB 打开方式；存储异常保留原错误，未知返回值拒绝。
  显式 `true` 按公开成功契约受理，`false` 仍报 superseded。未来上游升级返回值后可移除该兼容读取。
- `imported` 生命周期标记只作为恢复线索：即使已有标记，也要确认同账号/同批次 Draft 的完整
  metadata 和 Blob 才显示“已恢复”；缺失或被替换时重新下载导入。失败保留 pending、路由及重试入口。
  导入/确认阶段不 consume，提交成功并退休 Draft 后的清理顺序不变。
- 首次账号同步结束后才应用最新持久页签。加载时切页只更新偏好；账号变化复用既有 latest queue，
  过期/卸载的准备结果不触发切页、云读取或导入。这是宿主入口的收敛，不声称已统一 embed 内部
  mount/review/无账号初始化的全部加载链；完整修复仍需上游源码。
- 合法跨版本 CaptureBatch 保持放行；宿主在导入成功状态中持续显示截图版本、当前工作区版本和
  实际识别版本提示。提示随账号/批次变化清理，不修改 OCR context 或 CaptureBatch metadata。
- 移动 toast 放到顶部安全区，避开底部恢复工具和页签，并引用现有 toast 层级；toast 无操作按钮，
  不拦截点击。重要导入错误仍由宿主持续状态与重试按钮呈现。coarse pointer 下计划按钮及当前编辑
  按钮至少 44×44 CSS px；桌面保持当前 32px 紧凑视觉。
- `/star` 的 PWA 安装邀请排除已进入宿主基线，本轮不重复修改全局 PWA 组件。
- 已新增/更新只读 Draft、真实 vendored 导入/并发替换、页面加载/换账号/恢复、OCR timeout 后主动
  重试及初始化中卸载测试。**本轮未运行回归套件，也未做浏览器/真机 OCR 或生产 gzip 验收。**

用户最小验证（仓库根目录）：

```sh
node --test test/starCaptureTransport.test.js test/starCaptureDraftReceipt.test.js test/starCaptureLifecycle.test.js test/legacyHostAccountMigration.indexeddb.test.js test/yuanstarEmbedProvenance.test.js
npm run test:behavior -- behavior/embedProduct.spec.js behavior/starRecoveryUx.spec.js
```

布局另验收 390/768/1440、1080±1、388×608 短高度、横屏、安全区与 coarse pointer；必要时补 320px。
Worker mock 只能证明生命周期与重试路径，不能证明真实识别结果或手机网络表现。

## 当前局部 UI 修复来源（2026-10-03）

- 源码分支仍为 `fix/import-draft-lifecycle`，已提交 source commit 为 `91ce034f4aae2a68a4b3c387e44149fe6302a922`，
  commit message 为 `fix(ui): refine star plan action layout`。
- 此 commit 仅修改 `web/src/product.css`：三个计划按钮与左侧当前背包按钮统一为 32px 高；恢复与快捷靠左相邻，重置靠右。
  规则同时适用于宽屏和窄屏，保留既有同宽、自然收缩和单行文字设置，没有改动其它 UI 或 handler。
- 当前 vendored embed 由该已提交 source commit 的干净工作树正式 build 产生；在 `web/` 下执行 `npm.cmd run build:embed`，
  构建前后 source 均 clean。manifest 的 `_sourceCommit` 指向上述 commit，`_sourceWorkingTree.status` 为 `clean`，不含 `changedFiles`。
- 全部 12 个资源与构建目录 SHA-256 一致；仅 `yuanstar-embed.css` 变化，JS、worker、模型、ORT 与经验规则资源字节均不变。
- 320 / 351 / 390 / 430 / 768 / 1024 / 1440px 真页复核通过：按钮 32px 等高，三个计划按钮同行且文字单行，恢复 / 快捷左邻，重置靠右，无横向溢出。
- 下节 external-WASM 构建来源为此前正式基线；当前产物来源以本节记录为准。

## 此前正式构建来源（2026-10-03，external-WASM 修复）

- 源码仓：私有 YuanStar 源码仓；分支为 `fix/import-draft-lifecycle`。
- 已提交 source commit：`6446e4c6f46d0477130f7d9a37ab7827549badef`，
  commit message 为 `perf(ocr): externalize browser runtime wasm`。
- 此前 vendored embed 由此已提交 source commit 的干净工作树正式 build 产生；当时构建前后 source 均 clean。
  本轮 source commit 仅包含 `web/vite.config.mjs`、`web/vite.embed.config.mjs`、`web/package.json`、
  `web/scripts/verify-ocr-build.mjs`、`web/tests/asset-pipeline.test.mjs`；manifest 的 `_sourceWorkingTree.status` 为 `clean`。
- 两个 Vite 配置都保留默认 client conditions，并加入 ORT 1.27.0 官方
  `onnxruntime-web-use-extern-wasm`；Vite 8.2.0 worker 继承 resolver，实际命中 `ort.wasm.min.mjs`。
  没有引入不受支持的 `worker.resolve`，没有修改 `web/src/ocr.ts`。
- 在 `web/` 执行正式 `npm.cmd run build` 和 `npm.cmd run build:embed`；入口仍为 `web/src/yuanstar-embed.ts`。
  两个 build 都附带最小护栏：动态查找唯一 worker、体积小于 1 MiB、没有 WASM data URI、外部 MJS/WASM 非空。
- 完整镜像 `web/dist/embed/` 到 `public/yuanstar-embed/`，全部 12 文件 SHA-256 一致。
  相对基线只更新 worker 与 `yuanstar-embed.js`；CSS、模型、dictionary、ORT 和经验规则资源字节不变。
- 删除 `browser-vision-worker-Bt0Z67D1.js`，新增 `browser-vision-worker-BuVcSjOG.js`；无旧 worker 残留。
  worker 从 36,089,650 bytes（34.418 MiB）降至 120,560 bytes（0.115 MiB），节省 35,969,090 bytes（34.303 MiB，99.67%）。
  两份闲置 embedded WASM 已移除，完整外部 WASM 的 base64 编码及 `data:application/wasm;base64` 均不存在。
- 外部 runtime 保持同一 variant，与 package、public、standalone、embed 和基线资源逐字节一致：
  MJS SHA-256 为 `0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3`；
  WASM SHA-256 为 `d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6`。
- external-WASM 修复验证阶段运行正式 worker 与旧 baseline worker 的 40 张真实图片，完整结构化业务结果 40/40 一致。
  ignored 插桩入口继承本轮正式 resolver 与原模型，用于内部 tensor/crop 观测；两侧结果逐项匹配正式 worker。
  15 组 Web/WASM tensor bit-identical，40 次 detection boxes 和 1,665 组 crop pixel hashes 一致。
  BrowserOcrRuntime → reconcile → automatic resolution → finalize 回放 40/40 一致，总 inventory 743 项。
  回放使用实际浏览器输出注入引擎，不包含真实账号持久化或后端提交验证。
- Chrome 中正式 worker 初始化实际请求 worker JS、原 ORT MJS/WASM、det/cls/rec 和 dictionary，共 7 项；WASM 仅请求 1 次。
  手机验证见下节用户补充的 HTTP smoke；本轮没有重新验证手机后台挂起、弱网、HTTP cache 或 Brotli。
- `docs/yuanstar-embed-manifest.json` 记录已提交 source commit、干净源码状态与全部资源 SHA-256；provenance 测试逐文件校验。
- 模型、OCR preprocessing/postprocess、阈值、runtime 参数、10 秒 / 首批有效图片双触发预热、300 秒初始化 timeout 和 UI 均不变。
  本轮未做 HTTP 压缩、缓存策略、CDN、Service Worker 或模型量化；这些后续事项尚未完成。

## 2026-10-03：external-WASM commit 收口与手机 HTTP smoke

- 从上述新 source commit 的干净工作树重新执行正式 `npm.cmd run build` 和 `npm.cmd run build:embed`，
  构建前后 source 均 clean，standalone 与 embed 产物相对修复验证阶段没有字节漂移。
- 完整核对并同步重新构建的 12 个 embed 文件；仅保留 `browser-vision-worker-BuVcSjOG.js`，
  worker 仍为 120,560 bytes，两项 build 的 <1 MiB guard 均通过，embedded WASM 不存在。
  外部 MJS/WASM、三个模型和 dictionary 的 SHA-256 与 baseline 完全一致。
- 用户补充的 Android 局域网普通 HTTP `/star` smoke：OCR runtime 已成功运行 2/2 图片，
  worker、external WASM 和 models 均正常；最终应用结果到 workspace 时，因 HTTP 非 secure context 下
  `crypto.randomUUID()` 不可用，按现有安全 UUID 语义拒绝，提示“当前环境无法生成安全的 starInstanceId”。
  该结果归类为 HTTP 环境限制，不作为 external-WASM regression；此记录来自用户手机实测，Agent 未重复该手机测试。
- 不修改 starInstanceId 生成策略，不加入 `Math.random` fallback；正式 HTTPS 环境保持现有安全 UUID 语义。
- 两仓仅提交本阶段 source 修复与 embed/provenance 同步，不 push，不启动后续压缩、缓存或模型阶段。

## 宿主 ↔ embed 契约（宿主依赖，改动需同批同步）

宿主 `src/pages/star/index.vue` 依赖以下行为，缺少任一项会退化成错误状态：

- `importCaptureBatch(batch)`：必须等 Draft 真正持久化后才 resolve。
  契约要求：**若批次被其他操作顶掉、没有写入 Draft，必须返回 `false` 或 reject**，
  不能静默 resolve；宿主据此抛出 `star_capture_import_superseded` 并保留 pendingCapture。
  **当前产物仍未满足显式返回值契约**：成功及部分被替换分支均 resolve `undefined`。
  2026-10-05 起宿主使用上节的只读 Draft 证据确认兼容成功，缺失/不匹配拒绝，不能仅靠空返回报成功。
  无 verifier 或未知返回值报 `star_capture_import_unverified`，同样保留待处理。
  上游仍应成功显式 `return true`、被替换 `return false`（或 reject）后重新同步产物，
  才能去掉宿主对内部持久化 schema 的兼容依赖。
- `onCaptureCommitted({ source: 'maayuan', accountId, captureId, jobId })`：
  在 OCR 结果提交且 Import Draft 退休之后触发；宿主收到后才 consume 后端临时截图。
- `getActiveTab()` / `setActiveTab(tab)`、`onActiveTabChange(tab)`、`setHostAccount(accountId)`：
  宿主切换账号与标签页时使用；程序自动切换阶段通过同一个 callback 同步宿主高亮。

## 2026-10-02：CaptureBatch provenance 与边缘残片同步记录

### 源码与构建来源

- 源码仓：私有 YuanStar 源码仓（公开访问返回 404，故不在本仓库记录链接）。
- 集成工作树：同步者本机工作树（绝对路径属本机信息，不入库）。
- branch：`fix/import-draft-lifecycle`。
- 历史同步 commit：`fd1cf7c89919a495203d0b8e2596572fa920633b`；当前正式来源以上节记录的新已提交 source commit 为准。
- 构建入口：`web/src/yuanstar-embed.ts`。
- 生成命令：在 `web/` 下执行 embed 构建（Windows 为 `npm.cmd run build:embed`）。
- 同步基线完整镜像 `web/dist/embed/` 到 `public/yuanstar-embed/`，共 12 个文件。
- **完整性状态**：12 个文件当前在 YuanHub 中的 SHA-256 记录在 `docs/yuanstar-embed-manifest.json`，
  并由 `test/yuanstarEmbedProvenance.test.js` 逐文件比对。当前产物来源以「当前局部 UI 修复来源」记录为准。
- 当时新 worker：`browser-vision-worker-Bt0Z67D1.js`（数字 `0`），删除了 `browser-vision-worker-Ci-YovYF.js`；
  本轮又以 `browser-vision-worker-BuVcSjOG.js` 替换，当前仅保留上节的新 worker。
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
   历史风险为跨版本批次静默放行；2026-10-05 宿主已增加导入后的非阻断告警，
   standalone/upstream 的批次入口仍建议同步提示。
2. MaaYuan 自动 CaptureBatch 带明确的 `maayuan_capture` provenance，
   进入内部 `layoutHint: maayuan_mumu`；不通过尺寸、filename 或 sourceImageId 猜来源。
3. 仅在 provenance、720×1280、full viewport、`phone_9_16_v1` 条件全部满足，
   且能检出用于抬高上界的 tab 矩形时，才使用 MuMu fast path
   （检不出 tab 矩形时退回 profile 边界，只会多一些上边缘残片，不会丢数据）；
   canonical top 为 `272 / 1280`，bottom 为 `1044 / 1280`。
4. 边缘残片的分层命名：worker 对 `completeness !== "complete"` 的卡片产出
   `status: excluded_partial`；入口把**所有**非 complete 的卡片收进
   `excludedOrdinaryOccurrences`（`reasonCode: incomplete_card`，不只是上下边缘，
   也含其它不完整原因），再映射为 `kind: "fragment"`、review tier 2、
   `inventoryAction: exclude_fragment`，因此不进入普通 Tier1 review。
   `excluded_partial` 这串只存在于 worker 内，在 `yuanstar-embed.js` 里 grep 不到。
5. provenance 只写入 CaptureBatch 路径（手动上传构造的对象从不带 `origin`），
   因此只有自动采集会进入 MuMu `272 / 1044` 裁剪。
   注意：worker 中「按视觉选中的 tab 下沿抬高上界」的分支对所有被分析图片生效、
   不受 provenance 约束（手动上传也可能触发；通常是 no-op，但 tab bar 偏高时会把
   首行卡片判为残片）。「manual 保持保守路径」只对 provenance 与 fast path 成立。
6. footer OCR：**本次 vendoring 的 diff 无法证实**「已删除此前慢版 footer OCR 路径」——
   新旧 worker 中 `footer` 字样均为 0 次，`tabOcrMs` / `profileContentBoundsMs`
   计数一致。该结论仅来自源码侧声明，本仓库不重复断言其成立。
7. 不自动触发 OCR，仍由用户手动点击识别；import / commit / consume 的接口与语义与上一版
   一致（包含上面已标注的、仍未闭合的 `importCaptureBatch` 返回值缺口）。

### 已有源码侧回归证据（源码侧证据，本仓库无法复核）

以下为本次同步所依据的已完成源码侧真实回归，本轮宿主 vendoring 不重复执行。
这些数字来自源码侧回归环境，本仓库既无源码也无法重跑，**只能作为同步者提供的
证据引用，不构成本仓库可验证的结论**：
8 个真实自动采集 batch、101 张 main/support 截图、28 张 manual 对照，共 1,661 candidates。
fragment 从 135 到 140（top 59 到 64，bottom 76 不变）；Tier1 从 5 到 1。
剩余一条是独立的 `hierarchical_level_order_conflict`，不属于 fragment，仍待后续处理。
其它 1,520 accepted 结果的 name / level / quality / status 不变，manual generic path 无变化，
provenance 无泄漏，extra footer OCR = 0；structured 总耗时约 276.2s，前轮约 277.4s。

## 移动端 OCR 初始化与恢复

- 现象：手机浏览器 / PWA 在开始识别后可能长期停留在“正在初始化识别引擎”，图片进度保持 `0 / N`。
- 根因：浏览器视觉 worker 的 `initialize` 请求原先没有超时边界。
  YuanHub 的 PWA 明确不预缓存 `yuanstar-embed/**`，首次使用需要在线加载较大的 worker、WASM 与模型资源；
  当移动浏览器挂起 worker、网络请求迟迟不结束或初始化无法返回时，Promise 会永久 pending，UI 也就无法进入失败态。
- 当前已提交源码使用下文的双触发后台预热和 300 秒 worker 初始化硬超时；超时会终止 worker 并返回可重试错误。
- 初始化阶段提示首次需要加载较大的本机识别资源；手机端超时提示保持页面前台并使用稳定网络，
  初始化失败提示刷新页面后重试。预热仅准备引擎，识别仍由用户主动开始。
- 本次仅同步正式 source build，没有在 vendored JS 上叠加补丁。

## 2026-10-03：星石 UI 与移动端交互定向修复

- UI 与移动端交互修复已包含在 `fix/import-draft-lifecycle` 的
  `e044691d07f8c97deff7ddcd46214d51b1009ab2`；该阶段产物从此已提交 source HEAD 构建，当前产物来源以上节为准。
- 生成命令：`web/` 下 `npm.cmd run build:embed`；入口仍为 `web/src/yuanstar-embed.ts`。
- 初始化超时、双触发预热与手机恢复指引均已进入源码；
  本轮没有新加 OCR 性能优化、模型、识别规则或算法修改。
- 同步内容为构建生成的 `yuanstar-embed.js` 与 `yuanstar-embed.css`；全部 12 个资源与
  `web/dist/embed/` 逐文件 SHA-256 一致。worker、模型、ORT 与经验规则资源字节不变。
- 宿主以 `onActiveTabChange(tab)` 接收 OCR 完成等程序阶段切换，桌面与手机共用现有 activeTab。
- 原图预览使用单列可收缩 Grid 与 contain，卡片触摸长按激活后跨池移动，激活前滑动保留滚动；
  候选修改态隐藏自己的操作行，取消在左、确认在右。数量与计划按钮只调整文案和宽度。
- 仅执行定向回归及 embed 构建；手机真机拖拽、浏览器安全区和真实 OCR 链路仍需人工验证。

## 2026-10-03：OCR 双触发预热与初始化 timeout

- 双触发预热与 timeout 修复已包含在上节的已提交源码 commit；
  使用 `web/` 下 `npm.cmd run build:embed` 从干净 source HEAD 重新生成产物，没有手改 bundle。
- embedded 与 standalone 共用两个预热触发器：首次有效图片进入立即 prepare；
  否则在 `mountYuanStar` 首次 `renderPage()` 返回后设置 10 秒 timer。
  timer 在账号恢复、工作区加载、经验规则请求之前创建，不等待这些异步任务结束。
- 第一批图片覆盖手动选择、拖入、粘贴、有效 CaptureBatch 接收和待识别 Draft 恢复。
  两个触发器复用 `startProductOcrPreparation`；每个 mount 的 coordinator 只自动尝试一次，
  runtime 同时复用 preparing Promise / ready engine。卸载或挂载失败会清理延迟 timer。
- worker 初始化 timeout 为 300000 ms；timer 仅在 worker client 的 `initialize()` 内、
  创建 worker 后、发送 initialize 请求前创建。10 秒预热延迟不计入 300 秒窗口。
- 当前 run 若加入进行中的 prepare，而 prepare 以 `worker_initialization_timeout` 或
  `engine_initialization_timeout` 失败，直接返回 failed，不自动再 initialize。
  旧 prepare 已失败后才开始的 run、或 timeout 后用户再次主动开始的 run，仍可重新 initialize。
  非 timeout 的 joined prepare 失败保持既有一次恢复尝试；错误分类按明确 code 匹配。
- 保留失败 worker 清理、手机 timeout / initialization failed 恢复提示和现有浏览器缓存行为。
  不改模型、OCR 算法、识别规则、PWA precache、UI 样式或上一轮宿主修改。
- 此前双触发预热修复阶段仅变更 `yuanstar-embed.js`；当时 CSS、worker、模型、ORT、经验规则资源均不变。
  完整 12 文件与构建目录 SHA-256 一致，当前哈希以 manifest 为准。
- 此前修复阶段的定向验证包含源码 TypeScript、runtime / worker / import 测试和执行真实 vendored embed 的
  fake timer 回归，覆盖 10 秒延迟、双 trigger、310 秒 / 303 秒超时边界及卸载清理。
  真实手机网络、后台挂起与 OCR E2E 未在本轮验证；本阶段最终收口只重建、同步与提交 YuanHub，不 push。

## 待办

- 公开的 YuanStar 仓库目前没有嵌入构建入口（`mountYuanStar`、`src/product-import-draft.ts`
  等只存在于构建产物中）。建议把嵌入构建入口与其 CI 一起公开，或改为由 CI 从
  YuanStar 构建后发布到本仓库，从而让 embed 差异可被 review。
- worker 的两份闲置 embedded WASM 已由本轮官方 export condition 移除，当前 worker 约 0.115 MiB；
  不再按每次同步增加约 36 MB 估算。内容 hash 命名与资源存储方式保持现状。
- 上游把 `importCaptureBatch` 被顶掉的分支从裸 `return` 改为 `return false`（或 reject），
  以闭合上面的宿主 ↔ embed 契约缺口；同步后在本仓库补返回值断言。
- 宿主已为跨版本 CaptureBatch 增加非阻断告警；上游 standalone 入口可同步提示，
  保留 `capture_game_invalid` 合法性校验。
- 明确「仅看待养成」开关是否进入视图快照/恢复（当前视图快照不含该开关状态）。

## 2026-10-03：计划编辑按钮布局小修

- 本次仅调整 `web/src/product.css` 的计划按钮规则：两端对齐、均匀分布，宽度充足时同宽，
  空间不足时自然缩至内容宽度；360px 以下收紧按钮内边距和间距，始终保留单行文字和 44px 高度。
- 此前按钮小修阶段由源码执行 `npm.cmd run build:embed`，当时产物差异只有 `yuanstar-embed.css`。
  当时 JS、worker、模型、ORT 与经验规则资源字节均未改变，完整 12 文件与构建目录 SHA-256 一致。
- 已在运行中的 `/star` 真页检查 320 / 351 / 390 / 430 / 1440px；按钮同行，窄屏无水平溢出。
  没有修改按钮 handler 或其它 UI；该修复已进入当前正式 source commit，最终收口不继续调整 UI。

## 2026-10-03：上一阶段最终收口验证（external-WASM 修复前）

- 当时从已提交 source HEAD 执行 `npm.cmd run build:embed` 通过，构建前后源码工作树干净。
- 完整同步后，全部 12 个 vendored 文件与构建目录及 manifest SHA-256 一致；相对同步前产物没有任何字节变化。
- `node node_modules/vitest/vitest.mjs run behavior/embedProduct.spec.js behavior/starRecoveryUx.spec.js`：16 / 16 通过。
- `node --test test/yuanstarEmbedProvenance.test.js test/starCloudStatus.test.js test/starCaptureHostWiring.test.js`：8 / 8 通过，含 provenance 校验。
- 两仓 `git diff --check` 通过；只提交 YuanHub 当前阶段的 8 个文件，不 push。
