# 星石养成完成 P3-A：Backend 契约与审查交付

2026-10-21 扩展：完成事务现在同时保存实际突破次数，已知起点与确认声明冲突时拒绝。当前契约见[星石突破字段](./star-breakthrough-state.md)；以下P3-A章节为原阶段历史记录。

本任务风险 L3，验证由 Agent 执行受影响专项；真实 Mongo 验证仅允许仓库的 owned disposable TestMongo 容器。初版和未知库存收口阶段的记录保留在下文。当前轮授权真实事务验证、最小修复及验证通过后的本地commit；YuanHub仅检查现有预览，不改业务源码。仍不push/PR/部署，不访问生产数据库或真实用户库存。当前轮验收与P3-B交付见文末。

## A. 分支与基线

分支 `feat/star-growth-completion-p3`，HEAD/基线 `3120bec5186ca07c88a1ca17c750a5b4878830c3`。旧分支 `fix/star-capture-incremental-upload` 保留在 `e20af2f7cfae4dd964b58145030686818ba23179`，相对本地 main 无独有提交。工作树开始时 clean。

origin/upstream fetch 在默认沙箱遇到 FETCH_HEAD 权限错误，提升权限后因 GitHub 网络连接失败，远端最新状态未验证。用户明确允许以本地 main/origin/main/upstream/main 一致的已知 `3120bec` 继续。本轮全部成果保留为未提交修改。

## B. 修改范围

新增：

- `src/main/kotlin/com/lhs/share/config/doc/StarCompletionApiResponses.kt`
- `src/main/kotlin/com/lhs/share/hub/controller/star/StarCompletionController.kt`
- `src/main/kotlin/com/lhs/share/hub/controller/star/request/StarCompletionRequests.kt`
- `src/main/kotlin/com/lhs/share/hub/controller/star/response/StarCompletionResponses.kt`
- `src/main/kotlin/com/lhs/share/hub/repository/StarCompletionRepository.kt`
- `src/main/kotlin/com/lhs/share/hub/repository/entity/StarCompletion.kt`
- `src/main/kotlin/com/lhs/share/hub/service/star/StarCompletionService.kt`
- `src/test/kotlin/com/lhs/share/hub/service/star/StarCompletionServiceTest.kt`
- `src/test/kotlin/com/lhs/share/hub/service/star/StarCompletionMongoTransactionTest.kt`
- `src/test/kotlin/com/lhs/share/openapi/StarCompletionControllerContractTest.kt`
- 本文 `docs/star-growth-completion-p3.md`

窄范围扩展：

- `InventoryRevisionRepository.kt`：同一 inventory_revision collection 的 CAS 自增。
- `InventoryExceptionHandler.kt`：完成控制器复用现有错误 envelope，并使用独立请求校验 code。
- `SubAccountService.kt` / `SubAccountServiceTest.kt`：账号删除时清理所属回执，补级联/越权断言。
- `OperatorUpgradeServiceTest.kt`：明确 correctionRepository 泛型 save 的 mock 返回类型，修复此次专项复跑发现的既有夹具 ClassCastException；业务代码与断言不变。
- `InventoryService.kt`：消费记录禁止删除的错误描述改为业务操作通用表述，错误 code 和行为不变。

未修改普通 StarState PATCH/rebuild/restore、库存 import 业务流程或密探升级业务流程，也未修改 Gradle/依赖配置。

## C. API request / response

所有接口沿用 JWT 登录与 ApiResult 成功 envelope；失败使用既有 `{"error":{"code","message",...}}` 格式。userId 只取 AuthenticationHelper，正文携带 user_id 等未知字段会被拒绝。不存在/不属于用户的账号沿用仓库的 `404 account_not_found`，避免泄露账号存在性。

```text
GET  /v1/star-state/completion-context?account_id=...
POST /v1/star-state/completions
GET  /v1/star-state/completions/{operationId}?account_id=...
```

POST 示例（40→50，起点默认未突破、终点默认不额外突破）：

```json
{
  "account_id": "a",
  "game": "如鸢",
  "operation_id": "growth:fixed-client-operation-id",
  "expected_generation": 2,
  "expected_star_revision": 3,
  "expected_inventory_revision": 7,
  "stars": [
    {
      "instance_id": "stable-instance-id",
      "current_level": 40,
      "target_level": 50,
      "start_already_broken": false,
      "target_also_broken": false
    }
  ],
  "experience_consumed": { "orange": 1, "purple": 2, "white": 3 },
  "bottles_consumed": { "jiezhuping": 0, "jiezheping": 50, "jieyangping": 20 }
}
```

`game` 使用真实 SubAccount.game 的游戏版本标识：`代号鸢` / `如鸢`。当前账号没有独立 gameVersion 字段，故不添加第二个可能冲突的版本声明。`instance_id` 就是现有 StarState 的稳定实例身份，不以名称/品质/等级作身份匹配。

`operation_id` 是客户端在确认前固定的 1..128 字符 ASCII 操作标识，允许字母、数字、点、下划线、冒号和连字符，必须以字母或数字开头。stars 为 1..1000 个不同实例。所有三色经验和三瓶数量都必须显式提供；缺失、null、浮点、数字字符串、溢出整数均拒绝。期望版本必须为可自增的非负整数。

context 返回 `account_id`、`game`、现有结构的 `state`（generation、revision、inventory、plan_targets、experience、bag）、三瓶 `bottle_balances` 和 `inventory_revision`。它在单个 Hub transaction 内读取两个事实来源，不把两个独立 GET 声称为一致快照；context 仍只是确认依据，POST 必须重新验证。

`bottle_balances` 保持原字段和三种 stable ID，值为 `Long?`：明确库存条目返回实际 count（包括0）；缺少条目但 `fullBaselineAt != null` 时返回0；只有局部快照且缺少该条目，或没有item库存时返回null。context、新完成回执及其持久字段使用相同语义，不增加known标记或第二套库存。已有成功回执里的数值仍可读取，不迁移或重写，也不将旧0逆向猜成未知。

POST/回执查询返回：`operation_id`、`account_id`、`game`、`generation`、`changes`（instance_id/from/to）、`experience_consumed`、`bottles_consumed`、`bottle_balances`、`star_revision`、`inventory_revision`、`state`、`completed_at`、`request_identity`。经验扣减后的余额在 `state.experience`。state 是该操作提交时的完整权威结果；之后其他操作发生时，历史回执不会变成最新状态，须重新读取 context。

## D–E. 事务写入与共同并发保护

认证及账号归属检查后，先查询成功回执，再做期望版本预检。一个 hubTransactionTemplate 事务内依次执行：

1. 再查回执；同操作成功时直接返回。
2. 重查账号/game，并复用已有账号生命周期 write fence，和删除/游戏版本修改互斥。
3. 查询当前 StarState，核对 generation、star revision；核对共享 inventory revision。
4. 验证当前 generation 下的全部实例、当前等级、当前 planTargets 精确目标。
5. 计算突破节点，核对确认瓶子总量和余额；未知瓶子余额不能授权正数消费（409 star_bottle_inventory_unknown），确认零消费则保留null；校验经验数量/余额。
6. 对已有 inventory_revision 文档按 owner + expected revision CAS 自增；首次 revision=0 可 upsert，确定性 _id 防止并发创建。
7. 用现有 StarStateCurrentRepository.replace 按 owner + generation + revision CAS 更新等级、删除所选计划、扣三色经验，star revision 加一；generation 不变。
8. 若有瓶子消费，只修改实际消费的 item entries，保留基线和其他库存；保存正数 consumption_delta。
9. insert 持久完成回执，包括提交后的完整 StarState、瓶子余额与两个新 revision。
10. 全部成功后提交；任何异常使上述写入一起回滚。

没有新建第二套库存修订。现有 import、delete/restore 和 OperatorUpgradeService 均在 Hub transaction 内写相同 `inventory_revision` 文档；与完成 CAS 并发时 Mongo 产生同文档写冲突，包括两个操作消费不同物品、完成消耗零瓶子的情况。StarState replace 也与已有 PATCH/rebuild/restore 和 loadout 的 state fence 共享文档写冲突。

完成只更新 level/experience/planTargets，不改 instance ID、kind、bag、未选中实例和计划。loadout 仍引用同一稳定实例，不需要删除或重建；云端现有模型没有 OCR 证据字段，本轮也不改变证据处理。

## F. 幂等与持久恢复

`star_completion` 位于 Hub repository 扫描范围；`(userId, accountId, operationId)` 有 unique compound index，沿用仓库 auto-index-creation。首次成功将回执与消费一起提交。回执 insert 的并发唯一约束冲突会回滚该事务，随后按 owner 查询原回执。

身份摘要是明确类型请求的 canonical JSON，stars 按 instance_id 排序，再由 ObjectMapper 序列化；包括所有期望版本、确认数量和临时节点选项。相同操作和摘要直接返回第一次结果；不同摘要返回幂等冲突，不再次扣减。无需进程内 preview token 或临时内存回执。

已经成功后重试使用旧 revision 仍能恢复。两个完全并发请求中，一个尚未提交时另一个可能收到 concurrency conflict；保留原操作 ID 和正文重试后恢复唯一结果。回执查询/操作查重均受 user/account 归属限定，账号删除同事务清理回执。

## G. 经验与瓶子规则

经验单位橙=1000、紫=500、白=100。该操作扣的是用户确认的三种实际数量，不基于保守估算加消费，也不设缺乏条内进度证据的最低经验消耗；允许明确确认 0。三色经验的事实来源是现有 StarState.experience，并非 inventory item catalog；不制造第二套经验库存或猜测 item IDs。

经验余额 null 表示未知。确认消耗大于0时拒绝 `star_experience_unknown`；确认消耗0时保留 null，不转成0。已知余额不足则拒绝，所有资源不得产生负库存。

| 节点 | 解注瓶 | 解谪瓶 | 解殃瓶 |
| --- | ---: | ---: | ---: |
| 10 | 5 | 0 | 0 |
| 20 | 10 | 0 | 0 |
| 30 | 30 | 30 | 0 |
| 40 | 0 | 50 | 20 |
| 50 | 0 | 60 | 60 |

默认包含 `currentLevel <= node < targetLevel`。start_already_broken=true 去掉起点节点；target_also_broken=true 添加终点节点。两类选项仅在对应端点确为10/20/30/40/50时可出现（包括显式false），非节点端点必须省略/null。60不属于实际突破节点。选项只在请求身份中存档，不写永久突破状态。

40→50 的解谪/解殃四组合分别为：默认50/20，起点已突破0/0，终点同时突破110/80，两端均已突破60/60。43→50 默认不消耗瓶子；终点同时突破则60/60，不产生43级材料。

## H. 库存消费历史

瓶子产生 `inventory_records` 中 `record_type=consumption_delta`、`entity_type=item`、channel=星石养成、producer.version=star-completion-v1 的正数消费记录，并用 transactionId 和 `completion:` recordId 识别。三色经验及其余额保存在同事务的 StarState/完成回执，不冒充普通 item catalog，也不参与 item 库存重放。

复用 InventoryService 的消费重放：按 effective_at 排序，同时间 reward→snapshot→consumption；正数消费做扣减。删除/restore 重建保留消费；重放不足会回滚恢复/删除事务。较新 snapshot 是新的绝对观察，按原基线规则覆盖之前消费后的状态，不重复减一次。所有 consumption_delta 沿用禁止单独删除的保护，获得量统计仍仅查询 reward_delta。import 不允许用户伪造 consumption_delta。

## I–J. 验证与限制

初版专项结果：97/97通过，0失败、0跳过。以下表格记录初版验证；本次未知库存/错误码收口结果见文末。新增 service unit、HTTP contract、真实 Mongo integration 用例。真实 rollback/race/replay 断言位于 Mongo 用例；mock 单元测试只验证事务回滚调用，不冒称数据库回滚。

| 已执行检查 | 最终结果 |
| --- | --- |
| 主源码及测试源码编译 | 通过，Gradle test 包含 compileKotlin / compileTestKotlin；新增 Mongo 测试源码也编译通过 |
| StarCompletionServiceTest / StarCompletionControllerContractTest | 20 / 6，通过 |
| InventoryServiceTest / OperatorUpgradeServiceTest | 44 / 9，通过 |
| SubAccountServiceTest / StarStateLoadoutContractTest | 13 / 3，通过 |
| InventoryExceptionHandlerTest / StarCloudOpenApiContractTest | 1 / 1，通过；后者验证旧星石 OpenAPI，新增完成接口由独立HTTP contract测试验证 |
| 本轮16个Kotlin文件的精确文件 ktlintCheck | 通过，未运行全仓lint |
| git diff --check | 通过 |

本地详细日志：`build/p3-targeted-tests.log`、`build/p3-lint.log`；JUnit XML位于 `build/test-results/test/`，HTML报告位于 `build/reports/tests/test/index.html`（均为构建产物，不提交）。编译时已有跨WSL/Windows增量路径缓存错误，通过本次命令参数 `-Pkotlin.incremental=false` 规避，未改构建配置或删除缓存。

当前 Docker daemon 不可用：只读检查显示 `dockerDesktopLinuxEngine` named pipe 不存在。未启动 Docker 或本地 Backend，未连接已有开发/生产 Mongo。8 个新增 Mongo 事务用例已进入 test 源码编译范围，但未执行，不能据 mock 测试宣称通过。旧 StarStateMongoTransactionTest 和 InventoryRestoreMongoTest 同样未运行。

| 验证层 | 用例覆盖 |
| --- | --- |
| StarCompletionServiceTest（20 个） | 单/多实例、版本/等级/计划/身份隔离、三色/三瓶不足与未知、幂等正文冲突/丢响应重试、临时突破修正、低于估算的实际消费、未选中数据保留、context、CAS失败、事务rollback调用、内部失败与commit不确定语义 |
| StarCompletionControllerContractTest（6 个） | JWT身份传递、snake_case契约、缺失/null/浮点/字符串/溢出数量拒绝、user_id和未知字段拒绝、回执/context范围、500/503错误 |
| StarCompletionMongoTransactionTest（8 个，未运行） | 回执重启后持久读取、稳定佩戴关系、最终写失败全回滚、双客户端/相同操作并发、与真实import/密探upgrade并发、消费重放/删除/restore/后续snapshot、跨user/account同操作ID隔离 |

首轮专项执行97个测试，其中6个既有 OperatorUpgradeServiceTest 在 relaxed generic mock 的 correction save 上失败（ClassCastException）；其余91个通过。已补显式返回类型，未删除测试或弱化断言，最终复跑97/97通过。早期编译还遇到Gradle缓存锁权限限制；提权执行后通过。一次PowerShell未引用含点的Gradle property参数导致任务解析失败，改为明确引用后修正。

最小复跑命令（PowerShell，禁用已有跨 Windows/WSL 路径增量缓存问题）：

```powershell
.\gradlew.bat test --tests '*StarCompletionServiceTest' --tests '*StarCompletionControllerContractTest' --tests '*InventoryServiceTest' --tests '*OperatorUpgradeServiceTest' --tests '*StarStateLoadoutContractTest' --tests '*SubAccountServiceTest' --tests '*InventoryExceptionHandlerTest' --tests '*StarCloudOpenApiContractTest' '-Pkotlin.incremental=false' --offline --console=plain
```

用户准备好本机 disposable TestMongo 的 Docker 环境后，最小事务专项：

```powershell
.\gradlew.bat integrationTest --tests '*StarCompletionMongoTransactionTest' --tests '*StarStateMongoTransactionTest' --tests '*InventoryRestoreMongoTest' '-Pkotlin.incremental=false' --offline --console=plain
```

## K–M. 兼容、前端接线与待审查边界

普通 PATCH 仍只编辑星石状态，不获得资源扣减权限；现有 import 的协议、sourceConnectionId、revision 行为不变；密探 upgrade 的 SP/修正记录逻辑不变。GET inventory/current 不增加字段，采用独立 completion-context 避免改旧响应。

下一轮前端先读取 context，用 stable instance_id 和精确 current/target level 收集选择；在确认前固定 operation_id，明确三色实际数量及端点选项，并提交重新计算的瓶子数量与两个版本号。HTTP成功采用回执中的状态和余额。已成功回执的再次使用不得发第二个消费操作。网络错误、503或任何无法确认是否提交的5xx，应查询原回执或重试原ID/正文；不得自动换操作ID再次消费。查询404本身不证明正在执行的请求不会稍后提交。

| HTTP / code | 前端处理含义 |
| --- | --- |
| 404 account_not_found / star_instance_not_found | 明确账号/实例不可用，不泄露其他账号 |
| 409 star_generation_changed / star_state_revision_conflict / inventory_state_stale | 原事务未成功，重新读取并确认 |
| 409 star_level_changed / star_plan_changed | 当前等级或计划已变，重新确认 |
| 409 insufficient_inventory / insufficient_star_experience / star_experience_unknown / star_bottle_inventory_unknown | 余额不足或未知，重新确认实际库存 |
| 409 star_completion_idempotency_conflict | 原ID已有不同成功正文，禁止复用该ID提交另一意图 |
| 409 account_state_stale / star_completion_concurrent_change | 并发事务回滚；相同ID已有进行中操作时先查询/原正文重试 |
| 422 star_completion_duplicate_instance / star_completion_invalid_breakthrough / star_bottle_consumption_mismatch / star_completion_invalid_request | 输入不合法，未提交 |
| 503 star_completion_result_unknown | commit确认不确定，原ID查询/重试 |
| 500 internal_error / 网络断开 | 不宣称成功，也不推断一定未提交；原ID查询/重试 |

产品规则采用 prompt：完成目标必须等于当前 planTargets，不实现部分完成到另一级；未确认的经验资源不会被自动扣减；不新增永久突破状态。没有需要另作产品决定的前置阻塞。上线之前仍需人工源码审查和隔离 Mongo 事务专项通过，本轮不部署。

## P3-A 最小收口：未知库存与输入错误

本次只修改9个既有P3相关文件：StarCompletionService.kt、StarCompletionResponses.kt、StarCompletion.kt、StarCompletionApiResponses.kt、InventoryExceptionHandler.kt、StarCompletionServiceTest.kt、StarCompletionControllerContractTest.kt、InventoryExceptionHandlerTest.kt与本文。StarCompletionRequests.kt核查后保留原实现。完整未提交成果比初版新增一个修改文件（InventoryExceptionHandlerTest），总计18个修改/新增文件；没有commit/push/PR/部署。

瓶子规则统一用于context与本次操作回执：明确条目→实际count；缺项且有full基线→0；其他缺项→null。库存数据本身及inventory/current协议不变。未知资源不会按足够余额处理；正数需要已知且足够的余额，零消费不创建item文档或消费流水。已消费资源的最终0和未涉及的未知null可在同一回执中并存。旧回执数值按历史结果读取；没有足够历史证据修复初版可能写下的缺项0，因此不迁移猜测旧结果，新context会按当前库存事实返回准确的known/unknown语义。

输入错误核查：未知字段的JsonAnySetter异常通常被Jackson包装，和缺失字段、null数量、非整数数量一起返回422 star_completion_invalid_request；通用IllegalArgumentException/ConstraintViolation/类型不匹配异常分支原先直接返回schema_validation_failed。本次只对POST /v1/star-state/completions的该分支使用star_completion_invalid_request，其余Inventory接口和GET查询继续使用原code。非法突破节点的业务校验继续422 star_completion_invalid_breakthrough；突破字段类型错误属于422 star_completion_invalid_request；JSON语法错误仍400 invalid_json。没有改普通Inventory API的错误码。

新增8个service专项用例覆盖无item/局部缺项未知、full缺项0、明确0、未知拒绝正数消费、零消费无伪造记录、新回执null/0、旧数值回执BSON兼容及新null回执BSON round-trip。BSON测试使用MappingMongoConverter和内存Document，不连接数据库，不是Mongo事务验证。HTTP只新增2个用例：专属fallback校验code范围、nullable余额JSON表达；已有未知字段与缺失/数量测试补明确code与非法参数断言。handler补一个普通Inventory错误码不变的专项用例。

本次最终专项82/82通过，0失败、0跳过：StarCompletionServiceTest 28、StarCompletionControllerContractTest 8、InventoryServiceTest 44、InventoryExceptionHandlerTest 2。主/测试Kotlin编译通过，8个受影响Kotlin文件的定向ktlintCheck通过，git diff --check通过。首轮有1个新增BSON测试失败，原因是按纳秒比较时间而BSON Date只保存毫秒；测试期望改为明确的毫秒精度后复跑通过，未修改业务时间或事务实现。BSON字段、数值0、null及回执读取/幂等重试断言均保留。

最小专项复跑：

```powershell
.\gradlew.bat test --tests '*StarCompletionServiceTest' --tests '*StarCompletionControllerContractTest' --tests '*InventoryServiceTest' --tests '*InventoryExceptionHandlerTest' '-Pkotlin.incremental=false' --offline --console=plain
```

本次日志：`build/p3-closeout-tests.log`、`build/p3-closeout-lint.log`，JUnit XML仍在`build/test-results/test/`。旧97/97报告为初版执行结果，本次只重跑上述受影响范围，不将未复跑模块记为本轮通过。

只读Docker检查仍报告dockerDesktopLinuxEngine pipe不存在，8项Mongo事务测试及旧相关Mongo回归未执行，没有启动其他数据库或连接非隔离服务。真实事务原子性、并发及历史重放仍缺少实际Mongo执行证据，不能将mock或BSON内存映射测试当作事务通过。未发现本次修改新增扣减安全问题；上线前仍需要原有隔离Mongo专项与人工审查。

用初版ZIP核对了本次改动边界，其余9个原有文件逐字节保留，包括请求DTO、Controller、两套CAS相关仓储、消费历史/账号服务及8项Mongo测试源文件。分支仍为feat/star-growth-completion-p3，HEAD仍为3120bec5186ca07c88a1ca17c750a5b4878830c3，旧fix分支仍在e20af2f7cfae4dd964b58145030686818ba23179。Git当前7个tracked修改、11个untracked文件，全部保留，未做commit/push/rebase/merge/PR/部署。

## 真实事务验证与本地收口（2026-10-09）

本轮origin/upstream fetch均成功。local main、origin/main、upstream/main、开始时的P3 HEAD均为3120bec5186ca07c88a1ca17c750a5b4878830c3，main没有更新，因此不创建基线检查点、不切换main、不做merge或rebase。原fix分支e20af2f7cfae4dd964b58145030686818ba23179保留。

Docker Desktop本机desktop-linux引擎可连接，DOCKER_HOST未设置，Linux容器可用。按仓库TestMongo安全边界拉取mongo:7.0.28，通过Testcontainers临时副本集执行。已有compose开发Mongo/Redis及其数据卷不参与测试。

首轮真实专项执行24项：原8项StarCompletionMongoTransactionTest中6通过、2失败；StarStateMongoTransactionTest 11/11通过；InventoryRestoreMongoTest 5/5通过。失败来自首个完成响应与持久回执的completed_at精度差异：首次Instant.now()含纳秒，BSON Date只保存毫秒，恢复/同ID重试时完整回执不相等。

最小业务修复仅将StarCompletionService内操作时间截到ChronoUnit.MILLIS，保证首次成功与持久恢复的回执完全一致；保留完整响应相等断言。单测补明确的毫秒精度断言。真实测试增加新MongoClient读取回执，并补2个原测试缺少的用例：多星同时完成的一致资源/计划/revision写入；listed未知与明确0、full缺项0的实际数据库持久化及零消费无虚构流水。后者也验证未知余额的正数消费失败时没有部分写入。TestInfrastructure.kt、事务/CAS架构、库存历史算法、突破规则均未改。

最终真实事务专项26/26通过，0失败、0跳过：StarCompletionMongoTransactionTest原8项及2个补充全部通过（10/10）；StarStateMongoTransactionTest 11/11；InventoryRestoreMongoTest 5/5。rollback用例在真实Mongo事务最终插入失败后确认状态、库存、两种revision、历史记录与账号fence一起回滚；两个并发用例确认共享库存冲突；消费重放/restore、新MongoClient查询持久回执和stable loadout均有实际执行断言。

本轮副本集证据位于build/test-results/integrationTest/的JUnit XML，驱动连接localhost:53074并确认REPLICA_SET_PRIMARY、setName=docker-rs；测试自己的hello命令也返回primary=true及yuanhub_test_开头的临时数据库。副本集容器hostname为446fbc30524a。最终docker ps -a按yuanhub.test=true筛选为空，临时容器已由测试生命周期清理；开发Mongo/Redis仍是开始时同一完整容器ID且healthy，未改卷或数据。没有使用compose Mongo、外部URI或生产数据库。

最后定向单测82/82通过（28+8+44+2），0失败、0跳过；Kotlin主/测试编译通过；所有17个P3改动Kotlin文件的精确文件ktlintCheck通过；git diff --check通过。没有全仓或无筛选integrationTest。日志为build/p3-real-mongo-first.log（首轮失败）、build/p3-real-mongo-final.log（26项通过）、build/p3-final-unit-lint.log（最终单元及lint）。

验证通过后将这18个P3文件一次性提交到feat/star-growth-completion-p3；本地提交SHA以git log及最终报告为准（本文件不自引用自己的提交哈希）。本轮没有push/PR/rebase/merge/部署。

YuanHub保持feat/growth-plan-workspace-p1，HEAD为185ee361faf42770993a3aca284903e2c7efbdbf，工作树clean。现有Vite PID88792由本项目vite.js以--host 127.0.0.1 --port 5175 --strictPort运行，/star返回200，浏览器已完成星石页面加载；无需重启，未创建第二个Vite服务或修改业务源码。客户端VITE_API_BASE未注入、使用同源；Vite出站443地址匹配api-hub.maayuan.com的A记录，/ready代理返回401，仅记为代理可达，不当作认证readiness通过。没有将前端连接到本地8080，也未操作真实养成完成按钮。

已验证范围是上述隔离真实Mongo事务、受影响单元/HTTP contract、源码编译及文件级lint；没有发布P3公开API、真实用户扣减、生产Mongo验证、前端P3-B接线或设备E2E。上线前仍需要单独部署授权和相应线上/前端验收，本轮不启用功能。

## P3-B 前端接线契约

本节仅交付接口和隔离测试要求，不实现或启用前端按钮。现有公开Backend未部署本轮P3接口；本地预览继续使用公开Backend，不指向本地8080。

### 读取确认上下文

`GET /v1/star-state/completion-context?account_id=a`，JWT身份由后端取得。成功为ApiResult envelope（status_code=200，data为下列对象），字段使用snake_case：

```json
{
  "account_id": "a",
  "game": "如鸢",
  "state": {
    "account_id": "a", "generation": 2, "revision": 3,
    "inventory": [{"instance_id":"s1","kind":"main","name":"天府","quality":"orange","level":40}],
    "plan_targets": {"s1":50},
    "experience": {"orange":10,"purple":20,"white":30},
    "bag": {"current_count":1,"capacity":200},
    "updated_at": "2026-10-09T00:00:00.000Z"
  },
  "bottle_balances": {"jiezhuping":null,"jiezheping":200,"jieyangping":100},
  "inventory_revision": 7
}
```

这是虚构fixture示例，不是用户数据。nullable数量始终按未知解释，不用于自动填0或判断资源足够。读取是一个事务中的确认依据，POST仍重新核对全部版本。game是SubAccount.game的真实游戏版本标识（代号鸢/如鸢），无第二个独立game_version字段。

### 完成命令与权威结果

`POST /v1/star-state/completions`，Content-Type: application/json。完整请求见上文C节；前端把稳定starInstanceId映射为instance_id，精确提交选中实例的current_level与当前plan_targets对应的target_level。只接受相同generation的当前实例，不以名称/品质定位，也不实现部分完成到另一级。

确认前固定operation_id，冻结整份确认正文。expected_generation来自state.generation，expected_star_revision来自state.revision，expected_inventory_revision来自context.inventory_revision。三色experience_consumed及三瓶bottles_consumed全部显式提供非负整数，不能省略/null；不提供user_id。三色实际消耗允许低于保守路线估算，包括用户明确确认的0，服务端不追加估算下限。

40→50的start_already_broken和target_also_broken默认为false，分别临时去除40节点/加入50节点。解谪/解殃总量为默认50/20、只去起点0/0、只加终点110/80、两端都修正60/60。43→50必须省略起点修正；默认0/0，加终点则60/60。实际节点只有10/20/30/40/50，60没有突破选项。服务端重算并核对瓶子总数，不信任前端合计值。

以上context例子以实际经验1/2/3及默认40→50完成，成功data结构如下（request_identity为服务端生成的canonical请求JSON字符串）：

```json
{
  "operation_id": "growth:fixed-client-operation-id", "account_id": "a", "game": "如鸢", "generation": 2,
  "changes": [{"instance_id":"s1","from":40,"to":50}],
  "experience_consumed": {"orange":1,"purple":2,"white":3},
  "bottles_consumed": {"jiezhuping":0,"jiezheping":50,"jieyangping":20},
  "bottle_balances": {"jiezhuping":null,"jiezheping":150,"jieyangping":80},
  "star_revision": 4, "inventory_revision": 8,
  "state": {
    "account_id":"a", "generation":2, "revision":4,
    "inventory":[{"instance_id":"s1","kind":"main","name":"天府","quality":"orange","level":50}],
    "plan_targets":{}, "experience":{"orange":9,"purple":18,"white":27},
    "bag":{"current_count":1,"capacity":200}, "updated_at":"2026-10-09T00:01:00.000Z"
  },
  "completed_at":"2026-10-09T00:01:00.000Z",
  "request_identity":"<server-generated canonical request JSON>"
}
```

成功时一次采用state、bottle_balances和新revision，清理前端完成选择；selected计划已在服务端清理，未选中计划保留，loadout稳定引用不被改动。不要再发普通PATCH或inventory import做第二次等级/资源写入。receipt.state是该操作提交时的历史权威结果；如果其他操作已发生，需要新的context获取最新状态。

### 结果不确定、持久回执与错误提示

`GET /v1/star-state/completions/{operationId}?account_id=a`返回与首次POST相同的持久回执data。所有查重和读取都限定JWT user/account；同ID相同正文返回首次结果，即使expected版本已经过期；同ID不同正文返回409 star_completion_idempotency_conflict。不同账号/用户相同ID互不影响。

请求网络中断、503 star_completion_result_unknown或无法确认提交状态的500时，保存原ID与正文，只查询该回执或原正文重试。不能生成新ID再扣一次。404 receipt未找到也不代表正在执行的原请求不会稍后提交。并发相同操作在尚未提交时可能先得到concurrent_change，仍须保留原ID查询/重试。

错误码与提示映射沿用K–M节表格：版本/generation冲突→重新读取确认；等级/计划变化→重新确认目标；资源不足/未知→核对库存；非法输入/突破/总量→修正输入；幂等正文冲突→保留原操作身份，停止复用该ID作另一消费；401→恢复登录，404 account_not_found→账号不可用。JSON语法错误400 invalid_json；完成POST结构/通用校验错误422 star_completion_invalid_request；节点语义错误422 star_completion_invalid_breakthrough。

### 公开Backend尚未部署时的Mock隔离

下一轮只能在前端测试fixture/注入transport中mock上述三个接口，继续让其他API和现有5175预览使用公开Backend。Mock必须在网络发送前截断completion请求，不能在公开API 404后补发真实写入，也不能自动改到本地8080。

使用完全虚构的账号/实例/库存fixture，覆盖多星、实际经验低于估算、40→50临时修正、null/0区别、版本冲突、资源不足、同ID同正文重试和同ID异正文拒绝。模拟“服务端已提交但首个响应丢失”，然后通过receipt/同ID重试恢复同一回执，确认客户端不会再消费。用Mock结果验证前端状态采用与交互，不把它宣称为公开Backend E2E。P3-B实现、功能启用和Backend部署仍需后续单独授权。

## 主线集成：未来生效记录与历史重放

星石完成的消费记录 `effectiveAt` 取服务端当前时间与事务内该用户、该账号最新 item 流水生效时间的较大值，避免客户端未来快照在重放时覆盖已扣减余额。查询只取按生效时间倒序的首条记录；不读取完整历史。`receivedAt` 和回执 `completed_at` 仍为实际服务端完成时间，不因客户端未来时间而前移。库存 revision CAS 与历史导入/删除/恢复继续共用事务写冲突保护。

真实 owned TestMongo 回归覆盖未来 `stock_snapshot` 和 `reward_delta`，删除/恢复无关历史后余额不变，且同操作重试仍只有一份回执和一条消费记录。
