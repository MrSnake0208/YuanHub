# P2-D 组级批量编辑分配修正

2026-10-09。risk_level=L3，verification_owner=agent。完成后等待人工验收，不 commit/push/PR/rebase/merge。

## A. 旧实现问题根因

- `previewGrowthGroup` 把已达标与未达标全部塞进 assignments；视图据此把自动抵扣名额也渲染为可选择名额。旧 updates 实际已将达到目标的实例设为 null，因此不能把界面7个名额误报成已经持久化7条计划；本轮明确分离 satisfied 与 pending assignments。
- `groupInstances` 原先按来源顺序编号，没有先按当前等级排列；逐颗列表 comparator 则在相同等级时按随机实例 ID 兜底，两者可不一致。
- 默认选择的同成本优先项是“保留原目标”，优先级高于列表顺序。因此已有目标可能让后面的1级实例被提前选中；这会真实影响写回ID，不能只调显示编号。
- 云端验证为业务比较将 inventory 按 ID canonical 化，Session 则按 catalog/等级/来源正规化。同一事实的 raw record 与 Session 数组可顺序不同。修复期间专项暴露了直接指纹比较数组顺序会误报过期；最终保持事实 canonical，并在组级 separately 检查固定实例顺序，不放松真正的事实/revision保护。

## B–D. 最终规则与排序依据

1. 目标档位降序，各档名额独立，同一真实 ID 只使用一次。
2. 每档先以尚未使用且 currentLevel >= targetLevel 的实例抵扣；记录在临时 satisfied，禁止放进下拉。
3. 剩余名额取 currentLevel 更高的未达标实例；同等级复用 `snapshot.sortedInventory` 现有 sourceOrder、row、column 键，完全同键使用现有稳定列表顺序。没有新增随机 ID 选择优先级，也不再让旧目标抢先。
4. 养成计划逐颗列表同步使用上述来源键；背包整理 comparator 不改。预览生成时保存组内等级降序的 instanceOrder；编号1..N绑定原ID。渲染、换选不会重新分配或改编号；显式重新预览才重算。
5. 云端只有业务字段的实例，复用其已保存的 cloud_hydrated sourceOrder；原云端协议的 ID canonical 序列不变，不凭空恢复不存在的OCR位置。OCR/JSON模型未改。
6. 选项仅本品质组真实未达标实例，抵扣实例排除。已占用 pending 实例仅在交换后双方仍满足 current < target 时可选；否则不提供该选项，pure validation 也阻止确认。未占用实例释放旧ID、换入新ID。

## E. 指定例子实际 planTargets

固定编号：1–2号=60级，3–4号=40级，5–9号=1级。内部ID不变。

| 目标 | 抵扣 | 真正待养成 |
| --- | --- | --- |
| 60×5 + 40×2 | 1、2号 | 3→60、4→60、5→60、6→40、7→40，共5项 |
| 60×4 + 40×2 | 1、2号 | 3→60、4→60、5→40、6→40，共4项 |
| 60×5，当前60×3、50×1、40×1 | 三颗60 | 50→60、40→60，共2项 |
| 五颗1级，60×1+40×2 | 无 | 既有列表前三颗依次→60、→40、→40 |
| 全部已达标 | 全部抵扣 | 没有选择框或新增计划 |

隔离截图 A 的ID映射：1/2=`fixture-08`/`fixture-09`，3/4=`fixture-06`/`fixture-07`，5..9=`fixture-01`..`fixture-05`。
A默认新增：`fixture-06:60, fixture-07:60, fixture-01:60, fixture-02:40, fixture-03:40`。1/2不写计划，8/9不变。
手动截图将60名额3改选6号，原6号与5号交换；40名额2改选9号。应用：`fixture-06:60, fixture-07:60, fixture-02:60, fixture-01:40, fixture-05:40`。原其它组 `p:60, other:50` 保留。路线保留其它组在前，新增5个有效ID附后，没有孤立引用。

## F–H. 应用与冲突审查

- 预览/手动换选只改临时草稿，不改 planTargets，不触发宿主保存。
- 确认应用重新核对账号、mount generation、group epoch、previewRevision、事实fingerprint及分配合法性；调用原 `WorkspaceSession.setPlanTargets` 一次并进行一次 IDB expectedRevision 事务。正常组目标替换不增加弹窗。
- updates 覆盖当前大类+名称+品质组：分配为待养成者写目标；抵扣与未分配者清理该组旧计划。用户主动确认即同意替换。其它品质/名称/账号不在 updates 中。
- Session正规化保留仍待养成实例的原路线位置，包括目标改变的实例；取消/达成目标退出；新增 pending ID 按已有正规列表顺序附到末尾。没有另建groupGoals或完成历史。
- 一次批量业务操作对应一条 Session历史，立即Undo可整批还原。视图切换也属于现有UI撤销栈：如果应用后再切到逐颗明细，第一次Undo先撤销视图切换，下一次再撤销业务。本轮保留这一已有机制；浏览器隔离回放已验证恢复原2条其他组路线。
- 没有发现旧确认链路需要重构的真实保护遗漏。保留 revision CAS；账号切换、generation变化、实例集合/等级/目标/资源/来源顺序变更使预览失效。重复、缺额、错误品质、已达标重选及无效交换均拒绝。事实canonical不是忽略实例变更，只避免把同一事实的数组正规化排序误报冲突。

## I. UI

预览 label 在上、统一SoftDropdown在下；桌面4列优先，容器逐步3/2列，320px极窄1列。当前等级分布、目标等级与数量、目标字重600，不加字号。档位padding上下7→2px，卡片实测48→38px；输入、下拉、按钮仍32px。已有两栏1:1、路线伸展、标签配色、资源和库存恢复不改。

## J. 专项验证

- `npm.cmd --prefix web run test:growth-group`：37/37。A–G、稳定非字典序ID、抵扣、合法/非法交换、重复/缺额、Session原子应用/Undo/Redo、组隔离、旧目标替换与路线、陈旧事实、cloud record/Session正规化回归。
- `npm.cmd run test:behavior -- behavior/growthPlanEmbed.spec.js`：47/47，执行正式embed产物。新增A/B/C/D/G DOM与精确写回、手动替换、稳定编号和Undo；现有筛选、双击、路线拖拽、多选、缺口、库存writer恢复等仍通过。
- source `typecheck`、正式 `build:embed`/OCR guard通过；既有静态/动态 import 重复提示仍在。
- host provenance 6/6；两仓 diff检查及完整12文件源码/产物SHA-256/字节核对通过。
- 隔离页面1440px四列、430px三列、390px两列、320px一列，无横向溢出。1440px左右底部对齐；标题600；下拉32px。手机为浏览器模拟，未声称真实设备验证。
- 所有应用/撤销/库存读取为mock或独立本机fixture，没有向真实公共Backend写测试数据。不扩大全量测试或宿主全量构建。

## K. 截图与预览

正式预览：`http://127.0.0.1:5175/star`，仍使用公开Backend `https://api-hub.maayuan.com`。刷新后人工验收。

截图均为独立mock数据，位于被Git忽略的 `.ux/audits/p2d-allocation/`：

- `case-a.jpg`：60×5+40×2，5个待养成名额。
- `case-b.jpg`：60×4+40×2，4个待养成名额。
- `manual.jpg`：交换后再换入9号。
- `applied-detail-route.jpg`：准确逐颗结果和7条路线（5条本组+2条其它组）。
- `mobile-case-a.jpg`：390px两列预览。
- `editor-short.jpg`：38px档位。
- `responsive.json`：尺寸/溢出/对齐检查。

## L. Git与实际修改范围

两仓仍为 `feat/growth-plan-workspace-p1`：source HEAD `2af9d51a40ea6b083a7f597b28c9d28963f27de5`；host HEAD `7cec39af300b197a84b93659b22b9ef9d5ca96e3`。索引为空，已有未提交成果全部保留。

本轮新增修改：source `web/src/growth-group-plan.ts`、`web/src/growth-group-view.ts`、`web/src/product.ts`、`web/src/product.css`、`web/tests/growth-group.test.mjs`、`web/docs/growth-plan-p2d-review.md`；host `behavior/growthPlanEmbed.spec.js`、`docs/yuanstar-embed-manifest.json`、`docs/yuanstar-embed-sync.md`、两个生成入口JS/CSS、本报告。未修改 Session/业务模型/JSON/OCR/Backend/其它仓库。

累计未提交：source 7个 tracked + 4个 untracked；host 6个 tracked + 3个 untracked（包括此前两个报告及本报告）。以下为前轮已有、本轮继续保留：source package.json、Session、growth-plan-view、growth-route-controls、product-data-transfer test；host provenance test和此前P2-D报告。详细source dirty清单/hash由manifest记录。
