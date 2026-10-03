# OCR 静态资源传输压缩

正式策略为 **gzip-only + identity fallback**。YuanStar 生成原始 worker、模型和 ORT 资源，YuanHub 在最终部署 dist 中生成 `.gz`。原文件完整保留；OCR runtime、触发条件、300 秒 timeout 和现有缓存策略不变。

## 构建与完整性

`npm run build` 在 Vite/PWA 构建结束后执行 `scripts/precompress-ocr.mjs`。现有 Release 已使用该命令，并通过 `cp -a dist/.` 发布完整目录；不需要第二个压缩步骤或新增依赖。

- 使用 Node 标准 `node:zlib`，唯一压缩配置为明确的 **gzip level 6**。
- 只选择唯一 `browser-vision-worker-*.js`、`yuanstar-embed.js`、ORT MJS/WASM、det/rec/cls ONNX 和 dictionary。
- raw ≥16 KiB，且 gzip 至少节省 1 KiB、5%，才生成 `<原文件>.gz`；不为 CSS、reference、README 或普通应用资源添加压缩文件。
- 每次重新生成，清除已删除/改名资源的旧 gzip，以及迁移前的旧编码产物。必需原资源缺失时清除其 orphan gzip 并使构建失败。
- 生成和验证时均检查 gunzip 后 bytes 与原文件完全一致，SHA-256 相同；原始 hash 必须匹配 `docs/yuanstar-embed-manifest.json`。
- `dist/yuanstar-embed-compression.json` 只记录原文件 path/bytes/hash、gzip path/bytes/hash 和节省量，以及固定策略。无时间戳；gzip mtime 与原文件相同。
- `.gz` 是 deployment derivative，不写入 `public/`，不污染原 provenance manifest；低收益资源不生成 `.gz`，服务器仍可返回原文件。

最小验证：

```bash
npm run build
npm run build
node --test test/ocrCompression.test.js test/yuanstarEmbedProvenance.test.js
npm run verify:ocr-compression
```

长期测试覆盖 gzip generation、gunzip 字节/hash 恒等、changed-source regeneration、removed-source cleanup、旧编码迁移清理、重复生成稳定性和原文件保留。参数评估工具和独立 HTTP/browser harness 不进入正式维护面。

## 正式网络收益

2026-10-03 gzip-only 正式 build 实测，单位为 MiB（2^20 bytes），不含 HTTP/TLS 开销：

| 口径 | identity bytes / MiB | gzip 6 bytes / MiB | 节省 |
| --- | ---: | ---: | ---: |
| OCR prepare 的 7 项（不含已加载的 embed entry） | 45,467,882 / 43.362 | 30,605,571 / 29.188 | 14.174 MiB / 32.69% |
| 加 embed entry 共 8 项 | 47,420,950 / 45.224 | 31,322,757 / 29.872 | 15.352 MiB / 33.95% |

与最初约 77.664 MiB 的同一 prepare 口径相比，external-WASM + gzip 累计减少约 **48.476 MiB / 62.42%**。这是正确启用 gzip static 后的首次传输理论值，不是生产已生效的声明。

## 生产 serving 待确认

当前状态：**gzip-only repo-side precompression ready，production gzip_static serving pending confirmation**。

仓库没有生产 nginx 模块清单；`docs/deployment.md` 中 nginx 是示例。没有本轮服务器 SSH 授权，不连接服务器。下一步由服务器 A 运维只读执行：

```bash
nginx -V 2>&1
```

重点确认 `--with-http_gzip_static_module`。[nginx 官方说明](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html)指出该模块并非默认编译。能力尚未确认时不能把未知指令直接加入生产配置。

确认模块可用后，正式建议是在现有 OCR 两个 location 内启用：

```nginx
gzip_static on;
```

保留现有 root、MIME 和缓存设置。客户端始终请求原始 URL：支持且服务器可用时返回 `.gz`，`Content-Encoding: gzip`；客户端不支持、模块未启用或该文件没有 `.gz` 时返回原文件。使用 `on`，不使用 `always`，不 rewrite 到 `.gz` URL，不引入请求时压缩大型 ONNX 的路径。响应 Content-Type 必须仍是原资源 MIME，编码协商与 Vary 应正确。

ESA 是现有传输链的一层，不是本方案核心依赖。主要 ONNX/WASM 不能可靠依赖其自动压缩；origin/deployment 自行准备 `.gz`，由源站 gzip static 交付。

经另行授权部署后，运维再以完整 GET 检查 gzip-only 和 identity 请求：状态、Content-Encoding、原 MIME、Content-Length、协商头及解压 SHA。保留原始文件的 fallback 必须正常。当前没有确认或启用生产 gzip serving。

本方案不改变 Cache-Control、ETag 策略、Service Worker、PWA precache 或 ESA cache rules；不操作生产服务器、不安装模块、不 reload/restart。
