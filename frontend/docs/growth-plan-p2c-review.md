# 养成计划 P2-C 库存冲突恢复审查包

日期：2026-10-08；risk_level=L3（账号绑定及会话内未完成写入）；verification_owner=agent。范围仅宿主和集成源码；停待用户人工验收。

## 交付结果

已确认的瓶子写入与读回数量不一致时，显示目标/当前数量，锁定瓶子编辑，并提供“重新读取”“使用当前库存”。后者要求可验证的同账号服务器基线，点击时再次读取；不自动重写目标值。接受后恢复输入和账号切换，新编辑生成新 record_id。未确认记录保持原身份、时间和正文重试。

不开发组编辑、跨 OCR generation 或 P3，不新增第二套计划数据。不 commit、push、rebase、merge 或 PR。

## 真实调用链与修复判断

1. embed `product.ts` 中瓶子字段 change/Enter→blur 调用 `saveGrowthBottle`。空值、负数、非整数不写；明确0可写。保存中和 pending 中三个瓶子字段均禁用；经验字段保持原语义。
2. 宿主 `index.vue` 的 `onSaveBreakthroughInventory` 进入 `growthPlanInventory.js` writer。先 GET 当前账号 item 库存并校验响应，effective_at 使用 `nextManualSnapshotTime`，晚于 full 和目标条目的 listed 基线至少1ms；record_id 为 `yuanhub:manual:<UUID>`。
3. 复用 `buildManualStockSnapshot` 生成 v2 文档后，明确改为 stock_snapshot/listed，entries仅含编辑的瓶子（包括0）。绕过 full helper 的省略零行为，不发送其他物品条目；不改变 full writer 或 serializer。
4. `src/api/inventory.js`→原 `serializeInventoryExchangeDocument`→`request.js` POST。恢复调用可选绑定 expectedUserId；GET恢复调用带 Cache-Control:no-cache 重新验证，普通 inventory 调用默认选项不变。既有超时和同身份401重放仍用原正文。
5. 只有单记录 accepted=1 或 duplicates=1 才确认；未确认保存原 document。确认后绝不再次调用 import，后续只 GET。superseded/history_only 已存档但未改变库存，保持显式恢复，不能伪装为成功。
6. 宿主 writer 按站点用户ID和游戏账号ID保留当前应用会话中的 pending/busy，组件卸载不会丢掉原记录；晚到的 POST 确认仍写回原会话状态，但旧组件不得继续发布库存结果。账号上下文版本、站点身份版本及 embed mount/sequence 同时拒绝过期响应，包含A→B→A。

旧机制的死循环是 acknowledged pending + 数量不一致 → 只读重试 → 永远拒绝新编辑。另一个直接相关问题是读回HTTP拒绝也会清 pending；修复后只允许首次 POST 的明确拒绝解除保护，已确认读回失败以及曾有不确定尝试后的拒绝均保留记录。

## 修改前后的状态流

| 状态/事件 | 原机制 | 本轮行为 |
| --- | --- | --- |
| 初次有效编辑 | GET→生成listed单项文档→POST | 保持，并绑定账号/身份/上下文 |
| POST断网、超时、确认体无效 | 原文档pending；重试POST | 保持相同record_id/effective_at/正文，明确未确认提示，禁止接受库存 |
| POST可靠确认 | acknowledged→GET | acknowledged，后续所有恢复均GET |
| GET数量一致 | 解除pending | 正常解除pending，恢复编辑 |
| GET数量不同 | acknowledged永久重试 | conflict，显示目标与当前值，GET重读或用户显式接受 |
| GET失败/账号错/数量无效 | 部分HTTP错误会清pending | 保留acknowledged，撤销旧接受资格，重新读取 |
| 用户接受可靠库存 | 无出口 | 再GET校验账号/数量/基线，成功后解除pending |
| 接受后新编辑 | 被旧pending阻止 | 新UUID和新effective_at，独立保存操作 |
| 卸载重挂/外部账号切换 | 组件局部writer；可能遗失操作 | 会话内按用户/账号保留，其他账号独立处理 |

## 可靠性判据与 Backend 边界

静态只读核对 Backend 的 `InventoryService.import`：交换文档完整校验，重复同正文计 duplicates，记录和 current 更新在 TransactionTemplate 内执行，返回后该事务完成。`current` 直接读取 inventory_current；返回 full_baseline_at 与各项 listed_baseline_at。没有改动 Backend 仓库，也没有验证公用部署版本。

接受资格要求：原POST已可靠确认；最新GET通过账号/item/非负安全整数校验；目标瓶子的 `max(full_baseline_at, listed_baseline_at) >= 原effective_at`。缺失、无效或更早基线不开放接受；其他物品的新基线、updated_at或仅数量相同都不会赋予冲突接受资格。点击接受时再次GET并重新检查，读取失败或基线倒退保留pending。基线证明当前快照已推进到本记录或更新记录；不推断其他用户的修改原因。

如果部署仍持续返回更早/无基线、确认响应不符合协议、原记录被删除重建导致基线丢失，前端不能保证最终稳定。恢复路径是保持保护、重新读取；持续无法确认时需 Backend 核查原 account_id/record_id、事务结果和 current 基线，恢复协议证据后再读或接受。不能用自动覆盖目标值解除这种异常。

本轮保留的是同一应用会话内的卸载/重挂状态，未引入跨整页刷新、浏览器关闭/崩溃的持久化队列。刷新前仍有未确认写入时，应先在本页原记录重试确认；已经丢失会话则需服务器记录核查，不能宣称刷新能恢复同一幂等操作。跨标签页、多设备同瓶子同时编辑仍没有CAS/服务器版本前置条件；其更强并发保证需后端协议支持。读取后再次发生库存变化也不能由前端锁定服务器。

## P2-C 实际修改文件

宿主代码：
- `src/pages/star/growthPlanInventory.js`：状态、可靠读回、显式接受、原记录重试与会话隔离。
- `src/pages/star/index.vue`：三种callback接线、身份/上下文保护、pending切号状态。
- `src/api/inventory.js`、`src/api/inventory.d.ts`：可选身份绑定及恢复读取的缓存重新验证。

宿主测试：
- `test/growthPlanInventory.test.js`。
- `behavior/growthPlanInventoryApi.spec.js`、`behavior/growthPlanInventoryIdentity.spec.js`（新增）。
- `behavior/starRecoveryUx.spec.js`、`behavior/growthPlanEmbed.spec.js`（保留原测试并增加恢复测试）。
- `test/yuanstarEmbedProvenance.test.js`（原dirty provenance断言中增加product.ts）。

产物与审查：
- `public/yuanstar-embed/yuanstar-embed.js`：正式构建输出。
- `docs/yuanstar-embed-manifest.json`、`docs/yuanstar-embed-sync.md`：dirty源码与同步证据。
- 本报告 `docs/growth-plan-p2c-review.md`（新增）。

集成源码：`web/src/product.ts`、`web/src/growth-plan-view.ts`、`web/docs/growth-plan-p2-review.md`。前两项只扩展库存恢复，不修改业务规则/实例/计划或排序状态；审查文档只追加P2-C。

## 保留 P2-A/B 与后续 UI

进入任务时两个HEAD/分支与prompt一致，宿主6个dirty文件、源码4个dirty文件。源码新增的唯一dirty路径为product.ts；其余是保留的文件。

- 源码 product.css 与 growth-plan.test.ts 相对本轮开始SHA-256完全一致；此前养成审查文档原字节前缀保持不变。
- CSS产物相对本轮开始hash仍为 `98756194f5f170111970da043c34ab624ae89e459a5233a8540ecde10153428b`，其git dirty来自此前UI，不是本轮新CSS修改。
- 保留缺口行布局、紫经验折合、空选择0、有效待养成目标及达成清理、多选、序号编辑、拖拽、排序本机持久化/JSON映射、累计缺口和预计边界、4.5卡片窗口、三种教程入口。已有相关行为回归通过。
- 正式build:embed完整同步12个文件且与dist/embed逐字节一致；manifest五个dirty源码文件hash逐一核对。CSS、worker、模型、ORT、规则表保留原字节；没有手改生成JS/CSS，也没有把dirty源码归入干净commit。
- 未改按钮/输入/卡片高度、配色、两栏结构或页面间距。新增反馈复用已有按钮样式与移动触控覆盖，status朗读区域和恢复后键盘焦点。

## 实际验证与结果

全部写入测试均使用mock/fixture。未向真实账号写虚构库存，未运行真实OCR，未启动/重启/停止开发服务，未运行全量CI。

- Node定向55/55，其中growthPlanInventory专项26/26，覆盖三瓶、0、null拒绝、未确认原文档重试、已确认GET、数量冲突、接受新数量、新ID、HTTP读失败、晚到响应、重复操作和重挂隔离。
- 行为定向累计125/125：growthPlanEmbed 27、starRecoveryUx 40、growthPlanInventoryApi 2、growthPlanInventoryIdentity 5、embedProduct 17、inventoryStockBaseline 30、activeAccount 4。最终七组联合124/124后，新增有效B账号隔离用例及更严格双账号fixture，starRecoveryUx40/40再次通过，其他六组无代码变更。
- 源码typecheck、test:growth-plan、正式build:embed及OCR资产guard通过。
- 宿主npm run build通过，OCR gzip产物生成/校验通过。
- 两仓git diff --check通过；分支、HEAD与index保持原值，未暂存。
- 早期三瓶专项失败是提示文案断言需与新冲突文案同步；已保留原一致性断言并补恢复行为测试。请求身份fixture首次漏掉既有beta门禁mock导致4项失败；补齐mock后5/5通过，最终联合定向也通过。未削弱有效断言、未skip任何测试。

最小复验命令（已执行，无需自动追加全量检查）：

```sh
node --test test/growthPlanInventory.test.js test/manualStock.test.js test/inventoryExchange.test.js test/activeAccount.test.js test/latestAccountSync.test.js test/starCaptureHostWiring.test.js test/yuanstarEmbedProvenance.test.js
node node_modules/vitest/vitest.mjs run behavior/growthPlanInventoryIdentity.spec.js behavior/growthPlanInventoryApi.spec.js behavior/starRecoveryUx.spec.js behavior/growthPlanEmbed.spec.js behavior/embedProduct.spec.js behavior/inventoryStockBaseline.spec.js behavior/activeAccount.spec.js
npm run build
```

源码web目录：`npm run typecheck`、`npm run test:growth-plan`；修改源码后再运行`npm run build:embed`并走正式同步流程，不能手改产物。

## 人工验收与剩余风险

在隔离测试账号/fixture中检查：目标10/当前8的冲突反馈；连续“重新读取”不增加POST；接受当前库存后输入与切号恢复；再保存0产生新记录；未确认错误只允许原记录重试。手机390px、平板768px、桌面1440px确认两个恢复按钮可达、不溢出，现有控件高度和卡片窗口保持原样。测试使用jsdom，不把几何/布局断言冒充真实浏览器/真机验证。

真实部署的事务与读取基线、多设备并发、移动端实际网络和触控、屏幕阅读器朗读与真实布局未验证。用户人工验收前不继续UI美化、不开发组编辑/跨generation/P3。

## 两仓 Git 现场

两仓均为 `feat/growth-plan-workspace-p1`，未切main、未合上游。
- 源码HEAD：`847b408f278368016305721fe64f21e6eb8e3890`，5个tracked dirty路径；无新增untracked源码路径。
- 宿主HEAD：`02895e71ddca6fc13edbb629ddb34a75b618769f`，12个tracked dirty路径、3个untracked文件（两项API行为测试和本报告）；其中CSS仅为此前dirty状态。
- 暂存区均无改动。不reset、clean、stash或覆盖用户成果；未修改YuanStar-public及其他仓库。


## 2026-10-09 提交前修正与收口

资源摘要已删除pending目标的乐观覆盖：未确认/读取中/无可靠读回显示未知，可靠冲突显示当前数量，正常保存显示最终读回；冲突仍不可估算及编辑。writer状态机未改。源码提交`2af9d51a40ea6b083a7f597b28c9d28963f27de5`；源类型检查/养成专项/正式构建通过，受影响行为74/74、writer/provenance32/32通过。宿主按限定文件清单提交本阶段，后续P2-D独立保留dirty。此前2026-10-08的未提交状态与验收记录是历史快照。
