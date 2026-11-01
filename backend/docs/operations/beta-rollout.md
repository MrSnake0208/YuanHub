# YuanHub 限额内测：配置与发布

本功能已实现。**部署代码不会自动开始内测，也不会自动扫描用户主库生成 Share 名单。** 活动未初始化时，受限功能返回 `beta_service_closed`；正常注册、登录、找回密码、公开作业和账号恢复入口保留。

日历（列表、建议、订阅、私人事项）、招募个人接口及 `/v1/accounts` 统一使用全站内测准入。公开招募目录 GET 保留；独立招募名单/模式不再影响这些接口，也不能绕过账号门槛。日历和招募内容管理权限继续独立校验。

## 1. 运行与准备条件

后端沿用本仓库的 JDK 21、Spring Boot、MongoDB 和 Redis。配额写入使用现有 `hubTransactionTemplate`，Hub Mongo 必须支持事务，生产环境需要实际可用的副本集或分片事务配置；仅有一个 TransactionTemplate Bean 不代表数据库支持事务。

准备工具是一次性的 Node.js 脚本，不是后端服务的新运行时依赖。工具要求 Node.js 20.19 以上，先在仓库根执行：

```sh
npm ci --prefix scripts/beta
```

实际运行的活动 ID 读取 Spring 配置 `share.beta.campaign-id`，未指定时为 `yuanhub-beta-202609`。准备文件中的 `campaign_id` 必须与服务配置相同。新数据只写入 Hub 库，绝不向共享 `maa_user` 添加内测字段。

## 1.1 本地内测模式

需要反复测试报名、预留、候补、暂停、扩容和正式开放时，使用工作区根目录的显式本地模式：

```sh
./dev.sh beta
```

该模式只为后端进程注入 `YUANHUB_BETA_LOCAL_TEST=true` 与 `YUANHUB_BETA_CAMPAIGN_ID=yuanhub-beta-local`。后端会自动创建独立的 `yuanhub-beta-local` 活动，立即进入 `BETA` 且恢复新增；所有已激活账号在本地活动里模拟为 Share 快照资格用户，因此可以直接覆盖 25 个预留名额的领取逻辑。

本地活动和正式 `yuanhub-beta-202609` 使用同一组 collection，但所有报名、资格和通知都按不同 `campaign_id` 隔离。管理页会显示醒目的 `LOCAL` 标识，并提供“重置本地内测”操作，用于清空本地活动的报名/资格后重新测试。重置不会删除正式快照或正式报名。

本地模式下任何已登录账号也能在 `/beta` 页面自助重置：`/v1/beta/me` 返回 `can_reset_local_test`，前端据此显示“本地测试工具”，调用 `POST /v1/beta/test-reset` 复用同一套重置逻辑，不要求 `beta:manage`。非本地模式该接口返回 `beta_local_test_disabled`，正式活动不会因此被自助清空。管理页入口继续保留。

普通 `./dev.sh`、未设置环境变量的后端以及生产环境仍默认使用正式活动且 `local-test-mode=false`。不要在生产部署设置 `YUANHUB_BETA_LOCAL_TEST=true`；后端还会要求本地模式的活动 ID 以 `yuanhub-beta-local` 开头，否则拒绝启动。

切换普通开发模式与本地内测模式需要重启后端进程，因为 campaign ID 和本地模式是启动配置，不是网页开关。

## 2. 准备可信名单，而不是推测注册来源

由 Share 的可信服务端记录或经运营确认的历史备份提供一份 UID 文本文件，一行一个 UID。不要放用户名、邮箱、密码、Token 或完整用户表导出。文件放在仓库外的受控目录，不提交 Git，不上传到公开页面。

当前共享 `maa_user` 没有可靠的注册来源/注册时间字段；不能用 `from=share`、Referer、改密时间或主库全部现存账号来推断 Share 历史来源。工具会核实清单中的账号当前存在且已激活，但不会替运营证明清单的历史来源。

新建仓库外的配置 JSON，填写真实的活动安排与快照依据：

```json
{
  "campaign_id": "yuanhub-beta-202609",
  "snapshot_id": "share-before-beta-v1",
  "starts_at": "2026-09-24T20:00:00+08:00",
  "snapshot_at": "2026-09-21T12:00:00+08:00",
  "snapshot_source_note": "请替换：这份固定UID清单来自何处、对应哪个已确认的历史时点",
  "initial_capacity": 100,
  "rules_version": "v1",
  "announcement_timezone": "Asia/Shanghai"
}
```

以上日期和来源说明是**格式示例**，不代表实际快照已经存在。必须改成真实值；准备必须在实际 `starts_at` 之前结束。`snapshot_at` 不能是未来时间，也不能晚于开测时间。`initial_capacity` 只决定首次开测的小规模起点（当前为 100～200 且能被 4 整除），后续扩容不再受它或任何固定上限约束。

## 3. 先预览，再冻结

通过安全的进程环境提供连接信息：

- `BETA_ACCOUNT_URI`：含明确库名的共享账号库连接，仅需账号读取权限。
- `BETA_HUB_URI`：含明确库名的 Hub 业务库连接，需要建集合、索引和事务写入权限。

不要把连接密码写入配置 JSON、仓库、命令截图或聊天记录。示例命令中的路径自行替换为受控目录：

```sh
# 默认只读，不建集合，不导入，不开放活动。
node scripts/beta/prepare.mjs --config /secure/beta/config.json --uids /secure/beta/share-uids.txt

# 核对预览中的有效账号数、排除数量、时间和25/75分池后，明确执行冻结。
node scripts/beta/prepare.mjs --config /secure/beta/config.json --uids /secure/beta/share-uids.txt --apply
```

预览只输出汇总数字，不输出 UID 清单或凭据。重复 UID 会去重；不存在或当前未激活的账号不会导入。

成功结果为 `FROZEN_CLOSED`：名单 `READY` 且锁定，但活动仍是 **CLOSED + 暂停新增**。不会发出一份资格。

锁定后同一 `snapshot_id` 重跑只返回 `ALREADY_FROZEN_NO_CHANGES`，不会追加后来出现的 UID。换一个版本也不能替换已锁定的活动。

如果导入中断留下 `BUILDING`，确认无人继续操作原导入任务后，可在原活动仍为空、关闭、未锁定时使用**新的 snapshot_id** 配合 `--apply --resume` 恢复准备。旧版本残留不会参与资格判断；工具不会把两份导入混在一起。不要直接编辑 READY 清单。

## 4. 开测操作

使用已有 `PLATFORM_ADMIN` 或 `SUPER_ADMIN` 登录 `/admin/beta`，不需要先占内测名额。普通用户没有 `beta:manage`，无法修改配置。

依次确认固定名单、开始时间、72 小时截止、当前容量100、初始预留25和公开75，然后填写原因、选择“进入内测模式”，再“恢复新增”。即使提前进入 BETA，也不会在 `starts_at` 前接受报名。

所有变更携带 `expected_config_version`，写入审计；409 表示页面配置过期，需要刷新。503 可能意味着请求结果暂不能确认，先刷新管理状态，不要连续重复提交同一个变更。

日常操作：

- 暂停新增：仍可排队，但 Share 预留和公开都不继续发资格；已开通用户继续使用。
- 自定义扩容：在管理页填写“目标总容量”（绝对目标，不是增量），只增不减；新增名额全部公开，已有候补优先。除 `share.beta.capacity-hard-limit`（默认 100000，防误输入的纯技术保护值）外没有本轮人数上限。相同容量可作为幂等请求，但页面不主动提供该入口。
- 维护关闭：对普通用户关闭受限云功能，已有资格仍保留；具备管理能力的管理员账号仍可直接进入，账户、反馈和管理入口不锁死。
- 正式开放：取消资格门槛，仍保留正常登录、Token scope、数据归属与管理授权。首次 OPEN 留下永久记录，之后不得回到旧 BETA 配额；维护后恢复也应回 OPEN。

扩容只改总容量，不重新计算 Share 预留：预留数固定为 `initial_capacity / 4` 的快照，72 小时内可领取，之后未用部分转公开。因此从 100 扩到 1000 时 `reservedInitial` 仍为 25，新增的 900 个名额全部计入公开容量。旧版本 MongoDB 文档里遗留的 `maxCapacity` 字段已不再是运行时字段（读取时被忽略、下一次写入时被清除），不会阻止扩容，也无需手工改库。

Share 预留期是从开测起连续72小时；暂停新增或维护不会延长。到期剩余预留自动转公开，不增加总容量，已领取资格不失效。后台每30秒补偿处理，重启也会补偿；实际分配时同样检查截止时间，不能依靠调度时间差继续领取过期预留。

## 5. 访问与通知

报名接口 `POST /v1/beta/join` 只登记当前 JWT 对应的普通账号，需要确认须知和自动候补。具备管理能力的管理员账号始终绕过内测资格，不会创建或占用候补/ACTIVE 名额；如果账号此前已进入候补或占用名额，访问时会从内测配额中脱离并将名额归还。正常注册/登录不会自动报名。唯一普通账号只能占一份，游戏子账号和设备不额外占位。

资格查询 `/v1/beta/me` 与管理查询都包含一个嵌套 `campaign`，供前端使用同次读取的活动状态；个人响应中的 `can_use_beta_features` 是服务端最终判定结果，前端不再重复套用普通用户的 `CLOSED / NOT_STARTED` 限制。具备管理角色或反馈管理授权的激活账号在任意活动状态下均返回可访问；仅接收反馈通知、没有管理能力的账号仍按普通用户处理。权限不写入长期 JWT，也不使用客户端 `from` 判断。

Web 私有云接口与 OpenAPI Token 的 Redis命中、Mongo回退两条认证路径均执行同一套服务端访问判定：普通用户检查内测资格，管理员检查实时管理能力并直接旁路。旧 Token 本身不会额外获得旁路能力；Token 查看与撤销保留。SSE 首次连接执行同一判定，推送与心跳再次核实；异步收尾调度不会重复要求已经清除的请求认证。

资格发放与 `BETA_GRANTED` 站内通知在同一 Hub 事务内提交。通知点击跳转 `/beta`，但通知本身不是资格凭证。第一版没有自动邮件或强制加群。

## 6. 验证与故障处理

```sh
# 后端常规测试与构建
./gradlew test
./gradlew bootJar

# 对明确指定的测试用副本集运行真实Mongo测试
BETA_TEST_MONGO_URI='mongodb://127.0.0.1:27028/?replicaSet=betaTestRs' ./gradlew test --tests '*Beta*'
BETA_TEST_MONGO_URI='mongodb://127.0.0.1:27028/?replicaSet=betaTestRs' npm test --prefix scripts/beta
```

只有显式设置 `BETA_TEST_MONGO_URI` 才运行真实 Mongo 测试；测试新建随机 `beta_test_*` 库并只删除自己创建的库。不要将该变量指向生产环境。没有变量时，跳过不算验证通过。

本地前后端开发服务统一由父工作区 `./dev.sh` 管理，不要让会自动重编译的后端开发进程与同一仓库的 clean/test/格式化过程同时修改构建目录。运行测试服务前复用或检查现有服务，不影响其他人的进程。

出错时：先暂停新增，检查 `/admin/beta` 的配额、有效预留、候补、维护时间和维护错误。不要用 OPEN 临时绕过故障，不清空报名或资格集合，不用手工修改计数“修复”不一致。

安全回滚必须保留已有门禁。回滚到完全没有内测鉴权的旧后端会绕过限额；需要先通过受控维护入口/网关停止相关流量，再部署仍保留门禁的修复版本。无需也不得清空用户业务数据。
