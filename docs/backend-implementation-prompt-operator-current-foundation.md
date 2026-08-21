# 后端实施 Prompt：密探当前养成客观资料底座

状态：可直接投递给后端开发 Agent  
目标仓库：`/home/syoius/BackEndV3-Share`  
任务范围：双命盘、奇闻/攻生云同步、entry revision、安全局部校正

```text
你正在修改 MaaYuan Share / YuanHub 的 Spring Boot + Kotlin + MongoDB 后端：

/home/syoius/BackEndV3-Share

请完成“密探当前养成客观资料底座”这一独立批次。服务尚未正式上线，不需要设计复杂的停机迁移或多版本灰度方案，但必须保留现有 v2 契约和测试兼容性。

一、开始前必须完整阅读

后端仓库规则与现状：
- /home/syoius/BackEndV3-Share/AGENTS.md
- /home/syoius/BackEndV3-Share/README.md
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCurrent.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorRecord.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/request/OperatorImportRequest.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/response/OperatorResponses.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/OperatorController.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorService.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorServiceTest.kt

本批次权威规格：
- /home/syoius/YuanHub/docs/backend-operator-current-foundation-spec.md

总体产品与后续路线，仅用于理解边界：
- /home/syoius/YuanHub/docs/backend-operator-current-workbench-spec.md
- /home/syoius/YuanHub/docs/operator-current-workbench-implementation-plan.md
- /home/syoius/YuanHub/docs/operator-growth-data-exchange-protocol-v3.md
- /home/syoius/YuanHub/docs/schemas/operator-growth-exchange-v3.schema.json

若总体路线与本批次权威规格在“现在是否重做 starLevel/starStones”上出现旧表述，以 /home/syoius/YuanHub/docs/backend-operator-current-foundation-spec.md 为准。

二、先确认并复用现有能力

以下能力已经存在，不得重复建模：

1. OperatorEntry.starLevel 已负责化极的存储、v2 导入导出和 current 返回；
2. 普通密探 0=未拥有、1..30=星级与节点、31=觉醒；
3. 本体/SP 的 starLevel 独立保存，SP 通过公共图鉴 spOf 身份把标量直接解释为星级，不生成小节点；
4. OperatorEntry.starStones 已表示当前已装备星石，并支持 main1..main3、assist1..assist3 六槽；
5. 账号 game、account_game_mismatch、公共图鉴 special_oddity_name 和 oddity_schema 已完成。

因此：

- 不新增并行结构化化极字段或转换层；
- 不新增与 starStones 同义的 equippedStarStones 持久化字段；
- v3 直接使用 snake_case star_level，数值与现有 starLevel 完全相同；采集端负责编码，服务端按公共图鉴身份复核。

三、本批次必须实现

A. 双命盘

- 在 OperatorEntry/current DTO 中增加 discLoadouts；
- 最多两套，每套最多三个命盘；
- 每套 id 唯一，名称规范化，命盘项必须属于该密探公共目录；
- 不接受、不保存、不返回 active/is_active/active_disc_loadout_id/当前盘索引；
- 保留旧 discs 字段作为第一套兼容镜像；
- 旧行只有 discs 时读取为“命盘一”；
- v2 导入的 discs 只更新第一套，绝不能覆盖已有第二套。

B. 奇闻和攻生资料

- 在 OperatorEntry/current DTO 中增加 combatStats；
- combatStats.oddities 只接受 attack/hp/special；
- 上限按公共目录 rarity 校验：3 星 300/1560/9、4 星 305/1820/11、5 星 500/2600/15；
- 用户数据不保存第三奇闻展示名；请求 max 不能覆盖目录上限；
- 保存 observedAttack/observedHp、manualAttack/manualHp、source、observedAt、observedStatus、combatInputSignature 及必要的观测输入；
- 等级、修为、starLevel、奇闻当前值或 starStones 改变后，旧扫描观测保留但转为 stale；
- 公共目录第三奇闻纯改名不进入签名、不使观测 stale；
- 不在后端复制前端 Wiki 攻生计算器。

C. entry revision 与局部 PATCH

新增：

PATCH /v1/operator/current/{operatorId}?account_id={accountId}&game={game}

- expected_revision 必填；冲突返回 HTTP 409 operator_revision_conflict；
- current source document 的选择必须与 GET 合并语义一致：指定游戏 entry 存在时写指定游戏记录；指定游戏记录存在但 entry 缺失时回退写通用记录；两边都没有该 entry 时，只有 `expected_revision != 0` 才返回并发错误，`expected_revision=0` 必须创建默认 entry；
- 针对历史 `game=universal` 数据，增加一次性回填或首次 PATCH 惰性提升：按账号权威 `game` 复制缺失 entry 到具体游戏记录，具体游戏已有 entry 时不得覆盖；必须保留 revision、disc_loadouts、star_stones、combat_stats；回填完成前不能移除通用记录回退；
- 只合并请求中出现的字段，未出现字段保持不变；
- 支持 level、elite、star_level、disc_loadouts、star_stones、combat_stats 的局部校正；
- `combat_stats.display_mode` 作为用户显示偏好持久化：`attack` / `hp` 仅允许 `auto | manual | null`，缺失保留，null 清除；GET current 返回它，PATCH 按出现字段合并；不改变 manual/observed 值及 stale 规则；
- PATCH 目标 entry 缺失且 `expected_revision=0` 时创建默认 entry（level/elite/star_level=0、空命盘、空星石、combat_stats 按请求或 null），再应用请求字段；非零 revision 不得创建；
- 实现要点：目标 entry 缺失时不能直接抛 `operator_not_found`。应选择/创建目标游戏的 `OperatorCurrent` 文档，先以默认 `OperatorEntry(level=0, elite=0, starLevel=0, revision=0)` 作为 CAS 基线，再合并本次 PATCH。若目标文档不存在，必须在同一事务中先 materialize 该文档，否则现有 `compareAndSetEntries` 只更新已存在的 Mongo 文档，首次保存仍会失败。
- 创建分支必须与通用记录回退分支区分：有通用 entry 时复制通用 entry 到具体游戏后再应用 PATCH；两边都没有时使用全新默认 entry；两种情况都只允许 `expected_revision=0`，并继续走同一 revision 递增和 correction audit 流程。
- `star_stones` 表示六槽当前装备的完整替换：字段缺失保留，空数组清空；槽位只允许 `main1..main3`、`assist1..assist3`，不扣库存、不写库存流水；
- 星石变化必须触发已有 combat observation 的 stale 标记；
- 空数组、null 和字段缺失必须按权威规格区分；
- reason 第一版接受 manual_correction/local_migration；
- 校正不扣库存、不写库存流水；
- 成功返回合并后的完整 entry 与新 revision；
- 继续执行现有本体/SP level、elite 成对同步，但双方 starLevel、命盘、星石、combatStats 保持独立；
- 做完整的用户、子账号、game 和 operator ID 校验。

D. current 与 v2 兼容

- GET /v1/operator/current 在现有 star_level、discs、star_stones 基础上返回 disc_loadouts、combat_stats、revision、entry updated_at；
- 旧 Mongo 行缺字段时安全读取默认值，可采用惰性归一化或简单启动回填；
- version 2 的 listed/full 导入不得因为 DTO 没有新字段而清空第二套命盘或 combatStats；
- v2 discs 更新第一套时保留第二套；
- v2 starLevel/starStones 仍按现有语义工作；
- delete record 后 replay 也必须保护不属于 v2 record 的补充资料，并得到确定结果；
- export v2 继续输出第一套镜像 discs、现有 starLevel 和 starStones，不把 v3 新字段无版本塞入 v2 文档。

如果现有 operator_record 无法无损承载 PATCH 补充资料，请增加独立的校正审计/补充投影，不要把新字段偷偷加入 version=2 的交换 DTO。前端当前编辑保存会在一次 PATCH 中提交 `star_stones`，不得要求前端再通过 v2 import 补发。

四、实现顺序

1. 先补领域类型、默认读取和 current 响应契约测试；
2. 实现双命盘校验与 discs 兼容适配；
3. 实现 combatStats、奇闻上限和观测 stale 规则；
4. 实现 entry revision 与 PATCH；
5. 修正 v2 import/full/listed/delete replay 对补充资料的保留语义；
6. 更新 Swagger/OpenAPI 与 README；
7. 运行定向测试和完整回归。

五、明确不做

- 不实现 myshare-operator-exchange@3 preview/commit；
- 不实现自动采集 OpenAPI；
- 不实现 growth_state、annotations、favorites 聚合、targets 或备注；
- 不实现星石资产表、快捷卸除、撤销、恢复或换装；
- 不实现材料建议、升级预览、库存扣减或原子提升；
- 不修改前端仓库 /home/syoius/YuanHub；
- 不重复修改已经完成的账号 game 和公共奇闻目录任务；
- 不重构无关认证、库存或管理端模块；
- 不覆盖后端工作树中的无关改动。

六、错误码

至少使用稳定错误码：

- operator_revision_conflict：409
- invalid_star_level：422；普通密探允许 0..31，SP 依据公共图鉴身份只允许 0..5
- invalid_disc_loadout：422
- invalid_combat_stats：422
- unknown_operator_id：沿用现有语义
- invalid_game / account_game_mismatch：沿用现有语义

字段级错误尽量附带 operator_id 和具体字段路径。

七、测试与验证

请完整实现 /home/syoius/YuanHub/docs/backend-operator-current-foundation-spec.md 第 8 节的测试要求。

必须补充两个回归测试：

1. 新账号首次 PATCH 缺失 entry，`expected_revision=0` 成功创建并返回 `revision=1`，等级、修为、化极、命盘、六槽星石和 combat_stats 正确写入；
2. 新账号首次 PATCH 使用非零 `expected_revision` 返回 `operator_revision_conflict`，且不创建空 entry。

至少先运行：

cd /home/syoius/BackEndV3-Share
./gradlew test --tests '*OperatorServiceTest' --tests '*OperatorControllerContractTest' --tests '*OpenApiOperatorController*'

如果实际测试类名不同，使用 rg 查找并运行等价定向测试。最后必须运行：

./gradlew test

还需执行 /home/syoius/BackEndV3-Share/AGENTS.md 或 README 规定的格式化、静态检查和集成测试。

八、最终交付报告

最终回复必须包含：

1. 修改文件清单；
2. OperatorEntry、双命盘、combatStats、revision 的最终结构；
3. GET current 和 PATCH 的最终请求/响应示例；
4. starLevel 和 starStones 如何保持现有权威语义；
5. v2 discs 如何映射第一套且保护第二套；
6. v2 listed/full/delete replay 如何保护新增资料；
7. 奇闻上限和攻生 stale 规则；
8. 定向测试与完整 ./gradlew test 的实际结果；
9. README/Swagger 更新位置；
10. 任何未完成项、风险或偏离权威规格之处。

完成标准：

- 一个 current 响应可完整读取现有化极、六槽星石、两套命盘、奇闻和攻生资料；
- 没有引入第二套化极或星石持久化真相；
- 没有任何当前命盘/active 语义；
- PATCH 安全合并并受 revision 保护；
- v2 客户端继续工作且不会误删新资料；
- 完整测试通过，README 和 OpenAPI 已同步。
```
