# 后端实施 Prompt：密探面板无感采样与审核后台

状态：可直接投递给 BackEndV3-Share 开发 Agent  
目标仓库：`/home/syoius/BackEndV3-Share`  
任务范围：按密探开关无感采集实际攻生、反推白值候选、异常检测、管理员审核 API  

```text
你正在修改 MaaYuan Share / YuanHub 的 Spring Boot + Kotlin + MongoDB 后端。

工作仓库：
/home/syoius/BackEndV3-Share

目标：
在不增加用户操作、不影响现有密探保存成功率的前提下，从现有识图上报和玩家手动校正保存中自动留存“游戏内实际攻击/生命面板”候选样本；管理员可以逐密探开启或关闭采集、查看每条样本反推的 m 值和异常程度、接受或软排除无效样本。

本批次是影子采集系统：采集结果不得自动修改线上面板公式、公共图鉴或用户当前养成数据。

一、开始前必须完整阅读

后端仓库规则与现状：
- /home/syoius/BackEndV3-Share/AGENTS.md
- /home/syoius/BackEndV3-Share/README.md
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCurrent.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/request/OperatorCurrentPatchRequest.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorService.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorV3ImportService.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/account/SubAccountService.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/AdminOperatorCatalogController.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorCurrentFoundationServiceTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorV3ImportServiceTest.kt

现有前端事实与公式参考：
- /home/syoius/YuanHub/src/utils/operatorCombatStats.js
- /home/syoius/YuanHub/src/data/operatorPanelCalculator.js
- /home/syoius/YuanHub/src/pages/operator/index.vue
- https://wiki.biligame.com/yuan/%E9%9D%A2%E6%9D%BF%E8%AE%A1%E7%AE%97%E5%99%A8

相关协议与既有实现说明：
- /home/syoius/BackEndV3-Share/docs/operator-growth-persistence-upgrades-api.md
- /home/syoius/YuanHub/docs/backend-operator-current-foundation-spec.md
- /home/syoius/YuanHub/docs/operator-growth-data-exchange-protocol-v3.md
- /home/syoius/YuanHub/docs/operator-auto-scan-integration-plan.md
- /home/syoius/YuanHub/docs/future-work/operator-combat-data-coverage-2026-08-23.md

先检查两个仓库的工作树，保留所有无关改动。只修改后端仓库；不要修改 /home/syoius/YuanHub 的前端代码。

二、必须冻结的业务语义

1. 命盘和天赋不影响这里采集的基础攻击/生命面板，不进入输入快照、输入签名或公式。

2. 化极小节点是固定值加成，位于百分比乘区之前；最终公式为：

   result = (m + x) * (1 + y)

   x 包含：
   - 奇闻纯数值 attack/hp；
   - 橙色星石固定值；
   - 橙色星石组合固定值；
   - 化极小节点固定值。

   y 包含：
   - 修为百分比；
   - 化极星级/觉醒百分比；
   - 橙色星石百分比；
   - 橙色星石组合百分比。

   每条样本分别反推：

   m_attack = observed_attack / (1 + y_attack) - x_attack
   m_hp     = observed_hp     / (1 + y_hp)     - x_hp

3. 星石公式只考虑橙色品质。不存在同名不同属性版本。样本快照仍必须保存六槽 type/name/level 和明确空槽，不能只保存非空星石列表的无上下文摘要。

4. 奇闻只有 attack.current 和 hp.current 参与公式。special 不进入采样签名、反推或异常分组。

5. 普通密探和 SP 必须使用不同 formula_family：
   - normal：普通密探；
   - sp：SP 密探。
   SP 规则目前未知。允许采集 SP 原始样本，但没有明确规则资料时 derived status 必须是 missing_rules，绝不能套用 normal 公式。

6. 本批次的观测来源只允许：
   - scan：识图/自动上报产生的 combat_stats.observed_attack / observed_hp；
   - manual：玩家在现有养成卡片或完整编辑器保存的 combat_stats.manual_attack / manual_hp；
   - admin：管理员在后台明确录入的基准候选。

   不新增 passive_save 或 player_manual。无感保存只是传输方式，不是数据来源。

7. 当前后端 scan 行为必须保持：source=scan 且请求包含 observed_attack/observed_hp 时属于 fresh observation；服务端为了前端显示把 observed 值镜像到 manual 字段，不代表产生第二条 manual 样本。scan 样本必须使用原始 observed_*，不得再从镜像的 manual_* 重复采集。

8. manual 样本识别条件：
   - PATCH reason=manual_correction；
   - combat_stats.source=manual；
   - 本次原始请求至少显式包含一个非 null 的 manual_attack/manual_hp；
   - 取值来自本次 manual_*，输入上下文来自 PATCH 成功后的服务端权威 OperatorEntry。

9. imported 默认不进入样本库。v3 备份恢复、普通导入和历史回放不得制造公式样本。source_kind=scan 的正式 OpenAPI 扫描提交仍按 scan 处理，但必须有稳定的来源 record/event id 并幂等。

10. 自动计算出的 attack/hp 不得成为观测样本。仅切换 display_mode、保存自动展示值、修改备注/annotation/target/favorite 都不能采样。

11. 缺公式资料不等于丢弃数据：保留完整原始样本，将 derived.status 标为 missing_rules，并列出 missing_rule_fields。禁止猜测 SP、化极节点、未知星石或未知修为规则。

12. 样本只用于后台候选和分析。本批次不得自动回写 operatorPanelCalculator、公共图鉴、operator_current 或任何生产公式。

13. “本地缺规则”与“需要玩家采样”不是同义词。覆盖工作流必须区分：
   - complete：本地规则完整；
   - source_sync_needed：公开资料可能已有，但后端/前端规则尚未同步；
   - sample_needed：核验并同步现有资料后仍缺，才需要玩家样本；
   - data_malformed：现有资料数组长度、档位映射或内容异常；
   - missing_rules：缺少反推 x/y 所需资料，已有样本暂不可计算；
   - sp_research：SP 独立规则待研究；
   - verification_only：公式已有，仅采样验证。

   采集开关始终由管理员显式控制。系统不得因为发现 missing_rules/source_sync_needed 就自动开启采集。

三、持久化模型

A. operator_combat_collection_policy

唯一键建议为 (game, operatorId)。至少包含：

- id
- game
- operatorId
- enabled：默认 false；只有管理员显式开启的密探才采样
- collectAttack：默认 true
- collectHp：默认 true
- formulaFamily：normal 或 sp；默认按公共图鉴 spOf 派生，持久化后也必须与目录身份一致
- targetTiers：可选管理目标，例如 [{level:90, elite:15}, {level:100, elite:17}]
- coverageWorkflowStatus：complete / source_sync_needed / sample_needed / data_malformed / missing_rules / sp_research / verification_only
- sourceNote：可选，记录待同步资料或缺口依据
- note
- revision
- createdAt / updatedAt
- updatedBy

要求：
- 开关关闭只停止新增/更新样本，不影响用户正常保存；
- 关闭不删除历史样本；
- 已有策略更新使用 expected_revision CAS；
- 修改策略留管理员审计；
- 公共目录删除密探时按现有约束处理策略和样本，不允许出现无主数据；若现有目录不允许删除有依赖记录，应增加清晰冲突；
- 子账号删除不删除 policy，因为 policy 是全局管理配置。

B. operator_combat_observation

每条样本至少包含：

- id
- game
- operatorId
- formulaFamily
- observationSource：scan / manual / admin
- ingestionChannel：可选诊断字段，如 openapi_scan / current_patch / admin_api；不作为业务来源
- contributorKey：不可逆或服务端加盐的稳定贡献者键，不能在管理员响应中暴露 userId/accountId
- sourceEventId / sourceRecordId：如存在则保存，用于幂等
- canonicalInputSignature：服务端根据输入快照计算，不能信任前端签名
- level
- elite
- starLevel
- starStones：固定六槽规范化快照；每槽 type/name/level，空槽明确为空
- oddityAttack
- oddityHp
- observedAttack：nullable
- observedHp：nullable
- observedAt
- rawInputVersion
- formulaVersion
- derived：见下文
- qualityFlag：normal / suspicious / conflict / missing_rules
- qualityReasons：字符串码数组
- reviewStatus：pending / accepted / excluded
- reviewReason
- reviewedBy / reviewedAt
- revision
- createdAt / updatedAt

不要保存：
- 命盘；
- 奇闻 special；
- annotation、养成状态、备注、favorite、growth targets；
- 账号名称、用户名或可直接识别个人的信息；
- 自动计算显示值。

贡献者键仍需支持用户撤回/删除：可使用服务端密钥加盐 HMAC(userId + accountId)，子账号删除时用同一算法删除该账号对应样本。不要使用无法在删除流程中定位的随机匿名值。

C. derived 子结构

每个维度独立保存/返回：

{
  "attack": {
    "status": "computed|missing_value|missing_rules|invalid_input",
    "x": 0.0,
    "y": 0.0,
    "m": 0.0,
    "group_center": 0.0,
    "absolute_deviation": 0.0,
    "relative_deviation": 0.0,
    "robust_z_score": 0.0,
    "missing_rule_fields": []
  },
  "hp": { ... }
}

原始快照是事实源；derived 是可重算投影。公式版本变化、规则资料变化或审核状态变化后必须能重算，不能只保存 m 而丢失 x/y/原始值。

D. 公式资料模型

后端要完成 m 反推，必须有可版本化的规则资料。不要把 JS 作为运行时依赖。请按后端项目风格建立 Kotlin evaluator + JSON/resource 或 Mongo 管理资料，至少覆盖：

- 普通密探化极每个小节点的 attack/hp 固定增量；
- 普通密探化极星级/觉醒百分比；
- 修为百分比规则；
- 橙色星石各名称、等级的固定值/百分比；
- 橙色星石组合固定值/百分比。

现有前端权威实现和静态数据位于：
- /home/syoius/YuanHub/src/utils/operatorCombatStats.js
- /home/syoius/YuanHub/src/data/operatorPanelCalculator.js

首版可以将其规范化为后端 resource，并为 Kotlin evaluator 添加与前端一致的 golden tests。只移植橙色星石规则；不得移植命盘和奇闻 special。

移植前必须先执行覆盖审计，不能直接复制当前 JS 数组：

- 当前图鉴目录共有 121 位密探；
- 当前本地面板表只有 89 条普通密探记录；
- 严格五档口径下，快照统计为 44 位完整、45 位部分缺失/结构异常、30 位普通密探完全无本地规则、2 位 SP 规则未知；
- 详细名单和口径见 `/home/syoius/YuanHub/docs/future-work/operator-combat-data-coverage-2026-08-23.md`；
- 以上是仓库快照，不是需要硬编码进服务的常量。规则同步后必须动态重算覆盖状态，并在交付说明中列出新旧统计差异。

后端规范化资料不得继续使用“缺项后其余元素左移”的裸数组表达档位。标准 m 档位必须使用带键结构，例如：

{
  "50_7":  {"attack": 0, "hp": 0, "status": "missing|known", "source": "..."},
  "60_9":  {"attack": 0, "hp": 0, "status": "missing|known", "source": "..."},
  "80_13": {"attack": 0, "hp": 0, "status": "missing|known", "source": "..."},
  "90_15": {"attack": 0, "hp": 0, "status": "missing|known", "source": "..."},
  "100_17":{"attack": 0, "hp": 0, "status": "missing|known", "source": "..."}
}

化极节点也应使用明确节点键或经过严格长度校验的结构，不能靠不完整数组的位置猜测节点。

当前陆逊资料是必须锁定的回归案例：`Level_HP` 有 5 项，但 `Level_ATK` 只有 4 项，且没有空位占位。不得直接把四项依次映射到前四档或后四档；必须标 data_malformed，回查来源后再录入明确档位。BWiki 当前公开表能看到陆逊 90/100 白值和低档活动实际值，因此优先修复资料生成/映射，不应自动开启玩家采集。

BWiki 当前页面标注已更新至司马孚、赵云，并明确注明司马孚缺 90+15。当前本地规则却完全没有二者。它们初始应标 source_sync_needed，而不是直接 sample_needed；先同步可用资料，再由管理员决定是否开启缺口采集。其他本地缺失的新密探也遵循同一流程。

注意：Level_HP/Level_ATK 是待验证/维护的 m 资料，不应在反推候选时当成 observed truth。可以用于对照 residual，但不能覆盖由样本反推的 m。

如果某个新密探缺少 Pay_ATK/Pay_HP 等计算 x 必需资料，则样本照常入库但标 missing_rules。管理员以后补齐规则后应能重算。

四、采集挂接点与可靠性

1. 必须在现有 current/scan 提交成功并得到合并后的权威 OperatorEntry 后构造候选事件。

2. 样本采集失败不得让用户的密探保存失败。优先采用现有事件机制、after-commit 处理或可靠 outbox；如果项目没有 outbox，可以实现有日志、指标和可重试的 after-commit best-effort，但必须说明取舍。不要为了非关键样本使 PATCH/scan commit 返回失败。

3. 候选处理时再次读取 collection policy；enabled=false 立即结束，不写样本。

4. scan 分支：
   - 只读取原始请求/scan record 的 observed_attack/observed_hp；
   - source 必须是 scan；
   - observed_at 优先使用上报时间，否则使用提交有效时间；
   - 服务端镜像到 manual_* 的字段不参与第二次采样。

5. manual 分支：
   - 只读取原始 PATCH 中显式非 null 的 manual_attack/manual_hp；
   - reason/source 必须同时满足前述条件；
   - null 表示清除手动值，不产生新样本；
   - 如果只提交 attack，只产生 attack 维度，hp 保持 null，反之同理。

6. admin 分支：
   - 由管理员 API 显式创建；
   - 必须提交完整输入快照；
   - observationSource 固定为 admin；
   - 默认 reviewStatus=accepted，但仍保留计算异常提示，不能因为来源是 admin 就篡改数学结果。

7. 幂等与重复：
   - 同一 sourceEventId 重放必须返回/复用原样本；
   - 同一贡献者、operatorId、game、observationSource、canonicalInputSignature 重复保存相同实际值时 upsert/刷新时间，不新增行；
   - 同样配置但实际值改变时更新该来源样本并保留审计，或新增 revision；不得无上限堆积重复点击保存的数据；
   - scan 与 manual 可以作为两条不同来源展示，但统计“独立贡献者数”时同一 contributorKey 只计一次；
   - 不允许把同一 scan 的 observed_* 和镜像 manual_* 计两次。

8. canonicalInputSignature 至少包含：
   - game/operatorId/formulaFamily；
   - level/elite/starLevel；
   - 六槽规范化橙色星石 type/name/level/empty；
   - oddityAttack/oddityHp；
   - input schema version。

   不包含命盘、special、display_mode、前端 combat_input_signature、annotation 等无关值。

五、m 反推、分组与异常检测

1. 每条可计算样本在服务端分别计算 attack/hp 的 x、y、m。使用足够精度的 BigDecimal 或项目等价精确实现，不要先把中间值四舍五入成整数。

2. m 共识分组键：
   (game, formulaFamily, operatorId, level, elite, dimension)

   starLevel、星石和奇闻可以不同；它们在反推时应从 x/y 中消除。不同 level/elite 的 m 不得混组。

3. 公式来源建议的“无星石玩家自测”属于 clean 样本：
   - 六槽为空且奇闻明确：高置信度；
   - 有橙色星石且全部规则可解析：derived 样本，仍可反推但标记依赖项更多；
   - 未知星石、非橙色输入或缺规则：missing_rules，不进入共识。

4. 异常判断不能只用算术均值。实现稳健统计：
   - 展示 median 作为 groupCenter；
   - 展示清洗后 mean 仅作辅助；
   - 使用 MAD/robust z-score 识别离群候选；
   - 自动异常只做 flag，不自动 excluded；
   - 显示面板存在个位数取整误差，必须使用可配置的 attack/hp absolute tolerance，不能要求 m 完全相等；阈值放配置并在文档说明，不要散落魔法数字；
   - robust z-score 推荐阈值 3.5，但仍需同时超过对应 absolute tolerance 才标 suspicious；
   - MAD=0 时仅按 absolute tolerance 判断；
   - 少于 3 条独立贡献者样本时不得判定单条离群：1 条标 insufficient_samples，2 条差异超容差标 conflict；
   - excluded、missing_rules、invalid_input 不进入共识；
   - accepted 样本达到 3 个独立贡献者后优先用 accepted 集合；否则使用所有非 excluded 且可计算的候选形成临时共识，并在响应标 consensus_provisional=true。

5. 玩家可能漏改等级、修为、化极、星石或奇闻。自动系统只负责指出反推 m 与同组中心偏差大，并在详情中展示完整 x/y breakdown；不要武断声称具体漏改了哪个字段。

6. 公式/规则版本改变、样本审核改变、管理员新增/修改规则资料后，重新计算受影响组的 derived、center 和 flags。可以同步重算小集合，也可以使用后台任务，但结果必须最终一致且可测试。

六、管理员 API

沿用项目现有管理员认证、错误响应、分页和 snake_case 约定。推荐端点如下；若按现有 controller 命名做小幅调整，最终文档必须列出实际端点，但不能改变业务能力。

A. 覆盖总览

GET /v1/admin/operator-combat/coverage

查询至少支持：
- game
- query
- enabled
- formula_family
- status=complete|source_sync_needed|sample_needed|data_malformed|missing_rules|sp_research|verification_only|insufficient_samples|conflict|suspicious|covered
- cursor/limit

每个密探返回：
- 目录基础信息；
- policy 与 revision；
- attack/hp 分维度的样本数、独立贡献者数、accepted/excluded/suspicious 数；
- target tier 覆盖；
- 最近采样时间；
- missing rule fields；
- formula version；
- coverage workflow status、来源同步说明及管理员最后确认时间；
- overall status。

B. 密探详情

GET /v1/admin/operator-combat/{operatorId}?game=...

返回：
- policy；
- 公式资料摘要和缺失项；
- 按 level/elite 的 group consensus；
- 分页样本列表；
- 每条样本的来源、实际值、完整非个人输入快照、x/y/m、偏差、quality/review 状态和审核记录；
- contributor 只返回稳定匿名短标识，绝不返回 userId/accountId/账号名。

C. 修改采集策略

PUT /v1/admin/operator-combat/{operatorId}/policy?game=...

请求示例：
{
  "enabled": true,
  "collect_attack": true,
  "collect_hp": true,
  "target_tiers": [
    {"level": 90, "elite": 15},
    {"level": 100, "elite": 17}
  ],
  "note": "新实装，优先补标准节点",
  "expected_revision": 0
}

要求：
- CAS 冲突返回 409 combat_collection_policy_revision_conflict；
- operator/game 不匹配按现有目录语义报错；
- enabled=false 后新事件不写样本，但历史数据仍可读取。

D. 审核样本

PATCH /v1/admin/operator-combat/samples/{sampleId}

请求示例：
{
  "review_status": "excluded",
  "reason": "玩家漏改星石配置",
  "expected_revision": 3
}

要求：
- pending / accepted / excluded；
- excluded 必须有非空 reason；
- 从 excluded 恢复时保留历史审核审计；
- CAS 冲突返回 409 combat_observation_revision_conflict；
- 软排除，不物理删除；
- 审核后触发所在共识组重算。

E. 管理员录入样本

POST /v1/admin/operator-combat/samples

必须提交 game/operatorId、实际 attack/hp 至少一个、完整 level/elite/starLevel、六槽星石和 attack/hp 奇闻。服务端规范化、计算签名和 derived。来源固定 admin，默认 accepted。

F. 公式资料与重算

如果采用 Mongo 管理公式 profile，增加受 revision 保护的管理员读写接口和重算入口；如果首版采用 versioned resource，则至少提供只读规则摘要、missing_rule_fields 和内部重算 service。无论哪种方案，管理员详情页必须知道为什么某条样本无法反推。

七、生命周期、安全与可观测性

1. 子账号删除时级联删除该账号贡献的 observation；通过可重算 contributorKey 精确定位。扩展 SubAccountService 测试。

2. 用户删除或撤回样本的能力若已有统一隐私删除入口，接入该入口；若当前没有，至少把内部 service 和文档留清楚，不得宣称不可删除的“完全匿名”。

3. policy 和公式规则是管理员全局数据；普通用户接口、OpenAPI token 和 scan token 均不能读写管理员审核状态。

4. 日志不得打印完整用户 ID + 样本输入；记录 sample id、operator id、来源、结果状态即可。

5. 增加指标或结构化日志：
   - candidate received/skipped(policy off)/deduplicated/persisted/failed；
   - source 分布；
   - missing_rules/suspicious 数；
   - 重算失败数。

6. 管理员响应不暴露 contributorKey 全值；可返回服务端生成的短标识用于判断同一贡献者。

八、错误码

至少提供稳定错误码：

- combat_collection_policy_not_found：404（仅在需要既存策略的操作使用）
- combat_collection_policy_revision_conflict：409
- combat_observation_not_found：404
- combat_observation_revision_conflict：409
- invalid_combat_collection_policy：422
- invalid_combat_observation：422
- invalid_observation_source：422
- invalid_observation_input：422
- unsupported_combat_formula_family：422
- combat_formula_rules_missing：422（管理员要求立即计算/发布时使用；自动采样缺规则不得失败，而是 missing_rules）

沿用现有 account_not_found、operator_not_found、invalid_game、account_game_mismatch 和管理员未授权响应。

九、测试要求

至少覆盖以下单元、服务、契约和回归场景：

采集开关：
1. 无 policy 时默认关闭，manual/scan 保存成功但不写 observation；
2. enabled=true 时正常采样；
3. enabled=false 后停止新增但历史样本保留；
4. collect_attack/collect_hp 分维度生效；
5. policy CAS 冲突和管理员权限正确。

来源语义：
6. scan + observed_attack/observed_hp 生成且只生成一条 scan 样本；
7. scan 镜像到 manual_* 不产生第二条 manual 样本；
8. manual_correction + source=manual + manual_* 生成 manual 样本；
9. 只改 display_mode、只保存自动计算模式、manual_* 为 null 均不采样；
10. imported/v3 backup restore/replay 默认不采样；
11. 单维度数据只计算对应维度；
12. 样本服务失败不影响原 current PATCH/scan commit 成功。

快照与幂等：
13. 输入快照来自保存后的权威 OperatorEntry；
14. 六槽空位、星石顺序规范化后签名稳定；
15. 命盘和 special 改变不改变采样签名；
16. 等级、修为、化极、星石或 attack/hp 奇闻改变会改变签名；
17. 同 event 重放幂等；
18. 同贡献者重复点击保存不堆积重复行；
19. scan/manual 同贡献者统计独立贡献者数只计一次。

覆盖审计与资料同步：
20. 从当前前端快照生成的覆盖审计能识别 121 位目录、89 条规则记录以及 44/45/30/2 分类；如果实施期间规则已更新，测试改为锁定更新后的 fixture，并在交付报告解释差异；
21. 陆逊 5 项 HP / 4 项 ATK 不会发生静默错位映射，必须报告 data_malformed；
22. 司马孚、赵云在本地未同步状态下可标 source_sync_needed，系统不会自动开启采集；
23. keyed tier 资料缺某档时只影响该档，不会使后续档位左移；

公式：
24. Kotlin evaluator 与前端现有规则的 golden fixtures 在典型普通密探、化极中间节点、橙色固定值星石、百分比星石和组合效果上结果一致；
25. 反推 m 使用 (observed/(1+y)-x)，中间过程不先取整；
26. 奇闻 attack/hp 进入 x，special 完全忽略；
27. 命盘完全忽略；
28. 非橙色/未知星石或缺 Pay 数据标 missing_rules，原始样本仍保存；
29. SP 默认 missing_rules，不套 normal；
30. formula version 更新后可以重算 derived。

异常检测与审核：
31. 1 条样本不判异常，标 insufficient_samples；
32. 2 条明显不一致标 group conflict，不武断排除某条；
33. 至少 3 个独立贡献者时按 median/MAD 识别明显离群值；
34. 未超过 absolute tolerance 时不标 suspicious；
35. excluded 不进入共识；
36. exclude 必须填写原因，支持恢复且保留审计；
37. 审核状态变化会重算 group center 和 flags；
38. 管理员手动样本来源、默认 accepted 和异常数学结果均正确。

安全与生命周期：
39. 管理员列表不暴露 userId/accountId/账号名称或完整 contributorKey；
40. 普通用户无权访问 policy、样本和审核 API；
41. 子账号删除级联删除其 observation，不删除全局 policy；
42. 现有 operator current、v3 import/export、升级扣库存、annotation、growth targets、favorites 全量测试不回归。

十、明确禁止

- 不修改前端仓库；
- 不增加用户提交按钮、同意弹窗或新的普通用户采样 API；
- 不把自动计算结果当观测值；
- 不从保存后的 manual_* 反推 scan 来源并重复采样；
- 不采集命盘、奇闻 special 或主观养成资料；
- 不默认采集全部密探；无 policy 时必须关闭；
- 不把 source_sync_needed 自动等同为 sample_needed，不对可能已有公开资料的密探自动开采集；
- 不把当前前端不完整数组直接复制为后端权威资料，不允许缺项导致档位左移；
- 不因采样失败阻断用户保存；
- 不让 imported/备份恢复产生重复样本；
- 不自动排除 suspicious 样本；
- 不物理删除管理员排除的数据；
- 不根据单条或两条样本自动发布 m；
- 不自动修改生产公式或公共图鉴；
- 不给 SP 猜普通公式；
- 不覆盖后端工作树中的无关改动，不顺手重构无关模块。

十一、建议实施顺序

1. 先运行并固化覆盖审计，识别 source_sync_needed / data_malformed / sample_needed，禁止先复制数组；
2. 将可核验规则规范化为 keyed tier/node 资料并添加陆逊错位回归测试；
3. 建 policy/observation 实体、Repository、索引与 CAS；
4. 建服务端 canonical snapshot/signature 和 contributor key；
5. 从现有 scan/manual 成功链路发布候选事件，先完成原始留样和幂等；
6. 移植橙色星石/普通化极规则并加 golden tests；
7. 实现 derived m、分组共识和异常检测；
8. 实现管理员 policy/detail/review/admin sample API；
9. 接入子账号删除和可观测性；
10. 更新 Swagger、README 和独立接口文档；
11. 运行定向测试、ktlintCheck 和完整测试。

十二、验证与交付

执行至少：

cd /home/syoius/BackEndV3-Share
./gradlew ktlintCheck
./gradlew test

最终回复必须列出：
- 实际修改文件和新增 Mongo collections/indexes；
- scan/manual/admin 三种来源的最终判定规则；
- 采样为什么不会阻断用户保存；
- policy 默认关闭和逐密探开关语义；
- 覆盖审计结果、source_sync_needed 与 sample_needed 的判定，以及与 2026-08-23 快照统计的差异；
- keyed tier/node 资料结构及陆逊异常行的实际处理；
- 完整管理员接口文档及 JSON 示例；
- canonical signature、幂等和去重策略；
- m 反推公式、规则版本和 missing_rules 行为；
- median/MAD、absolute tolerance、样本不足时的行为；
- 软排除、恢复和审核审计语义；
- 子账号删除和隐私字段处理；
- 定向/完整测试命令与结果；
- 尚未具备的 SP 或新密探公式资料，不得用猜测掩盖。

完成标准：
- 管理员可以逐密探开关采集；
- scan observed_* 与 manual manual_* 按现有协议各自且仅采一次；
- 用户正常保存完全无新增交互，采集故障不影响保存；
- 每条可计算样本都有 x/y/m 和可解释 breakdown；
- 多样本时可标异常但不会自动排除；
- 管理员能接受、软排除、恢复并填写理由；
- 缺规则和 SP 样本仍安全保留；
- 采集结果不会自动污染线上公式；
- 全量后端测试通过。
```
