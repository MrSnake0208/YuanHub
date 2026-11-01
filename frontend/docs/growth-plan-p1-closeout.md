# 养成计划 P1 本地提交收口

日期：2026-10-08；risk_level=L3；verification_owner=agent。
源码仓与宿主仓均沿用`feat/growth-plan-workspace-p1`。
源码P1 commit：`d0d1760edf2442edea45eaf983fd1f533789e742`。
宿主集成提交包含本报告；具体宿主HEAD以`git log -1`和本次交付报告为准，避免文档自引用commit。

## 确认的设计与行为

用户已确认计划页只用「应用筛选」、没有「清除」按钮；背包整理和养成计划星石品质有意共享最新五组配色（橙#F5BE7D/#653D20、紫#D4BDF0/#503B74、蓝#B3D9F1/#2B526B、绿#BCE2BF/#345B3D、白#DEE0E3/#4C4E53）和600字重。保留现有1:1双栏、编辑/资源/路线/摘要结构、教程位置与文案、全部控件高度。没有继续UI美化。

左侧选择与编辑按可见对象收敛，名称汇总双击下钻；路线只取当前账号targetLevel>level对象，独立于左侧筛选、排序与视图。当前/计划等级是人工修正与规划，预览后显式保存，不等于完成养成、不扣资源。

已确认经验规则与最新reference一致：橙/紫/白1000/500/100，逐级累加、每颗按100经验向上取整；紫折合为经验/500。突破默认current<=node<target，五个节点10/20/30/40/50分别消耗(5,0,0)/(10,0,0)/(30,30,0)/(0,50,20)/(0,60,60)。起点/终点helper仅定义单次边界纠正契约，尚无完成确认流程。

## 瓶子保存风险与发布条件

当前瓶子编辑已有真实后端写入能力，复用inventory/import单项stock_snapshot+listed，并使用jiezhuping、jiezheping、jieyangping stable ID；当前账号读取和异步响应隔离已保留。不会以full盘点覆盖其他道具；已确认import的重试仅GET，未确认请求保留原记录。

import acknowledged后，GET数量若持续与保存目标不一致，pending可能持续阻止重新编辑及账号切换。用户明确将恢复完善列入P2，本轮保留代码、不改协议或Backend，不以此阻止开发分支本地提交。正式发布相应写入功能前必须完成冲突恢复、安全重读、重新编辑、确认记录不重复import、账号隔离与状态恢复。

## 实际验证与限制

- Source：TypeScript noEmit、经验规则、growth-plan、当前实例更新、名称汇总、历史、资产流程专项通过；pending-only19项、view-follow10项通过；build:embed与OCR external MJS/WASM guard通过。
- Host：growthPlanInventory/manualStock/bagTutorial/recognitionTutorial33项、starCloudCoordinator/starCloudRetryUi/starCloudStatus10项Node测试通过。
- Host：growthPlanEmbed12项、embedProduct17项、starRecoveryUx33项，共62项行为通过，均为mock/隔离fixture；没有真实账号库存写入测试。
- 受影响Vue SFC / JS语法编译9文件通过；provenance6项、host正式build（含PWA/OCR预压缩）与两仓diff检查均通过；保留既有动态import构建警告，未扩大修复范围。
- Source提交后clean工作树重新正式build/sync，12资源字节及SHA-256全覆盖一致，产物和上述62项行为使用的版本完全相同；manifest指向source P1 commit、clean状态，不再表示dirty开发快照。
- Python专项`python -m pytest tests/test_phase0_6_experience_rules.py -q`未执行成功：系统和bundled运行时缺pytest，系统也缺openpyxl；两个受影响Python文件UTF-8/AST语法检查通过。本轮不安装新依赖、不将历史通过当作本轮执行。
- 未运行完整CI/全仓套件、手机真机、完整视口矩阵、真实账号库存写入/冲突恢复或资源扣减事务测试。之前已验收的页面证据继续有效，本轮没有改UI源码或重跑自动美化。
- 没有发现P1本地提交阻塞项；Python验证是已报告的环境缺口，瓶子冲突恢复属于P2和正式发布前保护。

## 本次提交路径

YuanStar authoritative source（16个路径，含1个删除）：

- `resources/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx`
- `resources/reference/YuanStar_Phase0_6A_经验星曜规则与逐级数据.xlsx（删除）`
- `src/yuanstar/experience_rules.py`
- `tests/test_phase0_6_experience_rules.py`
- `web/docs/growth-plan-p1-review.md`
- `web/docs/python_experience_runtime_mapping.md`
- `web/package.json`
- `web/scripts/copy-runtime-assets.mjs`
- `web/src/experience-rules.ts`
- `web/src/growth-plan-view.ts`
- `web/src/growth-plan.ts`
- `web/src/product.css`
- `web/src/product.ts`
- `web/tests/experience-rules.test.ts`
- `web/tests/growth-plan.test.ts`
- `web/tests/product-pending-only.test.mjs`

YuanHub wrapper/embed integration（16个路径，含1个删除）：

- `behavior/growthPlanEmbed.spec.js`
- `behavior/starRecoveryUx.spec.js`
- `docs/growth-plan-p1-closeout.md`
- `docs/yuanstar-embed-manifest.json`
- `docs/yuanstar-embed-sync.md`
- `public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx`
- `public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜规则与逐级数据.xlsx（删除）`
- `public/yuanstar-embed/yuanstar-embed.css`
- `public/yuanstar-embed/yuanstar-embed.js`
- `src/pages/star/RecognitionTutorial.vue`
- `src/pages/star/bagTutorial.js`
- `src/pages/star/growthPlanInventory.js`
- `src/pages/star/index.vue`
- `test/bagTutorial.test.js`
- `test/growthPlanInventory.test.js`
- `test/yuanstarEmbedProvenance.test.js`

## P2 待办（本轮不实现）

1. 右侧路线checkbox多选。
2. 排序数字直接编辑。
3. 卡片拖动排序。
4. 路线顺序持久化。
5. 按路线累计经验与瓶子需求。
6. 当前库存预计可完成至此。
7. 资源缺口精确提示。
8. 本次选中资源需求汇总。
9. 瓶子库存保存冲突恢复机制（安全重读、重新编辑、确认记录不重复import、账号隔离及恢复）。
10. 完成所选养成的写回与实际资源扣减；实施前单独审查事务和revision。

只做本地commit。未push、rebase、merge或开PR；没有实现以上P2事项。完成后停止，下一轮再继续P2。
