# AGENTS.md — MaaYuan Share（YuanHub）

本仓库是 **MaaYuan Share 作业分享站**（Vue 3 + Vite + vue-router 4）的复刻/自建实现。

> 本项目借鉴了其他项目，但**必须严格遵守以下两份规范**：
> 1. 设计规范：《/Users/mrsnake/Desktop/yituliu/app/设计规范.md》
> 2. 页面开发流程：《/Users/mrsnake/Desktop/yituliu/frontend-v2-plus/docs-md/1-基础开发示例-新建页面.md》
>
> 任何新增页面、组件、样式、配色，都必须先对照这两份规则，再动手实现。

---

## 规则一：设计规范（MaaYuan Share 设计规范 v1.0）

> 本站由 **MAA · 代号鸢BWiki · 辟雍学宫 · YuanAssist** 四方共建。
> 定位：MAA 主导的 JSON 作业站，同时是各家功能的联合看板入口。
> 目标用户：如鸢 / 代号鸢玩家（女性向），整体气质：温暖、柔和、书卷气。

### 1. 色彩体系

#### 1.1 骨架色（四方最大公约数，不可动）

| 角色 | 色值 | 用途 |
|---|---|---|
| 纸底 `--paper` | `#F6EDD0` | 页面底色（叠加 MAA 大肥鸟平铺图） |
| 暖白卡 `--surface` | `#FFFDF6` | 卡片、表格、浮层 |
| 奶油 `--cream` | `#FFF8EC` | 侧边栏、深色块上的文字 |
| 暖棕 `--ink` | `#493B2C` | 正文标题、主要文字 |
| 茶棕 `--tea` | `#5A4633` | **深色块担当**：公告条、主按钮、页脚、标签底 |

#### 1.2 品牌 / 点缀色（克制使用）

| 角色 | 色值 | 规则 |
|---|---|---|
| 蜜黄 `--yellow` | `#EFD28E`（降饱和） | MAA 身份色。只用于小面积：选中态、标签底、hero 装饰。**禁止与蓝色大块对撞** |
| 金橙 `--accent` | `#D78935` | 辟雍同源色。hover、强调数字 |
| 绛红 `--rouge` | `#A6514A` | YuanAssist 同源色。全站 ≤3 处：点赞/热度等极小点缀 |
| 海盐蓝 `--brand-blue` | `#5B6A8C` | **只做描边**：MaaYuanShare 品牌标签、外链标识、hover。降级为"青花线"，禁止大面积填充 |

#### 1.3 马卡龙高亮色（信息色，仅用于跟打表）

薄荷绿 `#BFDCC0` / 雾蓝 `#C3CFDA` / 粉 `#F0CFC8` / 杏黄 `#F0E0AE`
—— 模仿荧光笔划重点，与 BWiki 生成的跟打图语法一致。

#### 禁令
- 不用纯黑；不用黑底黄字
- 不大面积填充海盐蓝（宜家感来源）
- 荧光黄大标题块（小红书作业风）不进站点 chrome

### 2. 字体

- **标题**：思源宋体（Noto Serif SC，免费商用）900 重 + 加宽字距 ≈ 书法感
- **正文/小字号**：PingFang SC / 微软雅黑（保证可读性）
- **数字**：Archivo（表格、统计数字）

### 3. 背景

`body` 固定平铺 `/maayuan/maayuan-pattern.webp`（2400px，fixed），
上叠两层白色径向高光 + 米黄渐变。MAA 大肥鸟各造型 = 本站吉祥物，不可丢。

### 4. 各家身份色（看板/共建区用）

| 方 | 身份色 | 吉祥物/icon |
|---|---|---|
| MAA | 蜜黄 | 大肥鸟（多造型，背景图同款） |
| 代号鸢 BWiki | 茶棕 | 编辑部鸟（icons/bwiki.png） |
| 辟雍学宫（小程序） | 金橙 | 广陵王配色（icons/piyong.png） |
| YuanAssist（App） | 绛红 | 小圆鸟（icons/yuanassist.png） |

### 5. 核心组件约定

#### 5.1 左侧看板（规划重点）
企鹅物流式联合看板：作业广场为本站功能，其余条目一键跳转各家原站。
每条目 = 小圆点（各家身份色）+ 名称 + 提供方，外链带 ↗ 标识。
形态对齐各家：胶囊 / 大圆角 / 细描边。

#### 5.2 跟打表（四方拉通的"货币"）
- 结构：回合 × 密探五列 + 备注列；记号语法 `↑上拉开大 · ↓下拉防御 · A 平A · 圈 特殊技能`
- 米白表底、茶棕表头、细棕线、超大圆角
- 关键动作用 1.3 马卡龙色块高亮（与 BWiki 出图一致，用户无缝识别）
- 备注列放控血 / 重开 / 赌点条件

#### 5.3 标签
- 分类标签：蜜黄底棕字
- 站点标签（如鸢/代号鸢）：透明底 + 描边
- 品牌标签（MaaYuanShare）：海盐蓝描边（学 YuanAssist 站内样式）

### 6. 参考渊源速查

- BWiki：米白 + 茶棕 + 马卡龙荧光笔（表格高亮语法来源）
- 辟雍：奶油杏 + 金橙 + 魂魂染色卡（吉祥物染色思路来源）
- YuanAssist：宣纸 + 绛红 + 金线 + 书法字（标题字体方向来源；MaaYuanShare 蓝边标签来源）

---

## 规则二：新建页面开发流程（基础开发示例）

> 来源：《/Users/mrsnake/Desktop/yituliu/frontend-v2-plus/docs-md/1-基础开发示例-新建页面.md》
> 流程主旨：**新建页面 = ① 建页面文件 + ② 注册路由**，两步即可访问。

### 示例：创建"材料价值列表"页面（路径 `/material/value`）

1. **建页面文件**：在项目的 `/src/pages/material/` 目录下新建 `value.vue` 文件。
2. **注册路由**：在 `/src/router` 目录下的 `routes.js` 文件中，按照注释的格式写入新建页面的路由信息，即可访问页面。

### 页面文件示例（demo.page.vue）

```vue
<template>
  <button style="width: 40px;height: 24px;line-height: 22px" @click="data = '111111'">
    {{ data }}
  </button>
</template>

<script setup>

import { ref } from "vue";

const data = ref('');
</script>

```

### 本仓库结构已与原规范对齐

> 项目体量与参考项目（frontend-v2-plus）保持一致，目录结构直接沿用原规范，**无需任何映射**：
> - 页面统一放在 `/src/pages/<模块>/` 下（参考：`src/pages/index.vue`、`src/pages/work/detail.vue`、`src/pages/tools/cart.vue`）；
> - 路由拆分为 `/src/router/routes.js`（路由表 + 顶部注释模板）与 `/src/router/index.js`（创建路由实例，`import { routes } from './routes.js'`）。

即：在本仓库新建页面时——
1. 在 `/src/pages/<模块>/` 下新建页面 `.vue` 文件（如材料价值页 `/src/pages/material/value.vue`）；
2. 在 `/src/router/routes.js` 中按照顶部注释模板的格式，写入新建页面的路由信息（path / text / name / display / module / icon / component / meta）；
3. 新增页面的样式、配色必须同时满足上面"规则一：设计规范"。

---

## 变更检查清单（提交/改动前自查）

- [ ] 新增页面走"建文件 + 注册路由"两步流程（规则二）
- [ ] 颜色只用设计规范中的色值（骨架色 / 点缀色 / 马卡龙色），未违反禁令
- [ ] 无纯黑、无大面积海盐蓝填充、无黑底黄字、无荧光黄大标题块
- [ ] 标题用思源宋体 900 + 加宽字距；正文用 PingFang SC / 微软雅黑；数字用 Archivo
- [ ] 背景保留大肥鸟平铺图 + 白色径向高光 + 米黄渐变
- [ ] 左侧看板条目 = 身份色圆点 + 名称 + 提供方，外链带 ↗
- [ ] 标签：分类=蜜黄底棕字；站点=透明底描边；品牌=海盐蓝描边
