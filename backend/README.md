# BackEndV3-Share

基于 MaaYuan-Share-Backend 架构模板搭建的后端框架骨架。

逐模块审阅顺序、进度清单与报告模板见 [后端 Review 计划](docs/backend-review-plan.md)。

外部开发者的正式入口为已部署 YuanHub 前端的 `/developers`；公开文档随前端构建发布。当前认证/版本边界与文档维护责任见[开放能力核对说明](docs/developer-api-status.md)。`backend-openapi.json` 是历史快照，不代表全部当前接口，不作为开发者中心的发布白名单。

## 一键发布

独立 clone 本仓库即可发布，不需要前端仓库或 YuanHub-All。先提交业务改动并切换到干净的 `main`，安装 Git / GitHub CLI 并执行 `gh auth login`（账号需具备仓库推送与 Actions 访问权限）：

```bash
./release-backend.sh --dry-run <新版本号>
./release-backend.sh <新版本号>
```

例如版本号 `0.1.13`（须尚未发布）；后端不支持 `auto`。脚本等待 CI 成功后推送 tag 并等待部署完成，生产凭据沿用 GitHub 配置。配置、审批与失败恢复见 [部署说明](docs/deployment.md#7-日常发布)。

## 技术栈

- Kotlin 2.2 (JDK 21)
- Spring Boot 3.5
  - spring-security (JWT 无状态认证)
  - springdoc-openapi
- MongoDB (Spring Data)
- Redis
- Gradle (Kotlin DSL) + ktlint + MockK

## 本地开发指南

本地 JVM 直接运行在 WSL/Nix 环境中，Docker Compose 只启动 MongoDB 和 Redis：

```bash
./scripts/dev-up.sh
nix develop path:.
SPRING_PROFILES_ACTIVE=local ./gradlew bootRun
```

`scripts/dev-up.sh` 会启动单节点 MongoDB replica set `rs0` 和 Redis，初始化一次 replica set，等待 PRIMARY，
并验证 replica set discovery 与 Redis `PING`。本地 profile 固定使用：

- 后端：`http://127.0.0.1:8080`
- MaaBackend：`mongodb://127.0.0.1:27017/MaaBackend?replicaSet=rs0`
- HubBackend：`mongodb://127.0.0.1:27017/HubBackend?replicaSet=rs0`
- Redis：`127.0.0.1:6379`

库存导入使用 MongoDB transaction，因此 MongoDB 必须以 replica set 运行；standalone MongoDB 不受支持。
启动后检查：

```bash
curl --fail-with-body http://127.0.0.1:8080/ready | jq
curl --fail-with-body http://127.0.0.1:8080/v3/api-docs \
  | jq '.servers'
```

第二条命令在 local profile 下应显示 `http://127.0.0.1:8080`。

反馈附件使用两个独立目录：`SHARE_MEDIA_DIR` 保存可由 `/media/**` 公开访问的截图，
`SHARE_PRIVATE_MEDIA_DIR` 保存只能经工单 JWT 下载接口读取的普通文件。两个目录不能相同，
私有目录也不能位于公开目录下；生产部署必须分别挂载持久卷。默认本地路径为
`./data/media` 与 `./data/private-media`。

MongoDB 与 Redis 使用命名 volume。普通停止不会删除本地数据：

```bash
docker compose -f compose.dev.yml down
```

需要显式重置测试数据时可执行下面的命令。**该命令会永久删除本仓库 Compose 环境的全部本地 MongoDB 和 Redis 数据：**

```bash
docker compose -f compose.dev.yml down -v
```

Windows 上的 MaaY 通常可直接用 `http://127.0.0.1:8080` 访问 WSL 后端。如果 WSL localhost 转发不可用，
在 WSL 中运行 `hostname -I` 查询当前 IP，并在 MaaY 中临时填写 `http://<WSL_IP>:8080`；不要把动态 IP 写入配置文件。

### 创建本地账号和 API Token

YuanHub-All 工作区的 Agent 真实浏览器验证另有隔离入口：根目录
`python3 scripts/agent-test/agent.py setup`，操作说明见工作区 `scripts/agent-test/README.md`。
它使用独占容器、`local,agent-test` profile、受保护 manifest 和真实账号/JWT，
默认普通身份无管理/招募授权，管理身份仅有活动日历编辑角色。
不要在下述普通开发数据库上运行 Agent 种子或清理操作。

local profile 已开启 `debug.email.no-send: true`，不会连接 SMTP。先请求注册验证码：

```bash
export API_BASE_URL=http://127.0.0.1:8080
export LOCAL_EMAIL=developer@example.test
export LOCAL_PASSWORD='replace-with-a-local-password'

curl --fail-with-body -X POST "$API_BASE_URL/user/sendRegistrationToken" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$LOCAL_EMAIL\"}" | jq
```

验证码会出现在运行 `bootRun` 的终端以及 `logs/latest.log` 中，日志文本为
`Email not sent, no-send enabled, vcode is ...`。把验证码仅放在当前终端后注册并登录：

```bash
export REGISTRATION_CODE='replace-with-code-from-log'

curl --fail-with-body -X POST "$API_BASE_URL/user/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$LOCAL_EMAIL\",\"user_name\":\"localdev\",\"password\":\"$LOCAL_PASSWORD\",\"registration_token\":\"$REGISTRATION_CODE\"}" \
  | jq

export JWT_TOKEN="$(curl --fail-with-body -sS -X POST "$API_BASE_URL/user/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$LOCAL_EMAIL\",\"password\":\"$LOCAL_PASSWORD\"}" \
  | jq -er '.data.token')"
```

先创建**统一子账号**（库存 × 密探共用一张 `sub_accounts` 表），再使用 JWT 为该账号
生成只含库存权限的本地 API Token。同一子账号也可在密探侧直接使用（如把 scopes 换成
`operator:read`，或同时包含 `inventory:*` 与 `operator:*`）：

```bash
export INVENTORY_ACCOUNT_ID="$(curl --fail-with-body -sS -X POST "$API_BASE_URL/v1/accounts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"本地烟测账号","game":"代号鸢"}' \
  | jq -er '.data.id')"

export INVENTORY_API_TOKEN="$(curl --fail-with-body -sS -X POST "$API_BASE_URL/user/open-api/token" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"account_id\":\"$INVENTORY_ACCOUNT_ID\",\"scopes\":[\"inventory:read\",\"inventory:write\",\"inventory:export\"],\"remark\":\"local inventory smoke\"}" \
  | jq -er '.data.token')"
```

JWT 和完整 API Token 只保存在当前终端环境变量中，不要写入文件或命令日志。可用以下命令确认 scope：

```bash
curl --fail-with-body "$API_BASE_URL/user/open-api/tokens" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data[] | {token_id, account_id, account_name, scopes, remark}'
```

已生成 Token 的权限可通过登录 JWT 完整替换；请求中的 `scopes` 是更新后的完整集合，因此既可新增也可
移除权限：

```bash
curl --fail-with-body -X PATCH "$API_BASE_URL/user/open-api/tokens/$TOKEN_ID/scopes" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"scopes":["operator:scan:write","inventory:write","inventory:read"]}' | jq
```

更新会立即同步到 MongoDB 和无过期 Redis 缓存，新增权限立即可用、移除权限立即失效；Token 明文不会
改变，也无需在 MaaYuan 中重新填写。创建返回 Token 明文；后续本人 JWT 可按需通过 secret 接口复制，禁止缓存。列表和权限更新响应均不返回明文。
当前 Token 仍不会自动过期。

> **统一子账号说明（2026-08）**：`/v1/inventory/accounts` 与 `/v1/operator/accounts` 已合并为
> **`/v1/accounts`**（POST 创建 / GET 列表 / PATCH 修改 / DELETE 删除）。子账号对库存、密探、
> 特别关注全局可用；token 绑定的账号为共享账号，**可访问的域由 scopes 声明**（`inventory:*` 走
> `/open-api/inventory/**`，`operator:*` 走 `/open-api/operator/**`，可混合）。删除子账号 =
> 整账号级联删除该子账号的库存、密探、特别关注数据及全部绑定 token。

每个统一子账号都持久化非空 `game`，且只允许 `代号鸢` / `如鸢`。创建缺省为 `代号鸢`；
`POST /v1/accounts`、`GET /v1/accounts`、`PATCH /v1/accounts/{accountId}` 都稳定返回该字段。
PATCH 是真正的局部修改，可只传 `{"name":"新名称"}` 或 `{"game":"如鸢"}`；修改版本不会搬迁或
删除既有库存、密探 current/record。密探新写入携带的 `game` 必须与账号一致，否则返回
`422 account_game_mismatch`。部署前先 dry-run，再按说明 APPLY
[`scripts/migrations/20260821-sub-account-game.js`](scripts/migrations/20260821-sub-account-game.js)。

### MaaYuan 首次库存同步验证

`GET /user/open-api/tokens/{tokenId}/first-sync` 使用本人 JWT，只读且 `Cache-Control: no-store`。先验证连接归属，再查询相同 user/account/connection 的真实已生效库存记录；返回 `connection_id / account_id / synced / record_id / received_at / data_type=inventory`，没有连接码明文。没有证据时 `synced=false`；未知、他人或已撤销连接返回404。

Open API 库存写入仍要求原有 `inventory:write` 权限，并在现有事务内将认证连接编号保存为 `inventory_records.sourceConnectionId`。普通 JWT/手工导入不标记来源；历史记录及幂等重传不会被追认为新连接成果。教程不依赖 producer 自报平台、普通更新时间、revision 或 SSE toast；站外 MaaYuan 设置不可直接观察。网页刷新/跨页后可重新查询已有成果。

前后端需要同时提供此契约。旧后端不支持该接口时，教程保留未验证状态。运行客户端任务以实际游戏库存为准，不为教程造测试数据。该接口证明指定连接实际写入库存，Bearer 凭证不能证明运行客户端的进程身份；其他工具持同一连接上传真实库存也会产生相同有效证据。

### 库存联调 Smoke Test

另开一个已进入 `nix develop path:.` 的终端，将刚生成的完整 API Token 放入环境变量后运行：

```bash
export INVENTORY_API_TOKEN='replace-with-local-api-token'
./scripts/inventory-smoke.sh
```

脚本默认访问 `http://127.0.0.1:8080`，也可通过 `API_BASE_URL` 覆盖。它从 Token 自动查询绑定的
子账号（`GET /open-api/inventory/account`），不要求另外配置 `account_id`。脚本从真实目录选择 item，使用唯一
`record_id` 验证首次导入、幂等重传、409 冲突、当前库存、原始交换文档导出和直接回传导入；脚本不会打印 Token。

### 密探心纸库存与特别关注

密探心纸沿用库存交换协议 v2，不提供单独的库存写接口。使用 `POST /v1/inventory/import` 导入
`record_type=stock_snapshot`、`entity_type=agent` 的记录，再通过
`GET /v1/inventory/current?account_id=...&entity_type=agent` 查询。`full` 快照替换该子账号的完整密探库存，
`listed` 只覆盖列出的密探。条目中的 `name` 仅作为流水展示值，库存写入不会修改公共目录。

特别关注只支持普通登录 JWT，不属于 OpenAPI Token scope，也不进入库存流水或交换档案 v2：

```text
GET    /v1/inventory/agent-favorites?account_id=acc_xxx
PUT    /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
DELETE /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
```

GET 返回按 ID 升序排列的 `agent_ids`。PUT 与 DELETE 均幂等，所有操作先按 JWT 当前用户校验库存子账号归属。
部署前运行 [密探关注迁移](docs/inventory-agent-favorites-migration.md)。

### YuanStar 星石当前状态

YuanStar `/star` 页面使用 JWT 读写账号级 StarState（背包、计划、经验星曜、容量）和恢复点：

```text
GET   /v1/star-state/current?account_id=acc_xxx
PATCH /v1/star-state/current?account_id=acc_xxx
POST  /v1/star-state/rebuild?account_id=acc_xxx
GET   /v1/star-state/recovery-points?account_id=acc_xxx
POST  /v1/star-state/recovery-points/{pointId}/restore?account_id=acc_xxx
```

PATCH 带 `expected_generation` 与 `expected_revision`，仅编辑当前代；完整 OCR 与 JSON 替换通过 rebuild 创建下一代并清空佩戴，同时将旧状态与佩戴保存为恢复点。Loadout PUT 也带 generation 与 revision，并只接受当前背包里的实例。

### 密探公共图鉴与管理员管理

密探公共 API = 公共图鉴 `GET /v1/operator/catalog`（无需登录，全局只读密探目录：有哪些密探、长什么样），
与个人密探数据严格分离——`/v1/operator/**`（除 catalog）与 `/open-api/operator/**` 只能访问自己的养成档案。

### 公共关卡目录与管理员维护

关卡基础数据以 `HubBackend.level_catalog` 为权威存储，历史审计写入 `HubBackend.level_catalog_revisions`。
公共读取无需登录：

```text
GET /v1/level/catalog
GET /v1/level/catalog/{levelKey}
```

列表支持 `game`、`cat_one`、`cat_two`、`q`、`include_archived`、`open_only`；默认隐藏 `ARCHIVED`。
响应中的 `catalog_version` 用于客户端缓存失效。每条关卡使用稳定的 `lvl_...` 业务 ID（`levelKey`），修改
`stageId` / `levelId` 不改变关卡身份；同一 game 内 `stageId`、`levelId` 分别有唯一索引。

管理员维护入口为 `/v1/admin/level-catalog/**`，必须使用登录 JWT 且具有 `level_catalog:write`；当前
`PLATFORM_ADMIN` 与 `SUPER_ADMIN` 获得该权限。写入采用 revision 乐观锁，过期 `expected_revision` 返回
HTTP 409 `level_revision_conflict`。归档/恢复必须走专用端点，所有 create/update/archive/restore/import
都与对应 history 在同一 Hub Mongo transaction 中提交，因此本地开发仍要求 HubBackend 使用 replica set。
完整请求、响应、错误和导入导出契约见父工作区 `YuanHub/docs/api-contract.md` 的“公共关卡目录与管理员管理”章节；
运行中的 Swagger 以 `/swagger-ui/index.html` 和 `/v3/api-docs` 为最终接口参考。

初始历史数据迁移脚本：

```text
scripts/migrations/20260907-level-catalog.js
scripts/migrations/level-catalog-normalizer.js
```

该脚本是一次性初始迁移工具，不属于每次启动流程。默认源数据是父工作区根目录的 `levels (2).json`；当前已验收的
初始迁移为 143 条（代号鸢 35、如鸢 5、通用 103），并包含 2027 白鹄 `stageId` 修正。执行前必须先 dry-run：

```bash
# 从 yituliu 工作区根目录执行
node --test BackEndV3-Share/scripts/migrations/20260907-level-catalog.test.js
node BackEndV3-Share/scripts/migrations/20260907-level-catalog.js --dry-run

# 如需验证另一份源文件
node BackEndV3-Share/scripts/migrations/20260907-level-catalog.js --dry-run --source /path/to/levels.json
```

`--apply` **不能通过 Node runner 执行**，只能在明确连接目标 MongoDB 的 `mongosh` 环境中运行；执行者必须先确认目标
是预期的 `HubBackend`，并先审阅 dry-run 报告。apply 会拒绝对“不属于本迁移且已非空”的目录做盲目覆盖，创建/验证
`levelKey`、`(game,stageId)`、`(game,levelId)` 三组唯一索引，并支持对本迁移结果幂等复跑。

当前仍保留旧 MaaYuan 的 GitHub JSON / webhook / `ManualArkLevels` 兼容链路；它们只有在生产稳定确认并正式进入
关卡计划“阶段 6：清理历史链路”后才能下线。本节新增 YuanHub 权威目录说明，不代表提前删除旧兼容配置。

### 可视化更新日志

公开读取 `GET /v1/changelog` 无需登录，只返回审核通过且未撤回的当前快照。管理接口位于
`/v1/admin/changelog/**`：`CHANGELOG_EDITOR` 具有 `changelog:write`，可保存草稿和提交审核；
`CHANGELOG_REVIEWER` 具有 `changelog:review`，可审核发布、退回和撤回；`SUPER_ADMIN` 继承两项权限，
`PLATFORM_ADMIN` 不自动获得权限。作者不能审核自己的修订。

正文存储为服务端白名单校验的 Tiptap JSON；图片复用 `/v1/media/upload`，只接受当前可用的 JPG、PNG、WebP
资产。条目使用 Mongo `@Version` 乐观锁；已发布条目的新修订获批前，公开快照保持不变。

### 密探当前养成资料底座

`GET /v1/operator/current?account_id=acc_xxx&game=代号鸢` 的每个 entry 在既有 `level / elite /
star_level / discs / star_stones` 上继续返回：

- `disc_loadouts`：最多两套、每套最多三个命盘，不存在 active 或“当前盘”；`discs` 始终是第一套兼容镜像；
- `combat_stats`：`attack / hp / special` 三项奇闻、扫描攻生、手动校正、观测输入与有效状态；
- `combat_stats.display_mode`：攻击力和生命力分别记忆 `auto`（公式计算）/ `manual`（手填或采集值）显示偏好；
- `revision / updated_at`：entry 级并发版本和更新时间。

旧 Mongo 行只有 `discs` 时会读取为第一套“命盘一”；旧 `main / assist` 星石槽读取为
`main1 / assist1`。`star_level` 仍是唯一化极标量，`star_stones` 仍是六槽当前装备，未增加同义字段。
读取具体游戏时，通用 `game="universal"`（兼容历史 `game="*"`）entry 可作为回退；首次 PATCH 编辑若具体游戏文档没有该 entry，
会以通用 entry 为基线写入请求的具体游戏文档，不回写通用文档。

JWT 用户可用局部校正接口（不扣库存、不写库存流水）：

```http
PATCH /v1/operator/current/{operatorId}?account_id=acc_xxx&game=代号鸢
Content-Type: application/json

{
  "level": 90,
  "star_level": 27,
  "disc_loadouts": [
    {"id": "disc_1", "name": "命盘一", "discs": [{"ot_name": "技能增伤"}]},
    {"id": "disc_2", "name": "命盘二", "discs": []}
  ],
  "star_stones": [
    {"type": "main1", "name": "攻击力", "level": 60},
    {"type": "assist1", "name": "生命值", "level": 50}
  ],
  "combat_stats": {
    "manual_attack": null,
    "display_mode": {"attack": "auto", "hp": "manual"},
    "oddities": {
      "attack": {"current": 500},
      "hp": {"current": 2600},
      "special": {"current": 15}
    }
  },
  "expected_revision": 7,
  "reason": "manual_correction"
}
```

只合并出现的顶层和 `combat_stats` 内部字段；`disc_loadouts=[]` 清空两套，
`star_stones` 出现时完整替换六槽当前装备，`star_stones=[]` 清空全部星石，缺失则保留，
槽位仅允许 `main1..main3`、`assist1..assist3` 且不可重复；
`combat_stats=null` 清除战斗资料，`manual_attack=null / manual_hp=null` 只清除对应手动校正。
`display_mode` 也按内部字段出现性合并，`attack: null` 或 `hp: null` 清除对应偏好，
显示偏好变化不会使已有观测变为 stale。若账号尚无 current 文档或 entry，`expected_revision=0`
的首次 PATCH 会创建指定游戏 entry；非零 revision 的缺失 entry 返回 `409 operator_revision_conflict`。
普通密探 `star_level` 允许 `0..31`，SP 依据公共图鉴
`sp_of` 只允许直接星级 `0..5`。奇闻上限按 rarity 固定为 3 星 `300/1560/9`、4 星
`350/1820/11`、5 星 `500/2600/15`；第三项展示名不写入用户数据。

v2 listed/full 导入继续只更新旧字段：`discs` 更新第一套并保留第二套，新增战斗资料不会因 DTO 缺字段被清空；
删除 v2 record 时会把独立的 `operator_correction_records` 校正审计与剩余 v2 record 按接收顺序重放。
v2 export 仍只输出第一套镜像 `discs`、既有 `starLevel` 和 `starStones`。

### 密探只读分享

分享管理接口均要求登录 JWT，且 `account_id` 只允许访问当前用户所属的统一子账号：

```text
GET    /v1/operator/share?account_id=acc_xxx
PUT    /v1/operator/share?account_id=acc_xxx
POST   /v1/operator/share/regenerate?account_id=acc_xxx
DELETE /v1/operator/share?account_id=acc_xxx
```

同一子账号重复 PUT 会复用已有 UUID；重新生成会覆盖旧代码并立即使其失效，DELETE 清空代码且幂等。
分享代码只保存在 `sub_accounts.shareToken`，使用 `idx_sub_share_token_unique` 的 sparse 唯一索引，旧账号文档无需回填。
通用账号响应不会返回该字段，代码也不会写入应用日志。

访客只需访问以下公开接口，不需要 JWT：

```text
GET /v1/operator/share/view/{shareCode}
```

接口按代码命中单个子账号后实时读取该账号游戏版本的 `operator_current`，只返回
`game`、`catalog_version`、`updated_at` 和已招募（`star_level > 0`）条目的
`level`、`elite`、`star_level`、`disc_loadouts`、`star_stones` 及
`combat_stats` 的攻生/奇闻数值。用户身份、账号标识、备注、目标、关注、revision、
listed baseline、观测来源/时间、签名和显示偏好均不返回；成功响应设置 `Cache-Control: no-store`。
没有 current 数据时返回 200、空 `entries` 和空 `updated_at`；无效、撤销或已删除代码统一返回
404 `share_not_found`。只有 `/v1/operator/share/view/**` 加入公开白名单，管理路径仍由 JWT 保护。

### 密探养成交换协议 v3

浏览器 JWT 使用以下接口导入客观养成快照：

```http
POST /v1/operator/import/preview
POST /v1/operator/import
Authorization: Bearer <JWT>
Content-Type: application/json
```

来源账号不是后端账号 ID 时，请求使用包装体；`account_mapping` 的 value 必须是当前 JWT 用户拥有的子账号：

```json
{
  "document": {"format": "myshare-operator-exchange", "version": 3},
  "account_mapping": {"local_default": "acc_xxx"},
  "confirm_review": false
}
```

来源 ID 已经是本人真实 `account_id` 时也可直接提交 v3 文档。preview 只返回逐 entry 的
`accepted / partial / review / rejected / unchanged`、字段差异、warning、blocking error、stale 和目标 revision，
不写 current 或库存。commit 复用同一 Schema validator 和 current 局部合并规则，写入
`operator_v3_import_records` 审计/幂等记录；相同 `record_id` 和内容重复提交返回 unchanged，内容不同返回
`idempotency_conflict`。`listed` 不删除报告外密探；`full` 删除文档外客观 entry，但文档内 entry 未出现的
第二套命盘、combat_stats 和 display_mode 保持不变。

自动采集使用账号绑定 token 和专用最小权限：

```http
POST /open-api/operator/scan-import/preview
POST /open-api/operator/scan-import/commit
Authorization: Bearer <account-bound-token>
Content-Type: application/json
```

token 必须包含 `operator:scan:write`。OpenAPI 只接受一个来源账号和
`operator_snapshot + source_kind=scan + snapshot_scope=listed`，并始终把来源账号映射到 token 绑定账号；
请求中的 `account_id` 不能选择其他目标账号。自动采集不能提交 annotation、manual 攻生校正或
`display_mode`，服务端将写入的 `combat_stats.source` 固定为 `scan`。v3 的
`equipped_star_stones` 写入现有 current `star_stones`，不会创建库存实例、扣库存或写库存流水。
服务端会把本次非空的 `observed_attack / observed_hp` 同步为对应的 `manual_attack / manual_hp`，
并把对应 `display_mode` 设为 `manual`；前端因此可继续使用既有 `auto / manual` 开关在公式值和采集值之间切换。

浏览器需要即时提示最近一次自动上报或库存更新时，可在页面打开期间订阅账号级 SSE：

```http
GET /v1/accounts/acc_xxx/events
Authorization: Bearer <JWT>
Accept: text/event-stream
```

OpenAPI scan 处理 entry 后发送 `operator_scan_import` 事件，数据包含
`account_id / operator_id / record_id / status / revision / stale / observed_status / warnings / blocking_errors / occurred_at`。
每个 OpenAPI 库存导入事务成功后发送一个 `inventory_import` 事件，数据包含导入结果和本次
`record_id / record_type / entity_type / entries[{id,count}]`。前端可以只根据事件名和时间显示“最近流水已更新”或“库存已更新”，忽略条目明细；采集端可以批量提交，不要求一个 entry 一个请求。
它不维护扫描总量或开始/结束状态，也不补发断线期间的历史动画事件；`operator_current` 和
`inventory_current` 仍是持久事实源。`review/rejected` 的密探采集条目另存为待复核结果，按用户、子账号、`record_id`、`operator_id` 隔离：

```http
GET /v1/operator/scan-reviews?account_id=acc_xxx
DELETE /v1/operator/scan-reviews?account_id=acc_xxx&record_id=scan:xxx&operator_id=char_xxx
Authorization: Bearer <JWT>
```

GET 返回原始 v3 单密探文档及 warning/error。用户修正后用新 `record_id` 走现有浏览器 v3 preview/commit；确认写入成功后才关闭待复核项。部分可靠分区可能在原扫描提交时已写入。
服务端每 15 秒发送 SSE comment 心跳并关闭 Nginx 响应缓冲。由于原生 `EventSource` 不能设置 Bearer header，
当前 JWT 前端应使用带 `Authorization` 的流式 `fetch` 或支持自定义 header 的 SSE 客户端。

生产校验使用内置 `schema/operator-growth-exchange-v3.schema.json`，并再次以公共图鉴校验 operator/game、
普通与 SP `star_level`、命盘、六个星石槽位和按 rarity 派生的奇闻上限。稳定错误码包括
`schema_validation_failed`、`account_mapping_required`、`account_scope_mismatch`、`account_game_mismatch`、
`unknown_operator`、`invalid_star_level`、`invalid_combat_stats`、`invalid_disc_loadout`、
`invalid_equipped_star_stones`、`scan_scope_not_allowed`、`idempotency_conflict` 和
`operator_revision_conflict`。

**平台管理员和超级管理员管理公共图鉴的数据面**，即在 `/v1/admin/operator-catalog/**` 上增删改查
`operator_catalog` 字典，改动即时反映到公共图鉴与导入校验：

```text
GET    /v1/admin/operator-catalog                 # 管理端全量（含 starStones / catalogVersion / createdAt）
POST   /v1/admin/operator-catalog                 # 新增密探（Body 见 OperatorCatalogWriteRequest）
PUT    /v1/admin/operator-catalog/{operatorId}    # 更新（path/body id 必须一致）
DELETE /v1/admin/operator-catalog/{operatorId}    # 删除
```

新增密探和目录改名会在同一事务中同步到库存对象目录；YuanHub 心纸页从公共密探目录动态生成清单，
因此不需要重新生成前端静态目录。新密探首次显示为 0 张，不会为任何用户补写库存或历史流水。

以上端点需要 JWT 登录和 `operator_catalog:write` 权限，否则 403；失败统一返回 `OperatorErrorResponse`
（`operator_conflict` / `operator_not_found` / `schema_validation_failed` 等）。
设计见 [docs/operator-subaccounts-implementation-plan.md](docs/operator-subaccounts-implementation-plan.md) §6.5。

公共与管理员目录的每位密探都返回 `special_oddity_name`、`oddity_schema` 和 `incomplete_fields`。
奇闻值的稳定键固定为 `attack / hp / special`；管理员只维护第三项显示名称，三个上限由服务端按
rarity 派生：3 星 `300/1560/9`、4 星 `350/1820/11`、5 星 `500/2600/15`。新建目录条目必须提供
`special_oddity_name`；更新缺失或传 null 时保留旧值。存量缺名时返回 null，
`oddity_schema.special.name` 降级为“第三属性（图鉴待维护）”，且
`incomplete_fields=["special_oddity_name"]`。目录改名只更新公共展示和 `catalog_version`，不会写入
任何子账号、库存或个人密探养成数据。

内置目录当前已按游戏直接采集结果维护 116 位密探的第三奇闻名称；`史子眇`、`陈登·黍王`、`简雍`、
`孙静`、`张松` 尚无可按目录 ID 确认的采集值，继续按上述存量缺名规则返回，禁止按职业猜测。

**密探头像**：头像以 webp 文件存放在 `share.avatar.dir`（默认 `./data/avatar`，可用环境变量
`SHARE_AVATAR_DIR` 覆盖，Docker 部署请挂持久卷），文件名为 `{operatorId}.webp`，对外以
`/avatar/{operatorId}.webp` 公开读（图鉴本就无需登录）。管理员可经
`PUT /v1/admin/operator-catalog/{operatorId}/avatar` 上传（webp、≤500KB）、
`DELETE /v1/admin/operator-catalog/{operatorId}/avatar` 删除。也支持把成品
`{operatorId}.webp` 直接放进头像目录——后端初始化时会按目录回填 `avatar` 字段（只补空值、
不覆盖已上传头像），重启后端即可批量生效。详见
[docs/operator-catalog-avatar-design.md](docs/operator-catalog-avatar-design.md)。

**管理员角色与权限**：平台角色保存在 HubBackend 的 `admin_role_bindings`，不再使用
`maa_user.status >= 2` 做长期授权。超级管理员可以通过以下端点查询和覆盖角色、配置反馈权限并查看审计：

```text
GET /v1/admin/access/me
GET /v1/admin/roles/users
PUT /v1/admin/roles/users/{userId}
GET /v1/admin/feedback-access
PUT /v1/admin/feedback-access/{userId}
GET /v1/admin/audit-logs
```

首次切换使用 `scripts/migrations/20260830-admin-role-bindings.js`：填写超级管理员与平台管理员用户 ID，
先保持 `APPLY = false` 核对 dry-run 输出，再明确改为 `true` 执行。角色回收按数据库当前绑定即时生效，
不依赖 JWT 里的旧 authority。

**反馈工单与广场状态**：`PATCH /v1/reports/{id}/status` 的请求支持
`complete_public_feedback`（默认 `true`）。仅当 `actor_mode=ADMIN`、目标为 `RESOLVED`
且反馈已公开时，同时保存 `publicStatus=COMPLETED`、`completedAt` 与 `publicUpdatedAt`；
传 `false` 保留原公开进度，提交人自行结案不改变广场状态。工单和公开完成使用单次 Mongo
条件更新，期间公开状态或可见性发生变化则返回业务 `409`，不结案、不发送成功通知。
公开发布面板保存完成状态也维护完成时间，离开完成状态时清空；取消公开保留已有完成时间。
已公开的历史反馈即使缺少公开授权，也可通过现有 `public-status` 或 `unpublish` 接口维护状态或撤下，
但 `publish` 仍强制要求用户授权。权限仍以当前运营负责人或超级管理员为准，公开接口不返回内部字段。

## 项目结构

沿用 MaaYuan-Share-Backend 的分层:

```
src/main/kotlin/com/lhs/share/
├── ShareApplication.kt        # 应用入口
├── common/                    # 共享的逻辑
│   ├── controller/            #   PagedDTO、Page 转 PagedDTO 扩展
│   └── utils/                 #   IpUtil 等通用工具
├── config/                    # Spring 配置
│   ├── accesslimit/           #   @AccessLimit 接口限流(注解+拦截器)
│   ├── doc/                   #   OpenAPI 文档配置、@RequireJwt 文档注解
│   ├── external/              #   @ConfigurationProperties 配置类(share.*)
│   └── security/              #   Spring Security + JWT 过滤器链
├── controller/                # 交互层
│   ├── request/               #   入参类型
│   └── response/              #   响应类型(ApiResult 统一返回)
├── handler/                   # 全局异常处理
├── repository/                # 数据仓库层,用于和数据库交互
│   └── entity/                #   与数据库字段对应的类型
└── service/                   # 业务处理层,复杂或者公用逻辑放在这里
    └── jwt/                   #   JWT 签发/解析
```

## 如何新增一个接口

参照已有的 `Demo` 示例(controller → service → repository → entity),
按以下步骤编写:

1. 在 `repository/entity` 下新建实体类(标注 `@Document` 对应 MongoDB 集合);
2. 在 `repository` 下新建仓储接口,继承 `MongoRepository<实体, 主键类型>`;
3. 在 `service` 下新建服务类,注入仓储,实现业务逻辑;
4. 在 `controller/request` 下新建入参 DTO(可用 Bean Validation 注解校验);
5. 在 `controller/response` 下新建响应 DTO;
6. 在 `controller` 下新建 Controller,方法返回 `ApiResult<T>`。

接口权限:

- 公开接口:加入 `SecurityConfig` 的 `URL_PERMIT_ALL` 白名单;
- 需要登录的接口:默认即为 authenticated,无需额外配置,
  可加 `@RequireJwt` 注解让 Swagger 文档展示认证要求;
- 精细权限:参考原项目在 `SecurityConfig` 中按 authority 放行,
  权限写入 JWT 的 authorities claim(`JwtService.issueAuthToken` 的第三个参数)。

其他约定:

- 接口需要限流时,在方法上加 `@AccessLimit(times = 5, second = 10)`;
- 需要缓存时,用 `@Cacheable` / `@CacheEvict`(Caffeine 进程内缓存)或注入 RedisCache;
- 定时任务放在 `task` 包,标注 `@Scheduled`(已开启 `@EnableScheduling`);
- 异步任务标注 `@Async`(已开启 `@EnableAsync`)。

## 账号模块

当前养成的主观标注、云端目标、v3 完整备份与原子升级扣库存接口见
[`docs/operator-growth-persistence-upgrades-api.md`](docs/operator-growth-persistence-upgrades-api.md)。

与 MaaYuan-Share-Backend 共用同一个 MongoDB 数据库(`MaaBackend`,连接串 `mongodb://192.168.31.21:27017/MaaBackend`),
注册/登录/改密/邮箱验证码/JWT 全部在本服务内实现,直接读写 `maa_user` 集合,
业务语义与原项目保持一致(字段结构、密码 BCrypt、status 状态、权限 authority 均对齐)。

### 接口清单

| 接口 | 说明 | 认证 |
|---|---|---|
| POST /user/register | 用户注册(邮箱验证码) | 匿名 |
| POST /user/sendRegistrationToken | 发送注册验证码 | 匿名 |
| POST /user/login | 登录,返回 access+refresh token | 匿名 |
| POST /user/refresh | 刷新 token | 匿名(无状态校验) |
| POST /user/update/password | 修改密码(原密码,10 分钟频率限制) | 需登录 |
| POST /user/update/info | 修改用户名 | 需登录 |
| POST /user/password/reset_request | 发送重置密码验证码 | 公开 |
| POST /user/password/reset | 邮箱验证码重置密码 | 公开 |
| GET /user/info?userId= | 查询用户公开信息(404 语义) | 公开 |
| GET /user/search?userName=&page=&size= | 用户模糊搜索(size 上限 50) | 公开 |

### 字段命名约定

全局 SNAKE_CASE(与原项目一致):请求体与响应体字段均为 `user_name`、`refresh_token`、`registration_token` 等。

### 验证码机制

- 6 位随机码,存 Redis(`vCodeEmail:{email}`),默认 600 秒过期(`share.vcode.expire`);
- 发送间隔限制:一个过期周期内最多重发 10 次(`HasBeenSentVCode:{email}`);
- **一次性**:校验通过即删除(Redis Lua 原子操作),防止重放;
- 本地调试:`debug.email.no-send: true` 时不真实发邮件,验证码打印到日志。

### 邮件配置

在 `application-dev.yml` 中配置 `share.mails`(SMTP 列表,可配多个轮询发送):

```yaml
share:
  mails:
    - host: smtp.qq.com
      port: 465
      from: xxx@qq.com
      user: xxx
      pass: 授权码
      ssl: true
      starttls: false
```

### JWT 与安全

- AccessToken 默认 6 小时(`share.jwt.expire`),RefreshToken 默认 7 天(`share.jwt.refresh-expire`);
- 需登录接口默认受 Spring Security 保护,请求头携带 `Authorization: Bearer <token>`;
- 权限模型与原项目一致:status 为几即拥有 0..status 的 authority;
- 改密/重置密码后,旧的 refresh token 因 `pwdUpdateTime` 校验而失效。

### 硬性约定(与原项目共享数据)

- userId 由 MongoDB 生成(ObjectId),禁止自造;
- 实体 `MaaUser` 字段与索引注解与原项目一字不差(email 唯一索引是数据根基);
- 密码统一 BCrypt(`$2a$10$`),兼容原项目已有 1921 条数据;
- 不要新建自己的用户集合;字段演进需与原项目协调。
