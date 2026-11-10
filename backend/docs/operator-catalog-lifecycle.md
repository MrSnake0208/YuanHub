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

## OCR 别名、描述别名维护与 MaaYuan 目录

公开 `GET /open-api/operator/catalog` 的完整契约见[公共目录交换规范](../../frontend/docs/exchange-specs/catalogs.md#3-maayuan-完整扫描目录)。目录数据直接来自数据库；职业定义位于 `src/main/resources/operator/professions.json`，内容取自 MaaYuan `agent/operators.json` 的 `PROFESSIONS`。公开旧 v1 目录继续只返回命盘原有四个字段。

管理端 `POST/PUT /v1/admin/operator-catalog` 的 `discs[].aliases` 是可选字符串数组；Mongo 字段名为 `discs[].aliases`，标准名字段为 `discs[].otName`。每盘最多 20 个别名，每项去首尾空白后最多 64 字符；空项去除，按 NFKC + 去空白后的值去重。更新时省略或 null 保留原有别名，显式 `[]` 清空；保留时优先匹配标准名，原位改名且旧名已从请求移除时使用原位置。若同时改名和重排，应显式传入别名。

别名归一后，不得等于同一密探另一命盘的标准名或别名，也不得等于任何密探上不同 `ot_name` 的标准名。标准名修改同样检查已有别名，冲突以 HTTP 422 `invalid_disc` 返回具体密探、命盘与别名；管理页保留输入以便修正。跨密探别名可以共用，但不能据此假定密探身份唯一。

`discs[].desp_aliases` 是可选的描述别名字符串数组，Mongo 字段名为 `discs[].despAliases`；管理响应完整返回，公开扫描目录仅在非空时输出，顺序在 `aliases` 之后。每盘最多 20 项，每项去首尾空白后最多 256 字符，空项去除；按 NFKC、去空白及去除非字母数字和非汉字字符后的归一键去重。更新时省略或 null 保留、`[]` 清空，并沿用 `aliases` 的标准名匹配及原位改名保留逻辑；同时改名和重排时应显式传入两种别名。

描述别名归一后，不得与同一密探其他命盘的 `desp` 或描述别名相等或双向包含，以免客户端描述匹配出现歧义；空描述不参与包含判断，不同密探之间不校验。修改标准描述同样校验已有描述别名，冲突返回 HTTP 422 `invalid_disc`，说明命盘及冲突项。

`/operator/admin` 每盘提供序号、OCR 别名及其下方的描述别名输入，均每行一个。已有密探命盘顺序影响自动编队，不要调整；普通保存会完整传递两种别名。描述别名用于客户端按描述反查未解锁命盘，扫描上传仍使用识别后的标准 `ot_name`，不改变导入逻辑。改正标准名时应把旧名显式添加为 OCR 别名，以兼容旧客户端及已保存命盘；仅改标准名不会自动生成别名。

当前数据的实际盘、目标盘在读取及 v3/v4/v5 导出时按该密探 aliases 投影为标准名，当前盘编辑及扫描导入也接受别名；历史正文与用户数据不做批量迁移。分享读取复用当前档案投影。旧 V2 历史备份、流水与纠错事件仍保留旧名；旧 V2 导入校验未扩展，含已改名词条的 V2 历史文档恢复前需更新名称，推荐改用当前 V5 备份。

### 一次性数据脚本（未执行）

根目录 `scripts/operator-catalog-ocr-aliases.mongosh.js` 仅处理本次确认的 17 组别名、13 处标准名修正（含快照准确 11 位生命词条）及陈琳顺序，不覆盖其他线上字段或 seed。只操作 `HubBackend.operator_catalog`。

```sh
# 默认只读并打印计划；连接参数由运维在授权环境提供
mongosh <连接参数> --file scripts/operator-catalog-ocr-aliases.mongosh.js
# 确认计划后显式写入，需支持事务的 replica set / sharded cluster
APPLY=1 mongosh <连接参数> --file scripts/operator-catalog-ocr-aliases.mongosh.js
```

所有目标、改名后的重复名、全目录别名冲突均在任何写入前检查；任一失败整体中止。APPLY 在单次事务快照中重新预检，写入同时检查原 discs 和 catalogVersion，失败回滚，不降级为逐条非事务写入。只有内容实际变化的行更新 `catalogVersion`，重复执行无变化则不写。提交结果不确定或并发冲突时，重新 dry-run 核对后再决定是否重试。

兼容发布顺序：先部署后端，再发布管理页；旧管理调用省略 aliases 或 desp_aliases 会分别保留对应别名。描述别名由管理员维护，不修改 seed，也不新增或执行数据脚本。上述 OCR 一次性脚本必须单独审阅并授权执行；MaaYuan 侧切源并读取描述别名后才能使用对应能力。当前工作未运行测试、构建、浏览器或数据脚本，未验证部署状态。

## SP 关系约束（2026-10-05）

新增/修改 `spOf` 只允许指向存在的普通本体，禁止自引用、SP 指向 SP、把已有 SP 子形态的本体改为 SP。本体 games 必须覆盖各 SP 的 games；无效关系返回 422 `invalid_sp_relation`。删除仍有 SP 引用的本体返回 409 `operator_has_forms`，应先显式处理关联形态；不会级联删除。

普通招募候选必须同时满足同游戏、rarity=5、spOf 为空；电影品质由关系派生，不新增另一份持久化品质字段。原始 operator_id、v2/v3 字段与独立拥有状态保持兼容。以上校验作用于新目录写入，不自动修复已有非法关系。
