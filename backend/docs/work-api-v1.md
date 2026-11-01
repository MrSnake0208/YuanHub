# Work API v1

YuanHub Work 以 `yuanhub-work@1` 为原生创作事实源，同时从 `MaaBackend.maa_copilot` 实时只读转换旧公开作业。原生作业存入 `HubBackend.hub_works`；Legacy 数据不复制、不回写。

## 接口

### `GET /v1/works?page=1&limit=20`

返回 1-based 分页结果：`page`、`limit`、`total`、`has_next`、`items`。`limit` 范围为 `1..100`。列表按发布时间倒序有限合并 Legacy 与原生 PUBLIC Work；旧 ID 是数字字符串，新 ID 是 `w_<ObjectId>`。

### `GET /v1/works/{id}`

返回社区元数据、可靠匹配时的 Level 摘要、`conversion` 和 `work`。Legacy 详情保留未经改写的 `source.raw_content`；原生详情使用 `source.type=native`，不伪造 raw source。不存在、不可见或已删除的作业统一返回 HTTP 404。

原生详情的所有权与并发字段位于 `data.metadata`：`owner_id`、`status`、`revision`、`created_at`、`updated_at`、`published_at`。我的作业列表则在每个 `data.items[]` 上提供 `owner_id`、`status`、`revision`、`updated_at`。

`conversion.status` 为 `exact`、`partial` 或 `unsupported`。无法确定的 Pipeline 节点会出现在 `conversion.issues`，并携带原 JSON path；不会被静默丢弃。

### `GET /v1/works/{id}/compatibility?to=MAAYUAN|YUANASSIST`

MAAYUAN 仅在全部语义 `exact` 时返回 `target_document.round_actions`。YUANASSIST 同样只在全部语义 `exact` 时返回原生 `target_document`：

```json
{
  "scriptContent": "1回合\t1A\t\t\t\t",
  "instructions": [
    { "turn": 1, "step": 1, "type": "PAUSE", "value": 0 }
  ],
  "config": {
    "intervalAttack": 5000,
    "intervalSkill": 5000,
    "waitTurn": 7800
  }
}
```

`target_document` 内保留 YuanAssist 原生 camelCase 字段；API 外层仍使用 snake_case。

### 原生创作接口

```text
POST   /v1/works
GET    /v1/works/mine?page=1&limit=20
PUT    /v1/works/{w_id}
POST   /v1/works/{w_id}/publish
POST   /v1/works/{w_id}/unpublish
DELETE /v1/works/{w_id}
```

- 创建请求为 `{ "document": <yuanhub-work@1> }`，创建状态固定为 `DRAFT`，owner 只取当前 JWT。
- 整体替换请求为 `{ "expected_revision": 1, "document": <yuanhub-work@1> }`。
- 发布、取消发布、删除请求为 `{ "expected_revision": 1 }`。
- 更新、状态变更和软删除每次成功都令 revision 加一。revision 冲突返回 HTTP 409，`data.current_revision` 给出服务端当前值。
- 非 owner 与不存在统一返回 HTTP 404；删除是软删除，删除后不出现在公开列表或“我的作业”中。
- 发布门禁只校验基础协议，不要求 MaaYuan 或 YuanAssist Adapter 达到 `exact`。

### `POST /v1/works/compatibility?to=MAAYUAN|YUANASSIST`

请求为 `{ "document": <yuanhub-work@1> }`，用于未保存文档预览并复用与保存后 GET compatibility 相同的 Adapter。该接口不写数据，可匿名调用。

输入结构或语义错误返回 HTTP 400，`data` 是 `{path, code, message}` 数组，例如：

```json
{
  "status_code": 400,
  "message": "WorkDocument 校验失败",
  "data": [
    { "path": "$.rounds[0].actions[1].slot", "code": "out_of_range", "message": "数值必须在 1..5" }
  ]
}
```

所有成功响应使用项目统一 `ApiResult`，字段按 snake_case 输出。非法分页或目标返回 HTTP 400。

## 第一阶段未实现或未完整支持

以下项目是当前明确保留的后续工作。调用方不得因接口返回了 `work`，就假定所有目标平台都能直接执行；应始终检查对应目标的 `status` 和 `issues`。

### 通用能力

- 未实现审核工作流、多人协作、自动保存、恢复软删除或独立搜索索引。
- 未实现作业搜索、标签筛选、游戏筛选、关卡筛选和自定义排序；列表目前只有基础分页。
- 未提供通用导出接口。兼容性接口只负责分析，并在满足当前 Adapter 的无损条件时返回阶段性目标文档。
- 未使用 JSON Schema 对每次响应做运行时二次校验；合法性目前由类型模型、Parser 边界检查和契约测试保证。
- 缺失或冲突的游戏、标题、关卡名、回合信息不会被猜测补全，必要字段不足时 `work` 为 `null`。阵容不足五项时以 `null` 保留空槽位，超过五项时只保留协议允许的五槽位并报告 compatibility issue；详情始终保留 raw source。

### Legacy Parser

- 仅实现已验证的 MaaYuan-SiMing 标准节点、旧式回合图和当前 CustomAction。任意自定义 Pipeline 节点、未知分支或缺失 `custom_action` 的 Custom 节点尚无转换规则。
- 不把 MaaFramework 的 Click、Swipe、ROI、模板识别等底层实现反推为 Work 动作；只有已验证的 `text_doc`、CustomAction 和标准分支语义会进入协议。
- 未实现对未知 Pipeline 图的通用控制流求值。不能确认的节点会产生 `unsupported_source_node`，原始内容保留在 `source.raw_content`。
- 超出 Work Protocol v1 边界的数据，例如回合号不在 `1..50`、等待或延迟超限、标题或说明超长，不会被截断或静默修正。

### Level Catalog 关联

- 只支持稳定 ID、stage ID 或名称的唯一精确匹配；未实现模糊匹配、别名表和人工映射覆盖。
- 候选不唯一或证据不足时省略 `level_id`，不会为了关联成功而选择任意 Level。
- Level Catalog 只用于引用和导航信息补充，不会把 Level 数据复制进 Work，也不会用 Level 内容改写战斗动作。

### MAAYUAN Adapter

- 当前 `target_document` 是标准化 `round_actions`、延迟和 MaaYuan 扩展，不是完整 MaaFramework Pipeline；尚未接入 SiMing `ConfigGenerator` 生成最终 Pipeline。
- 仅 `exact` 时返回 `target_document`。`partial` 和 `unsupported` 不会输出可能被误执行的降级文档。
- `pause`、`auto_battle(false)`、暴击检测和非 `restart` 的检测失败行为尚无稳定映射。
- `operator_action(switch_form)` 目前只有目标槽位明确为吕布时可无损映射。
- 龙气仅支持“指定槽位 `>= 2`”，星检测仅支持橙、紫、蓝的“`>= 1`”；其他比较条件不支持。
- 当前 SiMing 共用 SP 与大招延迟；两者配置不一致时标记为 `partial`，不会静默选取其中一个。

### YUANASSIST Adapter

- 基础槽位动作编译为 `A / ↑ / ↓ / 圈`，动作序号按每回合的 Work 动作顺序跨槽位递增；缺失的中间回合会生成空物理行。
- 等待、暂停、左右切换目标及位于回合首动作的全灭检测编译为 YuanAssist 原生 instruction。非首位全灭检测无法保留动作位置，不导出。
- 编译器保持同一 `turn + step` 的指令数组顺序；但 YuanAssist 尚未确认该执行顺序，因此当前遇到同位置多指令时返回 `unconfirmed_instruction_order`，不生成目标文档。
- 仅 `exact` 时返回 `scriptContent + instructions + config`；`partial` 或 `unsupported` 始终省略 `target_document`。
- `intervalAttack` 是攻击和防御延迟，`intervalSkill` 是技能（上拉）延迟，`waitTurn` 是回合延迟。三者分别必须有可靠的 `exec.delays_ms.attack`、`exec.delays_ms.ultimate`、`exec.extensions.yuanassist.enemy_turn_wait_ms` 来源；缺失时报告 `missing_yuanassist_config`，不会猜默认值。
- 防御延时与普攻不同时，通过动作 step 上的 `DELAY_ADD` / `DELAY_SUBTRACT` 保留差值。YuanAssist 的圈/SP 基础延时尚未确认；作业包含圈动作且显式指定 `delays_ms.sp` 时保持 `partial`。
- 自动战斗开关、关卡互动、吕布切形态、立即重开和退场检测暂无等价指令。
- 带槽位的龙气检测和蓝星检测不支持。无槽位龙气可将 `> N` 无损规范化为 `>= N+1`、`<= N` 规范化为 `< N+1`，再按 YuanAssist 编码。
- 阵亡、庞统复制、暴击、橙/紫星、无槽位龙气虽然有原生检测指令，但失败后重进关卡仍依赖可靠的 `STAGE_AUTO_NAV` 编码；当前 Level Catalog 未提供该稳定映射，因此继续报告 `restart_navigation_unavailable` 且不导出。

## 后续补充原则

- 新增 Parser 映射前，必须先用真实 MaaYuan-SiMing 产物确认节点语义并添加回归样例。
- 新增 Adapter 能力时，应先扩充 compatibility 规则，再生成目标文档；不允许通过丢动作换取 `exact`。
- 完整导出应复用目标项目已有生成逻辑或经过对照测试的等价实现，避免维护第二套未经验证的 Pipeline 生成器。
