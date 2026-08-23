# 后端暂缓项：SP 密探化极快捷提升

状态：已确认问题，暂缓实施  
优先级：低  
记录日期：2026-08-23  
影响范围：`POST /v1/operator/upgrades/preview`、`POST /v1/operator/upgrades/execute`

## 1. 结论

SP 密探暂时不开放服务端权威的化极快捷提升。

SP 化极消耗的道具不是该密探心纸。在真实的 SP 消耗规则和稳定库存道具 ID 尚未确认、接入前，后端不得复用普通密探的心纸消耗表。

当前前端已经隐藏 SP 密探的化极快捷按钮，只保留不扣库存的手动校正。此限制是产品层临时防护，不能代替后端业务校验。

## 2. 后端当前问题

后端 `OperatorUpgradeService.calculate` 当前允许 SP 密探使用 `dimension=huaji`，并把 SP 的最大值设置为 5；随后仍调用通用的 `OperatorRequirementRules.huaji`。

通用化极规则返回 `heart` 后，服务会将其转换为：

```text
entity_type = agent
id = 当前 operator_id
```

这会把 SP 化极错误地解释为扣除该密探心纸。

现有测试 `SP direct star range uses the same frontend stage costs` 也固化了这个错误假设：SP 从 1 到 5 被断言为消耗 15 心纸。后续实施时必须删除或改写该测试。

相关位置：

- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorUpgradeService.kt`
- `/home/syoius/BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorRequirementRules.kt`
- `/home/syoius/BackEndV3-Share/src/test/kotlin/com/lhs/share/hub/service/operator/OperatorRequirementRulesTest.kt`

## 3. 暂缓期间的约束

- 前端不展示 SP 化极快捷提升按钮。
- SP 仍可通过手动校正维护星级；`manual_correction` 不扣库存。
- 普通密探的等级、修为和化极快捷提升继续使用现有 preview → execute 流程。
- 普通密探的心纸扣除和等级兵书扣除不受本待办影响。
- 不得仅依靠前端隐藏入口认定接口安全；直接调用后端接口仍是已知缺口。

## 4. 后端最小修复方案

在 SP 专属消耗规则尚未接入时，推荐先做拒绝式保护：

1. `preview` 识别到公共目录中的 `spOf != null` 且 `dimension=huaji` 时，返回 HTTP 422。
2. 使用稳定错误码，例如 `sp_huaji_upgrade_not_supported`；若暂不扩充契约，也可以沿用 `invalid_upgrade_target`，但错误信息必须明确指出 SP 化极快捷提升尚未支持。
3. `execute` 不能只信任旧 preview token；事务内重新计算时也必须执行同一项 SP 校验。
4. 不生成升级事务、`consumption_delta` 流水或 `operator-upgrade` 事件，也不改变密探和库存 revision。

该最小修复只负责防止错误扣库，不需要在本阶段实现 SP 专属材料。

## 5. 正式支持 SP 时的实现要求

只有在以下信息全部确认后，才重新开放 SP 化极快捷提升：

- 每个 SP 化极阶段的真实消耗规则；
- 对应道具在库存目录中的稳定 ID；
- 规则是全 SP 通用、按原密探区分，还是按具体 SP 密探区分；
- 跨阶段提升时的累计方式；
- 预览、扣除流水和完整备份中的表现形式。

正式实现必须建立独立的 SP 规则分支，不得继续调用普通密探的心纸规则。接口仍应保持服务端 preview 返回具体扣除项、execute 按相同 revision 和 preview token 原子执行。

## 6. 验收测试

最小拒绝式保护至少覆盖：

1. SP 的 `huaji` preview 返回 422，不返回可执行预览。
2. 直接调用 SP 的 `huaji` execute 不能绕过限制。
3. SP 心纸库存、道具库存、密探星级和双 revision 均保持不变。
4. 不新增 `operator_upgrade_transaction`。
5. 不新增 `consumption_delta` 流水。
6. 不发布 `operator-upgrade` 事件。
7. 普通密探化极 preview/execute 的现有测试继续通过。
8. 等级兵书与修为材料的预览和扣除测试继续通过。

正式支持 SP 材料后，应将前两项替换为对应的具体道具预览与原子扣除断言，并保留“绝不扣除 SP 心纸”的回归测试。

## 7. 重新启动条件

满足以下任一条件时重新评审本待办：

- 产品准备开放 SP 化极快捷提升；
- SP 消耗规则和库存道具 ID 已由可靠数据源确认；
- 后端升级接口准备对外开放给前端以外的调用方。

