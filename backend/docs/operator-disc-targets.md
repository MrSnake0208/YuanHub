# 双命盘目标保存与交换

每个 `operator_current.entries[operatorId].discLoadouts` 组合增加 `status`（`unmarked` / `reroll` / `perfect`）及 `targetDiscs`。缺失字段由实体默认值兼容，不需要迁移。它们是用户意图，`discs` 是实际词条；旧字段 `entries.discs` 仍只镜像第一套实际词条。

命盘编号在 MongoDB 中沿用 `_id`，接口 JSON 使用 `id`。读取兼容直接导入的普通 `id` 字段；两者并存时以 `_id` 为准，不改写原文档。编号均缺失时仍报错，不生成编号或丢弃命盘。手工导入后应核对后端读回结果。

## PATCH / current

沿用密探 current 的账号归属校验、`expected_revision`、CAS 和 correction 记录，不新增接口或存储集合。JSON 使用 `target_discs`：

```json
{
  "expected_revision": 7,
  "reason": "manual_correction",
  "disc_loadouts": [
    {"id":"disc_1","name":"输出","discs":[{"ot_name":"实际词条"}],"status":"reroll","target_discs":[{"ot_name":"目标词条"}]},
    {"id":"disc_2","name":"生存","discs":[],"status":"perfect","target_discs":[]}
  ]
}
```

状态必须是枚举值；目标允许 0–3 个，必须属于该密探图鉴且不重复。显式 null、未知词条、重复和超量会返回 `invalid_disc_loadout`，不会写入。修改状态不会自动清空目标，词条相同也不会自动标记完美。

手动 PATCH、非采集来源的浏览器文件导入与备份恢复仍按数组顺序（命盘一/二）处理：未提交 `status` / `target_discs` 时保留对应序号已有值，组合 id 改变不清除目标。列表截短/清空时，遗漏组合的实际词条清空；有标记或目标的槽位仍保留。显式空 `target_discs` 只清空该套目标。v2 导入仍只更新第一套实际词条，保留其目标和第二套。

## 采集导入的命盘对齐

仅 `OperatorV3ImportService` 的 scan 接口或 `source_kind=scan` 记录启用内容对齐，preview 与 commit 共用处理。采集顺序和 `disc_1` / `disc_2` 不能代表游戏真实槽位；未显式提供的标记和目标跟随实际词条组合。每套盘以图鉴归一后的标准词条名排序列表作为指纹，不包含数组顺序、OCR 名称、id 或展示属性；`OperatorDisc` 没有词条槽位/部位字段。

- 唯一匹配时保留旧存储顺序、id、未提交的标记和目标，名称仍使用上传 OCR 名称，空名按写回位置默认“命盘一/二”。只采集部分命盘时，未覆盖的旧盘连同实际词条原样保留；空采集列表也不清空已有标注的命盘。
- 匹配后只剩一对旧盘/新盘时，旧状态为 `unmarked` / `reroll` 可继续洗盘并继承目标；旧状态为 `perfect` 则转复核。多对未匹配时，只允许替换没有标记或目标的旧盘。
- 同一侧指纹重复且旧标记或目标不同，或部分采集的盘无法匹配到有标注的旧命盘集合时，转复核，不猜测归属。相同词条的旧标注完全一致时可依旧顺序配对。
- 已有盘为空或完全没有标记/目标时沿用原有覆盖行为；上传每套盘都显式提供 `status` 和 `target_discs` 时仍按显式导入语义处理。其他情况只对齐缺失的字段，显式值保持优先。

无法对齐时，仅移除该密探补丁中的 `disc_loadouts`，结果为 `review`，`warnings` 中返回 `code=disc_alignment_requires_review`、`field=disc_loadouts` 和具体中文原因，即使其他字段没有变化也保留复核结果。同次导入的其他可靠分区和其他密探继续处理。OpenAPI 提交后沿用采集复核队列，在复核文档副本中将命盘分区标为 `review`，原始审计正文不变。现有界面会显示该原因及命盘待确认状态；用户可对照游戏手动修正。

不修改 v3/v4/v5 请求 Schema，不修改 MaaYuan payload，不修复历史错位数据。MaaYuan 现有响应处理接受 `review` 计数和可扩展 warning，不将该复核当作 rejected。

## 备份与边界

v3/v4/v5 schema 可选扩展这两个字段，历史 JSON 无需修改；新备份显式导出两个字段，恢复通过原 PATCH 校验和 correction 重放。v2 格式不承载目标，需使用新版备份。公开 BOX 分享 DTO 返回每套命盘的 `id`、`name`、`discs` 和 `status`，供按完美／待洗标记筛选；历史缺失状态按 `unmarked` 返回。`target_discs` 仍不公开。作业筛选与战斗输入只读取实际词条，目标不会用于判定已拥有的命盘。

前后端需配套更新。未修改数据库事务、索引或账号身份语义；定向单元/契约与无连接 BSON converter 检查即可覆盖新增字段，数据库和浏览器全面回归由用户另行安排。
