# 开发者文档维护

此文件是维护说明，不在公开白名单。公开入口为 `/developers`；场景入口及密探引导内容在 `src/data/developerUseCases.js`，技术文档注册为 `src/data/developerManifest.js`，资产白名单为 `src/data/developerAssets.js`。

## 场景入口与技术阅读器

- `/developers` 由 `src/pages/developers/index.vue` 呈现场景首页，不加载 Markdown 正文。四个入口为用户密探、用户库存、活动日历和公共游戏目录；卡片明确区分用户授权与匿名公共数据，未开放能力链接缺口清单。
- `/developers/use-cases/operator-read` 使用 `use-case.vue`，面向第三方应用开发者，展示功能权限、开发者测试账号调试、每位用户独立授权、上线安全和 AI 集成需求。包含 curl、服务端按用户读取示例、当前 DTO 与常见错误；示例存储适配器需接入第三方项目，页面不新增任何凭据存储或请求用户数据。API 根地址沿用 `API_BASE`，未配置时为当前站点；复制需求要求 AI 先调查现有项目，未提供项目时先确认平台与代码环境。
- 技术路由继续使用原有阅读器 `reference.vue`，保留文档搜索、章节、下载和代码复制。原首页 Markdown 仍在白名单中，旧 `/developers#doc-*` 深链接仍进入该正文；去掉 hash 返回新首页。
- 新场景优先添加数据配置；新增完整引导复用页面结构并显式注册公开路由。不要将场景说明当成新 API 已实现的证据。新手站内链接需要逐个加入 `developerPageLinks`，不扩大资源白名单。
- `/developers/guide` 按公开/私有能力、最小 Scope、测试账号调试、逐用户连接、多用户隔离与上线约束组织；独立的“用户操作说明”章节可通过 `/developers/guide#doc-用户操作说明` 供第三方产品引用。
- Token 创建仍在「个人中心 → 应用与数据连接 → 开发者与第三方 API」；每游戏子账号最多 5 个 Token，长期有效，创建、修改 Scope 和调用受所有者 Beta 资格限制。应用本地断开与 YuanHub“停止连接”撤销须区别说明，不虚构 OAuth。正式授权能力仅记入 `gaps.md` 的后续任务建议。

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

前两个命令是本轮页面/路由改造的定向检查。构建与 `--dist` 仅在需要发布产物验证时运行，最后一个检查比对发布文档实际集合、内容、首页脚本与 PWA 边界，不启动服务或浏览器。

人工检查首页、密探引导和指南的换行、键盘焦点、复制提示和主要入口：优先 390px 与 1440px，布局变化时按风险补充中间及极窄视口；宽屏场景两列，手机单列，无整页横向滚动。沿“读取用户密探养成 → 为测试账号创建连接码”确认既有登录入口；检查用户操作说明的可引用链接及“停止连接”用词。以 500 名玩家小程序场景确认读者能区分测试 Token 与每人独立授权，并理解本应用断开不等于撤销 Token。查看并复制 AI 需求，不附真实凭据。技术页保留目录、锚点、代码复制和 Schema 下载；代码/jsdom 检查不等于真实浏览器验收，当前任务未授权时不运行浏览器自动化。
