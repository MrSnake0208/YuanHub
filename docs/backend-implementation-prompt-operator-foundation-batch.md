# 后端实施总控 Prompt：账号游戏版本与公共图鉴奇闻定义

状态：历史批次，账号 game 与公共图鉴奇闻定义均已完成；不要再次投递  
目标仓库：`/home/syoius/BackEndV3-Share`  
包含任务：统一子账号游戏版本、密探公共图鉴第三奇闻定义

```text
你正在修改 MaaYuan Share / YuanHub 的 Spring Boot + Kotlin + MongoDB 后端：

/home/syoius/BackEndV3-Share

本次需要在同一工作批次中完成两个已经定稿的后端前置任务：

1. 统一子账号持久化游戏版本；
2. 密探公共图鉴维护第三项奇闻名称并派生稳定奇闻定义。

这两项共同构成密探养成 v3 导入前的基础能力。请由同一个 Agent 顺序实现、统一运行回归测试，但保留两个子任务各自的数据边界和验收项，不要把账号字段与公共目录字段混入同一领域模型。

一、开始前必须完整阅读

仓库规则：
- /home/syoius/BackEndV3-Share/AGENTS.md
- /home/syoius/BackEndV3-Share/README.md

子任务 A 的完整实施规格：
- /home/syoius/YuanHub/docs/backend-implementation-prompt-account-game.md

子任务 B 的完整实施规格：
- /home/syoius/YuanHub/docs/backend-implementation-prompt-operator-catalog-oddities.md

共同接口与产品契约：
- /home/syoius/YuanHub/docs/api-contract.md
- /home/syoius/YuanHub/docs/backend-operator-current-workbench-spec.md
- /home/syoius/YuanHub/docs/operator-growth-data-exchange-protocol-v3.md
- /home/syoius/YuanHub/docs/operator-current-workbench-implementation-plan.md
- /home/syoius/YuanHub/docs/operator-auto-scan-integration-plan.md
- /home/syoius/YuanHub/docs/schemas/operator-growth-exchange-v3.schema.json

上述两个子任务规格中的“必须实现、测试要求、明确禁止、完成定义”全部属于本次验收范围，不得只实现其中一项。涉及文件时以两个子任务文档列出的绝对路径为准。

二、实施顺序

第一步：统一子账号游戏版本

- 为 SubAccount 增加非空 game；
- 完成 POST/GET/PATCH 契约和存量迁移脚本；
- 固定只允许“代号鸢 / 如鸢”，缺省与存量非法值归为“代号鸢”；
- 实现 invalid_game 与 operator 写入时的 account_game_mismatch；
- 保证修改账号版本不搬迁、不删除库存或密探历史记录。

账号版本是密探写入校验的前置真相源，因此必须先完成该步骤及其定向测试，再继续公共图鉴改造。

第二步：公共图鉴奇闻定义

- 为 OperatorCatalogEntity 增加 nullable specialOddityName；
- 管理员可以维护第三项名称；
- 公共和管理员目录返回 special_oddity_name、oddity_schema、incomplete_fields；
- oddity_schema 固定使用 attack / hp / special，三个上限仅按 rarity 由服务端派生；
- 存量缺名明确降级，禁止按职业猜测；
- 修改目录名称只改变公共展示和 catalog_version，不触碰任何用户养成数据。

第三步：联合回归

- 运行两个子任务要求的全部定向测试；
- 运行完整 ./gradlew test；
- 核对账号 game 修改不会改变公共目录；
- 核对公共图鉴 specialOddityName 修改不会改变账号 game、库存、operator_current 或 operator_record；
- 核对 operator 写入同时满足账号归属、账号 game 一致性和既有目录 ID 校验；
- 更新 /home/syoius/BackEndV3-Share/README.md 和 Swagger/OpenAPI，避免两个子任务分别修改后留下互相覆盖或过时的示例。

三、共同兼容要求

前端仓库 /home/syoius/YuanHub 已准备账号 game 的新后端兼容层：

- 创建账号会提交 game；
- 服务端返回 game 时作为权威值；
- 切换版本会 PATCH 保存；
- 旧后端无 game 时暂时使用本地兜底；
- 库存、密探和快捷导入已接入同步与失败回滚。

因此后端应按正式账号契约直接实现，不需要再设计 game_scope、all、universal 或第三种账号状态。

公共图鉴管理员前端尚未提交 specialOddityName。为允许后端先部署：

- 旧 Mongo 目录行必须可读取；
- update 缺少/null specialOddityName 时保留旧值；
- 新建密探缺少该字段仍按新契约拒绝，并与后续管理员前端协同发布；
- 响应新增字段必须保持向后兼容，旧前端忽略它们时不崩溃。

四、冲突处理优先级

若两个子任务文档出现实现层面的交叉，使用以下优先级：

1. /home/syoius/BackEndV3-Share/AGENTS.md 的仓库规则；
2. /home/syoius/YuanHub/docs/api-contract.md 的正式 HTTP 契约；
3. 两份子任务文档各自在其领域内的业务语义；
4. 当前后端代码的包结构、错误包装、Jackson SNAKE_CASE 和测试惯例。

不要用“解决冲突”为由改变已确定的产品语义。如发现确实无法兼容的代码事实，先给出具体文件和代码证据，再采用对存量数据影响最小的方案。

五、本批次明确不做

- 不实现 myshare-operator-exchange@3 的 preview/commit；
- 不实现自动采集 OpenAPI；
- 不扩展 operator_current 的双命盘、战斗属性、已装备星石或养成标注；
- 不修改前端仓库 /home/syoius/YuanHub；
- 不把 game 写进公共密探目录作为账号真相源；
- 不把 specialOddityName 或 oddity_schema 写进 SubAccount、用户养成或库存；
- 不重构无关认证、库存、头像或 OpenAPI Token 模块；
- 不覆盖工作树中的无关改动。

六、验证命令

在后端仓库执行：

cd /home/syoius/BackEndV3-Share

先运行账号任务定向测试：

./gradlew test --tests '*SubAccountServiceTest' --tests '*AccountControllerContractTest' --tests '*OperatorServiceTest'

再运行公共图鉴定向测试：

./gradlew test --tests 'com.lhs.share.hub.service.operator.OperatorCatalogServiceTest' --tests 'com.lhs.share.openapi.AdminOperatorCatalogControllerContractTest' --tests 'com.lhs.share.hub.repository.entity.OperatorCatalogResponseContractTest' --tests 'com.lhs.share.hub.repository.entity.OperatorCatalogEntityContractTest'

最后运行：

./gradlew test

如果 /home/syoius/BackEndV3-Share/AGENTS.md 或 /home/syoius/BackEndV3-Share/README.md 规定了额外格式化、静态检查或集成测试，也必须执行。

七、最终交付报告

最终回复按两个子任务分区列出：

A. 账号游戏版本
- 修改文件；
- SubAccount/DTO/API 最终结构；
- 迁移脚本路径、dry-run/APPLY 行为；
- invalid_game/account_game_mismatch 行为；
- 测试命令与结果。

B. 公共图鉴奇闻定义
- 修改文件；
- 公共和管理员响应 JSON；
- specialOddityName 的 create/update/存量兼容语义；
- 3/4/5 星派生上限；
- catalog_version 和缺名处理；
- 测试命令与结果。

C. 联合结论
- 完整 ./gradlew test 结果；
- README/Swagger 更新位置；
- 未填充逐密探正式奇闻名称这一已知待办；
- 任何尚存风险或与权威规格的差异。

完成标准：

- 两份子任务文档的完成定义全部满足；
- 账号 game 成为跨设备权威值；
- 密探公共图鉴能稳定提供第三奇闻名称和 oddity_schema；
- operator 新写入不能绕过 account_game_mismatch；
- 客户端不能覆盖奇闻稳定键或上限；
- 存量账号、存量目录和既有库存/密探历史不丢失；
- 后端完整测试通过。
```
