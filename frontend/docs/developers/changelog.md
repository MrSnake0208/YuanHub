# 对外协议更新记录

本页记录文件格式、兼容约定及开发者 API 的变化，区别于[普通用户更新日志](/changelog)。以下日期按协议记录整理，不表示线上发布时间。

## 2026-10-18 · 文档基线核对

统一开发者入口，补齐 `calendar:read`、`operator:daily-tasks:write`、`star:capture:write` 及对应 API。修正普通成功响应为 `status_code/message/data`，null 字段可省略。Work V1 已实现；不再沿用总索引里的 Draft 判断。

完整密探备份推荐 V5；Token export 仍为 V2。本次只整理说明与前端文档，不新增任何后端 API、Scope 或数据迁移。

## 2026-10-17 · 密探 V5

新增 `level_breakthrough_stage:0..9|null`、历史 `observed_inputs.level_breakthrough_stage` 和 `section_status.breakthrough`。沿用 V4 化极、账号映射与扫描限制。整十级无法从等级推断是否已突破；扫描未知不清除已确认当前值，也不倒填旧观测。

迁移建议：完整备份显式请求 V5。V2/V3/V4 继续接收，但旧版导出损失突破事实；不自动降级。详见[密探 V5](../operator-growth-data-exchange-protocol-v5.md)。

## 2026-10 · 密探 V4

新增独立 `huaji:{owned,stage,awakened}`；旧 V2/V3 的 `star_level` 不原地换义。旧普通 25..30 适配至 stage25，旧31只确认觉醒，不能反推出当前阶段。SP 与隐密由目录语义继续校验。

迁移建议：升级读取器后使用 V5 保留独立化极和等级突破；[V4](../operator-growth-data-exchange-protocol-v4.md)继续兼容。

## 2026-10-03 · 主观状态扩展

密探 V3 的 `growth_state` 新增 `discarded`，V4/V5 延续。只用于主观标注，扫描不可写；旧值保留，`skip` 不自动迁移。旧版严格 Schema 会拒绝新枚举，不宣称完全向后兼容。详见[V3](../operator-growth-data-exchange-protocol-v3.md)。

## 已有稳定格式

[库存 V2](../exchange-specs/inventory-v2.md)：区分 `reward_delta` 与 `stock_snapshot`，区分快照 `full/listed`，保留稳定 `record_id`。

[招募 V1](./recruitment-v1.md)：完整历史备份，JWT 预览/提交、版本控制及抽数风险确认；不覆盖删除目标独有记录。

[Work V1](../exchange-specs/work-v1.md)：原生语义协议、服务端创作与公开读取已实现。Adapter 持续按[兼容规则](../exchange-specs/work-adapters-v1.md)报告 exact/partial/unsupported，不因协议正式而承诺任意 Pipeline 可转换。

## 后续维护约定

新增字段、扩大或收窄枚举、行为和覆盖边界改变时，记录兼容影响及迁移建议；旧读取器的限制需要明确写出。新增或调整公开 API 同时更新 API 参考及支持矩阵。未确认日期或线上状态不编造发布记录。
