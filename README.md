# YuanHub 鸢鸢相抱 · Vite + Vue 3 复刻版

复刻自 `/Users/mrsnake/Desktop/yituliu/app`（静态 HTML 版），使用 **Vite + Vue 3 + Vue Router** 重写。

## 运行

```bash
npm install   # 若报 npm cache 权限错误：npm install --cache /tmp/npm-cache-yuanhub
npm run dev   # http://localhost:5173
npm run build # 产物输出到 dist/
```

### API 地址配置

在工作区根目录运行 `./dev.sh` 时，前端默认将同源 API 请求代理到本机 `http://127.0.0.1:8080`，后端默认使用 `local` profile 连接本机 MongoDB 和 Redis。本地 `.env` 保持 `VITE_API_BASE=`；需要覆盖代理目标时设置 `YUANHUB_DEV_API_TARGET`。构建部署时可按环境设置 `VITE_API_BASE`。

```dotenv
VITE_API_BASE=
YUANHUB_DEV_API_TARGET=http://127.0.0.1:8080
```

`.env` 已加入 Git 忽略规则，真实地址不应写回源码或提交到仓库。

教程当前默认软隐藏；本地显式开启方法与恢复检查见 [教程维护说明](docs/tutorials.md)。

完整前后端接口契约见 [`docs/api-contract.md`](docs/api-contract.md)。公共关卡读取使用 `/v1/level/catalog`，
关卡管理页使用 `/v1/admin/level-catalog/**`，后者需要登录 JWT 与 `level_catalog:write`。

## 一键发布

独立 clone 本仓库即可发布，不需要后端仓库或 YuanHub-All。先提交业务改动并切换到干净的 `main`，安装 Git / GitHub CLI 并执行 `gh auth login`（账号需具备仓库推送与 Actions 访问权限）：

```bash
./release-frontend.sh --dry-run auto
./release-frontend.sh auto
```

`auto` 沿用未发布的 `VERSION`，或递增已发布的 beta 版本；也可显式指定新版本。脚本等待 CI 成功后推送 tag 并等待部署完成，生产凭据沿用 GitHub 配置。配置、审批与失败恢复见 [部署说明](docs/deployment.md#4-发布流程)。

## 开发规范

涉及页面、组件或样式修改时，先阅读：

- [`docs/standards/design-system.md`](docs/standards/design-system.md)：视觉与品牌规范。
- [`docs/standards/responsive-development.md`](docs/standards/responsive-development.md)：手机 / 平板 / 桌面同步开发规范与固定验收视口矩阵。
- [`docs/standards/page-header-system.md`](docs/standards/page-header-system.md)：六种 Page Header Pattern、全站迁移表与样板页边界。
- [`docs/standards/page-development.md`](docs/standards/page-development.md)：页面目录、路由与页面交付流程。

任何 UI 功能都不得只以桌面端正常作为完成标准；响应式适配属于功能本身的一部分。

## 页面

| 路由 | 页面 | 对应原文件 |
|---|---|---|
| `/`、`/today` | 今日一览：标题 / 日期与当前账号快速切换 → 值守密探 Lobby（透明半身 WebP、本地时间问候、真实账号状态）→ 今日及未来 7 天公开活动（按截止日期优先）→ 当前账号临期订阅与数据状态。保留首次登录/建账号/数据准备引导；已有任一类数据后，缺项以可选折叠区补齐，未知或已录入项不要求重录。活动/订阅仍受日历开关与管理员内测权限限制；无可靠数据的推荐、同步健康度、最近工作区不展示 | — |
| `/work/no-pangtong` | 作业详情：密探阵容 / 打法要点 / 星石练度 / 作业信息 + scrollspy 侧边栏 | `detail.html` |
| `/cart` | 广陵账房（礼包购物车）：版本切换 / 汇率换算 / 分类筛选 / 购物车合计 / 累充奖励档位 / 自定义礼包 / 导出图片 | `yuanpaid/src/App.tsx` |
| `/changelog` | 更新日志：公开查看已审核发布的富文本与图片内容 | — |
| `/feedback` | 反馈中心 · 我的反馈：登录后提交、补充和跟进私人工单；`?new=1` 直接打开提交表单 | — |
| `/feedback/plaza` | 反馈中心 · 反馈广场：公开浏览、筛选和支持问题与功能建议 | — |
| `/co-creation` | 大饼中心：独立开发目标、推进阶段、验收清单、目标版本/日期与关联公开反馈；原许愿池已移除 | — |
| `/co-creation/admin` | 开发目标管理：新增、编辑、维护验收进度并关联公开反馈；需要 `development_goal:manage` | — |
| `/manage` | 管理工作台：按权限进入反馈工作区、公共密探图鉴、关卡管理、更新日志、角色管理、反馈授权和审计记录；各管理详情页提供返回工作台入口 | — |
| `/level/admin` | 公共关卡管理：真实 API 列表/筛选、新建编辑、归档恢复、目录树、revision 冲突提示、批量导入预览/提交与 JSON 导出；需要 `level_catalog:write` | — |
| `/admin/changelog` | 更新日志管理：所见即所得编辑、图片上传、提交审核、发布/退回/撤回；需要 `changelog:write` 或 `changelog:review` | — |
| `/demo` | 养成规划演示：示例存档、养成目标、资源缺口、收集速度和密探档案；支持 `?view=overview|targets|materials|operator` 直接打开截图视图 | — |

BOX、演示、宣传、主动安装与权限失败页的使用边界、恢复行为和定向验收见 [公开入口与访问恢复说明](docs/public-entry-experience.md)。

### 首页值守密探（V1）

标题与日期在页头左侧，右侧复用 `DataAccountContextBar` 内的 `AccountSwitcher`（游戏 + 当前账号名）；手机空间不足时仍在页头自然换行。桌面 Lobby 含页头约 316px，手机约 216px，长状态按内容增高。问候与真实资料状态在左，立绘向下自然裁切并锚定场景底部；暖白纸色减弱局部大肥鸟纹样，全站背景保留。通过「更换值守」按名字、拼音或首字母搜索并固定一位密探。状态复用已有登录、账号读取、资料读取、未知、尚未建档、部分建档和全部就绪分支，不额外请求或推测活动数量。今日活动仅在账号辅助内容实际显示时使用双栏，否则占满内容区。

选择以 `yh_today_companion:user:<YuanHub 用户 ID>` / `yh_today_companion:guest` 保存到当前浏览器的 localStorage，用户与游客隔离，不随游戏子账号切换，也不跨设备同步。清除浏览器数据会恢复默认阿蝉；无法保存时页面会提示。立绘复用 `public/assets/operator-portraits/` 与现有目录，未提供立绘的密探暂不进入选择名单。问候按设备本地时间更新，活动日程继续按原服务器日期规则处理。

已有数据时，展开「还有 N 项数据可补齐（可选）」会自动滚动到补齐区，并留出移动页头的安全距离；收起不触发额外滚动，滚动动画沿用全站减少动画设置。

V1 只支持固定值守，不包含每日随机、收藏轮换、跟随游戏账号、Live2D、Spine 或语音。

## 目录结构

```
├── index.html                  # 入口（Google Fonts: Archivo + Noto Serif SC）
├── vite.config.js
├── public/
│   ├── maayuan/maayuan-pattern.webp   # 大肥鸟平铺背景
│   └── icons/                          # 四方共建图标
└── src/
    ├── main.js                 # 入口 + v-reveal 滚动出现指令
    ├── router/                 # 路由（对齐 frontend-v2-plus 结构）
    │   ├── index.js            # createWebHistory 路由实例 + scrollBehavior
    │   └── routes.js           # 路由表 + 新页面注册注释模板
    ├── api/
    │   ├── level.js            # 公共关卡目录 + 管理员 CRUD/归档/导入导出 API 封装
    │   └── changelog.js        # 公开更新日志 + 管理审核状态流转 API 封装
    ├── App.vue                 # RouterView + 路由过渡
    ├── styles/main.css         # 设计规范 v1.0 全部令牌与样式
    ├── data/                   # avatars.js / works.js / detail.js / packages.js / rewards.js / demoScenario.js / todayData.js
    ├── components/             # IslandSidebar / DetailSidebar / WorkCard / SiteFooter
    │   └── cart/               # PackageCard / ReceiptPanel / CustomPackageModal
    └── pages/                  # 页面（按模块分子目录）
        ├── index.vue           # 历史作业广场页面（当前未注册入口）
        ├── work/detail.vue     # 通关作业详情（/work/:id）
        ├── tools/cart.vue      # 广陵账房·礼包计算器（/cart）
        ├── admin/index.vue     # 管理工作台（/manage）
        ├── changelog/          # 公开阅读与所见即所得管理页
        ├── level/admin.vue     # 公共关卡管理（/level/admin，需 level_catalog:write）
        ├── today/index.vue     # 今日一览功能入口与真实状态摘要（/、/today）
        └── demo/index.vue      # 独立演示入口（/demo，仅使用本地示例数据）
```

## 复刻要点

- **设计规范 v1.0**：骨架色（纸底 #F6EDD0 / 暖白卡 / 奶油 / 暖棕 / 茶棕）+ 点缀色（蜜黄 / 金橙 / 绛红 / 海盐蓝描边）全部保留为 CSS 变量。
- **交互**：Tab（作业/作业集/关卡）、站点筛选、搜索（标题/作者/密探）、排序（访问量/热度/最新）均为响应式 computed 过滤。
- **加载更多**：原站按钮无逻辑，复刻版实现了分页（每页 6 条）+ ‹ › 翻页。
- **详情页**：scrollspy 高亮 + 平滑锚点滚动 + 密探星级/星石/要点全数据化。
- **动效**：IntersectionObserver 滚动出现（v-reveal 指令，支持错峰 delay）、路由淡入淡出。
- **导航**：常用功能平铺直达，不增加分类标题；今日、密探、招募、库存、星石、账房依次显示，活动日历下移至账房之后。桌面侧栏底部“更多”弹出反馈、大饼中心、更新日志、内测、安装和教程；账号与连接码及登录后的通知常驻底部。≤1080px 顶栏持续显示当前页面和通知/登录，抽屉内“更多”展开同一批站点服务；账号与退出固定在抽屉底部。反馈未读在“更多”收起时仍显示。管理工作台仅按既有授权显示，所有已注册管理详情高亮该入口；URL、资格与页面工作区不变。无效地址显示 404 页面和返回首页入口。
- **实操教程**：从当前功能页的「使用教程 / 盘点教程 / 连接教程 / 登记教程」主动开始；新老用户都有稳定入口，提示跟随真实编辑区，不再显示全站任务按钮墙。Today 只在主动开始后选择本次所需的数据任务；MaaYuan、招募、安装和星石保留各自真实验证机制。关闭不清草稿、不撤销业务，回到功能页按真实状态恢复；已有成果提供复习路径，无需重复建档。入口与完成条件见 [页面内教程策略](docs/plans/global-navigation-onboarding-policy.md#页面内实操教程2026-10-08-最终收口)。
- 原站 10 条作业数据中，仅「阳泰山府10 无庞统」有详情链接，其余卡片不可点击（与原站一致）。
- **广陵账房页**（`/cart`）：由 `yuanpaid`（React 版游戏礼包购物车）迁移，数据（101+41 个礼包、28 档累充奖励）逐字保留，交互逻辑（限购、汇率、筛选、自定义、导出图片）忠实移植，并按设计规范 v1.0 整体重新上色。
- 依赖：`@lucide/vue`（图标）、`html2canvas`（导出图片）、Tiptap（更新日志编辑与渲染）、Pinia（新手引导状态）与 Driver.js（页面引导）。
