# OCR 静态资源分发与压缩

星石识别在玩家浏览器内运行。Worker 继续使用 `/yuanstar-embed/` 下的同源入口，开发、preview 与生产对以下四个文件返回精确的 302 跳转。查询参数不会传给 CDN。

| 资源 | 下载来源 |
| --- | --- |
| det、rec、cls 三个 ONNX 模型 | ModelScope RapidAI/RapidOCR `v3.10.0` |
| `ort/ort-wasm-simd-threaded.wasm` | npmmirror 上的 `onnxruntime-web@1.27.0` |
| 字典、识别 Worker、ORT 的 MJS 加载器、embed 入口 | 本站 |

CDN 地址及已核对的 SHA-256 记录在 `scripts/ocr-model-cdn.mjs`。先前下载的三个 ModelScope 文件与源清单一致；npmmirror 的 WASM 同样逐字节匹配，响应允许本站跨域读取。更新模型或引擎时需核对新版本地址、跨域响应与文件 SHA-256，再同步映射。玩家端访问 CDN 失败时不会自动转回本站。

## 发布包

`public/yuanstar-embed/` 保留完整上游镜像与来源清单。Vite 复制静态资源后，`npm run build` 的后处理从 `dist` 移除四个 CDN 文件及其旧 gzip 副本，生产包不携带它们。固定 CDN 摘要与来源清单不符时构建会失败。

仅对本地 embed 入口、识别 Worker、ORT MJS 和字典执行 gzip level 6。原文件至少 16 KiB、压缩至少节省 1 KiB 且达到 5% 才生成同名 `.gz`。构建校验解压后的内容和来源 SHA-256，结果写入 `dist/yuanstar-embed-compression.json`。本地资源可由 Nginx 的 `gzip_static on` 提供压缩副本，未协商 gzip 时仍可返回原文件。

生产切换与回退见[前端部署说明](./deployment.md)。同源地址的浏览器缓存、CDN 状态与玩家网络会影响首次下载时间，包内体积不能视作线上实际流量。

## 历史传输量（切换 CDN 前）

2026-10-03 gzip-only 正式 build 实测，单位为 MiB（2^20 bytes），不含 HTTP/TLS 开销：

| 口径 | identity bytes / MiB | gzip 6 bytes / MiB | 节省 |
| --- | ---: | ---: | ---: |
| OCR prepare 的 7 项（不含已加载的 embed entry） | 45,467,882 / 43.362 | 30,605,571 / 29.188 | 14.174 MiB / 32.69% |
| 加 embed entry 共 8 项 | 47,420,950 / 45.224 | 31,322,757 / 29.872 | 15.352 MiB / 33.95% |

与最初约 77.664 MiB 的同一 prepare 口径相比，external-WASM + gzip 累计减少约 **48.476 MiB / 62.42%**。这是正确启用 gzip static 后的首次传输理论值，不是生产已生效的声明。
