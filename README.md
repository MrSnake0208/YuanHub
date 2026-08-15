# MaaYuan Share · Vite + Vue 3 复刻版

复刻自 `/Users/mrsnake/Desktop/yituliu/app`（静态 HTML 版），使用 **Vite + Vue 3 + Vue Router** 重写。

## 运行

```bash
npm install   # 若报 npm cache 权限错误：npm install --cache /tmp/npm-cache-yuanhub
npm run dev   # http://localhost:5173
npm run build # 产物输出到 dist/
```

## 页面

| 路由 | 页面 | 对应原文件 |
|---|---|---|
| `/` | 作业广场：Hero + 工具栏（Tab / 站点筛选 / 搜索 / 排序）+ 作业卡列表（分页加载）+ 三方共建 + 页脚 | `index.html` |
| `/work/no-pangtong` | 作业详情：密探阵容 / 打法要点 / 星石练度 / 作业信息 + scrollspy 侧边栏 | `detail.html` |

## 目录结构

```
├── index.html                  # 入口（Google Fonts: Archivo + Noto Serif SC）
├── vite.config.js
├── public/
│   ├── maayuan/maayuan-pattern.webp   # 大肥鸟平铺背景
│   └── icons/                          # 四方共建图标
└── src/
    ├── main.js                 # 入口 + v-reveal 滚动出现指令
    ├── router.js               # createWebHistory 路由 + scrollBehavior
    ├── App.vue                 # RouterView + 路由过渡
    ├── styles/main.css         # 设计规范 v1.0 全部令牌与样式
    ├── data/                   # avatars.js / works.js / detail.js
    ├── components/             # IslandSidebar / DetailSidebar / WorkCard / SiteFooter
    └── views/                  # PlazaView / DetailView
```

## 复刻要点

- **设计规范 v1.0**：骨架色（纸底 #F6EDD0 / 暖白卡 / 奶油 / 暖棕 / 茶棕）+ 点缀色（蜜黄 / 金橙 / 绛红 / 海盐蓝描边）全部保留为 CSS 变量。
- **交互**：Tab（作业/作业集/关卡）、站点筛选、搜索（标题/作者/密探）、排序（访问量/热度/最新）均为响应式 computed 过滤。
- **加载更多**：原站按钮无逻辑，复刻版实现了分页（每页 6 条）+ ‹ › 翻页。
- **详情页**：scrollspy 高亮 + 平滑锚点滚动 + 密探星级/星石/要点全数据化。
- **动效**：IntersectionObserver 滚动出现（v-reveal 指令，支持错峰 delay）、路由淡入淡出。
- 原站 10 条作业数据中，仅「阳泰山府10 无庞统」有详情链接，其余卡片不可点击（与原站一致）。
