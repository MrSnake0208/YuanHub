# 密探目录删除与旧养成清理

## 目录来源

`GET /v1/inventory/catalog` 的 `agent` 条目与新增密探心纸记录的 ID 校验直接读取 `OperatorCatalogService`。道具仍来自 `entity_catalog`。管理员增删改公共图鉴后，不再依赖另一个 agent 字典的同步；历史 `entity_catalog.agent` 行保留但不参与公开目录及新写入校验，也不再从 `inventory/operators.json` 补齐。

修复场景：删除 `char_130_zhoutai`、`char_129_chenlin` 后创建 `char_129_zhoutai`、`char_130_chenlin`，库存公开目录只返回当前图鉴的周泰、陈琳，不会再导致名称歧义。ID 是完整字符串，不能只按数字序号互换。

新库存流水引用已删除 ID 返回 `unknown_entity_id`；已接收且原正文相同的流水仍按 `record_id` 幂等返回 duplicates，同 ID 不同正文仍返回 `record_conflict`。取消旧密探的特别关注不要求该 ID 仍在公共图鉴。

## 当前养成清理

`DELETE /v1/operator/current/{operatorId}?account_id=...`，普通登录 JWT。成功返回 `ApiResult(data=true)`。

- 账号必须属于当前用户，否则 404 `account_not_found`。
- 密探仍在公共图鉴中时返回 409 `operator_still_in_catalog`。
- 在同一事务中移除本人该子账号各版本文档中的指定 ID，包括旧通用版本 `universal` / `*`，其他密探与其他账号保持不变。
- 保留历史导入记录；按受影响版本写 `operator_correction_records`，`reason=catalog_removed`，并保存删除前的练度字段。删除某条 v2 导入记录后的重放会执行这一清理事件，避免旧养成复活。
- 重复请求返回成功；没有该条目的版本不写清理事件。
- 接口只清理当前养成，不迁移到同名的新 ID，不清理心纸库存、标注、目标或规划清单。

先部署后端，再发布提供「移除旧养成」入口的前端。目录修复不需要删除历史数据库行；旧养成由用户核对并确认后清理，需保留的练度先导出备份。开发期间不自动执行线上清理。

## 回归验证

定向运行 `EntityCatalogServiceTest`、`InventoryServiceTest`、`InventoryAgentFavoriteServiceTest`、`OperatorCatalogServiceTest`、`OperatorCurrentFoundationServiceTest`、`OperatorControllerContractTest`，覆盖目录残留、修改/删除即时生效、旧流水幂等、取消旧关注、跨版本清理、账号隔离、有效 ID 拦截和历史重放。

## SP 关系约束（2026-10-05）

新增/修改 `spOf` 只允许指向存在的普通本体，禁止自引用、SP 指向 SP、把已有 SP 子形态的本体改为 SP。本体 games 必须覆盖各 SP 的 games；无效关系返回 422 `invalid_sp_relation`。删除仍有 SP 引用的本体返回 409 `operator_has_forms`，应先显式处理关联形态；不会级联删除。

普通招募候选必须同时满足同游戏、rarity=5、spOf 为空；电影品质由关系派生，不新增另一份持久化品质字段。原始 operator_id、v2/v3 字段与独立拥有状态保持兼容。以上校验作用于新目录写入，不自动修复已有非法关系。
