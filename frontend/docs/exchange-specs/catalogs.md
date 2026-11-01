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

## 3. 缓存与变更处理

- 客户端可按 `catalog_version` 缓存，但生成交换文档前应刷新。
- 目录版本变化时重新构建 ID、游戏、命盘词条与 SP 关系索引。
- 导入期间发现未知 ID 时停止或把自动采集原文放入 v3 `unmatched`；不要创建自定义 ID。
- 交换文档里的 `catalog_version` 只用于说明生产时参考版本，不能要求服务端回退到旧目录。

