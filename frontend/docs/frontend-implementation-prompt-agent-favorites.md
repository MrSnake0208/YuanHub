# 前端实施 Prompt：密探特别关注与心纸手动编辑

将下面内容完整发送给负责 YuanHub 前端的编码代理。开始时同时提供 YuanHub 和
BackEndV3-Share 仓库路径，以及 docs/frontend-handoff-agent-favorites.md 和 docs/api-contract.md。

~~~text
你正在修改 MaaYuan Share / YuanHub 的 Vue 3 + Vite 前端。

目标：
1. 在现有“广陵库房”密探心纸视图接入按库存子账号隔离的云端“特别关注”；
2. 使用现有库存交换协议 v2 支持密探心纸手动数量编辑；
3. 按密探 ID 数字段展示最新发布顺序；
4. 保持 item 库存、导入导出、时段统计和账号管理行为兼容。

权威材料：
- ~/BackEndV3/docs/frontend-handoff-agent-favorites.md
- docs/api-contract.md
- docs/inventory-agent-heart-paper-backend-spec.md
- 后端 Swagger：http://127.0.0.1:8080/swagger-ui/index.html

开始前：
- 完整阅读 YuanHub/AGENTS.md；
- 阅读 src/api/request.js、src/api/inventory.js、src/pages/inventory/index.vue、
  src/data/inventory/manualStock.js、src/data/inventory/catalog.js 和现有 test/*.test.js；
- 阅读后端 InventoryController 与关注响应 DTO，不能根据旧文档猜测字段；
- 检查 git status，保留并兼容工作树中与本任务无关的已有改动；
- 使用现有 Vue Composition API、request()、CSS 变量、Lucide 和 node:test，不引入
  Pinia、Axios、UI 框架或新测试框架。

后端已完成：
- GET /v1/inventory/agent-favorites?account_id=acc_xxx
- PUT /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
- DELETE /v1/inventory/agent-favorites/{agentId}?account_id=acc_xxx
- 三个接口只接受普通登录 JWT；PUT/DELETE 无 body 且幂等；
- GET data={account_id,agent_ids}；
- PUT/DELETE data={account_id,agent_id,favorite}；
- 账号越权按 account_not_found 返回 404；
- agent full/listed stock_snapshot 已支持；
- 本地真实 Mongo 64 次 PUT、并发度 16 已验证为 64 个 200、数据库 1 行。

A. API 封装

在 src/api/inventory.js 按现有风格新增：
- listAgentFavorites(accountId)
- addAgentFavorite(accountId, agentId)
- removeAgentFavorite(accountId, agentId)

要求 auth:true；account_id 用 URLSearchParams；agentId 用 encodeURIComponent；
PUT/DELETE 不发送 body；沿用 request() 自动解包和 JWT 刷新；不增加 OpenAPI Token scope。

B. 特别关注状态

在现有 src/pages/inventory/index.vue 内实现，不新增页面：
- 关注列表严格属于当前 accountId；
- 未登录或无账号时清空且不请求；
- 进入密探视图时加载；
- 切换账号时先清空，再加载新账号；
- 使用请求序号或等价方式，保证账号 A 的迟到响应不会覆盖账号 B；
- 每个 agentId 独立 busy；
- PUT/DELETE 可乐观更新，但失败必须回滚并显示错误；
- 同一 agentId 的操作必须串行或提交中禁用，避免快速点击导致最终状态反转；
- 登出和删除账号后清理状态；
- 不把云端事实状态持久化到 localStorage。

C. 密探网格 UI

保持现有“广陵库房”结构，不新增 Hero、弹窗或说明卡：
- 在密探格右上角使用固定尺寸的 Lucide Star 图标按钮；
- 未关注使用现有暖棕描边，已关注仅用 --yellow/--accent 小面积填充；
- 使用 aria-pressed、aria-label、键盘 focus 和 tooltip；
- hover/busy/选中不能引起卡片位移，不能只靠颜色表达状态；
- 动效短促克制并支持 prefers-reduced-motion；
- 不新增色板，不使用大面积海盐蓝，不嵌套卡片。

在现有筛选区中只对 agent 增加“特别关注”筛选，并确认它可与搜索组合，
且在全部/已持有/未持有/特别关注之间切换时状态互不污染。

D. 发布顺序

新增可独立测试的纯函数，解析 /^char_(\d+)_/：
- 数字越大越新，按数字降序；
- 无法解析的 ID 排最后；
- 数字相同或都无法解析时按完整 ID 升序；
- 不使用 GET favorites 返回顺序作为发布顺序；
- 不修改目录 ID，不向后端请求 release_order/release_date。

E. 密探心纸编辑

不要新增密探专用 API，继续使用 POST /v1/inventory/import 和
GET /v1/inventory/current?account_id=...&entity_type=agent。

当前 src/data/inventory/manualStock.js 把 entity_type 固定为 item。将
buildManualStockSnapshot() 泛化为接收 entityType:'item'|'agent'，建议默认 item，
确保原有 item 调用和测试不回归。

在密探工具栏提供 Pencil 图标入口并复用现有编辑器：
- agent 保存 full stock_snapshot；
- entries 只构建 id、name、count；
- 不提交 rarity、prof、sub_prof 或其他公共目录属性；
- count 只能是 0..2147483647 的整数；
- 保存成功重新加载 agent current；
- agent 快照绝不能混入 item，item 快照绝不能混入 agent；
- preserveHiddenStockEntries 仅用于 item；
- 编辑库存不能改变关注，切换关注不能生成库存流水或触发导入。

F. 图片资产

前后端目录均为 121 个 ID。当前 public/inventory-icons/agents 缺：
- char_084_chendengsp
- char_085_shizimiaosp

现有首字占位可以保底，但正式验收前应从可信来源补齐位图或明确记录仍使用占位。
不要修改 ID 来迁就文件名。

G. 测试

沿用 node:test，至少覆盖：
- 三个 API 的 path/method/auth/account_id/URL 编码；
- 发布顺序解析和稳定排序；
- item 快照保持 entity_type=item；
- agent 快照为 entity_type=agent，且不含静态目录字段；
- 同一账号关注切换、同一用户两个账号隔离；
- 切换账号时旧响应不污染新账号；
- PUT/DELETE 失败回滚和快速重复操作；
- 未登录和无账号不请求；
- favorites 与 search 的组合，以及 all/owned/missing/favorites 分段切换；
- agent 保存后刷新，item 行为不回归；
- 更新 test/contract.test.js，验证前后端关注路径和 snake_case 字段仍一致。

运行：
- npm test
- npm run build

完成后使用真实本地后端做浏览器验收：
- 浏览器 A 在账号 A 加关注，刷新后仍存在；
- 同一登录用户另一浏览器选择账号 A 能读到；
- 切到账号 B 不出现，B 单独关注后只存在于 B；
- DELETE 后刷新不再出现；
- 密探数量可保存并刷新；
- 关注操作前后 records/acquired/export 不变化；
- 桌面和移动端无重叠，星标支持键盘、tooltip 和加载/错误状态。

不要做：
- 不修改交换协议 version=2；
- 不添加 favorites/preferences 到导入导出；
- 不增加 OpenAPI Token scope；
- 不增加后端排序字段或接口；
- 不通过库存写入修改密探目录；
- 不重构无关库存模块或覆盖现有未提交改动。

最终报告：
- 修改文件；
- API 和状态流；
- UI 行为；
- 测试命令与结果；
- 真实联调结果；
- 缺失图片是否已补齐；
- 尚存风险。
~~~
