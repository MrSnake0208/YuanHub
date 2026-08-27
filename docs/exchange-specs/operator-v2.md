# 密探养成数据交换协议 v2（兼容）

状态：兼容版本，新接入建议使用 v3  
格式：`myshare-operator-exchange@2`  
导入 Schema：[`schemas/operator-exchange-v2-import.schema.json`](./schemas/operator-exchange-v2-import.schema.json)

v2 只交换单层客观养成快照，适合旧版快速录入。它不能完整表达双命盘、战斗数值观测、特别关注、养成标注或目标。

## 1. 顶层与 Record

顶层字段与库存文档相同：`format`、`version`、`exported_at`、`producer`、可选 `catalog_version/accounts` 和必填 `records`。`records` 为 1..1000 项。

Record：

| 字段 | 必填 | 约束 |
|---|---:|---|
| `account_id` | 是 | 调用者拥有的子账号；OpenAPI 时必须等于 Token 绑定账号 |
| `record_id` | 是 | 1..128 字符的稳定幂等 ID |
| `record_type` | 是 | 固定 `operator_snapshot` |
| `game` | 是 | `代号鸢` 或 `如鸢`，且必须与目标账号一致 |
| `effective_at` | 是 | RFC 3339 时间 |
| `snapshot_scope` | 是 | `full` 或 `listed` |
| `entries` | 是 | `listed` 至少一项；`full` 可为空 |

`full` 替换当前游戏账号的完整密探基线，`listed` 只覆盖列出的密探。较旧记录不会覆盖较新的基线，并计入 `superseded`。

## 2. Entry

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | 公共密探 ID；同一 record 内唯一 |
| `name`、`alias` | 否 | 展示冗余 |
| `rarity`、`prof`、`subProf`、`games` | 否 | 目录冗余；冲突时目录为准并产生 warning |
| `elite` | 是 | 非负整数，修为 |
| `starLevel` | 是 | 普通密探 0..31；SP 密探 0..5 |
| `level` | 是 | 非负整数 |
| `discs` | 否 | 单套命盘；默认空数组 |
| `starStones` | 否 | 已装备星石；默认空数组 |

`discs[]`：

```json
{"ot_name":"初始能量+2","abbreviation":"能量+2","color":"#F0E0AE","desp":"展示说明"}
```

`ot_name` 必须存在于该密探公共目录，且同一 entry 内不得重复。

`starStones[]`：

```json
{"name":"太阳","type":"main1","level":60}
```

- `type` 支持 `main`、`assist`、`main1..main3`、`assist1..assist3`。
- `main` 与 `assist` 导入后分别归一化为 `main1` 与 `assist1`。
- 归一化后的槽位不得重复，`level` 必须为非负整数。

完整示例：[`examples/operator-v2-listed-snapshot.json`](./examples/operator-v2-listed-snapshot.json)。

## 3. 历史字段命名兼容

v2 导入 DTO 混用了两种命名风格：

- Record 与命盘使用 `account_id`、`record_id`、`record_type`、`effective_at`、`snapshot_scope`、`ot_name`。
- Entry 的三个历史字段必须使用 camelCase：`subProf`、`starLevel`、`starStones`。

当前 v2 导出受全局 `SNAKE_CASE` 序列化影响，会输出 `sub_prof`、`star_level`、`star_stones`。若把 v2 导出文件再次交给 v2 导入接口，客户端应先转换：

```text
sub_prof    -> subProf
star_level  -> starLevel
star_stones -> starStones
```

这是 v2 的已知兼容边界。新工具应使用字段一致且有严格 Schema 的 [密探交换 v3](./operator-v3.md)。

## 4. 导入结果

成功返回 `{accepted,duplicates,superseded,warnings}`。相同账号与 `record_id` 的同正文重试计入 `duplicates`；不同正文返回 409 冲突。

