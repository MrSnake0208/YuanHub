# YuanHub Backend 蓝绿部署

生产后端采用 **GitHub Actions 编排 + 服务器 B 本地构建 + systemd Blue/Green + Nginx 原子切流**。

日常发布不再从 GitHub Runner 上传约 60 MiB 的 JAR。GitHub 只传递 tag / commit /版本信息，服务器 B 使用本地源码缓存执行 `git fetch` 与 Gradle 构建。

## 1. 生产拓扑

```text
用户
  ↓
api-hub.maayuan.com（服务器 A / 外部稳定 API）
  ↓
api-hub.maayuan.top（服务器 B）
  ↓
服务器 B Nginx
  ↓
yuanhub_backend upstream
  ├─ Blue  127.0.0.1:8080  / management 127.0.0.1:18080
  └─ Green 127.0.0.1:8081  / management 127.0.0.1:18081
```

任意时刻只有一个 slot 接收新流量。另一个 slot 用于部署新版本。

切流前，新 slot 必须同时满足：

- `/actuator/health/readiness` 返回 `UP`（应用 readiness + 主 Mongo + Redis + 磁盘）
- `/version` 返回本次 tag 与 commit
- `/v1/beta/status` 可访问（额外覆盖 HubBackend Mongo 链路）

切流后还会通过 `YUANHUB_BACKEND_URL/version` 从公网再次验证。若公网验证失败，脚本自动恢复旧 Nginx upstream 并停止新 slot。

## 2. 发布目录

默认根目录：

```text
/var/lib/yuanhub-backend/
├── .source/                    # 服务器 B 的 Git 源码缓存
├── releases/
│   └── vX.Y.Z/
│       ├── app.jar
│       └── deploy-meta.json
├── slots/
│   ├── blue.env
│   └── green.env
├── state/
│   └── active-slot             # legacy / blue / green
├── nginx/
│   └── active.conf             # Nginx upstream 当前指向
├── shared/
│   ├── backend.env             # 运维配置，不由 Release 覆盖
│   └── version.env             # 旧单实例兼容文件；蓝绿 slot 不依赖它
├── data/
│   ├── avatar/
│   ├── media/
│   ├── private-media/
│   └── star-captures/
└── logs/
    ├── blue.log
    └── green.log
```

`data/` 与 `shared/backend.env` 在 Blue / Green 间共享。

星石采集的 pending 元数据存储在 Redis，图片继续放在 `data/star-captures`，因此 JVM 切换不会丢失正在进行的采集。

## 3. GitHub 配置

后端仓库使用独立的服务器 B SSH 凭据，不再复用前端/宣传站服务器 A 的 secret 名称。

### Secrets

在 **BackEndV3-Share → Settings → Secrets and variables → Actions → Secrets** 配置：

| Secret | 含义 |
| --- | --- |
| `YUANHUB_BACKEND_VPS_HOST` | 服务器 B SSH 地址 |
| `YUANHUB_BACKEND_VPS_USER` | 部署用户，例如 `sylvine` |
| `YUANHUB_BACKEND_VPS_PORT` | SSH 端口 |
| `YUANHUB_BACKEND_VPS_SSH_KEY` | GitHub Actions → 服务器 B 的完整私钥 |

### Variables

| Variable | 推荐值 |
| --- | --- |
| `YUANHUB_BACKEND_DEPLOY_DIR` | `/var/lib/yuanhub-backend` |
| `YUANHUB_BACKEND_URL` | `https://api-hub.maayuan.com` |
| `YUANHUB_PRODUCT_VERSION` | 当前 YuanHub 产品版本 |
| `YUANHUB_KEEP_RELEASES` | `5` |
| `YUANHUB_BACKEND_DRAIN_SECONDS` | `45` |
| `YUANHUB_BACKEND_LEGACY_SERVICE` | `yuanhub-backend` |

`production` Environment 可以继续配置 Required reviewers，让生产发布需要人工批准。

## 4. 服务器 B：生产公共环境

星石养成完成前端开放前，先部署包含回执快照和索引修复的后端（PR #11）。
MongoDB 必须支持 replica set transaction；Hub 数据库账号须具备索引查询及删除权限。
正常启动会仅清理 `star_completion` 上名称为 `state.idx_star_state_owner`、字段依次为
`state.userId` / `state.accountId` 且为 unique 的旧错误索引，保留历史回执、
operation ID 唯一索引和 `star_state_current` 的归属唯一索引。
`test` profile 不自动运行启动清理；隔离 MongoDB 回归测试显式调用清理器验证迁移。
索引维护失败会阻止启动，应修复数据库权限或连接问题后重试，不得忽略后直接切流。

服务器 B 需要：

- Git
- Java 21 JDK（必须包含 `javac`，仅安装 JRE 不足以在服务器构建）
- curl
- Python 3
- Nginx
- systemd
- 能访问 GitHub 与 Gradle/Maven 依赖源

`/var/lib/yuanhub-backend/shared/backend.env` 仍由运维维护。至少确认：

```bash
SPRING_PROFILES_ACTIVE=prod
SERVER_ADDRESS=127.0.0.1

SPRING_DATA_MONGODB_URI=mongodb://...
SHARE_MONGO_HUB_URI=mongodb://...

SPRING_DATA_REDIS_HOST=...
SPRING_DATA_REDIS_PORT=6379
SPRING_DATA_REDIS_PASSWORD=...

SHARE_JWT_SECRET=...
SHARE_PUBLIC_BASE_URL=https://api-hub.maayuan.com
SHARE_CORS_ALLOWED_ORIGIN_PATTERNS=https://beta-hub.maayuan.com,https://hub.maayuan.com

SHARE_AVATAR_DIR=/var/lib/yuanhub-backend/data/avatar
SHARE_MEDIA_DIR=/var/lib/yuanhub-backend/data/media
SHARE_PRIVATE_MEDIA_DIR=/var/lib/yuanhub-backend/data/private-media
SHARE_STAR_CAPTURE_DIR=/var/lib/yuanhub-backend/data/star-captures
```

不要在 `backend.env` 固定 `SERVER_PORT`、`MANAGEMENT_SERVER_PORT`、`YUANHUB_BACKEND_VERSION`、`YUANHUB_PRODUCT_VERSION` 或 `LOGGING_FILE_NAME`；这些由 Blue/Green slot 文件覆盖。

## 5. 服务器 B：给 Git 仓库配置只读 Deploy Key

Release Action 会 SSH 到服务器 B，然后由服务器 B 自己执行：

```bash
git fetch
git checkout <exact commit>
./gradlew bootJar
```

如果仓库为私有仓库，需要让服务器 B 的部署用户拥有只读 GitHub Deploy Key。

在服务器 B（以部署用户运行）：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh

ssh-keygen -t ed25519   -f ~/.ssh/yuanhub-backend-github   -N ''   -C 'yuanhub-backend-server-b'
```

查看公钥：

```bash
cat ~/.ssh/yuanhub-backend-github.pub
```

把它添加到：

**GitHub → BackEndV3-Share → Settings → Deploy keys → Add deploy key**

只需要读取权限，**不要勾选 Allow write access**。

然后服务器 B 写：

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/yuanhub-backend-github
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
ssh -T git@github.com
```

GitHub 提示不提供 shell access 是正常的，只要认证成功即可。

## 6. 一次性从旧单实例迁移到 Blue/Green

第一次启用蓝绿前，现有 `yuanhub-backend.service` 可以继续占用 8080。

先把包含本次蓝绿实现的代码放到服务器 B 任意临时目录，或者在现有仓库 clone 中执行下面脚本。

先确认真实 Nginx site 文件。项目历史环境常见位置：

```bash
sudo grep -RIl '127.0.0.1:8080' /etc/nginx
```

找到服务器 B 上真正代理后端的 site，例如：

```text
/etc/nginx/sites-available/yuanhub-api-origin
```

然后：

```bash
cd <BackEndV3-Share 仓库目录>

sudo bash deploy/bootstrap-blue-green.sh   /etc/nginx/sites-available/yuanhub-api-origin
```

bootstrap 会：

1. 安装 `/etc/systemd/system/yuanhub-backend@.service`
2. 创建 `/var/lib/yuanhub-backend/nginx/active.conf`，初始仍指向 `127.0.0.1:8080`
3. 创建 Nginx `yuanhub_backend` upstream
4. 把当前 site 的
   `proxy_pass http://127.0.0.1:8080;`
   改成
   `proxy_pass http://yuanhub_backend;`
5. 执行 `nginx -t` 后 graceful reload
6. 写入最小化 sudoers，使 GitHub 部署用户只能启动/停止两个 slot、校验/reload Nginx
7. 将 `state/active-slot` 初始化为 `legacy`

**bootstrap 不会停止当前旧后端。**

因此执行完成后，用户仍由原来的 8080 实例服务。

检查：

```bash
cat /var/lib/yuanhub-backend/state/active-slot
cat /var/lib/yuanhub-backend/nginx/active.conf
sudo nginx -t
curl -s http://127.0.0.1:8080/version
```

首次自动 Release 会先构建新版本。由于旧单实例的星石 pending 元数据仍只存在旧 JVM 内存中，
脚本会在首次切流前等待 `data/star-captures/capture-*` 清空；默认最多等待 2100 秒（35 分钟）。
如果仍有 pending 采集则发布失败并保持 legacy 在线，绝不强行切流。该等待只发生在 `legacy → 首个蓝绿 slot`。

```text
legacy :8080 继续服务
        ↓
服务器构建新版本
        ↓
等待旧星石 pending 消费/过期（仅首次）
        ↓
Green :8081 启动
        ↓
Green readiness 通过
        ↓
Nginx → Green
        ↓
公网检查通过
        ↓
等待 drain
        ↓
停止旧 yuanhub-backend.service
```

之后就正式进入 Blue ↔ Green 循环。

## 7. 日常发布

后端版本由 Git tag 决定。

在 YuanHub-All 工作区内推荐根目录统一入口，先自行提交业务改动：

```bash
./release.sh --dry-run --frontend auto --backend 0.1.13
./release.sh --frontend auto --backend 0.1.13
# 仅发后端
./release.sh --backend 0.1.13
```

版本号为示例，必须使用新版本。两仓 main 先推送，入口并行等待对应 SHA 的 main push CI 与服务器预构建；任一失败均不创建 tag。默认后端 Release 完整成功后才发布前端，冻结的 SHA 不随等待期间的新提交变化。详细恢复步骤见工作区 `docs/release-workflow.md`。

统一入口 dispatch 同一 `release.yml` 的 `phase=prepare`，传入新 tag、完整 SHA 和唯一 request。prepare 只允许从 main 发起，提交必须属于 main 历史且 tag 不存在；服务器只生成 `app.jar` 与 version/commit 元数据，不写 slot/upstream、不启停服务或创建 GitHub Release。准备与发布共用原 production environment / concurrency；人工审批配置对两阶段都生效。两仓 workflow 需先进入远端 main。

CI 与 prepare 都成功后，tag Release 复用同版本/SHA 的 JAR，继续 readiness、切流、自动回滚及 drain；产物缺失或 metadata 不匹配则按原路径构建。脚本拒绝覆盖任一蓝绿槽位引用的产物，包括停止槽位保留的回滚 JAR。直接推 tag 保持原构建发布路径。

独立 clone 本仓库时，使用仓库根目录的一键入口，无需前端仓库或 YuanHub-All：

```bash
./release-backend.sh --dry-run 0.1.13
./release-backend.sh 0.1.13
# 自动化场景可跳过交互确认，仍保留全部门禁
./release-backend.sh --yes 0.1.13
```

版本号只是示例，必须指定尚未发布的新版本；支持 `v` 前缀，不支持 `auto`，不修改 `build.gradle.kts`。
本机需要 Bash、Git 与 GitHub CLI（`gh`），先用 `gh auth login` 登录具有该仓库 tag 推送和 Actions 访问权限的账号；若 main 有分支保护，应先按仓库要求合并业务改动。生产审批仍遵循 `production` Environment 配置。
服务器与 GitHub Secrets / Variables 沿用本文已有配置，发布者无需在本机配置服务器 SSH 私钥。

脚本要求干净的 main，确认后 fetch main/tags，仅允许 fast-forward；要求提交已合并至远端 main，等待同 SHA 的 main push CI，通过后才创建并推送 tag，再等待完整 Release。脚本从自身位置定位仓库，可在其他目录调用其路径；不自动提交业务代码、不自动预构建，也不依赖外部工作区脚本。
`--dry-run` 只检查本地状态，不登录或访问远端；正式执行会重新核对远端，预览不保证版本仍可发布。
CI 或查询失败时不创建 tag；Release 失败时到 Actions 重跑原 Release，禁止删除、移动或重打 tag。tag 推送失败时先核对远端，再按需推送本地原 tag。

仍可人工发布：

```bash
# 先通过 PR 合并业务改动并同步 main
# 等 ci.yml 的 main push CI 在同一 SHA 成功后，才推对应 tag
git tag v0.1.1
git push origin v0.1.1
```

push `v*` tag 后 Release workflow 自动执行。提前推 tag 时门禁会失败，不会等待 CI；CI 成功后重跑原 Release，禁止删除或移动已有 tag。

GitHub Runner：

1. checkout 精确 tag
2. 核对 `ci.yml / main / push / 同 SHA` 已有成功 CI，复用 ktlint / unit tests / assemble，不在 Release 重跑测试
3. 解析产品版本、检查配置/SSH 和服务器 Java 21 JDK
4. SSH 到服务器 B

服务器 B：

1. 第一次 clone `.source`，以后只 `git fetch` 增量
2. checkout 精确 commit
3. 保留 `~/.gradle`、`.gradle`、`build` 缓存
4. 复用同版本/SHA 的已有 JAR；无有效产物时执行 `./gradlew --no-daemon --max-workers=2 bootJar -x test --build-cache`
5. 将 JAR 放入 `releases/<tag>/app.jar`
6. 启动非活动 slot
7. 本机 readiness
8. Nginx 原子切流 + graceful reload
9. 公网版本/commit 验证
10. 失败自动切回旧 upstream
11. 成功后等待 drain，再停止旧实例
12. 保留最近若干 release

Release **不再 SCP JAR**；CI 仍上传 JAR artifact 保留 7 天供检查，但 Release 使用服务器 B 本地构建产物。

## 8. 自动失败回滚

以下任一步骤失败都不会主动停旧实例：

- 服务器本地构建失败
- 新 slot 启动失败
- Actuator health 不是 `UP`
- `/version` tag/commit 不匹配
- `/v1/beta/status` 不可用
- `nginx -t` 失败

若已经 reload 到新 upstream，但公网 `/version` 验证失败：

1. 恢复旧 `active.conf`
2. 再次 `nginx -t`
3. reload Nginx
4. 停止失败的新 slot
5. workflow 失败退出

旧 slot 在公网验证成功之前始终保持运行。

## 9. 主动回滚到旧版本

不需要 SSH 手改软链接。

在 GitHub：

**Actions → Release → Run workflow**

输入一个仍存在的旧 tag，例如：

```text
v0.1.0
```

workflow 会把旧 tag 部署到非活动 slot，完成相同的 readiness 与切流流程。

即使服务器已经清理了该版本的 JAR，只要 Git tag 还存在，服务器会重新 fetch/build。

## 10. 查看当前状态

服务器 B：

```bash
cat /var/lib/yuanhub-backend/state/active-slot
cat /var/lib/yuanhub-backend/nginx/active.conf

sudo systemctl status yuanhub-backend@blue --no-pager
sudo systemctl status yuanhub-backend@green --no-pager

curl -s http://127.0.0.1:18080/actuator/health/readiness
curl -s http://127.0.0.1:18081/actuator/health/readiness

curl -s https://api-hub.maayuan.com/version
```

正常情况下活动 slot 为 `active`，另一个 slot 在 drain 完成后为 `inactive`。

## 11. 为什么不使用 GitHub self-hosted runner

生产服务器不注册成 GitHub Actions Runner。

GitHub-hosted runner 只做发布闸门和 SSH 编排，服务器 B 使用只读 Git deploy key 拉取代码。这样避免让普通 workflow job 直接成为生产服务器上的长期执行器，同时也达到了“不上传大 JAR”的目标。

## 12. 资源注意事项

Blue/Green 切换期间两个 JVM 会短时间同时运行。模板把每个 JVM 的 `MaxRAMPercentage` 默认设置为 40%，并在服务器构建时使用：

```text
--no-daemon --max-workers=2
```

以降低编译和双实例同时存在时的内存峰值。

若服务器 B 内存很小，应在首次生产切换前观察：

```bash
free -h
ps -o pid,rss,cmd -C java
```

必要时再降低 `YUANHUB_JAVA_MAX_RAM_PERCENTAGE`。

## 私人通知 SSE

`GET /v1/notifications/events` 使用现有 `Authorization: Bearer <JWT>` 请求头，仅订阅 JWT subject 的通知；不接受 URL token，不需要内测或子账号权限。响应为 `text/event-stream`，包含 `Cache-Control: no-store` 和 `X-Accel-Buffering: no`。每 15 秒发送注释心跳，连接约 5 分钟轮换，断开/超时/写入失败清理订阅。

`NotificationService.create` 保存通知后，通过 `NotificationEventService` 在当前 Hub 事务的 `afterCommit` 发布 `notification_created`，事件 ID 和 JSON 的 `id` 均为通知 ID；事务回滚不发布。没有外层事务的已完成写入立即发布。推送失败不回滚反馈，也不改通知的已读状态；前端仍从现有通知接口读取权威数据。

当前仓库的生产设计是一个活动 Nginx upstream，蓝绿发布在切流和 drain 期间有两个进程并存。通知广播仅在进程内有效，旧 SSE 连接可能短暂收不到新进程创建的事件；断开重连/30 秒失败轮询及健康时 120 秒校准会补偿。若未来同时对多个后端实例分流，同样存在跨实例实时送达限制，需要另行确认并引入共享事件通道，当前不接入 Redis Pub/Sub。

上线前需人工确认 A/B 两层代理都保留 Authorization、支持长连接、禁用该路径的响应缓存/缓冲，不忽略 `X-Accel-Buffering`，并使读超时大于心跳间隔。中间代理可能不遵守后端头部；本次仅核实仓库部署文档与脚本，未访问或修改生产配置。浏览器冻结的后台页、离线页面不保证即时送达；没有离线 Web Push。
