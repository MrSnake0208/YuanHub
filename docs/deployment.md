# YuanHub 前端部署说明

本仓库可独立 clone / build / release / deploy，不依赖任何外部仓库。

- **CI**（`.github/workflows/ci.yml`）：`push main`、PR、手动触发。只做静态检查、单测、行为测试、`npm run build`，并校验 `VERSION` 真的进入了产物。**不做任何生产部署。**
- **Release**（`.github/workflows/release.yml`）：仅由 `v*` tag 触发，使用 `environment: production`，通过 SSH 发布到生产服务器。

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
| `YUANHUB_FRONTEND_URL` | `https://app.example.com` | 主站公网地址，health check 与 Release 说明使用。promo 站硬编码的是 `https://hub.maayuan.com`，主站必须是另一个地址。 |
| `YUANHUB_FRONTEND_API_BASE` | 留空 | 可选。与后端同源时留空；跨域时填后端基址。 |
| `YUANHUB_KEEP_RELEASES` | `5` | 可选。服务器保留的历史版本目录数量，默认 5。 |

> `environment: production` 会在首次运行时由 GitHub 自动创建，不需要手工建；如果希望发布需要人工批准，
> 在 **Settings → Environments → production** 加 Required reviewers 即可。

## 3. 服务器需要提前准备

1. 同一台 VPS 上已有 promo 站的部署用户（`YUANHUB_PROMO_VPS_USER`）；主站复用它即可，无需新建账号。
2. 主站部署根目录存在且可写：

   ```bash
   sudo mkdir -p /var/www/yuanhub/releases
   sudo chown -R deploy:deploy /var/www/yuanhub
   ```

3. Web 服务器（示例 nginx）指向 `current` 符号链接，并做 SPA 回退：

   ```nginx
   server {
     listen 443 ssl;
     server_name hub.example.com;
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

4. 服务器需为 Linux（workflow 使用 GNU coreutils 的 `mv -T` 做原子符号链接切换）。

## 4. 发布流程

1. 确认 `VERSION` 已经是目标版本，例如 `0.0.1-beta.2`。
2. 提交并推送到 `main`，等 CI 绿。
3. 打 tag 并推送（tag 必须与 `VERSION` 去掉 `v` 后完全一致）：

   ```bash
   git tag v0.0.1-beta.2
   git push origin v0.0.1-beta.2
   ```

4. workflow 依次执行：
   - 校验 `VERSION == tag`（不一致立即失败，不发布）
   - `npm ci` → 静态检查 → 单测 → `npm run build`
   - 上传 `dist` 到 `$YUANHUB_FRONTEND_DEPLOY_DIR/releases/0.0.1-beta.2/`
   - 原子切换 `current` 符号链接（先建临时链接再 `mv -T`，线上不会出现半套文件）
   - health check：抓取站首页并确认引用了本次构建的主入口文件
   - 创建 GitHub Release（附 `dist` 打包附件）
   - 按 `YUANHUB_KEEP_RELEASES` 清理旧版本目录

> 只 push `main` 不会部署；只有 tag 会。

## 5. 人工回滚

前端是纯静态的，回滚就是切回旧目录：

```bash
ssh deploy@<HOST>
cd /var/www/yuanhub
ls -1dt releases/*/          # 找到要回退的版本
ln -sfn releases/0.0.1-beta.1 .current-tmp && mv -T .current-tmp current
```

回滚后无需重启任何服务（nginx 直接跟随符号链接）。如需让线上版本号也回退，可再执行一次对应 tag 的 Release workflow（`workflow_dispatch` 输入 tag）。

## 6. 本地验证

```bash
npm ci
npm run test:static
npm test
npm run build
grep -o 'assets/[^"]*\.js' dist/index.html | head -1   # 产物入口
```
