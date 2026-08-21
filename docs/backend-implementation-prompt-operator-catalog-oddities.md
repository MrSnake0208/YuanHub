# 后端实施 Prompt：密探公共图鉴奇闻定义

状态：可直接投递给 BackEndV3-Share 开发 Agent  
任务范围：密探养成 v3 的后端阶段 0，仅实现公共图鉴奇闻定义  
目标仓库：`/home/syoius/BackEndV3-Share`

如需与“统一子账号游戏版本”在同一后端批次交付，优先投递总控 Prompt：`/home/syoius/YuanHub/docs/backend-implementation-prompt-operator-foundation-batch.md`。本文件继续作为公共图鉴子任务的完整验收规格。

```text
你正在修改 MaaYuan Share / YuanHub 的 Spring Boot + Kotlin + MongoDB 后端。

工作仓库：
/home/syoius/BackEndV3-Share

目标：
为现有“密探公共图鉴”增加第三项奇闻名称的管理员维护能力，并让公共/管理员目录响应返回基于稳定键的完整奇闻定义。这是密探养成数据交换协议 v3 的前置任务。

本次只完成公共图鉴阶段 0。不要实现 v3 import preview/commit、operator_current 战斗属性、自动采集 OpenAPI、前端页面或用户养成数据迁移。

一、开始前必须完整阅读

后端仓库规则与现状：
- /home/syoius/BackEndV3-Share/AGENTS.md
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogEntity.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/request/OperatorCatalogWriteRequest.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/response/OperatorResponses.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorCatalogService.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/OperatorController.kt
- /home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/operator/AdminOperatorCatalogController.kt
- /home/syoius/BackEndV3-Share/src/main/resources/operator/operators.json
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorCatalogServiceTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/openapi/AdminOperatorCatalogControllerContractTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogResponseContractTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogEntityContractTest.kt

权威产品与协议规格：
- /home/syoius/YuanHub/docs/backend-operator-current-workbench-spec.md
- /home/syoius/YuanHub/docs/operator-growth-data-exchange-protocol-v3.md
- /home/syoius/YuanHub/docs/operator-current-workbench-implementation-plan.md
- /home/syoius/YuanHub/docs/operator-auto-scan-integration-plan.md
- /home/syoius/YuanHub/docs/api-contract.md
- /home/syoius/YuanHub/docs/schemas/operator-growth-exchange-v3.schema.json

若文档与当前后端代码在类名、返回包装或序列化方式上有差异，以当前代码结构为实现基础，但不得改变下述业务语义。先检查工作树并保留所有无关改动。

二、必须冻结的业务语义

1. 用户养成值只使用三个稳定键：
   - attack：奇闻攻击力
   - hp：奇闻生命值
   - special：第三项奇闻

2. “增伤值 / 免伤值 / 治疗加成”等只是 special 的展示名称，不是用户数据键。

3. 每位密探的第三项展示名称由管理员在公共图鉴维护，持久化字段为 specialOddityName；对外 JSON 响应字段为 special_oddity_name。

4. 奇闻上限由服务端根据 rarity 统一派生，管理员不能逐个填写：
   - 3 星：attack=300，hp=1560，special=9
   - 4 星：attack=305，hp=1820，special=11
   - 5 星：attack=500，hp=2600，special=15

5. 用户导入、自动采集和普通用户接口都不能修改 specialOddityName、odditySchema 或任何目录上限。

6. 修改 specialOddityName 只改变展示；本任务不得修改、重放或迁移任何 operator_current、operator_record、库存或用户标注数据。

7. 不允许按职业在服务端静默猜测并持久化正式名称。缺名时使用明确降级状态。

三、需要实现

A. 公共目录持久化字段

在 OperatorCatalogEntity 中增加：

specialOddityName: String? = null

要求：
- 必须有默认 null，使旧 Mongo 文档可以直接读取；
- 不在实体中保存 attack/hp/special 的 max；
- 不在实体中保存派生 odditySchema；
- 不新增无意义的 Mongo migration framework。当前项目是 Mongo 文档，nullable 字段即可兼容旧数据；如项目已有必要的显式数据脚本约定，再按现有约定处理并说明理由。

B. 奇闻规则与响应 DTO

在现有 operator 包结构中增加清晰、可单测的目录奇闻规则和响应 DTO。名称可遵循项目风格，但对外响应必须等价于：

{
  "id": "char_012_yanliang",
  "rarity": 4,
  "special_oddity_name": "免伤值",
  "oddity_schema": {
    "attack": { "name": "攻击力", "max": 305 },
    "hp": { "name": "生命值", "max": 1820 },
    "special": { "name": "免伤值", "max": 11 }
  },
  "incomplete_fields": []
}

要求：
- GET /v1/operator/catalog 的每个 operator 增加 special_oddity_name、oddity_schema、incomplete_fields；
- 保持现有公共目录字段和“不得暴露 star_stones / Mongo _id”的契约；
- GET /v1/admin/operator-catalog 以及管理员新增、更新、头像上传/删除成功响应也应返回 special_oddity_name 与派生 oddity_schema，同时保留管理端现有全部字段；
- 推荐使用专用 Admin response DTO 或明确的映射层，不要为了输出 oddity_schema 把派生字段持久化进 Mongo 实体；
- 现有公共目录 format=myshare-operator-catalog、version=1 保持不变，本次是向后兼容的加字段；
- 对外响应继续遵循项目全局 Jackson SNAKE_CASE。

缺名降级：
- special_oddity_name 返回 null；
- oddity_schema.special.name 返回“第三属性（图鉴待维护）”；
- incomplete_fields 包含且只包含当前缺失的 "special_oddity_name"；
- attack/hp 名称和三个上限仍正常返回。

C. 管理员写入

扩展现有 OperatorCatalogWriteRequest 和 create/update 流程：

- Kotlin 字段使用 specialOddityName；
- 正式 JSON 字段为 special_oddity_name，同时兼容当前管理员前端的 camelCase 请求风格 specialOddityName；不要改坏现有 subProf/starStones/spOf 请求；
- 非空名称 trim 后长度必须为 1..32；空白字符串返回现有风格的 422 schema_validation_failed；
- 管理员 create 新密探时 specialOddityName 必填，缺失或空白都拒绝；
- 为避免后端先上线时破坏当前尚未提交该字段的管理员前端，update 请求缺失/null 时保留 existing.specialOddityName，不得清空；
- update 显式提交非空值时保存 trim 后的值；不提供清空能力；
- create/update 后的响应使用保存后的真实值和派生 oddity_schema；
- 请求中伪造 oddity_schema、incomplete_fields 或 max 不能改变服务端派生结果。项目全局当前会忽略未知字段，可以保持该行为，但必须用契约测试锁定“派生值不被覆盖”。

D. catalog_version 与缓存

- 管理员新增/更新目录目前已经生成新 catalogVersion；确保 specialOddityName 变化走同一逻辑并立即反映到 GET /v1/operator/catalog；
- 不为本任务新增多余缓存；如果映射结果进入任何已有缓存，目录写入后必须失效；
- 纯展示名称变化不接触用户战斗属性和 combat_input_signature；本任务无需实现相关模型；
- avatar 仍遵循当前“不 bump catalogVersion”的既有语义，不因本任务改变。

E. 资源播种与存量数据

现有播种资源：
/home/syoius/BackEndV3-Share/src/main/resources/operator/operators.json

要求：
- fromResource 支持读取资源中的 specialOddityName；
- 全新数据库播种时把该字段写入实体；
- 已播种数据库仅在 existing.specialOddityName == null 且资源提供了非空 specialOddityName 时回填；
- 回填不得覆盖管理员已经维护的值；
- 实际发生名称回填时应更新一次有效 catalog_version，使客户端能够感知目录变化；
- 当前没有权威的逐密探第三奇闻名称清单，因此不要按 subProf 批量猜测，不要为了让字段非空而编造资源数据；现有记录允许先保持 null，由管理员后续补齐；
- 如果修改资源副本，核对 /home/syoius/BackEndV3-Share/docs/operators.json 与运行时资源的来源关系，避免两份目录无意漂移。没有权威值时不要批量改写这两个文件。

F. Swagger 与后端文档

- 更新相关 OpenAPI/Swagger 注解，使公共和管理员目录的新字段可见；
- 更新 /home/syoius/BackEndV3-Share/README.md 中密探公共图鉴/管理员目录的字段说明；
- 如需要新增后端设计说明，放在 /home/syoius/BackEndV3-Share/docs/ 下，并引用上述绝对路径规格；
- 不修改 /home/syoius/YuanHub 下的前端代码或协议文档。

四、测试要求

在现有测试基础上至少覆盖：

1. 3/4/5 星分别派生精确上限：
   - 300/1560/9
   - 305/1820/11
   - 500/2600/15
2. 公共目录输出 attack/hp/special 稳定键、正确名称、special_oddity_name 和空 incomplete_fields；
3. 缺名时返回 null、降级名称和 incomplete_fields=["special_oddity_name"]；
4. 公共响应仍不含 star_stones 和 Mongo _id；
5. 管理员列表和 create/update 响应包含全部旧字段及新增字段；
6. create 缺少名称或提交空白名称返回 422；
7. update 缺失/null 保留旧值，显式新值会 trim、保存并更新 catalog_version；
8. 资源字段只回填 null，不覆盖管理员已有值；实际回填可被 catalog_version 感知；
9. 客户端伪造 oddity_schema/max 不影响服务端派生结果；
10. 普通用户接口、用户养成记录和库存数据不因目录改名发生写入；
11. 现有 SP、头像、命盘、星石模板、管理员权限和目录播种测试不回归。

重点更新或新增测试文件应落在现有测试结构中，至少检查：
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorCatalogServiceTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/openapi/AdminOperatorCatalogControllerContractTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogResponseContractTest.kt
- /home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogEntityContractTest.kt

五、明确禁止

- 不实现 v3 导入或自动采集上报；
- 不修改 myshare-operator-exchange v2 行为；
- 不把中文展示名称作为 oddities 数据键；
- 不允许管理员编辑 attack/hp/special 稳定键或任一 max；
- 不按职业自动写入第三项正式名称；
- 不把 oddity_schema 保存进 operator_catalog；
- 不修改 operator_current、operator_record、库存、favorite、养成目标或备注；
- 不顺手重构无关模块，不覆盖工作树中的无关改动。

六、验证与交付

先运行定向测试，再运行完整测试：

cd /home/syoius/BackEndV3-Share
./gradlew test --tests 'com.lhs.share.hub.service.operator.OperatorCatalogServiceTest' --tests 'com.lhs.share.openapi.AdminOperatorCatalogControllerContractTest' --tests 'com.lhs.share.hub.repository.entity.OperatorCatalogResponseContractTest' --tests 'com.lhs.share.hub.repository.entity.OperatorCatalogEntityContractTest'
./gradlew test

如果仓库有既定格式化或静态检查命令，按 /home/syoius/BackEndV3-Share/AGENTS.md 和 /home/syoius/BackEndV3-Share/README.md 执行。

最终回复必须列出：
- 实际修改文件；
- 最终公共/管理员 JSON 示例；
- create/update 的缺失、空白、保留语义；
- catalog_version 与存量数据处理方式；
- 测试命令和结果；
- 未填充逐密探正式名称这一已知待办；
- 任何与权威规格仍存在的差异。

完成标准：
- 管理员能够为单个密探保存第三奇闻名称；
- 公共和管理员目录立即返回稳定的 oddity_schema；
- 3/4/5 星上限完全正确且不可由客户端覆盖；
- 旧 Mongo 数据可以直接读取，当前管理员前端对已有条目的读取与更新在后端先上线时不崩；旧前端新建密探因尚未提交必填名称而被拒绝是预期行为，需与后续管理员前端改动协同发布；
- 没有任何个人养成数据因目录字段新增或改名而变化；
- 全量后端测试通过。
```
