# 养成计划 P2-A / P2-B 本地交付

基线：源码 HEAD `d0d1760edf2442edea45eaf983fd1f533789e742`；宿主 HEAD `50d9d49c5fe12b0161722a573977afd5294c7aa7`。两仓保持 `feat/growth-plan-workspace-p1`；本轮专项通过后按最新 prompt 授权本地 commit，未 push / PR / merge / rebase / reset / stash。只修改本轮允许的两个仓库。

1. **实例与持久化**：复用 `starInstanceId`。Workspace V1 增加可选 `growthRouteOrder: string[]`，schemaVersion 仍为 1，IndexedDB 版本、object stores 和 Backend 协议不变。复用账号工作区事务、revision、撤销/恢复链路；仅存顺序引用，不重复保存实例。新增待养成目标追加，已达成或失效引用清理。旧快照兼容测试通过。
2. **保存边界**：顺序按当前账号及其现有 gameVersion 工作区隔离，刷新和 embed 重挂载保留。云投影仍不包含路线字段，排序不触发星石/资源云写入；云 hydration 保留本机有效顺序。JSON 文件通过可选 `growthRouteInventoryIndices` 保留排序并映射到既有导入实例；旧 JSON 可读。本地恢复点可恢复准确顺序。排序不跨设备同步，仅云端历史恢复点无法恢复历史路线。
3. **多选与排序**：checkbox 以实例 ID 保存本次选择，不持久化；换账号/重挂载清空，左侧选择及筛选无影响。同账号数字/拖动重排保持选中对象。数字无常驻框，支持 Enter、blur 单次确认、Escape 撤销和非法输入恢复提示。整卡鼠标拖放，触屏长按 350ms 激活，提前滑动超过 8px 保留滚动，边缘自动滚动；无新增把手、按钮或拖拽依赖。checkbox 重渲染保留键盘焦点。
4. **资源**：复用 P1 工作簿逐级经验和瓶子节点算法，经验条为 0，库存必须完整确认。完整路线连续累计产生前缀分界，与 checkbox 无关。首项不足直接提示，全部足够给末尾提示，未知/失败/保存未确认显示无法估算。缺口标为「路线累计缺口（至第 N 颗）」并逐资源显示红色数值，卡片保持本颗需求，避免把累计缺口说成单颗无法养成。右下两行摘要只累加选中实例；完成按钮始终 disabled，不写回等级或扣库存。
5. **滚动与样式**：至少 5 颗时根据实际卡片位置设内部滚动高度；桌面约 4.5 张，768/390 窄屏约 2.5 张，少于 5 颗完整展开。资源和摘要在列表外。渐隐不接收指针，滚到底消失。保留 1:1 桌面布局、底部对齐、字体、品质、资源标签及现有按钮高度；未扩大按钮 padding。
6. **教程**：背包整理的同行右侧入口显示「重新查看使用教程」并打开 bag 模式；截图导入显示「重新查看识别教程」并打开 recognition 模式；计划显示「重新查看养成教程」并打开 plan 模式。复用现有组件。仅删除原计划教程中已失效的「路线顺序暂未开放」描述，不重写教程步骤。

## 实际修改文件

源码仓（18 个文件）：

```text
web/src/business/growth-route.ts                  新增：路线引用规范化
web/src/business/model.ts                         V1 可选字段
web/src/business/snapshot.ts                      快照兼容与清理
web/src/business/session.ts                       同一排序状态的业务操作
web/src/business/cloud-business-snapshot.ts        hydration 保留本机顺序
web/src/product-workspace.ts                      账号保存与恢复兼容
web/src/product-data-transfer.ts                  JSON 顺序映射
web/src/growth-plan.ts                            累计需求/缺口/可完成前缀
web/src/growth-plan-view.ts                       卡片/摘要/分割线
web/src/growth-route-controls.ts                  新增：数字、拖动、滚动测量
web/src/product.ts                               多选与工作区保存接线
web/src/product.css                              必要的滚动及交互样式
web/tests/cloud-business-snapshot.test.ts
web/tests/growth-plan.test.ts
web/tests/product-workspace.test.ts
web/tests/product-account-controller.test.ts
web/tests/product-data-transfer.test.ts
web/docs/growth-plan-p2-review.md                  新增：源码审查包
```

YuanHub（10 个文件）：

```text
src/pages/star/index.vue
src/pages/star/bagTutorial.js
behavior/growthPlanEmbed.spec.js
behavior/starRecoveryUx.spec.js
test/yuanstarEmbedProvenance.test.js
public/yuanstar-embed/yuanstar-embed.js             正式构建产物
public/yuanstar-embed/yuanstar-embed.css            正式构建产物
docs/yuanstar-embed-manifest.json                  正式产物哈希及已提交源码来源
docs/yuanstar-embed-sync.md                        本轮来源记录
docs/growth-plan-p2-closeout.md                    本报告
```

截图、验收脚本及 results.json 在 `.ux/audits/growth-plan-p2/`，属于隔离产物，不提交到 Git。

## 已执行验证

- 源码 `test:growth-plan`、`test:product-workspace`、`test:product-data-transfer`、`test:product-account-controller`、`test:cloud-business` 全部通过；TypeScript `npx tsc --noEmit` 通过。
- 宿主五个专项行为文件共 **85 / 85** 通过；新增全选、完成目标选择清理和标签字重回归。源码提交后的最终产物又通过养成/恢复行为 **55 / 55** 与 provenance **6 / 6**；最终宿主 build 同样通过。包含单/多选、重排后选择、账号隔离、非法序号、单 revision 提交、Escape、鼠标拖放、触屏滚动/长按/取消、边缘滚动、IDB 重挂载、旧云 hydration、新增/达成目标及资源与选择独立性。
- Node 定向测试 **41 / 41** 通过：provenance、库存 writer 原行为、三种教程及云 coordinator。未改 P1 库存 writer。
- 正式 `build:embed` 和 OCR 资源护栏通过。完整同步 **12** 个资源；文件集不变，逐文件字节与 SHA-256 一致，未手改 JS/CSS。manifest 记录新 source commit `847b408f278368016305721fe64f21e6eb8e3890` + clean 工作树，去掉旧 dirty 源码哈希。
- 宿主 `npm run build` 通过，PWA 与 OCR gzip 生成/校验通过。构建有既有静态/动态混合 import 警告，不阻断构建。
- 两仓 `git diff --check` 通过。
- 隔离 Edge / Playwright 真页验收四个视口，均无页面横向溢出、无 pageerror。桌面左右宽分别 518/518px（1440）与 534/534px（1600），左右底部均 943.75px；路线高度 494.09px，准确露出第 5 卡约一半。768 路线 297.09px；390 路线 370.69px，按窄屏真实卡高约 2.5 张。受检控件均保持 **32px**。
- 滚到底末卡底部与列表底部差 0.22px（取整），末卡完整可见且渐隐关闭；资源和摘要位置不随内部滚动改变。真实鼠标长距离拖动触发自动滚动，并能把第一卡移到原视口之外的末尾；刷新后完整排序保留，选择清空。数字修改、三个教程场景真实打开均验证。
- 所有浏览器业务 API 均 mock，请求记录只有 GET；未向真实账号写入虚构库存、星石或经验。

可重复的最小命令：

```sh
# 源码 web 目录
npm run test:growth-plan
npm run test:product-workspace
npm run test:product-data-transfer
npm run test:product-account-controller
npm run test:cloud-business
npx tsc --noEmit
npm run build:embed

# YuanHub 根目录，正式同步后
node --test test/yuanstarEmbedProvenance.test.js test/growthPlanInventory.test.js test/bagTutorial.test.js test/recognitionTutorial.test.js test/starCloudCoordinator.test.js
node node_modules/vitest/vitest.mjs run behavior/growthPlanEmbed.spec.js behavior/starRecoveryUx.spec.js behavior/bagTutorial.spec.js behavior/recognitionTutorial.spec.js behavior/embedProduct.spec.js
npm run build
```

## 截图与预览

预览：[http://127.0.0.1:5175/star](http://127.0.0.1:5175/star)。复用已有 5175 服务；公网代理 `/version` 返回 ESA 后端版本，`/ready` 为 401，证明代理可达，不代表已登录就绪。没有使用本地 8080。

截图全部使用 **7 颗路线的隔离 mock 账号**，不代表真实账号库存：

- [七颗路线、约 4.5 卡与缺口分割线](../.ux/audits/growth-plan-p2/route-seven-and-resource-gap.png)
- [内部下滚后末卡完整可见](../.ux/audits/growth-plan-p2/route-scrolled-bottom.png)
- [多选后的固定两行摘要](../.ux/audits/growth-plan-p2/selected-summary.png)
- [直接修改排序状态](../.ux/audits/growth-plan-p2/route-order-edited.png)
- [鼠标边缘自动滚动完成重排](../.ux/audits/growth-plan-p2/route-native-edge-drag.png)
- [背包整理入口](../.ux/audits/growth-plan-p2/bag-tutorial-entry.png) / [使用教程实际打开](../.ux/audits/growth-plan-p2/bag-tutorial-open.png)
- [养成计划教程入口与实际打开](../.ux/audits/growth-plan-p2/growth-tutorial-entry.png)
- [导入场景识别教程实际打开](../.ux/audits/growth-plan-p2/recognition-tutorial-entry.png)
- 视口：[1440](../.ux/audits/growth-plan-p2/viewport-1440.png)、[1600](../.ux/audits/growth-plan-p2/viewport-1600.png)、[768](../.ux/audits/growth-plan-p2/viewport-768.png)、[390](../.ux/audits/growth-plan-p2/viewport-390.png)
- [测量及请求记录](../.ux/audits/growth-plan-p2/results.json)

## 未验证与后续边界

- 未测试真实登录账号云端写入、多设备并发和真实手机长按/惯性滚动/系统手势；触屏自动化是合成事件及视口验证，不能替代真机。未跑全仓 CI 或真实 OCR。
- P2-C：P1 已知的瓶子保存后读回冲突/pending 恢复风险仍保留，writer 未修改；正式发布写入功能前仍需解决。
- P3：真正完成养成、等级写回、扣料及确认流程仍未开放；完成按钮始终 disabled。
- 排序跨设备同步与仅云端历史排序恢复需要后续协议评审，本轮没有扩展 Backend。

## 本次审查收口

源码 commit：`847b408f278368016305721fe64f21e6eb8e3890`。宿主提交包含本报告，最终宿主 HEAD 以本分支 `git log -1` 和聊天交付结果为准。

统一规则在 `normalizePlanTargets`，`normalizeWorkspaceState`、legacy backfill、Session、云投影/hydration 和 JSON 导入导出复用；只保留目标高于当前等级的存在实例。`normalizeGrowthRoute` 保留其余相对次序、清理达成/失效引用，当前选择移除退出 ID，其余选中保持。当前等级超过目标也自然清理，无二次删除确认；保留实例和资源。

旧 V1 快照与 JSON 均可读；JSON 顺序通过 inventory 位置映射到新 ID，重复/越界/非整数排序引用清理。云历史等于/低于当前等级目标本地规范化，hydration 不发 autosave；IDB backfill 幂等，不产生循环 revision。Undo 和本地恢复点恢复合法历史待养成状态。OCR 证据隔离、Backend 协议、云 generation/revision 写入门禁保持。

全选在完成按钮左侧，按账号完整待养成路线，不受左侧过滤影响；半选显示 indeterminate。缺经验旁显示紫星曜标签与折算颗数；选中摘要紫标签复用现有资源样式。卡片及选中紫星曜数、选中瓶子数量加粗；左侧预计经验普通字重，其余不变。真实页面测得序号与名称中心相同，虚线位于数字下方，按钮仍32px；多选摘要保持两行，底部框72px。

未来跨 generation 可参考本机、JSON 和本地恢复点中的有效顺序；这不构成旧/新实例身份映射。源顺序仅存在另一设备时，现有云投影没有该字段，无法恢复。P2-C acknowledged/readback 冲突恢复、组级编辑/跨品质关系审查、跨 generation 意图迁移和 P3 真正扣料均留待后续。

[全选后摘要截图](../.ux/audits/growth-plan-p2/selected-all-summary.png)。两仓本地提交完成后停止，保留预览等待人工验收。
