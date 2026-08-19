# 密探特别关注与心纸编辑：前端交付说明

状态：后端已实现，本地可联调  
更新时间：2026-08-18  
前端仓库：YuanHub  
后端仓库：BackEndV3-Share

## 1. 交付结论

后端已提供按库存子账号隔离的密探特别关注接口，现有交换协议 v2 也已支持
<code>agent + stock_snapshot</code>。前端可以开始实现，不需要等待新的后端接口或协议版本。

后端已验证：

- 前后端密探目录均为相同的 121 个 ID；
- 同账号重复 PUT、并发 PUT、重复 DELETE 均幂等；
- 本地真实 Mongo replica set 使用 64 次 PUT、并发度 16，结果为 64 个 HTTP 200、数据库 1 行；
- 同一用户的不同库存子账号相互隔离；
- 密探快照只改变数量，不修改名称、星级、属性或职业；
- 关注不进入 current、acquired、records、export 或交换档案 v2。

本地联调前需要让 8080 后端运行最新构建。Swagger：

- <http://127.0.0.1:8080/swagger-ui/index.html>
- <http://127.0.0.1:8080/v3/api-docs>

## 2. 特别关注 API

三个接口都只接受普通登录 JWT：

~~~http
Authorization: Bearer <accessToken>
~~~

OpenAPI Token 不支持这些接口，也不需要新增 scope。

### 2.1 查询

~~~http
GET /v1/inventory/agent-favorites?account_id=acc_xxx
~~~

~~~json
{
  "status_code": 200,
  "message": null,
  "data": {
    "account_id": "acc_xxx",
    "agent_ids": [
      "char_038_luxun",
      "char_102_jianyong"
    ]
  }
}
~~~

<code>agent_ids</code> 已去重并按完整 ID 字符串升序返回。这个顺序只保证稳定，不代表发布时间。

### 2.2 添加

~~~http
PUT /v1/inventory/agent-favorites/char_102_jianyong?account_id=acc_xxx
~~~

无请求体。响应：

~~~json
{
  "status_code": 200,
  "message": null,
  "data": {
    "account_id": "acc_xxx",
    "agent_id": "char_102_jianyong",
    "favorite": true
  }
}
~~~

重复 PUT 返回成功。

### 2.3 删除

~~~http
DELETE /v1/inventory/agent-favorites/char_102_jianyong?account_id=acc_xxx
~~~

无请求体。响应中的 <code>favorite</code> 为 <code>false</code>。目标不存在时仍返回成功。

### 2.4 错误

库存错误没有 ApiResult 包装：

~~~json
{
  "error": {
    "code": "unknown_agent",
    "message": "Unknown agent id: char_999_unknown",
    "entry_id": "char_999_unknown"
  }
}
~~~

| 场景 | HTTP | error.code |
|---|---:|---|
| 未登录或 JWT 失效 | 401 | unauthorized |
| 缺少或空 account_id | 422 | schema_validation_failed |
| 子账号不存在或不属于当前用户 | 404 | account_not_found |
| 密探 ID 格式非法 | 422 | invalid_agent_id |
| 密探不在后端目录 | 422 | unknown_agent |

src/api/request.js 已能读取库存错误的 error.message，并能对 JWT 401 执行一次刷新和重放。

## 3. 前端 API 封装

在 src/api/inventory.js 沿用现有 request() 模式新增：

~~~js
listAgentFavorites(accountId)
addAgentFavorite(accountId, agentId)
removeAgentFavorite(accountId, agentId)
~~~

要求：

- auth: true；
- 查询参数使用 URLSearchParams 生成 account_id；
- path 中的 agentId 使用 encodeURIComponent；
- PUT/DELETE 不传 body；
- 函数返回 request() 解包后的 data。

## 4. 页面状态与竞态

目标页面是现有 src/pages/inventory/index.vue，不新增页面。

关注状态至少包含当前账号的 Set&lt;agentId&gt; 或等价结构、列表加载/错误状态、每个密探独立
的提交中状态，以及一个账号切换序号，用于丢弃旧账号迟到的响应。

行为要求：

1. 未登录或没有选中账号时清空关注状态且不请求。
2. 登录且选中账号后，在进入密探心纸视图时加载关注列表。
3. 切换账号先清空旧列表，再请求新账号；账号 A 的迟到响应不能写进账号 B。
4. PUT/DELETE 可以做乐观更新，但失败必须回滚并展示可操作的错误。
5. 同一密探的切换必须串行，或在请求完成前禁用其按钮，保证最终状态对应最后一次有效操作。
6. 删除账号和退出登录后不能保留上一账号或上一用户的关注显示。

不要把关注列表写入 localStorage 作为事实来源。短暂页面缓存可以有，但必须以 account_id 为 key，
并以服务端 GET 结果为准。

## 5. 密探列表交互与视觉

该功能属于“广陵库房”的高频工具，不新增 Hero、弹窗或说明卡。直接扩展密探网格：

- 每个密探格右上角放一个固定尺寸的 Lucide Star 图标按钮；
- 未关注使用暖棕细描边，已关注使用现有 --yellow / --accent 小面积填充；
- 使用 aria-pressed、明确的 aria-label 和 hover tooltip；
- 按钮提交期间保持格子尺寸不变并显示明确 busy 状态；
- 支持键盘焦点，不能只靠颜色区分；
- 动效只使用短促的颜色/缩放反馈，并遵守 prefers-reduced-motion；
- 不新增色板，不使用大面积蓝色或新的装饰卡片。

在现有筛选组中，仅密探视图增加“特别关注”筛选。默认列表和关注筛选中的密探都按发布序号排序：

~~~js
export function agentReleaseOrder(id) {
  const match = /^char_(\d+)_/.exec(String(id || ''))
  return match ? Number(match[1]) : -1
}
~~~

排序规则：可解析数字降序；无法解析的 ID 排最后；数字相同或都无法解析时按完整 ID 升序。
不要使用后端 GET 返回顺序作为发布时间顺序。

## 6. 密探心纸手动编辑

不要新增密探专用库存 API。沿用：

~~~http
POST /v1/inventory/import
GET /v1/inventory/current?account_id=acc_xxx&entity_type=agent
~~~

当前前端基线有两个必须处理的事实：

- src/pages/inventory/index.vue 把密探心纸标为“仅供查看”；
- src/data/inventory/manualStock.js 的 buildManualStockSnapshot() 把 entity_type 固定为 item。

应将快照构建器泛化为显式 entityType，并保留 item 的现有行为。建议默认值仍为 item：

~~~js
buildManualStockSnapshot({
  accountId,
  entityType: 'item' | 'agent',
  catalogVersion,
  effectiveAt,
  recordId,
  entries
})
~~~

密探编辑要求：

- 从密探工具栏的 Pencil 图标进入现有库存编辑模式；
- 使用 full stock_snapshot 保存该账号的完整密探库存；
- 只提交 id、name、count，其中只有 id 和 count 参与业务；
- 不提交 rarity、prof、sub_prof 等公共目录字段；
- 数量必须是 0 到 2147483647 的整数；
- 保存成功后重新请求 entity_type=agent 当前库存；
- 密探快照不能带入 item 条目，item 编辑也不能带入 agent 条目；
- item 原有隐藏条目保留逻辑只能用于 item，不能错误套到 agent。

特别关注与心纸数量是两套独立状态：编辑数量不能改变星标，切换星标不能生成库存流水。

## 7. 目录与图片资产

前后端目录 ID 已一致，共 121 个。当前 public/inventory-icons/agents 缺少两个目录 ID 的图片：

- char_084_chendengsp
- char_085_shizimiaosp

现有首字占位可以保证页面不空白，但正式视觉验收前应补齐可信来源的位图资源，或明确接受占位状态。
不要为了补图修改密探 ID。

## 8. 测试与验收

至少补充：

- API 封装的 GET/PUT/DELETE 路径、方法、JWT 和 URL 编码契约；
- 发布序号解析、降序、非法 ID 排末尾和稳定兜底排序；
- item 快照仍生成 entity_type=item；
- agent 快照生成 entity_type=agent，且 entries 不含静态目录字段；
- 登录/未登录、有账号/无账号状态；
- 账号 A/B 切换后关注列表隔离，旧账号迟到响应不覆盖新账号；
- PUT/DELETE 失败回滚，快速重复点击不会让 UI 与服务端最终状态相反；
- 特别关注筛选与搜索的组合，以及各分段筛选切换时状态互不污染；
- 密探保存后数量刷新，item 库存不改变。

运行：

~~~bash
npm test
npm run build
~~~

浏览器验收至少覆盖桌面和移动端，并检查键盘操作、按钮 tooltip、加载/错误状态以及账号切换。

## 9. 非目标

- 不修改库存交换档案版本 2；
- 不向交换档案添加 favorites/preferences；
- 不新增 OpenAPI Token scope；
- 不新增 release_order/release_date 字段或后端排序接口；
- 不通过库存请求更新密探公共目录；
- 不把关注状态混入 current、records、acquired 或 export；
- 不重做库存页面整体视觉结构。
