# JSON Schema

| Schema | 用途 | 权威程度 |
|---|---|---|
| [`inventory-exchange-v2.schema.json`](./inventory-exchange-v2.schema.json) | 库存 v2 开发期校验 | 按当前后端约束整理的严格互操作子集；目录存在性、账号归属、entry ID 唯一性仍由服务端校验 |
| [`operator-exchange-v2-import.schema.json`](./operator-exchange-v2-import.schema.json) | 密探 v2 导入校验 | 按当前兼容 DTO 整理的严格互操作子集；SP 化极上限、目录与命盘合法性仍由服务端校验 |
| [`../../schemas/operator-growth-exchange-v3.schema.json`](../../schemas/operator-growth-exchange-v3.schema.json) | 密探 v3 正式校验 | v3 权威 Schema，与后端资源文件一致 |

Schema 使用 JSON Schema Draft 2020-12。建议启用 `date-time` format checker。

“严格互操作子集”表示 Schema 会拒绝未定义字段和不必要的 `null`，即使当前 v2 服务端在部分层级可能忽略它们。这样可避免客户端依赖未承诺的宽松解析行为。

Schema 只能检查结构；以下语义必须额外处理：

- 账号所有权与 OpenAPI Token 绑定范围；
- 同一 record 中的业务 ID 唯一性；
- ID、命盘词条和游戏是否存在于最新公共目录；
- `record_id` 幂等冲突；
- 密探 v3 preview 的 partial/review/rejected 判定。
