# YuanHub 鸢鸢相抱 · Vite + Vue 3 复刻版

复刻自 `/Users/mrsnake/Desktop/yituliu/app`（静态 HTML 版），使用 **Vite + Vue 3 + Vue Router** 重写。

## 运行

```bash
npm install   # 若报 npm cache 权限错误：npm install --cache /tmp/npm-cache-yuanhub
npm run dev   # http://localhost:5173
npm run build # 产物输出到 dist/
```

### API 地址配置

复制 `.env.example` 为 `.env`，按运行环境设置 `VITE_API_BASE`。Vite 会在启动和构建时读取该文件，构建完成后再修改 `.env` 不会改变已有产物。

```dotenv
VITE_API_BASE=http://127.0.0.1:8080
```

`.env` 已加入 Git 忽略规则，真实地址不应写回源码或提交到仓库。

## 页面

| 路由 | 页面 | 对应原文件 |
|---|---|---|
| `/` | 作业广场：Hero + 工具栏（Tab / 站点筛选 / 搜索 / 排序）+ 作业卡列表（分页加载）+ 三方共建 + 页脚 | `index.html` |
| `/work/no-pangtong` | 作业详情：密探阵容 / 打法要点 / 星石练度 / 作业信息 + scrollspy 侧边栏 | `detail.html` |
| `/cart` | 广陵账房（礼包购物车）：版本切换 / 汇率换算 / 分类筛选 / 购物车合计 / 累充奖励档位 / 自定义礼包 / 导出图片 | `yuanpaid/src/App.tsx` |
| `/manage` | 管理工作台：按权限进入反馈工作区、公共密探图鉴、角色管理、反馈授权和审计记录 | — |

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
    ├── App.vue                 # RouterView + 路由过渡
    ├── styles/main.css         # 设计规范 v1.0 全部令牌与样式
    ├── data/                   # avatars.js / works.js / detail.js / packages.js / rewards.js
    ├── components/             # IslandSidebar / DetailSidebar / WorkCard / SiteFooter
    │   └── cart/               # PackageCard / ReceiptPanel / CustomPackageModal
    └── pages/                  # 页面（按模块分子目录）
        ├── index.vue           # 作业广场（/）
        ├── work/detail.vue     # 通关作业详情（/work/:id）
        ├── tools/cart.vue      # 广陵账房·礼包计算器（/cart）
        └── admin/index.vue     # 管理工作台（/manage）
```

## 复刻要点

- **设计规范 v1.0**：骨架色（纸底 #F6EDD0 / 暖白卡 / 奶油 / 暖棕 / 茶棕）+ 点缀色（蜜黄 / 金橙 / 绛红 / 海盐蓝描边）全部保留为 CSS 变量。
- **交互**：Tab（作业/作业集/关卡）、站点筛选、搜索（标题/作者/密探）、排序（访问量/热度/最新）均为响应式 computed 过滤。
- **加载更多**：原站按钮无逻辑，复刻版实现了分页（每页 6 条）+ ‹ › 翻页。
- **详情页**：scrollspy 高亮 + 平滑锚点滚动 + 密探星级/星石/要点全数据化。
- **动效**：IntersectionObserver 滚动出现（v-reveal 指令，支持错峰 delay）、路由淡入淡出。
- 原站 10 条作业数据中，仅「阳泰山府10 无庞统」有详情链接，其余卡片不可点击（与原站一致）。
- **广陵账房页**（`/cart`）：由 `yuanpaid`（React 版游戏礼包购物车）迁移，数据（101+41 个礼包、28 档累充奖励）逐字保留，交互逻辑（限购、汇率、筛选、自定义、导出图片）忠实移植，并按设计规范 v1.0 整体重新上色。
- 依赖：`@lucide/vue`（图标）、`html2canvas`（导出图片）。
