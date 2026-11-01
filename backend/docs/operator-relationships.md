# 密探信赖与传闻

首版入口位于密探名册内，暂仅平台管理员和超级管理员可见。所有 `/v1/operator/relationships` 接口（含目录读取）要求 `operator_relationship:use`；匿名 401、普通与内测用户 403，账号归属校验保持不变。记录独立存储于 `operator_relationships`，不改变练度导入 v5、库存、成就或领取状态。两款游戏现共用提取的信赖奖励规则；传闻奖励资料仍为空，可记录数量但不估算传闻收益。

## 接口

接口使用现有 JWT 身份，返回 `ApiResult` 包装及 `Cache-Control: no-store`。

| 请求 | 用途 |
| --- | --- |
| `GET /v1/operator/relationships/catalog?game=如鸢` | 返回 `game/version/operators`；游戏仅支持如鸢、代号鸢 |
| `GET /v1/operator/relationships?account_id=...` | 返回当前用户所属账号记录；空记录不会创建文档 |
| `PATCH /v1/operator/relationships?account_id=...` | 按字段合并，一次请求原子保存 |

PATCH 必须且仅包含 `expected_revision`、`catalog_version`、`entries`。例如下列密探 ID 仅作示意，调用时须使用当前游戏目录真实 ID：

```json
{"expected_revision":0,"catalog_version":"从当前目录响应读取的完整 version","entries":{"operator_id":{"trust":0,"rumors":null}}}
```

未传字段保持原值，`null` 清除记录，`0` 明确记录为零；不接受字符串、负数、小数或非安全整数。批次最多 1000 位密探、1 MiB，保存后总记录最多 1000 位。已知上限会校验；上限未知仅做类型校验。共享信赖归并到规则明确指定的主体，传闻按卡独立；同批共享信赖值冲突时整批拒绝。

响应包含 `account_id/game/revision/catalog_version/entries/updated_at`。无变化不增加版本。版本或规则变化返回 409，前端需重新读取后核对；非法数据 422，非本人或不存在的账号 404。账号写围栏与版本 CAS 在 Mongo 事务中执行；删除账号清理记录，有实质记录的账号禁止切换游戏。持久化只使用现有 hub 数据库及事务管理器。

## 维护奖励资料

静态数据：`src/main/resources/operator/relationships.json`，保留全部 124 位原密探、40 档奖励及原始导出摘要。数据来自 2026-10-22 信赖配置提取；双服同步、原形态与电影形态共用信赖及奖励按产品确认执行。更新数据时运行：

```sh
python3 scripts/operator/import_trust_rules.py /path/to/trust_export src/main/resources/operator/relationships.json
```

转换器交叉检查完整等级奖励和突破表。每位密探使用自己的最终上限：22 位为 2000（15 档），102 位为 10000（40 档），不能把化极星级当作初始品质。15 档累计奖励为兵书残卷 75、白金币 100、阴符 3、阴符·异 1；40 档为 200、260、7、4。声音、功能解锁和赠礼偏好不作为物品奖励。

运行时按当前游戏的真实服务器图鉴精确匹配原密探名称，电影形态通过图鉴 `spOf` 归属原密探。名称歧义或资料缺失时信赖规则为 `null`；关系无效时不提供该条规则。本地种子缺少的密探仍保留在数据中，服务器图鉴存在后即可匹配。目录版本由数据版本和完整数据、实际映射的摘要组成；客户端必须读取当前版本，不能硬编码。

接口中的每位密探包含 `trust_owner_id/trust/rumors`。已收录领域包含 `max/complete/source/verified_on/milestones`，档位为 `{at,rewards:[{item_key,name,quantity}]}`；未知领域为 `null`。完整领域才纳入计算，物品按 `item_key` 汇总，共享信赖只统计一次；已达标档位不再计入未解锁收益，不能据此判断是否已领取。

读取不会迁移或修改旧记录。只有显式保存信赖字段时，才在同一事务中归并到原密探并清理同组旧别名的信赖，保留各自传闻；`null` 清除本组信赖，`0` 仍是有效记录。客户端对不一致的历史共享值提示人工核对，不静默选值；仅修改传闻不会清理信赖。规则在保存期间改变时拒绝保存，需重新核对。

## 定向验证

`OperatorRelationshipCatalogTest` 覆盖全部 124 位映射、15/40 档总额、双服与动态图鉴版本；`OperatorRelationshipServiceTest` 覆盖字段语义、校验、共享、版本与纯读取；`OperatorRelationshipControllerTest` 覆盖身份传递和响应；`OperatorRelationshipMongoTest` 使用 TestMongo 独立可抛弃容器验证隔离、CAS 与回滚；`SubAccountServiceTest` 覆盖账号生命周期。
