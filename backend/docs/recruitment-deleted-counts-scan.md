# 全服只读排查：删除出货记录漏扣抽数

脚本：`scripts/migrations/20261015-recruitment-deleted-counts.scan.js`，单文件上传即可，无需其他修复文件、用户 JSON 或后端发布。只使用集合名称读取和 aggregation 查询；没有更新、删除、建索引、审计备份或修复入口。

## 运行

连接当前 HubBackend 数据库；`HUB_MONGO_URI` 是服务器已有 Mongo 连接串变量，必须包含目标数据库名称。已有只读连接可直接使用，无需授予写权限。请勿在聊天或日志中发送连接串。脚本会检查招募相关集合，连接错库时拒绝。

在脚本所在目录执行：

```sh
umask 077
mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-deleted-counts.scan.js > recruitment-count-scan.jsonl
```

命令成功退出且输出文件最后一行是 `"type":"summary"` 才代表扫描完整。查看汇总：

```sh
tail -n 1 recruitment-count-scan.jsonl
```

每个可疑批次占一行 JSON，最后一行全服汇总。报告只包含用户/账号/卡池/批次 ID、版本和计数，不读取或输出备注、认证信息。文件仍含内部账号标识，保留在私有目录。

## 汇总和明细字段

| 字段 | 含义 |
| --- | --- |
| `suspectedAccounts` | 至少存在一个可疑批次的账号数，按用户+子账号去重，包含人工核对项，不等同于独立玩家人数 |
| `candidateBatches` | 数值、池归属和账号校验未发现矛盾的候选批次数 |
| `candidateDeletedPulls`（汇总） | 上述候选批次的疑似漏扣抽数之和，不包含需要人工核对的批次 |
| `reviewBatches` | 存在矛盾、需要人工核对的批次数；不能按候选值直接扣数 |
| `status`（明细） | `candidate` 为疑似漏扣，`needs_review` 为需要核对；具体原因见 `reasons` |
| `batchTotal` / `candidateDeletedPulls` / `estimatedRemaining` | 当前批次总数、已删除且疑似未扣的抽数、扣减后的估计余量 |
| `liveKnownPulls` / `deletedEventCount` | 当前有效节点的已知跨度总和、此次候选删除条数 |
| `archiveRevision` | 扫描观察到的档案版本；修复前仍需重新预演核对 |

仅统计有已知正跨度、正删除版本、未标记已扣数，且所属批次仍有效的删除记录。已扣过的记录、导入的版本零 tombstone、独立记录、已整批删除和找不到同用户同账号有效批次的记录不计入。跨账号同名批次不会串联。未知跨度无法推断漏扣量，不猜测；本脚本不排查重复卡池。

`needs_review` 原因包括批次/档案/所有者歧义或缺失、游戏不一致、池归属不一致、删除版本异常或扣后抽数不足。扫描成功且汇总各计数为零，只能说明未发现符合本次已知条件的候选。

## 查询负载和后续处理

全服过滤仍可能扫描事件集合；查询最多运行60秒，禁止磁盘溢写，结果按游标输出。超过时限、内存限制或权限不足会非零退出并在 stderr 报错；即使已输出部分明细也不是完整结果，不要按部分文件认定全服无问题。

玩家可以在扫描期间编辑，所以 `consistentSnapshot:false`：这是只读观察，不能作为直接批量扣数计划。发现候选后，按当前账号重新导出/预演、核对并单独修复；当前单账号修复包不提供全服写入。无需停服，也不会自动修改数据。

本地定向验证：

```sh
node --check scripts/migrations/20261015-recruitment-deleted-counts.scan.js
./gradlew integrationTest --tests '*RecruitmentDuplicateRepairMongoTest' --console=plain
```

实际 Mongo 查询、原始 BSON 零写入对比和 `mongosh --file` 入口均通过 TestMongo 自建可销毁容器验证；生产数据和耗时由服务器执行结果决定。
