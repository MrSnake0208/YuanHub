# API 参考

核实日期：2026-10-18。以下是经过审查的开发者接入接口集合，包含认证边界明确的站内备份接口；不是整个后端 Swagger 的公开镜像。

## 认证与账号

| 类型 | 请求方式 | 使用范围 |
|---|---|---|
| 公共 | 不带 Authorization | 目录、公开 Work 与兼容性预览 |
| OpenAPI Token | `Authorization: Bearer <OPENAPI_TOKEN>` | `/open-api/` 数据接口；绑定单一账号 |
| 普通 JWT | `Authorization: Bearer <USER_JWT>` | 站内账号、Token 管理、完整备份恢复和原生作业创作 |

两种 Bearer 凭据不能互换。JWT 仍受账号所有权及相关 Beta 策略限制。管理员权限不等于第三方 Scope；本中心不开放管理员写目录、反馈自动化的 Integration Token 或内部运维接口。

## 功能索引

| 模块 | 状态 | 参考 |
|---|---|---|
| 公共目录、库存、心纸与奖励 | 正式支持 | [库存及物品](./api-inventory.md) |
| 密探当前状态、标注、扫描与备份 | 部分支持（Token 完整备份缺失） | [密探及养成](./api-operator.md) |
| 招募档案备份恢复 | JWT 正式支持；Token 尚未实现 | [招募档案](./api-recruitment.md) |
| 活动日历与每日历练 | 正式支持所列受限能力 | [日历与历练](./api-calendar.md) |
| 星石临时截图上传 | 部分支持；不是背包数据 API | [星石采集](./api-star.md) |
| Work V1 | 正式原生协议；Adapter 部分支持 | [作业与兼容性](./api-work.md) |
| MaaYuan 百宝箱诊断 | 已实现，部署状态需另行确认；有效连接码即可 | 本页「MaaYuan 百宝箱诊断」 |

## Scope 全表

从公共 `GET /user/open-api/permissions` 可读取当前枚举，成功 `data=[{scope,description}]`。

| Scope | 用途 |
|---|---|
| `inventory:read` | 当前库存读取 |
| `inventory:write` | 库存 V2 导入 |
| `inventory:export` | 库存 V2 导出 |
| `operator:read` | 密探 current、annotations、每日历练读取 |
| `operator:write` | 兼容密探 V2 导入 |
| `operator:export` | 兼容密探 V2 导出 |
| `operator:scan:write` | 密探 V3/V4/V5 受限扫描预览与提交 |
| `operator:daily-tasks:write` | 每日历练读取与完成勾选 |
| `star:sync:write` | 完整星石结构化同步，不上传截图 |
| `calendar:read` | 绑定账号游戏的活动与订阅读取 |

## 响应和错误

普通成功示例：

```json
{"status_code":200,"data":{}}
```

`message` 可出现，也可因 null 省略。不要假定存在 `success` 或 `code` 字段。库存和密探导出直接返回协议文档；招募导出、Work 及其兼容性响应使用普通包装。部分传统 JWT 接口在 HTTP 200 中返回非 200 的 `status_code`，不能只检查网络成功。

领域错误示例：

```json
{"error":{"code":"schema_validation_failed","message":"字段或业务约束不满足"}}
```

认证失败或其他接口错误也可能是 `{"status_code":401,"message":"…"}`。客户端应支持这两种形式。

| HTTP | 处理建议 |
|---|---|
| 400 | JSON、分页或请求参数不合法；修正请求 |
| 401 | 凭据缺失、无效、过期或撤销；重新授权 |
| 403 | Scope、Beta 或账号边界限制；提示用户检查授权 |
| 404 | 资源不存在；部分无权限资源也返回 404 |
| 409 | 幂等、版本、预览或图片完整性冲突；按模块说明恢复 |
| 422 | Schema 或业务语义不满足；修正数据而不是盲目重试 |
| 429 | 资源限额；减少创建或按响应提示处理 |

仅连接中断、超时或可重试服务错误适合原样重试。不要更换幂等 ID 绕过冲突。此处不承诺尚未确认的统一请求速率配额。

## MaaYuan 百宝箱诊断

`POST https://api-hub.maayuan.com/open-api/maayuan/diagnostics`

使用 `Authorization: Bearer <现有连接码>`；任何通过 `OpenApiTokenService.authenticateAuthorization` 的连接码均可使用，无新增 Scope，不提供匿名入口，原连接码无需更新。用户和绑定账号只从认证结果推导。认证发生在正文读取和 multipart 解析之前，保留既有账号可用性/Beta 校验。

请求为 `multipart/form-data`：一个 `manifest` 部分，类型 `application/json`，最多 64 KiB；零至三个同名 `files` 部分，类型均为 `image/jpeg`，每张最多 512 KiB。整个 HTTP 正文（含 multipart 边界、头及字段）最多 2 MiB；不允许其他部分。客户端文件名不保存。

```json
{
  "schema_version": 1,
  "event_id": "4146597c-ac5f-4c91-af76-81962ca24394",
  "run_id": "a3779a6b-6124-45ec-9e71-e816f364f485",
  "feature": "operator_info_collection",
  "client": {
    "resource_version": "2026.11.10",
    "maafw_version": "5.0",
    "resource": "base",
    "resolution": "1280x720"
  },
  "catalog": { "version": "1", "source": "remote" },
  "occurred_at": "2026-11-10T12:00:00Z",
  "outcome": "failed",
  "issues": [{
    "code": "collector_exception",
    "stage": "collect",
    "count": 1,
    "operator_ids": ["char_test"],
    "error_type": "ValueError",
    "stack": ["agent/collector.py:run:12"],
    "blocking_errors": [{ "code": "invalid", "field": "level" }],
    "section_status": { "disc_loadouts": "partial" },
    "ocr_samples": ["攻击力"]
  }],
  "images": [{ "index": 0, "role": "disc_cells", "roi": [0, 0, 4, 4], "operator_id": "char_test" }]
}
```

协议采用严格白名单，所有层级拒绝未知字段、重复 JSON 键、null、尾随 JSON、字符串数字和浮点整数。字段约束：

| 字段 | 允许值及限制 |
|---|---|
| `schema_version` / `feature` | 固定为整数 `1` / `operator_info_collection` |
| `event_id` / `run_id` | 标准 36 字符 UUID，服务端归一化大小写；重试必须复用 `event_id` |
| `client` | `resource=base|zh_tw`；`resolution=宽x高`，每边 1～8192；两个版本各 1～100 字符，仅字母、数字、空格及 `._+()-` |
| `catalog` / `occurred_at` | `source=remote|cache|builtin`，版本同上；时间为带时区的 ISO-8601，最多 40 字符 |
| `outcome` | `failed|upload_failed|data_review` |
| `issues` | 1～32 项；`stage` 1～64 字符（文字、数字、空格及 `_ . -`），`count` 缺省 1，范围 1～10000 |
| `operator_ids` / 图片 `operator_id` | `char_` 后接 1～80 个字母、数字或下划线；每项 issue 最多 100 个 |
| `error_type` / `blocking_errors` | 异常类型最多 100 字符；最多 32 项阻塞错误，`code` 1～64、`field` 1～100 字符；仅字母、数字及 `_.[]-` |
| `stack` | 最多 32 行、每行最多 200 字符；仅项目相对文件、函数、正整数行号，不允许 `..`、绝对路径或变量值 |
| `section_status` | 最多 32 个键，键 1～64 字符，同上符号规则；状态为 1～32 字符的机器状态名，同上符号规则（例如 `partial`） |
| `ocr_samples` | 最多 20 个已知游戏字段，每个 1～80 字符；只允许短文本、数字及有限标点；拒绝 URL、邮箱、凭据关键词、账号标识及长数字/十六进制串 |
| `images` | 缺省空数组；`index` 按文件出现顺序从 0 连续编号；`role=disc_cells|main_panel|last_frame`；`roi=[x,y,w,h]` 位于声明分辨率内，图片宽高必须与 ROI 的宽高一致 |

issue 的可选字段 `operator_ids/error_type/stack/blocking_errors/section_status/ocr_samples` 可以省略，不能传 null。图片必须完整解码，每边最多 4096、总计最多 4,194,304 像素。服务端从新像素缓冲区重新编码 JPEG，去除原始元数据；只存私有目录，不产生公开媒体 URL。客户端仍负责裁剪、遮挡与截图授权，不应发送完整日志、用户标识、账号名、绝对路径、token 或任意服务端响应正文。

`issues[].code` 仅允许：`collector_exception`、`account_lookup_failed`、`annotations_failed`、`catalog_unavailable`、`navigation_failed`、`screenshot_or_ocr_failed`、`identity_unresolved`、`data_review`、`upload_network_failed`、`upload_http_failed`、`upload_rejected`、`upload_response_unverified`。

此接口返回真实 HTTP 状态，成功正文不使用 `status_code/data` 包装：

```json
{"status":"accepted","event_id":"4146597c-ac5f-4c91-af76-81962ca24394"}
```

| HTTP / status | 含义和客户端动作 |
|---|---|
| 200 / `accepted` | 已建立一个独立的私有反馈工单 |
| 200 / `duplicate` | 同一事件已接收，不再创建工单或绑定新附件 |
| 200 / `accepted_without_images` | 全局诊断图片预算不足，摘要及 manifest 已接收；不要重发图片 |
| 400 / 413 / 422 | 请求结构、大小或字段/图片无效，永久失败；错误正文为 `{"error":"..."}` |
| 401 / 403 | 认证或账号策略失败；检查连接码及所属账号 |
| 429 | 按 `Retry-After` 秒数延后，保持原 `event_id` |
| 5xx / 网络失败 | 可延后重试，保持原 `event_id` |

配额在 Redis 中按认证用户计数：每个 60 秒窗口最多 6 次请求、每天最多 100 次请求；同一用户下每个子账号每天最多 30 包、图片原始上传字节最多 20 MiB。日界线为 UTC 00:00；重复请求仍消耗用户请求配额，已确认重复的事件不再消耗子账号包/图片配额。输入非法请求也可能消耗用户请求配额；Redis 不可用时返回 5xx，不绕过配额。

诊断图片保留 14 天；manifest、结构化摘要和工单保留 90 天。每小时清理磁盘文件及媒体引用，读取接口即时拒绝过期附件/摘要；清理失败会重试。随机 `event_id` 幂等标记单独保留，不包含用户、账号、manifest 或图片，用来防止旧包在保留期后重建工单。诊断图片全局硬预算为 10 GiB，按重新编码后的实际字节预留；工单创建失败会清理本次媒体。诊断工单属于现有「麻圆」板块，不发逐条新工单通知，禁止公开或合并，附件不能转绑到其他工单。

## 用户管理连接码（JWT）

第三方通常让用户在个人中心操作，不代管其登录凭据。以下不是 OpenAPI Token 自助扩权接口。

| 方法与路径 | 参数/请求 | 成功 data |
|---|---|---|
| `POST /user/open-api/token` | `{account_id,scopes,remark}` | `{token_id,token,account_id,account_name,remark,scopes,created_at}` |
| `GET /user/open-api/tokens` | 无 | 当前用户连接元数据数组，不含明文 |
| `GET /user/open-api/tokens/{tokenId}/secret` | 本人 Token ID | `{token}`；禁止缓存 |
| `GET /user/open-api/tokens/{tokenId}/first-sync` | 本人 Token ID | 首次同步状态；禁止缓存 |
| `PATCH /user/open-api/tokens/{tokenId}/scopes` | `{scopes:[...]}` | 更新后的连接元数据；完整替换 Scope，Token 不变 |
| `DELETE /user/open-api/tokens/{tokenId}` | 本人 Token ID | 无业务数据 |

Scope 至少一个且不能重复或未知；每子账号最多五个 Token。创建与权限修改受 Beta 策略限制，撤销立即停止访问。常见错误 401/403/404/422/429。

```bash
curl --fail-with-body "$BASE_URL/user/open-api/permissions"
```
