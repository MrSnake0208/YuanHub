# 广陵账房公共数据 API 与迁移

本功能是独立公共目录，不改变 `hub_ledger_plan` 私人方案、JWT 用户归属、游客存储或快照结构。首次上线需要正常发布前后端；以后维护礼包、活动和参考汇率只需网页保存并刷新 `/cart`。本地实现不代表已经部署。

## 接口

统一 snake_case JSON。成功 `{status_code:200,data:...}`；本模块失败使用实际 HTTP 401/403/404/409/422/503，错误体含 `status_code`、`message`。所有写入与管理读取都先校验 JWT 和 `ledger_catalog:write`；默认 PLATFORM_ADMIN、SUPER_ADMIN 拥有此权限，其余角色没有。仅下述 GET 可匿名访问，POST 同路径不公开。

| 方法 / 路径 | 作用 |
| --- | --- |
| GET `/hub/ledger/catalog` | `{packages,campaigns,settings}`，仅启用礼包和已发布活动/启用档位，含已结束历史资料 |
| GET `/v1/admin/ledger` | 完整目录，含草稿和停用数据 |
| POST `/v1/admin/ledger/packages` | 新增礼包，后端分配 ID |
| PUT `/v1/admin/ledger/packages/{id}` | 更新/软停用，`id` URL 编码，如 `ru%3A1000000` |
| POST `/v1/admin/ledger/campaigns/preview` | 校验并返回活动预览，不写库、不审计 |
| POST `/v1/admin/ledger/campaigns` | 新增草稿/发布活动 |
| PUT `/v1/admin/ledger/campaigns/{id}` | 修改/发布/停用活动及档位 |
| PUT `/v1/admin/ledger/settings` | 更改默认参考汇率 |

新建不接受 `expected_version`；更新必填当前响应的 `version`。任何并发冲突返回 HTTP 409，不自动覆盖。`game`、礼包 `content_id` 和资源 `id` 创建后不可更改，禁止硬删除或复用 ID。

礼包示例（如鸢）：

```json
{"game":"ru","name":"示例礼包","points":60,"draws":0.6,"limit":2,"price_cny":6,"price_usd":null,"category":"其他","sort_id":10,"extra":"说明","enabled":true}
```

`game` 为 daihao / ru；价格仅允许所属币种。`name` 1–120 字，`category` 1–40 字，`extra` 最多1000字；积分整数0–10000000，抽数有限小数0–1000000，限购整数1–9999，排序整数0–1000000，价格有限数0–10000000。未知字段、数字字符串、整数小数、null 基础数值拒绝。

活动示例：

```json
{"game":"daihao","name":"新一期累充","starts_at":"2026-10-11T00:00:00+08:00","ends_at":"2026-10-20T23:59:59+08:00","time_zone":"Asia/Shanghai","status":"draft","tiers":[{"points":100,"sort_id":0,"enabled":true,"rewards":[{"name":"符传","count":2}]}]}
```

时间带偏移并存为 UTC Instant，展示使用有效 IANA 时区；开始必须早于结束，新活动开始时间必填。`status` 为 draft / published / disabled；发布至少一个启用档位。每活动1–100档，积分门槛1–10000000且不重复；每档1–30种奖励，名称1–120字、数量整数1–10000000。档位按 sort_id / points 展示，下一档按积分门槛计算。草稿/停用不公开；已发布但未开始/已结束仅为预算或历史参考，不表示当前可领取。旧迁移活动允许原始开始日期未知，但不得在缺少开始日期时延长原结束时间。

设置示例：`{"exchange_rate":6.7,"expected_version":0}`，汇率为有限数，范围0.0001–10000。用户在页面手动输入的汇率（含原有允许的0）和私人方案携带汇率优先。

## 集合、唯一性与审计

- `hub_ledger_packages`：Mongo `_id = game:contentId` 的唯一索引，两游戏可用同一数字 ID。
- `hub_ledger_campaigns`：UUID `_id`，嵌入活动档位/奖励，整条文档 @Version CAS。
- `hub_ledger_settings`：`default` 设置使用 @Version；`counter:daihao` / `counter:ru` 原子 `$inc` 分配 ID。
- 新公共 ID 为1000000–999999999，单游戏单调递增，失败分配也不回收；保留原1–101等 ID，和现有前后端个人礼包毫秒时间戳分配区间分离。私有快照不依赖公共记录存在。
- `admin_audit_logs` 动作 `LEDGER_CATALOG_UPDATED`，含 actor、ledger 资源、时间、前后公共数据值；管理审计页可读取。没有用户方案、token、密钥。冲突和预览不写审计。

## 幂等迁移

固定资源 `src/main/resources/ledger/catalog-v1.json` 来源于本次基线的前端 packages.js / rewards.js。`LedgerCatalogSeed` 在正常启动时只 insert；重复 `_id` 跳过，已有管理修改、停用和版本号不覆盖，计数器不重置。数据库连接异常使启动失败，不假装导入成功。无需运行手工 Mongo 脚本或操作生产数据。

首次启动前先备份并按正常流程发布后端，使种子完成，再发布前端。检查管理页或公共 GET：代号鸢101个、如鸢41个；两期旧活动各按旧页面两游戏均展示的行为迁移为4份游戏限定的历史记录，每份14档。保留结束时间 `2026-04-29T23:59:59+08:00`、`2026-05-13T23:59:59+08:00`，不补造开始时间。原来源未记录活动适用版本，`source_note` 明示这一限制；运营应核实适用游戏后创建新活动，或停用不适用历史记录。默认6.7。原如鸢 id96 的 price_cny=1580 等数值保持原样，不自动纠错。

非生产 test profile 不自动执行启动种子，隔离测试显式调用相同 initialize；测试只连接 TestMongo 拥有的临时容器和随机测试库。不要删除种子记录后期待其删除永久生效：正常启动会补回缺失的固定 v1 ID，停用才是维护方式。回滚前端不清理公共集合或私人方案。

## 缓存与失败

公开和管理 GET 均返回 `Cache-Control: no-store`，项目 PWA 不缓存业务 API。客户端每次页面挂载请求服务端，仅将成功且验证完整的公开响应写入 `yh_ledger_catalog_v1`（带保存时间）。失败明确提示使用上次缓存或内置迁移数据，并注明不是最新数据；可重试。成功返回空目录视为真实空目录，提示尚无可售礼包，保留已选快照。异步目录更新先保存当前选购快照，金额/抽数/积分不会随公共改价丢失。无需实时推送。

## 最小定向验证

```sh
./gradlew test --tests '*LedgerCatalogServiceTest' --tests '*LedgerCatalogSecurityTest' --tests '*LedgerPlan*Test' --tests '*AdminAuthorizationServiceTest'
./gradlew integrationTest --tests '*LedgerCatalog*MongoTest'
```

第二条需要本机 Docker，禁止改接现有数据库。`LedgerCatalogHttpMongoTest` 验证真实 JSON → Controller → Service → 临时 Mongo → 公开 JSON → 持久审计闭环；安全链测试另外验证匿名/权限边界。
