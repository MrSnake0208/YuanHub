# 历史删除记录漏扣抽数修复

适用于旧版逐条删除批次内出货记录后，批次总抽数仍包含被删记录的情况。先部署本次后端修复，再执行定向补扣，防止后续删除继续漏扣。前端改动只有删除说明文案。

排查所有账号是否存在同类记录，使用[全服只读扫描](recruitment-deleted-counts-scan.md)。扫描无需后端发布，也没有写入入口；本页的单账号修复包不能直接用于全服扣数。

新逻辑：删除记录扣除该条已知 `pull_span`，不修改其他记录、当前垫抽或基准；撤销只加回实际扣过的抽数。未知跨度不推测。例：60 抽批次删除 20 抽和 37 抽记录，剩余 3 抽保留，不能据此把整个池清零。

本例用户后续截图要求按保留出货明细计算，原导入仍有九个批次共49抽差额，使用[九项批次差额修正](recruitment-batch-remainders-repair.md)单独预演。此处的删除补扣工具不会修正原文件自带的批次余量，不能重复 apply 来消除它。

## 1. 上传私有执行包并预演

使用 `yuanhub-recruitment-count-fix-20261015.tar.gz`，解压到仅管理员可读目录。包内 `source.json` 仅用其账号 ID 定位目标账号；**实际抽数、删除记录及版本从服务器当前数据读取**，不会用旧 JSON 覆盖用户后续操作。文件包含个人记录，请勿提交仓库或公开分享。使用已有指向 HubBackend 数据库的 `HUB_MONGO_URI`；不要把连接串发到聊天或日志。

```sh
umask 077
tar -xzf yuanhub-recruitment-count-fix-20261015.tar.gz
cd yuanhub-recruitment-count-fix-20261015
sha256sum -c SHA256SUMS
YUANHUB_REPAIR_ACTION=dry-run mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-deleted-counts.run.js
```

默认只读预演，核对 `database`、`archiveRevision`、`knownTotalBefore`、`knownTotalAfter`、`deduction` 和逐批次 `corrections`。`no_changes` 表示没有可安全补扣的记录。不得改用旧重复池修复入口。

## 2. 按预演版本应用

把下面的 `123` 替换为本次预演输出的 **archiveRevision**，不要使用旧 JSON 中的版本。应用时任何新写入导致版本变化都会拒绝；重新预演后再核对。最好请目标用户暂时停止编辑。

```sh
YUANHUB_REPAIR_REVISION=123 YUANHUB_REPAIR_ACTION=apply mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-deleted-counts.run.js
```

修复仅扣除仍有效批次中、具有正删除版本且未标记已扣数的已删除记录的已知跨度。导入的版本零 tombstone、已删整批和已扣过的记录不参与。若扣后为负或不足以覆盖有效记录跨度，整次拒绝，不猜测。重复用同一版本执行返回 `already_applied`，不再扣数。

所有操作按实际 `userId + accountId` 隔离，在现有账号 fence / CAS 事务内同时写入批次、内部已扣标记、递增档案版本和原始 BSON 审计备份；不硬删记录，不修改备注、顺序、当前垫抽或其他账号。任一步失败整体回滚。要求 MongoDB 支持事务，与应用生产要求相同。

## 3. 刷新验收或回滚

让用户刷新招募页并导出新备份，核对预演后的抽数。再删除一条已知 N 抽记录并保存，应减少 N 抽；未删除记录和垫抽保持原值。真实页面和生产数据由管理员、用户验收。

需要回滚时，`YUANHUB_REPAIR_REVISION` 仍填写应用时使用的原预演版本：

```sh
YUANHUB_REPAIR_REVISION=123 YUANHUB_REPAIR_ACTION=rollback mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-deleted-counts.run.js
```

回滚恢复修复前的原始历史和标记，并单调递增档案版本。修复后如已有新操作，会拒绝回滚以免覆盖用户数据；不得强改版本绕过。已回滚的同一计划不能重放，需重新预演。

## 本地验证

```sh
node --test scripts/migrations/20261015-recruitment-duplicate-pools.test.js
./gradlew test --tests '*RecruitmentServiceTest' --tests '*RecruitmentExchangeServiceTest' --tests '*RecruitmentRecordImportTest' --console=plain
./gradlew integrationTest --tests '*RecruitmentExchangeMongoTest' --tests '*RecruitmentMongoTest' --tests '*RecruitmentDuplicateRepairMongoTest' --console=plain
```

Mongo 测试使用 TestMongo 自建可销毁容器，不连接开发或生产数据库，覆盖原子回滚、账号隔离、幂等补扣、实际 mongosh 入口和零总量备份恢复。没有自动启动服务或浏览器。
