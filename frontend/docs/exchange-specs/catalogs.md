# 公共目录交换规范

公共目录是只读发现接口，用于取得合法 ID 和目录版本。它不是用户数据备份，不能回传到 import 接口修改目录。

## 1. 实体目录 v1

端点：`GET /v1/inventory/catalog`，公开，无需认证。

```json
{
  "format": "myshare-entity-catalog",
  "version": 1,
  "catalog_version": "2026-08-24",
  "entities": [
    {"entity_type":"item","id":"baijinbi","name":"白金币"},
    {"entity_type":"agent","id":"char_001_yangxiu","name":"杨修"}
  ]
}
```

| 字段 | 说明 |
|---|---|
| `catalog_version` | 当前实体目录版本；可用于缓存与交换文档溯源 |
| `entity_type` | `item` 或 `agent` |
| `id` | 库存交换 entry 的稳定主键 |
| `name` | 当前展示名称，不是导入主键 |

导入库存时，服务端校验 `(entity_type,id)` 是否存在。调用方不应以名称反向猜 ID。

## 2. 密探目录 v1

端点：`GET /v1/operator/catalog`，公开，无需认证。

```json
{
  "format": "myshare-operator-catalog",
  "version": 1,
  "catalog_version": "2026-08-24",
  "entries": [
    {
      "id": "char_001_yangxiu",
      "name": "杨修",
      "alias": null,
      "rarity": 5,
      "special_oddity_name": "免伤值",
      "prof": ["阳"],
      "sub_prof": [],
      "games": ["代号鸢", "如鸢"],
      "discs": [{"ot_name":"初始能量+2"}],
      "sp_of": null,
      "avatar_url": "/v1/operator/catalog/char_001_yangxiu/avatar"
    }
  ]
}
```

关键用途：

- `id`：密探 v2/v3 的 `operator_id` 或 entry `id`。
- `games`：确认密探是否适用于目标子账号游戏。
- `discs[].ot_name`：校验 v2 命盘词条以及 v3 命盘匹配。
- `sp_of`：判断是否为 SP 密探；普通化极范围 0..31，SP 范围 0..5。
- `special_oddity_name`：展示 v3 `oddities.special` 的业务名称；交换字段键仍固定为 `special`。

公共响应不包含用户已装备星石，也不把目录模板星石当成养成状态。

## 3. MaaYuan 完整扫描目录

`GET /open-api/operator/catalog` 公开，无需 Token 或 Beta 资格，直接返回 JSON 文档，不使用 `ApiResult` 包装。原 `/v1/operator/catalog` 的响应字段保持不变，不新增 `discs[].aliases` 或 `discs[].desp_aliases`。

```json
{
  "OPERATORS": [{
    "id": "char_001_yangxiu",
    "name": "杨修",
    "name_en": "杨修",
    "alias": "",
    "alt_name": "杨修",
    "rarity": 5,
    "prof": ["阳"],
    "subProf": ["shenji"],
    "games": ["如鸢", "代号鸢"],
    "discs": [{"ot_name":"初始能量+2","abbreviation":"初始+2","color":"金","desp":"初始能量+2","aliases":["示例错读"],"desp_aliases":["初始能量增加2点"]}]
  }],
  "PROFESSIONS": [{"id":"阳","name":"阳","name_en":"阳","sub":[{"id":"shenji","name":"神纪","name_en":"神纪"}]}],
  "catalog_schema_version": 1,
  "catalog_version": "2026-11-10T00:00:00Z"
}
```

示例仅展示一位密探、一项命盘与一个职业分组；实际 `PROFESSIONS` 为 MaaYuan 原有完整定义。

| 契约 | 行为 |
|---|---|
| 数据来源 | 每次读取数据库 `operator_catalog`，不触发 seed/backfill；`catalog_version` 取本次数据库快照中最大的持久化 `catalogVersion` |
| 排序 | 密探按 ID 稳定排序；命盘严格保持存储顺序，自动编队依赖该顺序；`discs=[]` 草稿不输出 |
| 字段 | `name_en`、`alt_name` 均派生自 `name`；`alias/abbreviation/color/desp` 的 null 输出空字符串；`aliases`、`desp_aliases` 均仅在非空时输出，`desp_aliases` 为字符串数组，放在 `aliases` 之后；`subProf` 大小写固定 |
| 缓存 | `Content-Type: application/json; charset=utf-8`、`Cache-Control: public, no-cache`；强 `ETag` 为完整响应序列化字节的 SHA-256（带双引号） |
| 条件读取 | 带 `If-None-Match`，命中返回 HTTP 304、相同 ETag 和缓存头、无正文；内容变化返回 HTTP 200 和新完整文档 |
| 失败与限流 | 数据库读取、空库或组装失败为真实 HTTP 503，正文 `{"error":"operator_catalog_unavailable"}`、`Cache-Control: no-store`，不返回部分目录；匿名 IP 每 60 秒最多 600 次，超限 HTTP 429、`Retry-After: 60` |

客户端应在扫描前发起条件读取，收到 304 复用上次完整目录；503 或网络失败时保留可用缓存，不能用错误响应覆盖缓存。管理员提交修改后，下一次请求即可读取新内容；不提供实时推送。MaaYuan 需已接入此端点，且新密探仍符合客户端既有 OCR 与界面规则。

`discs[].desp_aliases` 是管理员维护的描述写法，用于客户端按描述反查未解锁命盘；可省略，客户端按空数组处理。管理写入时每盘最多 20 项，每项去首尾空白后最多 256 字符，空项去除；按 NFKC、去空白及去除非字母数字和非汉字字符后的归一键去重。同一密探内，描述别名不得与其他命盘的 `desp` 或描述别名归一后相等或双向包含；空描述不参与包含判断，不同密探之间不校验。冲突返回 HTTP 422 `invalid_disc` 并说明冲突项。

管理更新省略 `desp_aliases` 或传 null 时保留原值，显式 `[]` 清空；与 `aliases` 共用按标准名优先、原位改名回退原位置的保留规则。描述别名仅供客户端识别，识别后上传标准 `ot_name`，不作为导入词条或扫描上传字段。

扫描 v3/v4/v5 导入的 `disc_loadouts[].discs` 与 `target_discs` 接受该密探标准 `ot_name` 或其 `aliases`，均为精确匹配。别名在补丁生成、变更比较与写入前归一为标准名；归一后同一套盘中的重复词条仍被拒绝。原始上传正文保留，`record_id` 幂等比较继续按原文进行。

当前档案读取和 v3/v4/v5 备份导出将已保存的实际盘与目标盘旧名投影为当前标准名；未知名称原样保留。不会批量改写用户数据、历史流水或纠错事件。旧 V2 导入仍按原有标准名契约校验，不扩展为 OCR 输入接口。

## 4. 缓存与变更处理

- 客户端可按 `catalog_version` 缓存，但生成交换文档前应刷新。
- 目录版本变化时重新构建 ID、游戏、命盘词条与 SP 关系索引。
- 导入期间发现未知 ID 时停止或把自动采集原文放入 v3 `unmatched`；不要创建自定义 ID。
- 交换文档里的 `catalog_version` 只用于说明生产时参考版本，不能要求服务端回退到旧目录。

