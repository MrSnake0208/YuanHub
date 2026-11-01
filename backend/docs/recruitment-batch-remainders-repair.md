# 本例九个 AI 导入批次的额外计数修正

该用户的原始完整 JSON 同时包含逐条出货抽数和批次总数。九个仍保留的导入批次总数大于其全部已知明细之和，共多出49抽。比如桓桓先征写160，明细38+39+37+40=154。此前的删除补扣只扣掉被删除记录的跨度，不会移除原文件已带入的这些差额；全服删除漏扣扫描同样不判断额外批次计数是否真实。

本工具只针对本例已核对的九个导入批次，不把“批次总量大于明细”统一判为错误。正常批次可包含未逐条录入的真实抽数，不能在全服自动改成出货明细之和。该用户截图给出了按保留明细计算的目标值，修正包准备了逐批次预演，实际执行由管理员核对后操作。

| 截图卡池 | 已核对的额外计数 | 截图目标已知抽数 |
| --- | ---: | ---: |
| 桓桓先征 | 6 | 154 |
| 金相玉质 | 3 | 0 |
| 契阔谈宴 | 4 | 66 |
| 天弧封狼 | 9 | 111 |
| 铁弦千钧 | 6 | 74 |
| 形谍成光 | 5 | 5 |
| 英徽弥亮 | 5 | 205 |
| 珠渊玉水 | 3 | 117 |
| 却月凌风 | 8 | 0 |

合计49抽。当前独立记录和进度会保留，服务器若已发生新编辑，实际总数以当前预演为准，不用旧截图或旧版本覆盖。目标批次只把计数调整到当前有效已知跨度合计，保留事件、删除标记、备注、排序、导入归属、当前垫抽和基准。没有读取时自动修正或前后端代码发布要求；应保留之前已发布的逐条删除同步扣数修复。

## 1. 运行新的只读预演

上传并解压私有包 `yuanhub-recruitment-remainder-fix-20261016.tar.gz`，进入新目录。包内 `remainder-plan.json` 仅列出该账号、九个稳定批次/池/导入ID和逐项差额，不含用户备注或连接串。不要混用此前重复池或删除补扣入口。

```sh
umask 077
tar -xzf yuanhub-recruitment-remainder-fix-20261016.tar.gz
cd yuanhub-recruitment-remainder-fix-20261016
YUANHUB_REPAIR_ACTION=dry-run mongosh HubBackend --quiet --file 20261016-recruitment-batch-remainders.run.js
```

如果服务器连接需要 URI，使用已有的 `"$HUB_MONGO_URI"` 替换 `HubBackend`。预演不写入，核对 `deduction:49`、当前 `archiveRevision`、账号总数以及每条的 `poolKnownBefore/poolKnownAfter`。后者包括同池独立记录和当前已知进度，不能只把批次 remaining 当成整个池的总数。

例如形谍成光可能是“旧批次剩5+后来独立记录5”，修正后批次0、独立记录5，整池5；金相玉质和却月凌风在没有其他记录/垫抽时归零。如果当前账号总数仍是2283，修正后为2234；这个数必须由服务器当前预演确认。

## 2. 核对后按本次版本应用

将下面 `123` 替换为刚刚预演输出的 `archiveRevision`，不是旧预演的43/45，也不是预演输出的 afterRevision。

```sh
YUANHUB_REPAIR_REVISION=123 YUANHUB_REPAIR_ACTION=apply mongosh HubBackend --quiet --file 20261016-recruitment-batch-remainders.run.js
```

只有九个当前批次的“批次总数−有效明细之和”全部与原核对差额一致，才允许修正。发现未知跨度、未完成的旧删除补扣、目标批次已删、导入来源或池归属变化、版本不匹配、部分批次已被其他方式校正，整包拒绝，获取最新完整导出再核对；不得强改版本或调整计划绕过。如果九个差额全部为零，返回 `no_changes`。重复原 apply 返回 `already_applied`，不再扣49。

apply 使用现有账号fence/CAS事务，原始BSON备份与九个批次计数、档案版本同步提交，任一步失败全部回滚。其他账号、事件和请求账本不变，没有硬删除记录或全服修正。刷新页面后应与预演的 poolKnownAfter 相同。以后删除其中某条已知跨度的记录会继续扣同量；当前批次已完全按明细计数，删除全部已知明细后批次总量为零。

## 3. 必要时回滚

使用应用时的原预演版本：

```sh
YUANHUB_REPAIR_REVISION=123 YUANHUB_REPAIR_ACTION=rollback mongosh HubBackend --quiet --file 20261016-recruitment-batch-remainders.run.js
```

仅当修正后没有新操作才允许恢复原始BSON；回滚版本单调递增，不复用旧版本。保留私有执行目录和数据库审计记录。

## 验证与边界

定向命令：`./gradlew integrationTest --tests '*RecruitmentRemainderRepairMongoTest' --tests '*RecruitmentDuplicateRepairMongoTest' --console=plain`。使用 TestMongo 自建可销毁容器、合成账号和历史，验证预演零写入、误差变动/未知跨度/旧删除未补扣/过期版本拒绝、账号隔离、事件和独立记录保留、原子回滚、幂等、原始BSON恢复和实际 mongosh 入口。

无生产访问、浏览器验证或全量回归。原始私有 JSON 只在本地生成核对计划，不作为测试数据或重新导入生产。实际服务器是否仍满足九个差额，由本次只读预演判断。
