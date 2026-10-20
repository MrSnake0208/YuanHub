# YuanHub 前端部署说明

本仓库可独立 clone / build / release / deploy，不依赖任何外部仓库。

- **CI**（`.github/workflows/ci.yml`）：`push main`、PR、手动触发。只做静态检查、单测、行为测试、`npm run build`，并校验 `VERSION` 真的进入了产物。**不做任何生产部署。**
- **Release**（`.github/workflows/release.yml`）：由 `v*` tag 或手动指定已有 tag 发布，另支持仅预构建的 `phase=prepare`，使用 `environment: production`。GitHub 通过 SSH 驱动服务器 A 自动拉取指定 tag、在服务器本地构建并原子发布，不再上传整套 `dist`。

## 1. 版本来源

星石养成完成为正式公开功能：本地 Vite 开发与生产构建的 `starCompletion` 均默认启用，
不需要用户设置环境变量、URL 参数或演示模式。CI 和服务器 Release 构建显式设置
`NODE_ENV=production`，Release 继续从 `YUANHUB_FRONTEND_API_BASE` 注入正式 API。
本地联调继续通过 `VITE_API_BASE` 和 `YUANHUB_DEV_API_TARGET` 配置实际 API 目标，
使用本地 Backend；养成完成不再需要独立开发开关，也不额外限制 tunnel 配置。

发布此前端版本前，必须先确认正式 Backend 已部署 completion-context、completions、
原 operationId 回执查询，以及原子事务、库存消费重放修复和账户隔离保护
（Backend main 的 PR #10 及后续回执嵌入快照、错误唯一索引清理修复）。MongoDB 必须支持 replica set transaction。
后端启动只定向清理回执集合的 `state.idx_star_state_owner`，保留 operation_id 唯一索引和历史回执；
应先合并并部署后端修复，再发布默认开放养成完成的前端。
功能开放继续遵守既有登录、子账号和站点访问资格规则；正式开放的站点配置需单独确认。
本地 E2E 与前端生产构建成功不等于正式 Backend 已部署或生产 E2E 已通过。

| 字段 | 来源 |
| --- | --- |
| `productVersion` | 仓库根目录 `VERSION` 文件（唯一来源，形如 `0.0.1-beta.1`） |
| `frontendCommit` | 构建时的 `git rev-parse --short HEAD` |
| `buildTime` | 构建时的 UTC ISO-8601 时间 |

三者由 `vite.config.js` 在构建期注入 `__YUANHUB_BUILD_INFO__`，页面统一从 `src/config/buildInfo.js` 读取。
无 Git 环境（源码压缩包等）时 `frontendCommit` 降级为 `unknown`，**不会导致构建失败**。

不要单独修改 `package.json` 的 `version`，也不要在其他地方再写一份版本号。

## 2. 需要配置的 GitHub 项

**SSH 连接直接复用本仓库已有的 `promo-site-deploy.yml` 那套凭据 —— 不需要新建，也不需要重新填值。**
只有本应用专属的目录 / 域名需要新增。

### 复用（已存在，无需操作）

`promo-site-deploy.yml` 已在用下列 **repository secrets**，`release.yml` 读的是同一批：

| 名称 | 用途 |
| --- | --- |
| `YUANHUB_PROMO_VPS_SSH_KEY` | 部署私钥全文（含 `BEGIN` / `END` 行），两套部署共用同一台 VPS |
| `YUANHUB_PROMO_VPS_HOST` | 服务器地址 |
| `YUANHUB_PROMO_VPS_USER` | SSH 用户 |
| `YUANHUB_PROMO_VPS_PORT` | SSH 端口 |

### 新增（Variables：Settings → Secrets and variables → Actions → Variables）

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `YUANHUB_FRONTEND_DEPLOY_DIR` | `/var/www/yuanhub` | 主站部署根目录。**必须与 promo 站点的 `YUANHUB_PROMO_DEPLOY_DIR` 不同**，否则会互相覆盖。 |
| `YUANHUB_FRONTEND_URL` | `https://beta-hub.maayuan.com` | 主站公网地址，health check 与 Release 说明使用。promo 站硬编码的是 `https://hub.maayuan.com`，主站必须是另一个地址。 |
| `YUANHUB_FRONTEND_API_BASE` | `https://api-hub.maayuan.com` | 后端稳定公网地址；内测与正式开放都保持不变。 |
| `YUANHUB_KEEP_RELEASES` | `5` | 可选。服务器保留的历史版本目录数量，默认 5。 |

> `environment: production` 会在首次运行时由 GitHub 自动创建，不需要手工建；如果希望发布需要人工批准，
> 在 **Settings → Environments → production** 加 Required reviewers 即可。

## 3. 服务器需要提前准备

内测阶段域名与服务器：

- `hub.maayuan.com`：服务器 A，继续服务现有宣传页。
- `beta-hub.maayuan.com`：服务器 A，YuanHub 前端。
- `api-hub.maayuan.com`：服务器 A，对用户提供 API 入口并反代到服务器 B。
- `api-hub.maayuan.top`：服务器 B，YuanHub Backend 源站。

前端始终请求 `https://api-hub.maayuan.com`，不直接感知服务器 B 的 `.top` 源站域名。

1. 服务器 A 上复用 promo 站的部署用户（`YUANHUB_PROMO_VPS_USER`）。
2. 服务器 A 必须安装 `git`、Node.js 22、npm；Release 会在服务器本地构建：

   ```bash
   git --version
   node --version   # 必须为 v22.x
   npm --version
   ```

3. 主站部署根目录存在且对部署用户可写：

   ```bash
   sudo mkdir -p /var/www/yuanhub/releases
   sudo chown -R <部署用户>:<部署用户组> /var/www/yuanhub
   ```

   Release 会自动维护 `/var/www/yuanhub/.source` 作为源码缓存。首次发布需要拉取完整仓库；后续只需 fetch Git 增量。

4. Web 服务器（示例 nginx）指向 `current` 符号链接，并做 SPA 回退：

   ```nginx
   server {
     listen 443 ssl;
     server_name beta-hub.maayuan.com;
     root /var/www/yuanhub/current;
     index index.html;

     # 带 hash 的静态资源可长期缓存；入口 HTML 与 PWA 更新文件必须始终重新验证。
     location /assets/ {
       expires 1y;
       add_header Cache-Control "public, immutable";
     }

     location = /index.html {
       expires -1;
       add_header Cache-Control "no-cache, must-revalidate" always;
     }

     # Service Worker 文件名固定为 /sw.js。它一旦被 CDN / 浏览器按普通 JS 缓存，
     # 不同用户就可能继续被旧 worker 控制，出现刷新后回退到旧前端版本。
     location = /sw.js {
       expires -1;
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
     }
     location = /registerSW.js {
       expires -1;
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
     }
     location = /manifest.webmanifest {
       expires -1;
       add_header Cache-Control "no-cache, must-revalidate" always;
     }
     location = /deploy-meta.json {
       expires -1;
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
     }

     # YuanStar embed 入口文件名固定（/yuanstar-embed/yuanstar-embed.js），
     # 而它引用的 worker 带内容 hash、每次同步都会改文件名。
     # 若浏览器继续使用缓存的旧入口，就会去请求已被删除的旧 worker → 404，
     # 表现为“星石”页视觉识别不可用。因此这里的 HTML/JS/CSS 必须每次重新验证；
     # 目录下体积较大的模型与 wasm 仍可按需长缓存。
     location /yuanstar-embed/ {
       expires -1;
       add_header Cache-Control "no-cache, must-revalidate" always;
     }
     location ~* ^/yuanstar-embed/(models|ort|reference)/ {
       expires 30d;
       add_header Cache-Control "public";
     }

     location / {
       try_files $uri $uri/ /index.html;
     }
   }
   ```

   如果主站前面接了阿里云 ESA，还要在 **规则 → 缓存规则** 增加一条 PWA 更新文件规则：

   - 匹配路径：`/sw.js`、`/registerSW.js`、`/manifest.webmanifest`、`/deploy-meta.json`
   - Cache Eligibility：**Bypass Cache / 绕过缓存**
   - 不要把 `/assets/*` 放进这条规则；带 hash 的构建资源继续长期缓存

   同样地，`/yuanstar-embed/*.js` 与 `/yuanstar-embed/*.css` 也必须绕过边缘缓存：入口文件名固定，却引用带内容 hash、每次同步都改名的 worker；边缘缓存旧入口会让浏览器请求到已被删除的旧 worker 并 404。

固定文件名的 Service Worker 必须由源站响应头或 ESA URL 规则明确禁止边缘缓存；仅依赖浏览器请求里的 `Cache-Control: no-cache` 不够。

5. 服务器 A 需为 Linux（workflow 使用 GNU coreutils 的 `mv -T` 做原子符号链接切换）。

## 4. 发布流程

在 YuanHub-All 工作区内，推荐根目录统一入口，支持两仓 CI 与服务器预构建并行，默认后端部署成功后再部署前端：

```bash
./release.sh --dry-run --frontend auto --backend 0.1.13
./release.sh --frontend auto --backend 0.1.13
```

版本号是示例，必须选择尚未发布的版本；详细失败恢复见工作区 `docs/release-workflow.md`。只发前端时可使用 `./release.sh --frontend auto`。

独立 clone 本仓库时继续使用前端脚本（先提交业务改动）：

```bash
./release-frontend.sh --dry-run 0.0.1-beta.20
./release-frontend.sh 0.0.1-beta.20
# 或不传版本 / 传 auto，自动沿用未发布 VERSION 或递增 beta.N
```

统一入口会 dispatch `release.yml` 的 `phase=prepare`，传入新 tag、完整 main SHA 与唯一 request。prepare 校验提交属于 main、tag 未存在且 VERSION 匹配，仅写构建产物，不切换 current 或创建 GitHub Release；两仓 CI 和 prepare 全部成功后才发 tag。准备和发布复用原 production environment / concurrency；配置了人工审批时两阶段均需批准。两仓 workflow 需先进入远端 main。

独立前端脚本保持先 CI、后 tag/构建的顺序，不自动预构建。脚本支持 `--prepare-only` 供统一入口只准备 VERSION/main；`--expected-commit <完整 SHA>` 核对准备阶段提交。未通过 CI 不创建 tag；Release 失败通过重跑原 Release 恢复，不删除、移动或重打已有 tag。

人工发布仍遵循：

1. 确认 `VERSION` 已经是目标版本，例如 `0.0.1-beta.2`。
2. 提交并推送到 `main`，等 CI 绿。
3. 打 tag 并推送（tag 必须与 `VERSION` 去掉 `v` 后完全一致）：

   ```bash
   git tag v0.0.1-beta.2
   git push origin v0.0.1-beta.2
   ```

4. workflow 依次执行：
   - GitHub-hosted runner 校验 `VERSION == tag`，要求 `ci.yml` 中 **main push / 同 SHA** 已成功；复用完整 CI 的 static / repo / behavior / build，不重复安装依赖或跑部分测试
   - 通过 SSH 连接服务器 A；首次创建 `.source`，之后复用源码缓存
   - `git fetch --tags`，checkout 精确 commit，并再次核对 commit 与 GitHub 本次发布 commit 完全一致
   - 优先复用同版本/commit 的产物；新的 metadata 还校验构建 API 地址。缺失或不匹配时执行 `npm ci` 与 `VITE_API_BASE=... npm run build`
   - 构建完成后写入 `$YUANHUB_FRONTEND_DEPLOY_DIR/releases/<version>/`，并生成带 version/commit/API 地址的 `deploy-meta.json`；拒绝原地覆盖活动版本
   - 原子切换 `current` 符号链接（先建临时链接再 `mv -T`）
   - GitHub-hosted runner 通过公网读取 `deploy-meta.json`，核对线上 version + commit
   - 创建或更新 GitHub Release
   - 按 `YUANHUB_KEEP_RELEASES` 清理旧版本目录

首次发布仍需要服务器 A 从 GitHub 拉取完整仓库；后续发布使用同一 `.source`，只 fetch Git 增量，不再传输整套 `dist`。

> 只 push `main` 不会部署；tag 或手动指定已有 tag 的 Release 才会。直接提前推 tag 不会等待 CI，而是门禁失败；等对应 main CI 成功后重跑该 Release。

## 5. 正式开放时切换

正式开放当天只切域名入口，不迁应用路径：

1. 把 `YUANHUB_FRONTEND_URL` 改为 `https://hub.maayuan.com`；API 地址继续使用 `https://api-hub.maayuan.com`。
2. 把 `hub.maayuan.com` 的 Web 根目录切到 `/var/www/yuanhub/current`。
3. 把 `beta-hub.maayuan.com` 设为永久跳转到 `hub.maayuan.com`，并保留原路径。
4. 确认主站稳定后停用 `promo-site-deploy.yml`；宣传页文件可暂时保留作人工回退材料。

宣传页 Service Worker 是 network-only，不缓存宣传内容，所以域名切换后不会长期把旧宣传页留在用户端。

## 6. 人工回滚

前端是纯静态的，回滚就是切回旧目录：

```bash
ssh deploy@<HOST>
cd /var/www/yuanhub
ls -1dt releases/*/          # 找到要回退的版本
ln -sfn releases/0.0.1-beta.1 .current-tmp && mv -T .current-tmp current
```

回滚后无需重启任何服务（nginx 直接跟随符号链接）。如需让线上版本号也回退，可再执行一次对应 tag 的 Release workflow（`workflow_dispatch` 输入 tag）。

## 7. 本地验证

独立前端仓库：

`npm test` 与 `npm run test:repo` 都只执行本仓 Node 测试（含递归 property 与宣传站测试），不读取后端源码。
`npm run test:all` 聚合本仓 static、repo、behavior、build 四阶段；跨仓契约不在其中。
以下沿用现有 CI 的 npm 命令；统一 pnpm/npm 与锁文件属于后续 F01，本批没有改变安装路径。

```bash
npm ci
npm run test:static
npm run test:repo
npm run test:behavior
npm run build
```

跨仓契约使用 Node 和 Git，默认读取相邻的完整 `BackEndV3-Share` 检出；前端目录可重命名。缺少后端或所需文件会失败，不会跳过：

```bash
npm run test:contract
```

后端不在默认位置时，显式指定目录（相对路径以命令工作目录为准）：

```bash
YUANHUB_BACKEND_ROOT=/path/to/BackEndV3-Share npm run test:contract
```

日志输出前后端 HEAD、clean/dirty 状态及 operator v4/v5 协议版本。dirty 表示当前文件树有未提交修改，不能把 HEAD 单独当成可复现的验证版本。
此入口只读取源码、schema/fixture 与 Git 元数据，不启动应用或连接数据库；它保留既有源码契约，不代替真实 API/权限验证。

YuanHub-All 的 `./test all` 和保守全量回退显式执行 `test:repo` 与 `test:contract`，定向选择契约时也单独执行一次。
两仓现有 CI 仍未接入专门的双仓兼容 job；新增 job 的归属和固定 revision 配置留待后续，不把本地入口当作 CI 已接入。

## 8. OCR 资源传输压缩

`npm run build` 在最终 dist 中为指定 OCR 首载资源生成并验证 gzip level 6 的 `.gz` 部署衍生文件；原文件完整保留作为 identity fallback，原 vendored 资源和 provenance manifest 保持原样。Release 沿用同一构建命令并复制完整 dist，不重复压缩。

当前状态为 gzip-only repo-side precompression ready，production gzip_static serving pending confirmation。下一步仅需服务器 A 运维执行 `nginx -V 2>&1`，确认 `--with-http_gzip_static_module`。能力确认后的 `gzip_static on;`、原 MIME 与 gzip / identity fallback 说明见 [OCR 传输压缩说明](ocr-transport-compression.md)；现有缓存策略不变，本轮没有服务器或 ESA 配置变更。
