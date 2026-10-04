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

## 第三项奇闻精度

`combat_stats.oddities.special.current` 支持非负数、最多一位有效小数，如 `0.5`、`3.2`；尾随零不增加精度。所有第三项名称共用稳定键规则，沿用数值单位，不新增百分号或换算。攻击/生命奇闻继续要求整数 JSON 数字；目录上限与诊断整数 `max` 不变。超精度拒绝，不静默四舍五入。

`ready` 三键齐全，`partial` 只合并出现的键；v3 export → import 保留第三项小数和攻击/生命整数。v2 没有 `combat_stats`，不能无损交换第三项奇闻。部署先更新后端；小数落库后不得直接回退到旧整数模型，也不会自动改善旧采集器 OCR。


## 2026-10-03：已弃置枚举扩展

主观 `growth_state` 为 `active | graduated | skip | discarded`，对应养成中/已毕业/养老中/已弃置。discarded 保留所有资料，支持 listed/full 备份恢复，普通客观导入和 scan 不覆盖它。API 分享/OpenAPI 读取原样透传。未知非空值拒绝，缺失沿用默认。

仍为 v3 明确扩展，旧 schema 会拒绝新值文件。发布前先升级读取界面和 MaaYuan，再开放新值写入；旧标签页使用现有更新横幅刷新；后端回滚需保留四值兼容。详情见完整 v3 协议的“2026-10-03 v3 养成状态枚举扩展”。

## SP 共享成长约束（2026-10-05）

协议身份和字段不变；服务端根据目录 spOf 同步本体及全部 SP 的等级/修为。各形态星级独立，缺失形态仅补零星占位；full 裁剪后也保留关系占位。关联成长变化推进 revision，并将旧观测标记 stale。历史存量不会由本次发布自动迁移。
同一 v3 record 的有效共享 patch 值冲突时，该关联组全部 rejected（`shared_growth_conflict`）；无关组仍按原有部分接收语义处理。合法同值双形态提交在同一事务中准备并应用，允许本批同步引起的 revision 变化，保留外部并发冲突保护；响应与审计使用最终 revision。review 未确认字段仍按原规则排除。SP annotation 星级目标同样限 0..5。
