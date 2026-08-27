# 密探养成数据交换协议 v3 接入指南

状态：当前推荐版本  
格式：`myshare-operator-exchange@3`

完整规范以 [密探养成数据交换协议 v3](../operator-growth-data-exchange-protocol-v3.md) 为准。本页帮助第三方开发者选择记录类型和传输流程，不重复定义全部字段。

## 1. v3 解决的问题

v3 可表达：

- 客观养成：等级、修为、化极、奇闻、攻击/生命/特殊值、双命盘和六个星石槽位；
- 主观数据：养成状态、特别关注、养成目标和备注；
- 数据可信度：匹配信息、分区状态、覆盖率、未匹配项与 diagnostics；
- 来源：`manual`、`scan`、`backup`、`migration`。

机器校验与样例：

- [正式 JSON Schema](../schemas/operator-growth-exchange-v3.schema.json)
- [完整备份有效样例](../examples/operator-growth-exchange-v3/full-backup.valid.json)
- [SP 自动采集有效样例](../examples/operator-growth-exchange-v3/scan-sp.valid.json)
- [Schema 无效样例](../examples/operator-growth-exchange-v3/schema-invalid.json)
- [需人工复核样例](../examples/operator-growth-exchange-v3/semantic-review.json)

## 2. 两类独立记录

| `record_type` | 领域 | 省略时的含义 |
|---|---|---|
| `operator_snapshot` | 客观养成 | 不交换客观数据 |
| `operator_annotation_snapshot` | 状态、关注、目标、备注 | 不交换主观数据 |

两类记录的覆盖边界互相独立。自动采集器只生成 `operator_snapshot`，不能用空客观字段清除用户标注。

## 3. 接入流程

1. 调用 `GET /v1/operator/catalog`，按 `id` 和 `games` 建立密探匹配。
2. 生成文档并以正式 Schema 校验；`record_id` 在重试间保持不变。
3. 浏览器导入先调用 `/v1/operator/import/preview`，展示 accepted/partial/review/rejected/unchanged。
4. 存在 review 时由用户确认，再以 `confirm_review=true` 调用 commit。
5. 自动采集器通过 OpenAPI scan preview/commit，不能使用普通 v3 浏览器包装体。

## 4. 来源账号映射

浏览器请求可使用包装体：

```json
{
  "document": {"format":"myshare-operator-exchange","version":3,"accounts":[],"records":[]},
  "account_mapping": {"local_default":"acc_xxx"},
  "confirm_review": false
}
```

若文档来源账号本身就是当前 JWT 用户拥有的目标账号 ID，可直接提交原始文档。OpenAPI scan 接口只允许单来源，服务端强制映射到 Token 绑定账号。

## 5. 自动采集的强制限制

OpenAPI `operator:scan:write` 只接受：

- 单一来源账号；
- `operator_snapshot`；
- `source_kind=scan`；
- `snapshot_scope=listed`；
- 不含 annotation/full/manual；
- 不扣减库存。

无法可靠识别的原始条目放入 record 的 `unmatched`，不能伪造 `operator_id`。分区未采到时使用 `section_status=unavailable|partial` 并省略不可靠字段；不要用零值冒充“未识别”。

## 6. Preview 与 Commit

Preview 顶层格式是 `myshare-operator-import-preview@1`，统计：`accepted`、`partial`、`review`、`rejected`、`unchanged`。`items[]` 提供目标账号、密探、记录、变化、warning、blocking error、stale 和 revision 信息。

- Preview 不写数据。
- Commit 默认拒绝 review 项；只有浏览器用户明确确认后才传 `confirm_review=true`。
- OpenAPI 自动采集不允许绕过需要人工复核的边界。

具体端点见 [传输与鉴权](./transport.md)。

