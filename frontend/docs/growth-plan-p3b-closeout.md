# 养成计划 P3-B 本地交付

## 2026-10-10 人工验收后收口状态

主要UI已人工验收。最新源码9文件已提交为`836c40c4b55e7787e8ddf1ab47564354b495b82c`，工作树clean；从该提交正式重建并同步12个embed文件，集合、字节及SHA-256一致，manifest为该SHA和clean来源。宿主提交范围为当前17个相关文件，包含此前集成、最新资源状态/紧凑弹窗、开发预览及本次演示恢复边界修复；最终宿主提交可由本feature的git log及远端引用确认。

最小隔离测试复现了“响应丢失后重置虚拟服务器，旧本地pending仍恢复并遇到回执404”。重置及切换场景现在只清理虚构DEMO_USER/DEMO_ACCOUNT/如鸢的原v1恢复键，不清理其他用户、账号或游戏记录，不改变正式幂等流程及持久格式。新增两项回归，使用Mock transport，没有真实资源写入。

本次授权仅为三仓origin同名feature非强制推送；Backend仍保持`5788e39e9183792392bcdd839b1d6ccbce89fbb9`且clean，不新建Backend提交、不重跑历史Mongo专项。生产STAR_COMPLETION=false，不合并main、不开PR、不部署。以下原本地交付内容及未提交/未push状态均为此前阶段的历史记录；本次专项与推送结果另见最新UI交付和最终报告。

本轮完成确认弹窗、用户实际资源输入、三个API adapter、固定操作持久恢复、权威结果采用及隔离Mock。公开Backend未部署P3，真实账号入口和transport均关闭；没有真实资源扣减，没有Backend修改、push、merge、rebase、PR或部署。普通预览仍使用公开Backend。

## A. Git与实际文件

两前端仓均保持`feat/growth-plan-workspace-p1`。源码由`42ae3599a8173fd6c5e81bcde3a9c2fc21a68a1b`到本地提交`d9411b3abf6ad74c01df0c80c11037ede0dd9f9d`，工作树clean。为满足正式同步的clean来源约束，按用户条件授权在功能及隔离UI验证完成后提交这9个文件。宿主HEAD仍为`185ee361faf42770993a3aca284903e2c7efbdbf`，本轮15个文件未提交。旧开发分支及已有提交均保留。

源码提交文件：

- `docs/growth-plan-p3b-review.md`
- `web/package.json`
- `web/src/growth-plan-view.ts`
- `web/src/product.ts`
- `web/src/star-completion.ts`
- `web/src/star-completion-dialog.ts`
- `web/src/star-completion.css`
- `web/tests/growth-plan.test.ts`
- `web/tests/star-completion.test.ts`

宿主修改/新增文件：

- `src/api/starCompletions.js`
- `src/config/features.js`
- `src/pages/star/index.vue`
- `src/pages/star/starCloudCoordinator.js`
- `src/pages/star/starCompletionPort.js`
- `src/pages/star/dev/starCompletionMock.js`
- `src/pages/star/dev/starCompletionDemo.js`
- `test/starCompletion.test.js`
- `test/yuanstarEmbedProvenance.test.js`
- `scripts/sync-yuanstar-embed.mjs`
- `docs/yuanstar-embed-manifest.json`
- `docs/yuanstar-embed-sync.md`
- `docs/growth-plan-p3b-closeout.md`
- `public/yuanstar-embed/yuanstar-embed.js`
- `public/yuanstar-embed/yuanstar-embed.css`

Backend仅只读参考，仍为`feat/star-growth-completion-p3` / `5788e39e9183792392bcdd839b1d6ccbce89fbb9`，工作树clean；本轮未运行Backend/Mongo测试。

## B. 实例与generation核对

现有`cloudInventory`将`starInstanceId`原样转换为`instance_id`；Host账号ID也是既有工作区ID。云协调器维护generation及writer revision，先读取并采用云状态。完成prepare要求writer不存在pending/saving/error，context与当前user/account/game、generation/star revision一致；库存revision必须有效。完整inventory、planTargets、经验及bag业务投影一致后，再以稳定ID逐颗核对当前/目标等级；同名不同ID分别提交。提交前重读context并要求与草稿一致，禁止模糊匹配。

公开P3接口未部署，本轮没有对真实账号读取completion-context，故不声称已验证真实账号数据对应关系。无法取得一致上下文时关闭提交；入口当前默认关闭。

## C–F. UI及实际例子

演示入口：`http://127.0.0.1:5175/star?star_completion_demo=1`。只在Vite DEV且显式URL参数为1时启用，普通`/star`默认关闭。无需开启新服务或切换Backend。演示显示明确的虚构账号标记；账号ID、用户ID、实例及库存独立于真实账号。可以使用“重置演示数据”和“下次模拟响应丢失”。

截图只保存在被Git忽略的`.ux/audits/`，未入库：

| 证据 | 文件 |
| --- | --- |
| 桌面40→50默认确认 | `p3b-desktop.jpg` |
| 起点/终点同时勾选，实际数量橙2/紫3/白4 | `p3b-boundaries-edited.jpg` |
| 3颗同时完成，包含同名天府40→50和43→60 | `p3b-multi.jpg` |
| 390宽度多颗弹窗，独立列表滚动 | `p3b-mobile.jpg` |
| 响应丢失后的冻结与原请求重试 | `p3b-pending.jpg` |
| 刷新恢复后权威状态、路线及Undo | `p3b-recovered.jpg` |

40→50的解谪/解殃为默认50/20、仅起点已突破0/0、仅终点额外突破110/80、两端修正60/60。43没有起点选项，60没有终点选项。橙2/紫3/白4实际为3.9k，允许低于67k的单颗估算；3颗示例估算302k，瓶子160/100。库存null显示“—”，与已知0分开；正数必须有已知足够库存，明确0不虚构未知库存余额。

保持原左右1:1、筛选、名称汇总、组编辑、卡片及按钮体系。新弹窗使用原品质/资源标签和原工作簿helper，桌面输入32px、coarse pointer44px。浏览器检查1440/390，并测320/768无弹窗横向溢出（scrollWidth等于clientWidth）；Escape返回完成按钮。截图与检查是浏览器视口模拟，非实体手机触控/软键盘验证。

## G–I. Transport、冻结及恢复

adapter维持snake_case、既有JWT和ApiResult解包，并通过expectedUserId阻止身份变化后的请求重放。真实feature flag固定false，adapter在transport调用前拒绝。Mock直接注入transport，仅接受虚构账号及三个已定义路径；没有fetch、没有真实POST失败后fallback、没有localhost Backend。演示不会进入真实账号Session，Mock模块/fixture在最终生产JS中未出现。

确认前生成operation_id，storage写入原scope和完整POST正文成功后才发请求；正文递归冻结，pending输入不可编辑。持久键按user/account/game隔离，不保存JWT。网络、500/503、401及并发同操作等保留原命令；400/403/明确404/明确409/422可结束未成功命令，幂等正文冲突仍保留身份并提示停止。恢复先GET原回执；star_completion_not_found的404保留待定状态，显式重试仍用原ID/正文。跨账号或用户不能发送/采用旧命令。

浏览器实际模拟已提交但响应丢失，确认输入和关闭被锁定，刷新后查询原回执并恢复；观察区间完成接口网络请求数为0。新transport读取持久虚拟服务回执的单元测试证明不重复消费。Mock只作前端验证，不宣称真实Mongo或公开Backend E2E。

## J. 成功采用及Undo

先核对回执身份及canonical原正文，再读最新context，避免用历史receipt.state回滚后来发生的操作。宿主现有CAS writer取得账号绑定的completion租约；待定期间拒绝committed回调的普通PATCH，采用context的generation/revision。源码通过既有ProductWorkspaceController.applyCloudBusinessSnapshot事务及新WorkspaceSession采用状态；清理完成选择、UI Undo/Redo、无效路线，保留其他路线原顺序。余额由context提供，不再PATCH等级、不import扣减，也不直接修改IndexedDB。普通Undo不能撤销成功的消费。

## K. 实际验证

- 源码新增完成命令专项32/32，0失败/跳过，覆盖附件26项要求，包括storage失败不发送、历史回执不回滚、稳定ID不模糊匹配。
- 宿主新增完成专项10/10；连同云协调器、瓶子库存兼容、embed provenance共50/50。
- 受影响feature flags、云状态提示及inline重试回归8/8。
- 原养成计划、cloud-business、product-workspace回归通过；源码typecheck及build:embed通过。
- 最终宿主production build及OCR压缩校验通过。构建仅有既有动态/静态import提示，未新增分包资产。
- 两仓git diff --check通过。正式embed全12文件集合、字节及SHA-256一致，source provenance为上述真实commit、clean工作树；只JS/CSS内容变化。同步脚本仅将阶段说明改为通用文字，dirty/HEAD/集合门禁未放宽。
- 生产JS检查无虚构用户/账号/实例ID、模拟transport、临时dirty preview路径。

最小复验：源码`web`内运行`npm run test:star-completion`和`npm run typecheck`；宿主运行`node --test test/starCompletion.test.js test/starCloudCoordinator.test.js test/growthPlanInventory.test.js test/yuanstarEmbedProvenance.test.js`。本轮没有全量无关测试。

## L–M. 保护与人工验收

公开Backend仍未部署P3，真实入口关闭，真实完成POST未发送。本轮不修改Backend、不部署、不push/PR；宿主修改等待人工审查。启用真实命令和部署须另外授权及实际API联调。

已读取ui-ux-pro-max及项目设计/响应式/开关规范，执行了以上聚焦静态与浏览器审查。当前环境未找到项目所述usability-audit/audit-cuj技能入口，因此未声称执行这些技能的完整审计。UI审查记录与截图隔离在`.ux/audits/`。

待人工确认：弹窗信息密度、实际消耗录入、端点“已突破”表达、多颗列表滚动及未知结果恢复提示。未进行公开API E2E、真实扣减、实体手机软键盘/触控或完整屏幕阅读器验证。保留本地恢复数据，不将Mock成功表示为真实云保存成功。
