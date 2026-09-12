# 养成追踪与培养计划：本地版本及后端适配契约

状态：前端本地版本已实现；本文新增的 workspace API 为待实现草案，不属于现有可调用接口。

现有目标接口以 [api-contract.md §5.3](./api-contract.md#53-主观标注与养成目标) 为准。后端任务入口见 [适配 prompt](./backend-implementation-prompt-operator-training-plans.md)。整个追踪入口继续受 `operatorGrowthTracking` 控制，生产默认关闭。

## 1. 用户行为

- 默认「特别关注」清单的成员为：最新星标集合 ∪ 手动添加集合 − 手动移出集合。移出清单不取消星标，不删除密探档案，不扣库存。管理密探可重新加入被移出的成员。
- 用户可以创建、命名、切换、编辑和删除自建培养计划。同一密探可属于多个计划，每个自建计划独立保存等级、修为和化极目标。新加入时复制当前所选计划的有效目标；没有目标时使用原追踪默认值。
- 默认清单的目标沿用现有 `/v1/operator/growth-targets` 云端数据。默认清单的成员调整、自建计划、各计划目标、当前选中计划、历练通关设置保存到当前浏览器，按子账号隔离。界面明确提示保存范围。
- 移出密探、删除自建计划均提供一次撤销；后续清单修改会替换/清除该撤销记录。撤销是当前页面内的交互，不是持久化回收站。
- 完成态取决于实际等级、修为、化极是否均达到目标，不以「材料备齐」代替「已完成」。未拥有密探不判为完成。五星旧协议值 25..30 为同一完成阶段；觉醒 31 单独判断。
- 常规卡采用奶油到暖白渐变底与金色细描边；完成卡采用更显眼的柔和蜜黄渐变底、金色描边、完成标签和「已完成，移出清单」按钮；仍可提升目标继续追踪。
- 不再展示或编辑单独的心纸目标/进度。所需心纸完全由当前化极到目标节点计算。旧 `heart_paper` 值不参与追踪计算，不自动删除其他接口中的历史数据。

## 2. 计算口径

数据源为本次需求附带的三类十二层修为奖励及八档经验奖励，完整数值集中在 `src/data/operatorTraining.js`，避免散落在页面。默认所有层数开放；四类最高通关层数分别保存在子账号 workspace。

每种历练（风火、地水、阴阳、经验）每天各有最多 **6 次**，可以在该类可用层数间分配。这不是每种材料每天六次，也不是四类合计六次。

单项材料速度使用可用层数的最大单次必得数量 × 6，标为「历练至多 N/日」。总账的时间不直接取这些单项天数的最大值：计算时比较高阶优先和低阶优先的两种分配，每次选取对当前缺口收益最高的可用层数，同时抵扣该层所有掉落，采用次数较少的可执行方案。同类总次数除以 6 向上取整；四类可独立并行。该算法是保守估算，不承诺全局最优，界面可展开查看次数分配。

未开放的高阶材料不虚构产速，其所在历练估算标为不可用。非历练材料及心纸参考近 30 日流水；无正产速的缺口使整体 ETA 未知。五铢钱仅展示总需求，不参与 ETA。

等级经验先统一抵扣库存：残卷 100、全卷 1,000、六韬兵书 10,000 经验。剩余经验缺口按经验历练整轮换算成道具展示。默认绝境历练每轮 100 残卷 + 9 全卷，合计 19,000 经验；向上取整。此函数与当前养成快捷提升共用；追踪可按选定的最高经验档位换算，快捷提升保留默认绝境比例。

单人缺口是该密探独占当前库存时的估算。卡内每行两项材料，使用材料图标与缺口数量同排、名称 tooltip，并显示每项 ETA。历练材料的单项 ETA 按该密探刷取方案的层数顺序计算首次备齐日期，计入同类其他材料已占用的次数；无流水或层数未开放时明确标记。它不代表多个密探竞争资源后的实际完成日期；若需这种排期，必须再引入培养优先级或资源分配策略。总账先合并本清单需求，再统一抵扣共享库存一次。不同计划是替代/独立视图，不跨清单叠加库存占用。兵书双掉落属于同类同轮，不重复累计经验历练次数。

## 3. 本地持久化模型 v1

读写边界：`src/data/operatorTrainingPlans.js`；键为 `yuanhub:operator-training-workspace:v1:<accountId>`。跨页读取使用 `storage` 事件；写入校验已有 revision，防止旧页面静默覆盖。存储失败会显示错误，不宣称已保存。版本或子账号不匹配时保留原始存储，不覆盖。

```json
{
  "version": 1,
  "accountId": "acc_example",
  "revision": 3,
  "updatedAt": "2026-09-12T00:00:00.000Z",
  "activePlanId": "favorites",
  "trainingLevels": { "fh": 12, "ds": 12, "yy": 12, "experience": 8 },
  "plans": [
    {
      "id": "favorites",
      "name": "特别关注",
      "source": "favorites",
      "operatorIds": [],
      "excludedOperatorIds": ["char_example"],
      "targets": {}
    },
    {
      "id": "4d4e3763-2b56-4dda-9a3f-a79d4634e74b",
      "name": "主队培养",
      "source": "custom",
      "operatorIds": ["char_example"],
      "excludedOperatorIds": [],
      "targets": { "char_example": { "level": 80, "elite": 13, "starLevel": 19 } }
    }
  ]
}
```

`revision` 当前是本地工作区修订号，不可直接作为未来服务端 revision。自建计划 ID 在创建时生成 UUID，迁移必须保留。被移出密探的目标可暂留于 `targets`，重新添加时恢复；目标键不要求一定属于当前成员集。默认清单的 `targets` 为空，其云端目标另有现成存储；不要把星标集合固化写入 `operatorIds`。

## 4. 建议新增 API（待后端实现）

采用账号级 workspace 原子快照，降低首版迁移与多计划事务复杂度。服务端可用结构化表或 JSON 存储，必须对模型进行字段校验与账号鉴权。业务 API 使用 snake_case，前端 repository 负责 camelCase 转换。

| 接口 | 参数 | 成功返回的 `data` |
| --- | --- | --- |
| `GET /v1/operator/training-workspace` | query `account_id` | `{account_id, schema_version:1, revision, updated_at, active_plan_id, training_levels, plans}` |
| `PUT /v1/operator/training-workspace` | query `account_id`；body `{expected_revision, schema_version:1, active_plan_id, training_levels, plans}` | 完整新 workspace |
| `POST /v1/operator/training-workspace/import-local` | query `account_id`；body 为 PUT 字段加 `{migration_id, source_version:1}` | `{workspace, migration_id, imported_at}` |

plan 字段映射：`id,name,source,operator_ids,excluded_operator_ids,targets`；目标字段为 `level,elite,star_level`。没有独立心纸目标。允许 targets 保留已移出成员的目标以便重新添加；所有涉及的密探 ID 均需验证。

读取不存在的 workspace 返回默认结构与 `revision:0`，不会创建业务数据。首次写入仅允许 `expected_revision:0`。每次成功写入修订号递增；更新/导入在同一事务中完成。revision 冲突返回 HTTP 409 `training_workspace_revision_conflict`，不得静默覆盖。

默认计划 `id=favorites` 必须唯一且存在，不可删除或改为 custom；默认 `targets` 必须为空。自建计划 source 必须为 custom、ID 唯一且稳定。名称去除首尾空白后 1..40 字；拒绝重复成员 ID、非法 source、未知 ID、非法 schema、无效 active_plan_id。历练 fh/ds/yy 范围 1..12，experience 范围 1..8。目标 level 0..100、elite 0..17、star_level 0..31，均为整数，修为目标还应符合等级上限 `min(17,max(0,floor(level/5)-3))`；客户端以当前档案进度为显示下限。

错误建议：400 `invalid_training_workspace` / `unsupported_training_workspace_version`，401 未登录，403 子账号不可访问，409 修订冲突，409 `training_workspace_migration_conflict`。上限/配额若后端需要新增，须先在契约说明数值并补齐前端反馈，不得默默截断计划或成员。

迁移幂等以 `(account_id,migration_id)` 为唯一键，记录请求摘要与最终结果。相同 ID、相同内容重试返回同一成功结果；相同 ID、不同内容返回迁移冲突。幂等命中应在 expected_revision 再校验之前返回，保证网络超时后的重试可恢复。迁移 receipt 与 workspace 写入原子提交。

## 5. 前端迁移步骤

1. 新增 remote repository，用与本地相同的 workspace 领域模型包装 GET/PUT；保持现有本地 repository 可读取，实际部署前联调，不把草案路径提前投入运行。
2. 登录并选定子账号后先读取云端。没有云端数据时，将本地 v1 转为请求；保留计划 UUID、成员增减、自建目标和通关层数。默认云端目标仍沿用现有接口，不重复导入、不写入 `heart_paper`。
3. 云端已有数据时先比较本地与云端；展示合并结果供用户选择，不能用本地快照盲目覆盖。同 ID、不同目标必须保留冲突信息；保留两份时为复制计划生成新 ID，并明确名称。
4. 使用持久化 migration_id 和当次服务端 revision 提交完整已选快照。失败、超时、409 均保留本地原数据；刷新云端并重新合并后，用新的 migration_id 提交不同内容。
5. 收到 receipt 后再次 GET 校验计划与目标，记录迁移完成信息。保留本地备份，禁止在请求刚发出时删除 localStorage。此时切换为远端写入，界面提示同步位置；离线编辑若要支持，需要单独设计队列和冲突处理，首版不得偷偷双写造成分叉。
6. 现有默认目标 API、密探导入导出 v2/v3、特别关注、annotations 和快捷提升保持兼容。本地培养计划当前不包含在密探 v2/v3 导出中；未来备份需单独版本化 workspace，不把它塞进现有 targets 对象。

## 6. 验收清单

- 1920×1080 至少四张卡，每卡缺口每行两项；手机不溢出；三个进度目标可编辑，心纸只随化极计算。
- 空头像当前档案不覆盖图鉴头像；追踪与当前养成使用同一 `OperatorAvatar`。
- 同类的低阶与高阶缺口需要共用六次额度；同层双掉落抵扣一次；四类独立，层数不可达反馈明确。
- 资源已备齐但等级未达到目标不进入完成态；完成后提高目标恢复普通卡。
- 默认清单动态同步星标，排除/重新加入均有效；移出与撤销不改星标。自建计划同一密探不同目标互不覆盖。
- 刷新恢复、子账号隔离、跨页修订冲突、存储失败、未知版本不覆盖均有验证。
- 后端阶段额外验证账号授权、并发 PUT、导入幂等、迁移失败可重试、不覆盖已有云端数据、已有 v2/v3 与默认目标接口兼容。
