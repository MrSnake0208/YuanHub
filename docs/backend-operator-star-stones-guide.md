# 后端修改指导：支持密探 3 主星 + 3 辅星星石

> 目标仓库：`BackEndV3-Share`  
> 对应前端：`YuanHub` 密探编辑弹窗已支持 3 主星 + 3 辅星槽位。

## 背景

前端密探编辑弹窗现已支持：

- 主星石 3 个槽位：`main1` / `main2` / `main3`
- 辅星石 3 个槽位：`assist1` / `assist2` / `assist3`
- 每个槽位携带：`name`（星石名）、`type`（槽位类型）、`level`（等级）

后端目前在导入校验时只允许 `main` / `assist` 两种类型，且要求同一 record 内 `type` 不重复。  
因此前端保存多颗主星/辅星时会报：

```
422 invalid_star_stone
```

需要扩展后端 `STONE_TYPES`，允许 8 种类型：

- 兼容旧值：`main` / `assist`
- 新槽位：`main1` / `main2` / `main3`
- 新槽位：`assist1` / `assist2` / `assist3`

## 修改文件

```
BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorService.kt
```

## 修改内容

将：

```kotlin
val STONE_TYPES = setOf("main", "assist")
```

改为：

```kotlin
val STONE_TYPES = setOf(
    "main",
    "assist",
    "main1",
    "main2",
    "main3",
    "assist1",
    "assist2",
    "assist3",
)
```

## 建议补充注释

在 `STONE_TYPES` 上方添加说明：

```kotlin
/**
 * 星石槽位类型：
 * - main / assist：旧协议兼容用（等价 main1 / assist1）
 * - main1..3：3 个主星石槽位
 * - assist1..3：3 个辅星石槽位
 */
val STONE_TYPES = setOf(
    "main",
    "assist",
    "main1",
    "main2",
    "main3",
    "assist1",
    "assist2",
    "assist3",
)
```

## 影响说明

- 旧数据 `main` / `assist` 仍然合法，继续兼容。
- 新数据 `main1..3` / `assist1..3` 被后端接受。
- 唯一性校验仍然有效：同一 record 内 `type` 不能重复，因此 3 个主星槽位互不冲突。
- 导出、导入幂等、快照覆盖逻辑均无需改动，因为 `starStones` 仍是一个 `List<OperatorStarStone>`。
- 如果后续需要更严格表达“槽位顺序”，可直接用 `type` 数字后缀表达，当前后端无需额外字段。

## 可选：OpenAPI / 文档同步

如果后端同时维护 OpenAPI 契约，需要将下面位置同步为 8 种类型：

- `OperatorImportRequest` 中 `starStones[].type` 的示例/描述
- 任何 `StarStoneType` 枚举文档
- 若存在 `operator-exchange-v2.schema.json` 等协议 Schema，把 `starStones.type` 的 enum 更新为：

```json
[
  "main",
  "assist",
  "main1",
  "main2",
  "main3",
  "assist1",
  "assist2",
  "assist3"
]
```

## 验证方式

修改后建议验证：

1. 启动后端后，用前端编辑密探，主星选 3 个、辅星选 3 个并保存。
2. 确认导入返回 `accepted: 1`，不再返回 `invalid_star_stone`。
3. 再次打开编辑弹窗，确认 6 个槽位都能正确回显。
4. 如有后端测试，补充一条用例：`starStones` 允许 `main1/main2/main3/assist1/assist2/assist3`。