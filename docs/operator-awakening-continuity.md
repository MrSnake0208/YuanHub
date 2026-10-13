# 五星化极到觉醒：交互与回归记录

状态：开发完成后待用户主动集中回归；本文不代表最终验收。风险 L2：前端状态转换、人工校正、计划目标与需求显示；后端契约、库存、事务未修改。

## 基线与范围

- 前端起始 `main`：`1b3f321de11d0a1abc6730bbd443fde20fd299b5`；任务 01 的 `05cc0ae6a30f4023283a71091ae5a40e6c99dfe8` 已是祖先。
- 开发期间任务 03 独立提交为 `388e7e9f45cb4250e4a7dbf5158745be45be733e`，本次提交接在其后。其复核表单与导入改动不属于本次 diff。
- 后端起始与结束均为 `5321fcd253ab95970197303be17183d5c8351c70`，工作树保持干净。
- 本次仅覆盖主档案化极入口、完整编辑器、培养目标/需求与分享文字；不改导入归因、复核表单、导航、v2/v3/v4 协议或任务 01/02/03 状态。

## Review 证据与状态机

`operatorHuaji.js` 统一下一动作和草稿事实，`OperatorAwakeningDialog.vue` 负责人工记录，`operatorPlanGrowth.js` 处理目标进度与已知需求。`operator/index.vue` 的卡片与计划入口复用同一个动作分支；`OperatorGrowthTracker.vue` 用一次保存提交星级到觉醒的连续目标。

| 当前状态 | 原位置的动作 / 显示 | 写入与保护 |
| --- | --- | --- |
| 普通已拥有，stage 1..24 | 下一化极节点；24 的下一步是五星 | 沿用升级 preview/execute 与库存检查，最大 25 |
| 普通 stage25，awakened=false | 记录已觉醒 | 确认后仅 PATCH `huaji.awakened=true`，不扣库存 |
| 普通 stage25，awakened=null | 确认觉醒状态 | 明确选择 true/false；取消保留 null |
| 普通 stage25，awakened=true | 养成已完成 | 禁止重复记录 |
| 旧31、stage=null、awakened=true | 已觉醒（历史确认）／化极待确认 | 不猜 25；编辑器可单独补录阶段并保留 true |
| 隐密 rarity=3 | 终点 24；异常历史显示待复核 | 不提供普通五星/觉醒入口，不改写历史 |
| SP / movie | 保留自身稀疏化极与觉醒事实 | 无普通快捷化极/觉醒；不冒用普通材料表 |
| 未拥有、stage未知、目录资料不足或 capabilities 禁止 | 未拥有／待确认／无觉醒动作 | 不自动拥有，不推断阶段，其他字段仍可校正 |

完整编辑器按「星级及节点 → 五星之后·觉醒」排列。新确认 true 要先由用户核实五星；这只是前端人工复核保护。后端现有校验并未建立“true 必须 stage25”的硬不变量，因此历史低阶段或未知阶段的 true 原样保留，不新增全局拒绝规则。SP/隐密历史 true 校正阶段时不重复发送 `awakened:true`，避免误作新的不支持觉醒确认。

当前三态与兼容转换不变：普通旧25..30显示为 stage25；旧31只提供觉醒事实。卡片与编辑器的面板观测签名及 `observed_inputs.huaji` 使用同一份阶段草稿，避免补录阶段后被错误视为旧观测。低星未确认觉醒不再占用卡片/分享的默认显示空间。

## 用户旅程与计划语义

1. stage24 正常预览并执行已知最后一步消耗；返回 stage25 后，同一按钮变为觉醒记录入口，不请求 26 或 31。
2. 记录弹层说明“仅记录在游戏中已完成的状态，不由 Hub 扣除材料”。保留取消、错误信息与焦点；保存中阻止重复点击/关闭；409 先同步，再由用户重新确认，不能自动覆盖。账号/游戏切换、组件卸载后丢弃旧响应。
3. 培养目标可选“5 星”或“五星后·觉醒”。后者保存独立的 stage25+true；当前 false/null 时化极条显示 96%，不显示已完成。26 仅作视觉分母，未写入业务 stage。仅五星目标不强制觉醒。
4. 自建计划与特别关注均在点击保存后写云端，保留 revision、冲突反馈及账号隔离；取消不写。旧31目标按连续最终目标读取，新增保存不再写31。
5. 觉醒尚缺时显示“材料规则未知·暂不估算”，完整成本/ETA 不当作零或今天完成；已知等级、修为、化极材料仍参与排期。本体/SP 共享等级修为需求仍仅计一次。

后端无需变更的源码证据：`OperatorHuajiRules.patch` 保留未提供的子字段；`OperatorService` 的 Current PATCH 校验 `expected_revision`、合并事实并保留无变化 revision；该路径不调用升级库存扣除。`OperatorUpgradeService` 只有 level/elite/huaji，化极上限 25，SP 仍返回 `sp_huaji_upgrade_not_supported`。自建计划 Validator 与 GrowthTarget 已接受 `huaji`，不需要新增接口或服务器约束。

## 开发期验证

本次新增 `behavior/operatorAwakening.spec.js`、`behavior/operatorAwakeningPlan.spec.js`；更新 `test/operatorHuaji.test.js`、`test/operatorPlanGrowth.test.js`、`behavior/operatorEntryDefaults.spec.js`、`behavior/operatorSharePage.spec.js`。

定向证据覆盖：24→25 的升级边界；true/false/null；旧31补录；SP/隐密/capabilities；人工 PATCH 正文；无升级调用；取消、防重复、网络错误、409 同步、账号/游戏切换、卸载；目标保存/重载、custom/favorites 冲突、完成徽记、进度、未知成本与共享需求。

开发期实际执行上述六个 node 测试文件：73/73 通过；执行觉醒记录、计划、主档案、拥有状态、分享五个行为测试文件：91/91 通过。四个受影响 SFC 的 script/template/style 编译与 `git diff --check` 通过；不等同全站构建或完整回归。

复用现有 Vite 服务，通过 Playwright CLI 在 390×844 下挂载合成记录弹层：无横向溢出、按钮至少 44px、Tab 留在弹层、Escape 可关闭。所有 `/v1/**` 请求均拦截，不读取登录凭据、不写真实业务数据。该检查不是登录后的完整旅程，768/1440 及实际页面矩阵仍待集中回归。

## 待集中回归

在 `YuanHub/` 执行以下命令，按整批任务的提交范围合并检查，不能仅检查最后一个任务或未提交 diff：

```sh
node --test test/operatorHuaji.test.js test/operatorRequirements.test.js test/operatorPlanGrowth.test.js test/operatorTraining.test.js test/operatorCombatStats.test.js test/operatorShare.test.js
npm run test:behavior -- behavior/operatorAwakening.spec.js behavior/operatorAwakeningPlan.spec.js behavior/operatorEntryDefaults.spec.js behavior/operatorQuickFlow.spec.js behavior/operatorGrowthOwnership.spec.js behavior/operatorSharePage.spec.js
```

浏览器矩阵：390 / 768 / 1440px，图鉴卡片、完整编辑器、培养计划目标弹窗与记录弹层、分享、快捷入口；检查换行/溢出、触屏点击、键盘焦点与 Escape、错误重试、账号切换，以及持久化后重新加载。覆盖上述状态表与 24→25→人工觉醒完整旅程。

后端未改，不以本任务单独触发后端全套测试。整批若涉及后端 Current/目标/升级契约，再由集中回归合并 `OperatorHuajiRulesTest`、`OperatorServiceTest`、`OperatorUpgradeServiceTest`、`OperatorCurrentFoundationServiceTest` 与目标校验测试范围；Mongo/Redis 语义测试只能使用自有一次性容器。

## 尚未核实与并行衔接

普通觉醒材料身份、解锁条件以及 SP 觉醒条件仍未充分核实。本机预期路径 `/Users/snake/Desktop/Cal/m_components.csv` 当前不存在，不能沿用旧调查中的文件证据。[BWIKI 干吉](https://wiki.biligame.com/yuan/干吉) 展示独立觉醒条目，但本次未建立可用于自动扣料的完整材料/条件映射。自动觉醒扣料需另立任务，现有 [SP 材料延后事项](./known-issues/backend-deferred-sp-huaji-upgrade.md) 保留。

任务 02/03 可能共同触及 `src/pages/operator/index.vue`；本次未修改扫描复核组件或导入工具。任务 03 已先提交，应保留其祖先关系再应用本次提交；后续任务 02 应基于两者之后重放，仅处理导入/保存归因。需要冲突处理时按功能 hunk 核对，禁止整文件覆盖。
