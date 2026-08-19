# 已归档：后端实施 Prompt：密探心纸库存编辑与特别关注同步

> 状态：后端已实现并通过本地真实 Mongo 并发烟测，本 Prompt 仅保留为历史实施记录，不应再次投递。
> 前端任务请使用 [`frontend-implementation-prompt-agent-favorites.md`](./frontend-implementation-prompt-agent-favorites.md)，接口交付见 [`frontend-handoff-agent-favorites.md`](./frontend-handoff-agent-favorites.md)。

以下是当时发送给 BackEndV3-Share 编码代理的原始内容。

```text
你正在修改 MaaYuan Share / YuanHub 的 Spring Boot 后端 BackEndV3-Share。

目标：
1. 为登录用户提供“密探特别关注”云端同步能力，数据按库存子账号 account_id 严格隔离；
2. 验证并补齐现有库存交换协议 v2 对密探心纸手动库存更新的支持；
3. 保证库存写入只能改变数量，绝不能通过用户请求修改密探名称、星级、属性、职业等公共目录元数据。

权威规格：
- docs/inventory-agent-heart-paper-backend-spec.md
- ~/YuanHub/docs/api-contract.md 中“库存接口契约（/v1/inventory，交换协议 v2）”

开始前：
- 先完整阅读后端仓库的 AGENTS.md、库存模块、认证/账号所有权校验、数据库迁移、异常包装、Jackson SNAKE_CASE 和测试约定；
- 用现有包结构、命名、Repository/Service/Controller 模式和迁移工具实现，不要自行引入新框架；
- 核对当前库存账号表、删除级联、目录查询/校验和 stock_snapshot 重放逻辑，不能依据前端文档猜测类名或表名；
- 保留工作树中与本任务无关的已有改动。

需要实现：

A. 数据持久化
- 新增 inventory_agent_favorite（名称可按现有规范调整）迁移；
- 核心字段为 account_id、agent_id、created_at；
- (account_id, agent_id) 建立主键或唯一约束；
- account_id 外键关联库存子账号，删除账号时 ON DELETE CASCADE；
- 不要把关注状态放进库存当前值、库存流水、密探目录或交换档案 v2；
- 不要仅依赖应用层查重，并发幂等必须由数据库唯一约束兜底。

B. JWT 接口
按现有库存成功/错误包装和 snake_case JSON 实现：

GET /v1/inventory/agent-favorites?account_id=acc_xxx
data = { "account_id": "acc_xxx", "agent_ids": ["char_038_luxun", "char_102_jianyong"] }

PUT /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
data = { "account_id": "acc_xxx", "agent_id": "...", "favorite": true }

DELETE /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
data = { "account_id": "acc_xxx", "agent_id": "...", "favorite": false }

- 三个接口都只接受普通登录 JWT，当前不增加 OpenAPI Token scope；
- GET 结果去重并确定性排序；
- PUT 和 DELETE 都必须幂等；
- Service 层必须用 JWT 当前用户校验 account_id 所有权，不能接受 user_id，也不能只凭 account_id 直接操作；
- 不同子账号必须完全隔离，即使属于同一用户；
- 校验 agentId 格式及目录存在性，错误码/HTTP 状态遵循现有库存模块；
- 上线前确保后端密探目录包含前端将使用的新密探 ID。

C. 密探心纸库存
不要新增密探专用库存更新接口。检查现有：

POST /v1/inventory/import
GET /v1/inventory/current?account_id=...&entity_type=agent

确保交换协议 v2 的 record_type=stock_snapshot、entity_type=agent 可正确更新该子账号的密探心纸数量，并符合 full/listed 现有语义。若已经支持，只补测试；若不支持，修复通用库存实现。

库存请求中只有 id 和 count 参与库存业务。name 只是交换档案冗余展示值，不得覆盖目录名称。rarity、prof、sub_prof 等客户端额外字段不得更新公共目录。不要创建可被库存写入调用的目录更新路径。

D. 发布顺序
无需新增 release_order、release_date 数据库字段，也无需新增后端排序接口。前端会从 ID 解析：
- char_102_jianyong -> 102
- 数字越大越新
- 无法解析的 ID 排在最后

E. 测试
至少覆盖：
- 同一账号 PUT 两次仅一行且均成功；
- DELETE 不存在的关注项仍成功；
- 同一用户两个子账号关注列表隔离；
- 不同用户越权访问被拒绝；
- 未登录 401；
- 非法/未知 agentId 被拒绝；
- 并发关注同一密探不产生重复行或 500；
- 删除子账号级联删除关注数据；
- agent full/listed stock_snapshot 的数量语义；
- 密探快照不影响 item，账号 A 不影响账号 B；
- 伪造 name、rarity、prof、sub_prof 不改变密探目录；
- 关注操作不改变 current/acquired/records/export，不生成库存流水；
- 远程目录同步失败时保留上一份有效目录；
- 重复或非法密探 ID 不得进入后端目录；
- 现有库存、导入导出、记录重放和账号 CRUD 测试全部通过。

F. 文档与交付
- 更新后端 OpenAPI/Swagger 注解和后端仓库自己的接口文档；
- 数据库迁移必须随代码提交；
- 不要修改库存交换档案版本或偷偷向 v2 增加 preferences 字段；
- 运行后端仓库规定的格式化、单元测试和集成测试；
- 最终报告修改文件、迁移名称、接口示例、测试命令与结果、尚存风险；
- 如发现现有实现和规格冲突，先以代码证据说明冲突，再选择兼容现有数据的最小修复方案，不得跳过关键验收项。

完成标准：
- 登录用户在设备 A 对子账号 A 关注密探后，设备 B 登录同一用户并选择子账号 A 可读到；
- 同一用户的子账号 B 不出现该关注，除非在 B 中单独关注；
- 密探心纸库存可以通过现有 v2 快照更新；
- 所有密探静态属性保持只读；
- 现有物品库存和交换档案兼容性不回归。
```

## 交给后端代理时的补充材料

建议同时提供：

1. 后端仓库的绝对路径；
2. 后端数据库类型和本地测试数据库启动方式；
3. 最新密探目录数据或生成流程；
4. 一个开发用登录账号及两个库存子账号，或对应的集成测试 fixture；
5. 后端当前分支和期望提交方式。

如果后端目录尚未包含最新密探，应先完成目录同步，再验证关注和库存写入。否则严格的目录存在性校验会导致前端最新密探操作返回 422。
