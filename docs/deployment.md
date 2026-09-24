# YuanHub 前端部署说明

本仓库可独立 clone / build / release / deploy，不依赖任何外部仓库。

- **CI**（`.github/workflows/ci.yml`）：`push main`、PR、手动触发。只做静态检查、单测、行为测试、`npm run build`，并校验 `VERSION` 真的进入了产物。**不做任何生产部署。**
- **Release**（`.github/workflows/release.yml`）：仅由 `v*` tag 触发，使用 `environment: production`。GitHub 通过 SSH 驱动服务器 A 自动拉取指定 tag、在服务器本地构建并原子发布，不再上传整套 `dist`。

## 1. 版本来源

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

     # 带 hash 的静态资源可长期缓存；HTML 必须每次校验
     location /assets/ {
       expires 1y;
       add_header Cache-Control "public, immutable";
     }
     location = /index.html {
       add_header Cache-Control "no-cache";
     }
     location / {
       try_files $uri $uri/ /index.html;
     }
   }
   ```

5. 服务器 A 需为 Linux（workflow 使用 GNU coreutils 的 `mv -T` 做原子符号链接切换）。

## 4. 发布流程

1. 确认 `VERSION` 已经是目标版本，例如 `0.0.1-beta.2`。
2. 提交并推送到 `main`，等 CI 绿。
3. 打 tag 并推送（tag 必须与 `VERSION` 去掉 `v` 后完全一致）：

   ```bash
   git tag v0.0.1-beta.2
   git push origin v0.0.1-beta.2
   ```

4. workflow 依次执行：
   - GitHub-hosted runner 校验 `VERSION == tag`，并运行 `test:static` / `test:repo`
   - 通过 SSH 连接服务器 A；首次创建 `.source`，之后复用源码缓存
   - `git fetch --tags`，checkout 精确 tag，并再次核对 commit 与 GitHub 本次发布 commit 完全一致
   - 服务器 A 执行 `npm ci` 与 `VITE_API_BASE=... npm run build`
   - 构建完成后写入 `$YUANHUB_FRONTEND_DEPLOY_DIR/releases/<version>/`，并生成 `deploy-meta.json`
   - 原子切换 `current` 符号链接（先建临时链接再 `mv -T`）
   - GitHub-hosted runner 通过公网读取 `deploy-meta.json`，核对线上 version + commit
   - 创建或更新 GitHub Release
   - 按 `YUANHUB_KEEP_RELEASES` 清理旧版本目录

首次发布仍需要服务器 A 从 GitHub 拉取完整仓库；后续发布使用同一 `.source`，只 fetch Git 增量，不再传输整套 `dist`。

> 只 push `main` 不会部署；只有 tag 会。

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

```bash
npm ci
npm run test:static
npm run test:repo
npm run test:behavior
npm run build
```

如果当前目录位于 `YuanHub-All` 且相邻的 `BackEndV3-Share` 存在，可额外运行跨仓库契约测试：

```bash
npm run test:contract
```
