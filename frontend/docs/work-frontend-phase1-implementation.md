# YuanHub 作业系统前端第一阶段实施说明

本文是交给后续前端 Agent 的可执行需求。目标是在现有 Vue 3 前端接入已经可用的 Work API，替换作业页面中的静态演示数据，同时忠实展示 Legacy Parser 与 Adapter 的兼容性结果。

## 1. 开始前必须阅读

按以下顺序阅读，不要另建重复的设计、路由或请求体系：

1. `AGENTS.md`
2. `docs/standards/design-system.md`
3. `docs/standards/page-development.md`
4. `docs/standards/feature-flags.md`
5. `docs/exchange-specs/work-v1.md`
6. `docs/exchange-specs/work-adapters-v1.md`
7. `docs/exchange-specs/schemas/work-protocol-v1.schema.json`
8. `src/api/request.js`
9. `src/router/routes.js`
10. `src/pages/index.vue`、`src/pages/work/detail.vue`、`src/components/WorkCard.vue`

现有 `src/pages/index.vue`、`src/pages/work/detail.vue` 和 `src/data/works.js`、`src/data/detail.js` 是静态原型，只能作为视觉与信息结构参考，不能继续作为运行时数据源。

## 2. 本阶段交付目标

实现两个公开页面：

- `/works`：真实作业列表。
- `/work/:id`：真实作业详情与目标平台兼容性。

路由约束：

- 不要占用或改写 `/`；当前 `/` 和 `/today` 属于“今日一览”。
- 在 `src/router/routes.js` 注册 `/works`，页面放在 `src/pages/work/index.vue`。
- 复用已有 `/work/:id` 路由和 `src/pages/work/detail.vue`，不要增加第二条详情路由。
- `/works` 应作为“作业广场”导航入口，是否加入 feature flag 取决于明确的发布要求。若没有延后发布要求，不要为了“以后可能需要”新增开关。

本阶段只做读取和展示，不实现上传、编辑、删除、审核、点赞、收藏或导出执行。

## 3. API 接入

新增 `src/api/work.js`，复用 `src/api/request.js`，不要直接创建第二套 `fetch` 封装。三个调用均不需要登录：

```js
listWorks({ page = 1, limit = 20 })
// GET /v1/works?page=<page>&limit=<limit>

getWork(id)
// GET /v1/works/<id>

getWorkCompatibility(id, target)
// GET /v1/works/<id>/compatibility?to=MAAYUAN|YUANASSIST
```

路径参数与查询参数必须使用 `encodeURIComponent`。`request()` 已解包统一的 `ApiResult`，API 模块应直接返回 `data`，不要让页面重复判断 `status_code`。

### 3.1 列表响应

```json
{
  "page": 1,
  "limit": 20,
  "total": 2039,
  "has_next": true,
  "items": [
    {
      "id": 29811,
      "title": "作业标题",
      "stage_name": "关卡名或 null",
      "game": "如鸢、代号鸢或 null",
      "level": {
        "id": "Level Catalog 的稳定 key",
        "game": "如鸢",
        "name": "关卡名称",
        "level_id": "来源关卡 ID",
        "stage_id": "来源 stage ID"
      },
      "uploader_id": "上传者 ID 或 null",
      "upload_time": "ISO LocalDateTime 或 null",
      "views": 14,
      "hot_score": 8.65,
      "conversion_status": "exact|partial|unsupported",
      "issue_count": 0
    }
  ]
}
```

`level`、`stage_name`、`game`、`uploader_id`、`upload_time` 都可能为空。前端必须提供中性 fallback，不得伪造关卡、作者或发布时间。

### 3.2 详情响应

```json
{
  "metadata": {
    "id": 29811,
    "title": "作业标题",
    "uploader_id": "上传者 ID 或 null",
    "upload_time": "ISO LocalDateTime 或 null",
    "views": 14,
    "hot_score": 8.65,
    "like_count": 2
  },
  "level": null,
  "conversion": {
    "status": "exact|partial|unsupported",
    "issues": []
  },
  "work": {
    "format": "yuanhub-work",
    "version": 1,
    "game": "如鸢",
    "level_id": "可选",
    "stage_name": "关卡名",
    "doc": { "title": "标题", "details": "说明" },
    "operators": ["王粲", "赵云", null, null, null],
    "exec": {},
    "rounds": [
      {
        "round": 1,
        "actions": [{ "slot": 1, "type": "attack" }]
      }
    ]
  },
  "source": {
    "type": "maayuan_legacy",
    "id": 29811,
    "raw_content": "完整原始 JSON 字符串"
  }
}
```

`work` 可能为 `null`。此时仍须展示 metadata、conversion issues 和 raw source，不能把页面整体当成 404。Work 内部字段与动作结构以 `work-v1.md` 和 JSON Schema 为准。

### 3.3 兼容性响应

```json
{
  "target": "MAAYUAN",
  "status": "exact|partial|unsupported",
  "issues": [
    {
      "code": "unsupported_source_node",
      "path": "$.actions['回合1行动1']",
      "feature": "custom_action:unknown",
      "message": "面向用户的说明",
      "severity": "partial|unsupported"
    }
  ],
  "target_document": {
    "round_actions": {
      "1": [["1普"], ["2大"]]
    }
  }
}
```

- `target_document` 是可选字段。
- MAAYUAN 只有 `exact` 时才会返回阶段性的标准化文档；该文档不是完整 MaaFramework Pipeline，不要提供“一键执行”或“下载 Pipeline”按钮。
- YUANASSIST 第一阶段只返回分析结果，不返回 `target_document`。即使 `status=exact`，也只表示现有动作语义可表达，不表示导出功能已经完成。

## 4. `/works` 列表页要求

复用现有静态作业广场的暖色纸张视觉，但数据、状态与交互必须改为真实 API。

### 必须实现

- 首次加载、加载失败并重试、空列表、正常列表四种状态。
- 使用后端 1-based 分页；建议把当前页同步到 `route.query.page`，保证刷新、返回和分享链接稳定。
- 卡片点击进入 `/work/<id>`。
- 每张卡展示：标题、游戏、关卡名称或 stage fallback、上传者 ID fallback、发布时间 fallback、浏览量、热度、转换状态和 issue 数量。
- `exact`、`partial`、`unsupported` 使用文字加颜色共同表达，不能只靠颜色。
- 桌面和移动端都必须可用；交互按钮触控高度至少沿用项目现有标准。

### 不要实现或伪装

- 后端当前不支持搜索、标签筛选、游戏筛选、自定义排序。不要只对当前一页结果做客户端搜索后宣称是全站搜索。
- 列表摘要没有 operators、details 和 like count。不要逐卡请求详情来补齐这些字段，也不要继续使用静态阵容或头像；这会形成 N+1 请求和真假数据混合。
- 现有“作业集”“关卡”标签页没有对应 API。应移除、隐藏或明确标为尚未开放，不能展示静态假数据。

如产品确实需要搜索、筛选或阵容摘要，应先扩展后端列表契约，再接入前端。

## 5. `/work/:id` 详情页要求

### 页面状态

- loading：保留稳定页面骨架，不闪现“找不到”。
- 404：显示“作业不存在、非公开或已删除”，提供返回作业广场入口。
- 其他错误：显示后端错误或网络错误，并提供重试。
- `work=null`：展示“原作业暂时无法转换”，继续显示 compatibility issues 与 raw source。
- 正常：展示协议内容、外层元数据、来源和兼容性。

路由 ID 必须验证为正整数；非法 ID 不发请求，直接显示无效链接状态。

### 信息区块

至少包含：

1. 标题、游戏、关卡、上传时间、浏览量、点赞数、热度。
2. Level Catalog 关联；`level=null` 时显示“未可靠关联”，不要隐藏成已匹配。
3. 五个固定槽位；`null` 显示“未指定”。头像只能在本地 `AV` 映射存在时使用，否则显示文字占位，不得产生破图。
4. `doc.details` 原样按纯文本换行展示。
5. 回合动作表。
6. Legacy 转换状态与 issues。
7. MAAYUAN、YUANASSIST 两个兼容性面板，按需请求并缓存当前页面生命周期内的结果。
8. 折叠的 raw source 查看区，提供复制原始 JSON；默认不要展开长内容。

后端内容属于不可信文本。`doc.details`、issue message/path、raw source 和所有元数据禁止使用 `v-html`，应使用文本插值或 `textContent`，并用 CSS `white-space: pre-wrap` 保留换行。

## 6. 回合动作展示

遵循设计规范的“回合 × 五密探槽位”跟打表，同时保留动作原始顺序。推荐列：

```text
回合 | 1号位 | 2号位 | 3号位 | 4号位 | 5号位 | 流程 / 检查
```

同一回合的每个动作显示顺序号，避免把动作分列后丢失执行顺序。基础动作映射：

| Work action | 展示 |
|---|---|
| `attack` | `A 普攻` |
| `ultimate` | `↑ 大招` |
| `defense` | `↓ 防御` |
| `sp` | `圈 SP` |
| `wait` | `等待 <duration_ms>ms` |
| `switch_target` | `向左/向右切目标`，有 count 时显示次数 |
| `auto_battle` | `开启/关闭自动战斗` |
| `interaction` | `关卡内互动` |
| `operator_action` | `指定槽位切换形态` |
| `restart` | `立即重开` |
| `check` | 根据 condition 显示检查条件和失败行为 |
| `pause` | `暂停` |

检查条件至少覆盖：全员存活、指定槽位存活、指定槽位仍在场、鹦鹉复制、龙气比较、橙/紫/蓝星比较、暴击。不得把未知动作或条件静默过滤；显示“未知动作”及其安全序列化内容。

## 7. 兼容性展示规则

- 页面顶部的 `conversion` 表示 Legacy Source → Work v1 的转换结果。
- MAAYUAN/YUANASSIST 面板表示 Work v1 → 目标平台的结果。两层状态不能混为一个徽标。
- issue 至少展示 `severity`、`message`、`feature` 和 `path`；详细技术字段可放在可展开区域。
- `partial` 必须说明“存在明确降级，不建议直接执行”。
- `unsupported` 必须说明“关键语义无法安全表示”。
- 没有 `target_document` 时不要显示空下载按钮。
- 有 MAAYUAN `target_document` 时可以提供“查看/复制标准化文档”，按钮文字必须避免暗示这是最终可执行 Pipeline。

## 8. 文件建议

保持最小充分结构，优先修改或新增：

```text
src/api/work.js
src/pages/work/index.vue
src/pages/work/detail.vue
src/components/WorkCard.vue
src/router/routes.js
test/workApi.test.js
test/workPages.test.js
```

只有详情页确实过长时，才拆出 `WorkRoundTable.vue` 或 `WorkCompatibilityPanel.vue`。不要先建空 Store、Repository、DTO class 或通用渲染框架。

替换完成后，用 `rg` 确认 `src/data/works.js`、`src/data/detail.js` 是否还有调用方；仅在确认无引用时删除，避免误删其他原型依赖。

## 9. 测试与验收

### 自动测试

至少覆盖：

- API 路径、分页参数、ID 和 target 编码正确。
- 列表对 nullable 字段、三种转换状态和分页边界处理正确。
- 详情对 404、普通错误、`work=null`、五槽位 null、未知动作处理正确。
- MAAYUAN 有/无 `target_document`，YUANASSIST 无目标文档。
- 页面源码不再从静态 WORKS/DETAILS 读取生产数据。
- 不使用 `v-html` 渲染后端作业内容。

运行：

```bash
npm test
npm run build
```

### 浏览器验收

- `/works`：加载、翻页、刷新、前进后退、空态、失败重试、移动端布局。
- 从列表进入 `/work/:id`，再返回列表时保留页码。
- 详情正常作业、`work=null` 作业和不存在 ID 都有清晰状态。
- 两个兼容性面板不会串数据；切换作业 ID 后旧请求结果不会覆盖新页面。
- raw source 默认折叠，展开和复制可用，长 JSON 不撑破移动端。
- 键盘可访问，焦点可见，状态变化有 `aria-live`，并尊重 `prefers-reduced-motion`。

## 10. 明确不在本阶段范围

- Work 上传、编辑、删除、审核、点赞、收藏。
- 作业集和关卡聚合页。
- 全站搜索、筛选和服务端排序。
- MAAYUAN 最终 Pipeline 下载或一键执行。
- YUANASSIST 原生脚本导出。
- 根据 raw Pipeline 猜测未进入 Work v1 的视觉或战斗信息。
- 用前端静态数据填补后端缺失字段。

完成后应汇报：修改文件、页面能力、API 对接情况、自动测试、构建结果、浏览器验收结果，以及仍受后端第一阶段限制的功能。
