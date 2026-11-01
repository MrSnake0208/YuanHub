# 密探鞭子重置与撤销

该功能仅记录游戏内已完成的重置，不操作游戏，不统计、消耗或返还「触器·却谷」。等级变为 1、修为变为 +1、等级突破状态变为 0。星级、觉醒、命盘、奇闻、星石、关注、备注及目标保留；原面板数据保留，采集面板标为待核对。

## 返还口径

服务端按已保存练度预填兵书、等级突破和属性修为材料；五铢钱只展示。如鸢与代号鸢共用返还口径：1–100 级按现有等级经验表累计基础经验，全卷优先（每本 1000 经验），余数换残卷（每本 100 经验），不足 100 经验不补算。六韬不参与自动拆分，保留该项键并预填 0。100 级基础经验为 2,386,300，对应 2386 全卷和 3 残卷。当前等级内及满级溢出经验未记录，不自动补入；玩家按游戏预览修改实际数量，例如另有 500 溢出经验时可核对为 2386 全卷和 8 残卷。整十级突破状态未知时必须选择已突破/未突破。手动返还清单只能包含该次规则允许的物品，必须完整提交预览所列键，数量为 0..Int.MAX_VALUE 的整数，0 表示不记录该项返还。

同一组共享形态一起变更练度，只返还一次。不同形态原有招募/星级等私有信息不变。已被采集/盘点包含的返还不可再次记录；服务端不能判断游戏内是否真的重置，玩家确认前应核对游戏清单与库存。

## 私有接口

全部接口使用 JWT 的用户归属，绑定子账号的游戏，不缓存。正文严格为下列字段，不允许客户端 user_id 或任意扩展；数值不接受小数、字符串或溢出。

| 方法与 `/v1/operator/resets` 后缀 | 参数 |
| --- | --- |
| POST `/preview` | `{account_id,game,operator_id,refunds?:{item_id:count},level_breakthrough_stage?:int}` |
| POST `/execute` | Header `Idempotency-Key`；`{account_id,game,preview_token,confirmed_game_preview:true}` |
| GET 空后缀 | `account_id,game,operator_id,cursor?`；每页 20 条，返回 `{items,next_cursor}` |
| POST `/{id}/undo-preview` | `{account_id,game}` |
| POST `/{id}/undo` | `{account_id,game,preview_token}` |

预览返回 `{preview_token,before,resources,blockers,inventory_revision,money,experience,breakthrough_required}`。每项资源包含 `id,count,balance_before,balance_after`；未知余额为 null。撤销预览数量为负值。无阻塞项时预览可提交，token 绑定用户/账号/游戏、原练度及库存版本，5 分钟有效。读取、预览、取消不产生持久化写入。

预览先读取库存版本，再读取余额。如果两次读取之间有库存事务提交，预览仍绑定旧版本，执行时必须冲突阻断并重新预览，不能将旧余额与新版本绑定后接受提交。重置与撤销预览共用此保护。

执行及撤销均在 Hub Mongo 事务内完成：账号生命周期 fence、整组练度版本/观测基线校验、库存版本 CAS、练度 current/correction、库存 current/resource_delta、持久操作回执。重复执行编号同正文返回原记录（包括后来已撤销的状态），异文 409；撤销同一记录天然幂等。事务提交结果未知时返回 `reset_result_unknown`，客户端保留原请求与编号重试，不生成另一笔操作。

## 撤销边界

`operator_reset_transactions` 没有 TTL；刷新、换设备、服务重启后，仍可读取原账号记录并重新生成撤销预览。撤销只恢复本次练度字段并扣回实际返还数量，不覆盖整个账号或恢复整份库存快照。无关新增资源保留。

以下情况阻止直接撤销：关联密探/共享形态有后续保存或采集（版本/有效基线变化）、相关材料被重新盘点、数量不足或预览后数据变化。第一版保守阻止关联密探的任意后续保存，不自动连带回退。相关库存缺盘点基准或基准在未来时不可执行。失败整笔回滚，不能部分扣回或产生负库存。

库存使用有符号内部 `resource_delta`，以 transaction_id 关联回执，按 resource_revision 排序重放，不计入 reward_delta 获得量/收集速度。重置及撤销流水不可单独删除或恢复。名册 correction 使用相同前缀保证同毫秒先重置、后撤销的重放顺序。账号删除级联清理回执；账号备份交换仅迁移现有事实，不复制撤销历史，不扩展交换协议。

## 定向验证

`OperatorResetRulesTest` 覆盖混合兵书、突破边界和三组属性；`OperatorResetControllerTest` 覆盖私有归属、no-store 及严格输入；`OperatorResetMongoTest` 使用自有可丢弃容器覆盖事务、并发、幂等、重启后撤销、基线与关联流水保护。`SubAccountServiceTest` 覆盖回执级联清理。不得连接开发或生产库运行这些事务测试。

`OperatorResetPreviewTest` 无数据库复现预览两次读取之间的库存变更，验证旧余额绑定旧版本；`OperatorResetMongoTest` 对应交错读取用例进一步验证执行冲突时不写练度和库存，重新预览后结果与展示一致。
