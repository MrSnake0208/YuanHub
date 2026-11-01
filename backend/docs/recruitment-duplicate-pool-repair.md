# 已确认重复招募历史的单账号修复（2026-10-15）

这是独立的人工运维工具，不随启动执行，也不扫描全库。仅适用于已核对的 revision 28 完整备份：26 个个人池、85 条事件、20 个批次，总抽数 2673。用户已确认六组是同一段历史，各计一次，修复后 20 个池、2340 抽。不同或更新后的备份必须重新核对，不能修改版本/计数检查强行执行。

工具按备份中的 account_id 查找唯一档案，再使用实际 userId + accountId 隔离写入。默认只读预演；正式执行使用 Mongo 副本集事务、账号 recruitmentFence 和档案版本 CAS。原始 BSON 档案、事件、批次在同一事务中保存到 `recruitment_duplicate_pool_repairs`。任何校验失败均停止；写入失败则整个事务回滚。不要连接单机且不支持事务的 Mongo，也不要修改索引或部署结构来绕过报错。

## 处理内容

| 卡池 | 减少重复计数 | 保留内容 |
| --- | ---: | --- |
| 击金鸣鼓 | 74 | 手工两条历史 |
| 暮燕翻雷 | 70 | 手工两条历史，导入条目仍保持已删除 |
| 壑林邀月 | 40 | 手工 39 抽及进度 1 |
| 云雨滂润 | 80 | 手工 75 抽及进度 5 |
| 金相玉质 | 0 | 60 抽批次，已删除事件不复活 |
| 腾陵张胆 | 69 | 手工两条有效历史，旧删除记录仍保留 |

将六个 `<目录ID>` 池的所有事件和批次转到现有 `catalog:<目录ID>` 池，再移除六个别名池描述。软删除五个重复批次及七条有效的重复导入事件；全部 85 条事件和 20 个批次仍存在，备注、导入来源、原有删除标记均保留。事件/批次 ID、排序、nextEventOrder、基数、其他个人池和请求幂等账本不变。档案版本 28 -> 29。

## 服务器执行

1. 先通过正常发布流程安装包含重复关联校验的后端。修复脚本本身不发布后端；没有新校验时，旧备份可能再次制造别名。执行期间请该用户暂停招募操作，执行后刷新页面。无需为修复脚本重启服务。

2. 上传专用执行包，解压到仅运维账号可读的目录。目录内应有下列三个文件及 SHA256SUMS：
   - `20261015-recruitment-duplicate-pools.js`
   - `20261015-recruitment-duplicate-pools.run.js`
   - `source.json`（用户确认的原始完整备份）

   ```sh
   umask 077
   tar -xzf yuanhub-recruitment-repair-20261015.tar.gz
   cd yuanhub-recruitment-repair-20261015
   sha256sum -c SHA256SUMS
   : "${HUB_MONGO_URI:?请使用服务器现有配置设置连接 HubBackend 的环境变量}"
   mongosh "$HUB_MONGO_URI" --quiet --eval 'db.getName()'
   ```

   最后一条必须显示 `HubBackend`。`HUB_MONGO_URI` 表示现有安全连接配置，不要在聊天中发送其内容；若采用其他认证方式，沿用现有 mongosh 连接参数。Mongo 用户需要对目标业务集合和修复备份集合具备事务读写权限。不要把连接密码写进本脚本。

3. 只读预演：

   ```sh
   YUANHUB_REPAIR_ACTION=dry-run mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-duplicate-pools.run.js
   ```

   必须得到 `status: dry_run`，`before.total: 2673`，`after.total: 2340`，池数 26 -> 20。出现版本、历史、游戏、唯一归属或其他校验错误时停止；重新导出当前备份核对，不要改 source.json 或删除数据库记录。若返回 `already_applied`，表示之前已执行，不会再次修改；通过用户刷新/重新导出检查当前状态。

4. 执行已确认的修复：

   ```sh
   YUANHUB_REPAIR_ACTION=apply mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-duplicate-pools.run.js
   ```

   成功输出 `status: applied` 和修复编号，重复执行输出 `already_applied` 并保持不变。用户刷新招募页面，检查六组各剩一张卡池、总抽数 2340、进度 1/5 保留，金相玉质仍保留 60 抽且已删除明细未恢复。重新下载完整备份确认 20 个池、85 条事件（69 有效）、20 个批次（15 有效）。若命令断线/提交结果不确定，使用同一包重跑预演，由修复账本判断，勿手工再扣抽数。仅导入整理后的 JSON 不会删除服务器旧池，不能代替此步骤。

5. 如需撤销，且用户尚未产生新操作，执行：

   ```sh
   YUANHUB_REPAIR_ACTION=rollback mongosh "$HUB_MONGO_URI" --quiet --file 20261015-recruitment-duplicate-pools.run.js
   ```

   按原始 BSON 恢复档案和历史，版本递增到 30；不会重置账号 fence。新操作已推进版本时拒绝回滚，避免覆盖用户新历史。重复回滚为无操作；回滚后不能用同一旧计划再次修复，需要重新核对。保留数据库修复备份及执行包直到人工验收结束，不要提前删除备份。

## 最小定向验证

L3：涉及单账号持久化、事务及计数。使用合成数据和 TestMongo 拥有的临时副本集，验证真实 mongosh 模块及与运维一致的 `--file` 入口；不使用开发或生产数据库。默认全量回归/发布验证由用户或 CI 执行。

```sh
cd BackEndV3-Share
node --test scripts/migrations/20261015-recruitment-duplicate-pools.test.js
./gradlew integrationTest --tests '*RecruitmentDuplicateRepairMongoTest' --console=plain
```

集成测试环境需要现有 Docker 和 mongosh；缺少工具时失败，不静默跳过。真实浏览器交互和生产数据由用户按第 4 步手工验收。
