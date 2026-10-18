# 开发者文档维护

此文件是维护说明，不在公开白名单。公开入口为 `/developers`，页面注册为 `src/data/developerManifest.js`，资产白名单为 `src/data/developerAssets.js`。

## 权威来源

| 内容 | 权威源 |
|---|---|
| 公开接入、API、矩阵、协议记录 | 本目录对应 Markdown；依据后端控制器、权限、Security/Beta Policy 和服务重新核实 |
| 库存 V2 / Work V1 / 旧密探 V2 | `docs/exchange-specs/` 中正文与 Schema |
| 密探 V3/V4/V5 | `docs/operator-growth-data-exchange-protocol-v*.md`、`docs/schemas/`；接入导航仅链接正文 |
| 招募 V1 正文/示例 | 本目录 `recruitment-v1.md`、`examples/recruitment-v1.json` |
| 招募 V1 Schema | 后端 `docs/schema/recruitment-exchange-v1.schema.json`；本目录 schemas 是发布快照，不人工编辑 |

已有后端运行时密探 Schema 副本继续由原业务工作流维护。本中心不额外复制协议 Markdown，不把 api-contract 或后端 docs 整体公开。

## 发布流程

1. 修改唯一权威正文/Schema/示例，核对实际代码，更新 `changelog.md` 与支持矩阵。
2. 如果后端招募 Schema 变化，在双仓工作区执行 `node scripts/sync-developer-schema.mjs --write`；执行不带 --write 的同一命令检查完全一致。前端独立 checkout 不运行同步，不依赖后端仓库。
3. 新公开文件必须逐个加入 `developerAssets.js` 的 literal glob，并在 `developerManifest.js` 注册页面或下载链接。禁止目录通配；本 README、审计、规划、后端 Swagger、配置不加入。
4. 按现有 CI/release 流程运行 `npm ci` 与 `npm run build`。Vite 将白名单资源变为带内容 hash 的 Markdown/JSON URL，随 dist 自动发布，无手工上传，也不改服务器激活流程。

`?url&no-inline` 强制正文/JSON 独立资源；页面懒加载，选中正文才 fetch，下载文件按需请求。PWA 当前只 precache JS/CSS；如果以后扩大 glob，仍必须排除文档 Markdown/JSON。更新正文改变内容 hash，避免旧 URL 命中旧内容；已打开旧页面需刷新获取新构建索引。

页面只渲染 Markdown tokens 对应的 Vue 元素，不使用 v-html/innerHTML；原始 HTML 显示为文本，不加载 Markdown 图片。相对文档链接只能指向白名单；站内页面链接只允许明确批准路径，外链仅 HTTP(S)，危险 scheme 降级文本。

## 定向检查

```bash
node --test test/developerDocs.test.js
npx --no-install vitest run behavior/developers.spec.js
npm run build
node scripts/check-developer-docs.mjs --dist
```

最后一个检查比对发布文档实际集合、内容、首页脚本与 PWA 边界，不启动服务或浏览器。人工检查 `/developers` 的桌面目录、手机折叠目录、锚点、代码复制和 Schema 下载；代码检查不等于浏览器验收。
