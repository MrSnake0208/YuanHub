# API 参考

核实日期：2026-10-18。以下是经过审查的开发者接入接口集合，包含认证边界明确的站内备份接口；不是整个后端 Swagger 的公开镜像。

## 认证与账号

| 类型 | 请求方式 | 使用范围 |
|---|---|---|
| 公共 | 不带 Authorization | 目录、公开 Work 与兼容性预览 |
| OpenAPI Token | `Authorization: Bearer <OPENAPI_TOKEN>` | `/open-api/` 数据接口；绑定单一账号 |
| 普通 JWT | `Authorization: Bearer <USER_JWT>` | 站内账号、Token 管理、完整备份恢复和原生作业创作 |
| Integration Token | `Authorization: Bearer <INTEGRATION_TOKEN>` | 管理员授权的诊断读取与 AI 分析；须有独立 scope 及 MAAYUAN 板块范围 |

这些 Bearer 凭据不能互换。JWT 仍受账号所有权及相关 Beta 策略限制。管理员权限不等于第三方 Scope；诊断集成仅开放下述读取和分析写入，不授予写目录、修改问题状态或内部运维能力。

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
    "ui_script": "traditional",
    "resolution": "1280x720"
  },
  "catalog": { "version": "1", "source": "remote" },
  "occurred_at": "2026-11-10T12:00:00Z",
  "outcome": "failed",
  "issues": [{
    "code": "collector_exception",
    "stage": "main",
    "reason": "resource_language_mismatch",
    "count": 1,
    "operator_ids": ["char_test"],
    "error_type": "ValueError",
    "stack": ["agent/collector.py:run:12"],
    "blocking_errors": [{ "code": "invalid", "field": "level" }],
    "section_status": { "disc_loadouts": "partial" },
    "ocr_samples": ["攻击力"]
  }, {
    "code": "identity_unresolved",
    "stage": "identity",
    "reason": "name_fuzzy_disc_unconfirmed",
    "candidate_operator_ids": ["char_007_lvmeng"],
    "ocr_samples": ["呂蒙"]
  }],
  "images": [{ "index": 0, "role": "name_area", "roi": [0, 0, 4, 4], "operator_id": "char_test" }]
}
```

协议采用严格白名单，所有层级拒绝未知字段、重复 JSON 键、null、尾随 JSON、字符串数字和浮点整数。字段约束：

| 字段 | 允许值及限制 |
|---|---|
| `schema_version` / `feature` | 固定为整数 `1` / `operator_info_collection` |
| `event_id` / `run_id` | 标准 36 字符 UUID，服务端归一化大小写；重试必须复用 `event_id` |
| `client` | `resource=base|zh_tw`；`resolution=宽x高`，每边 1～8192；两个版本各 1～100 字符，仅字母、数字、空格及 `._+()-` |
| `client.ui_script` | 可选，枚举 `simplified`（简体）、`traditional`（繁体）、`mixed`（简繁混合）、`unknown`（无法判定）；仅发送判定枚举，不发送整屏 OCR 文字；不能传 null |
| `catalog` / `occurred_at` | `source=remote|cache|builtin`，版本同上；时间为带时区的 ISO-8601，最多 40 字符 |
| `outcome` | `failed|upload_failed|data_review` |
| `issues` | 1～32 项；`stage` 1～64 字符（文字、数字、空格及 `_ . -`），`count` 缺省 1，范围 1～10000 |
| `issues[].reason` | 可选，1～64 字符，匹配 `[a-z][a-z0-9_]{0,63}`；省略表示原因未知，不能传 null；客户端使用下表固定枚举，服务端只校验格式，不做枚举白名单 |
| `operator_ids` / 图片 `operator_id` | `char_` 后接 1～80 个字母、数字或下划线；每项 issue 最多 100 个 |
| `issues[].candidate_operator_ids` | 可选，缺省空数组，0～5 项且不得重复；每项匹配 `char_[A-Za-z0-9_]{1,80}`，按名称匹配相似度降序排列；不能传 null |
| `error_type` / `blocking_errors` | 异常类型最多 100 字符；最多 32 项阻塞错误，`code` 1～64、`field` 1～100 字符；仅字母、数字及 `_.[]-` |
| `stack` | 最多 32 行、每行最多 200 字符；仅项目相对文件、函数、正整数行号，不允许 `..`、绝对路径或变量值 |
| `section_status` | 最多 32 个键，键 1～64 字符，同上符号规则；状态为 1～32 字符的机器状态名，同上符号规则（例如 `partial`） |
| `ocr_samples` | 服务端校验不变：最多 20 个样本，每个 1～80 字符；只允许短文本、数字及有限标点；拒绝 URL、邮箱、凭据关键词、账号标识及长数字/十六进制串。身份类姓名样本的客户端限制见下文 |
| `images` | 缺省空数组；`index` 按文件出现顺序从 0 连续编号；`role=disc_cells|main_panel|last_frame|name_area`（姓名区域）；`roi=[x,y,w,h]` 位于声明分辨率内，图片宽高必须与 ROI 的宽高一致 |

issue 的可选字段 `reason/operator_ids/candidate_operator_ids/error_type/stack/blocking_errors/section_status/ocr_samples` 可以省略，不能传 null。图片必须完整解码，每边最多 4096、总计最多 4,194,304 像素。旧 multipart 路径由服务端从新像素缓冲区重新编码 JPEG 去除元数据，存入本地私有目录，启用 COS 时转存私有桶；不产生公开媒体 URL。下述直传路径只校验，不重新编码或上传，客户端须在直传前去除原始元数据，仍负责裁剪、遮挡与截图授权，不应发送完整日志、用户标识、账号名、绝对路径、token 或任意服务端响应正文。

身份类 issue（`identity_unresolved`）可在 `ocr_samples` 携带姓名 OCR 原文：客户端仅发送匹配 `[㐀-鿿]{1,8}` 的 1～8 个 CJK 汉字，最多 4 条，不含数字、字母或标点，无需已存在于密探目录；其他 issue 维持已知游戏字段的样本规则。姓名和候选在摘要档也发送，不依赖图片开关。带图档位的主界面姓名裁图使用 `name_area`，命盘格仍使用 `disc_cells`，总图数仍最多 3 张。

`issues[].code` 仅允许：`collector_exception`、`account_lookup_failed`、`annotations_failed`、`catalog_unavailable`、`navigation_failed`、`screenshot_or_ocr_failed`、`identity_unresolved`、`data_review`、`upload_network_failed`、`upload_http_failed`、`upload_rejected`、`upload_response_unverified`。

`reason`、`ui_script`、`candidate_operator_ids` 是 v1 的兼容增量，`schema_version` 仍为 1。客户端只能使用下列原因；服务端接受格式合法的未来 reason，前端遇到未知值显示原码。旧客户端可省略新增字段；旧工单缺少 `issues` 时继续使用 `issueCodes` 展示和筛选，无需回填。**必须先发布后端，再发布携带新增字段的 MaaYuan 客户端**，否则旧后端会将新增字段视为未知字段并返回 400。

页面等待超时时，若资源为 `zh_tw` 而界面为 `simplified`，或资源为 `base` 而界面为 `traditional`，客户端以 `resource_language_mismatch` 代替 `page_timeout`。`mixed`、`unknown` 不据此判定语言不一致。详情将资源显示为简中/繁中，将界面简繁显示为中文。

诊断事件摘要包含 `resource`、`ui_script` 和逐项 `issues`（`code/stage/reason/error_type/count/operator_ids/candidate_operator_ids/ocr_samples`），复用旧摘要结构。旧摘要缺少资源或界面简繁时为 null，缺少 `issues`、候选或样本时为空数组。诊断中心从公共密探目录的只读快照解析对象和候选中文名；未命中时保留原 ID。

新诊断不再生成反馈工单，不向上报用户提供沟通或追加消息入口。反馈管理队列、队列计数、用户自己的列表、反馈未读及 `/open-api/feedback/queue` 均排除 `source=maayuan_diagnostic`；保留的旧诊断筛选参数不会让这些工单重新进入列表。旧工单不迁移，按 ID 查看和原附件授权路径继续保留，仍按原 90 天保留期清理。

`catalog.version` 若来自 ISO 时间戳，客户端需移除日期中的 `-` 和时间中的 `:`，例如 `2026-11-10T16:32:20.750Z` → `20261110T163220.750Z`；其他版本原样保留，服务端版本格式约束不变。

| `reason` | 中文说明 | 排查提示 |
|---|---|---|
| `resource_language_mismatch` | 资源语言与游戏界面不一致 | 用户所选资源（简中/繁中）与游戏画面文字不符，请让用户切换资源 |
| `page_timeout` | 等待目标页面超时（stage 即页面） | 资源语言与游戏界面不一致、弹窗遮挡、卡顿 |
| `enter_operator_page_failed` | 无法进入密探界面 | 起始界面不在主界面/导航失败 |
| `disc_plan_unknown` | 无法确认当前命盘方案 | 命盘页标签 OCR 失败 |
| `disc_tip_close_failed` | 无法关闭命盘单套提示 | 提示弹窗样式变化 |
| `disc_switch_unconfirmed` | 命盘方案切换未确认 | 点击未生效/动画过慢 |
| `disc_restore_failed` | 命盘原配置恢复失败 | 采集后未能切回原命盘 |
| `identity_changed_on_reread` | 数值补读时密探身份不符 | 补读期间页面被切换 |
| `page_arrow_failed` | 密探翻页箭头识别未执行 | 翻页按钮识别失败 |
| `list_boundary_unverified` | 无法复核密探列表边界 | 列表首尾判断失败 |
| `page_turn_unconfirmed` | 密探翻页未确认 | 翻页后身份未变化 |
| `return_first_limit` | 回到首位密探超过安全上限 | 列表过长或回滚失败 |
| `current_operator_failed` | 无法采集当前密探 | 见同次其他 issue |
| `form_identity_unconfirmed` | 切换形态后身份未确认 | SP/普通形态切换 |
| `form_switch_failed` | 形态切换或恢复失败 | 陈登/史子眇等双形态 |
| `form_tip_close_failed` | 无法关闭未解锁形态提示 | 未解锁形态弹窗 |
| `name_and_disc_unresolved` | 姓名 OCR 与命盘均无法确认密探 | 新密探未录入目录、OCR 失败 |
| `name_fuzzy_disc_unconfirmed` | 姓名仅模糊匹配且命盘未能唯一确认 | 新密探/命盘别名缺失（可在 YuanHub 补 aliases） |
| `unmatched_in_report` | 报告中存在未匹配密探 | 新密探/命盘别名缺失（可在 YuanHub 补 aliases） |
| `section_needs_review` | 部分字段待核对（见 section_status） | 数值/命盘识别不完整 |
| `server_marked_review` | 服务端标记部分接受或待核对 | 查看 YuanHub 待核对 |
| `screenshot_failed` | 截图失败 | 模拟器/ADB 异常 |
| `ocr_failed` | OCR 识别异常 | OCR 模型/资源问题 |
| `catalog_load_failed` | 本地与远程密探目录均不可用 | 网络 + 内置目录损坏 |
| `account_lookup_failed` | 连接码绑定账号查询失败 | 连接码失效/网络 |
| `annotations_failed` | 养成状态读取失败 | 连接码无读取权限 |
| `upload_network_error` | 上报网络错误 | 网络 |
| `upload_http_error` | 上报 HTTP 错误 | 服务端状态码 |
| `upload_rejected_by_server` | 服务端拒收（见 blocking_errors） | 数据不合规 |
| `upload_response_invalid` | 上报响应无法验证 | 响应格式异常 |
| `upload_auth_missing` | 在线上传认证缺少连接码或地址 | 配置问题 |
| `active_only_requires_sync` | “仅更新养成中”未开启同步/连接码 | 配置问题 |
| `unknown_scan_mode` | 未知扫描模式配置 | 配置问题 |
| `unexpected_exception` | 未分类异常（看 error_type/stack） | 开发排查 |
| `task_failed_no_detail` | 任务失败但未记录具体原因 | 开发排查 |

此接口返回真实 HTTP 状态，成功正文不使用 `status_code/data` 包装：

```json
{"status":"accepted","event_id":"4146597c-ac5f-4c91-af76-81962ca24394"}
```

| HTTP / status | 含义和客户端动作 |
|---|---|
| 200 / `accepted` | 已保存私有诊断事件，并累计到对应问题组 |
| 200 / `duplicate` | 同一事件已接收，不再创建事件、累计次数或绑定新附件 |
| 200 / `accepted_without_images` | 全局诊断图片预算不足，摘要及 manifest 已接收；不要重发图片 |
| 400 / 413 / 422 | 请求结构、大小或字段/图片无效，永久失败；错误正文为 `{"error":"..."}` |
| 401 / 403 | 认证或账号策略失败；检查连接码及所属账号 |
| 429 | 按 `Retry-After` 秒数延后，保持原 `event_id` |
| 5xx / 网络失败 | 可延后重试，保持原 `event_id` |

配额在 Redis 中按认证用户计数：每个 60 秒窗口最多 6 次请求、每天最多 100 次请求；同一用户下每个子账号每天最多 30 包、图片原始上传字节最多 20 MiB。日界线为 UTC 00:00；重复请求仍消耗用户请求配额，已确认重复的事件不再消耗子账号包/图片配额。输入非法请求也可能消耗用户请求配额；Redis 不可用时返回 5xx，不绕过配额。

诊断图片保留 14 天，event、manifest 和事件摘要保留 90 天，问题组及累计次数永久保留。每小时清理过期事件及私有资产，读取即时拒绝过期数据；事件在保留期内保留图片引用的角色信息以提示过期，不提供已删除文件。原有诊断工单的 90 天清理继续运行，不批量迁移或主动删除旧数据。随机 `event_id` 幂等标记独立保留，不包含用户或原始内容，避免过期重试重新累计。图片全局硬预算仍为 10 GiB，multipart 按重新编码后的字节预留，直传按声明 size 预留；事务失败清理本次未被已提交事件引用的媒体。

### 诊断图片直传国内 COS

manifest 字段与 `schema_version=1` 保持不变。反馈截图（私有或公开）全部继续存本地，此流程仅适用于 MaaYuan 诊断图片。两步接口复用上述连接码鉴权和用户请求配额，认证在正文读取前完成；complete 不再消耗子账号包/图片日额度。

1. `POST /open-api/maayuan/diagnostics/intents`，`Content-Type: application/json`，正文最多 64 KiB：`{"manifest":{...},"uploads":[{"size":5934,"content_md5":"<16 字节 MD5 的 24 字符规范 Base64>"}]}`。uploads 必须与 manifest.images 按下标一一对应（0～3），size 为整数 1～524288；拒绝未知字段、重复键、null 与类型强转。子账号 packet/字节额度按声明 size 之和计；服务端在本步即预留图片额度、创建事件和问题组，图片为 pending，manifest 本地保存。
2. 成功 200 返回 `{"status":"accepted","event_id":"...","uploads":[{"index":0,"method":"PUT","url":"https://<bucket>.cos.<region>.myqcloud.com/diagnostics/images/med_xxx.jpg?...","headers":{"Content-Type":"image/jpeg","Content-MD5":"...","Content-Length":"5934"},"expires_in":600}]}`。额度不足的 `accepted_without_images`、去重的 `duplicate` 返回空 uploads。COS 未启用返回 409 `{"status":"direct_upload_unavailable"}`；遇到 404/405/409 回退原 multipart 接口。
3. 客户端向每个 URL 直接 PUT 对应字节，按响应 headers 发头；签名覆盖对象 key、Host、Content-Type、Content-MD5、Content-Length。URL 必须是 HTTPS、默认端口或 443、主机以 `.myqcloud.com` 结尾、无 userinfo；不跟随重定向，单张超时 15 秒，失败不重试该张，继续下一张。URL/签名不得记录到日志、诊断或本地包。
4. 全部尝试后，`POST /open-api/maayuan/diagnostics/{event_id}/complete`，同一连接码认证，JSON 正文 `{}`。只允许事件所属用户及绑定账号调用，重复调用幂等。服务端对 pending 图片 Head 核对存在/大小，再有界 Get 并使用与 multipart 相同的 JPEG 解码、ROI、像素与损坏校验；不重编码、不重新上传。通过为 ready，不存在为 missing；失败先删除对象再为 invalid，missing/invalid 释放预留额度且不重复释放。返回 `{"status":"completed","images":[{"index":0,"status":"ready"}]}`，图片状态可为 ready/missing/invalid。未调用 complete 的图片保持 pending。

管理端事件详情为未过期 cos+ready 图片提供短期 GET `url`，默认 300 秒，带 `response-content-type=image/jpeg`、`response-content-disposition=inline`；每次重新签发，禁止缓存与记录签名。网页直接使用 `<img src=url>`，失败时重新拉一次事件详情；本地旧图继续经代理。pending 显示「图片未上传完成」，missing/invalid 显示丢失/校验失败。open-api（AI）只返回状态，继续代理取图，不返回直链。

COS 配置沿用 `share.media.cos.*`，region 由运维选择国内地域（如 ap-shanghai）；新增 `put-url-ttl-seconds=600`、`get-url-ttl-seconds=300`。桶私有读写，无需 CORS（客户端非浏览器，网页用 img）；CAM 仅授予目标桶诊断前缀的 PutObject/GetObject/DeleteObject/HeadObject。管理员必须配置 `diagnostics/images/` 上传后 15 天过期的生命周期。新直传路径中，东京后端到国内 COS 为跨境公网，仅用于 complete 校验（每张 ≤512KiB，通常约 6KB）和删除；旧 multipart 转存及 AI 代理仍经过后端。配置项、环境变量与部署边界见后端 `docs/cos-private-images.md`。

### 诊断中心管理与 AI 集成

管理页面为 `/maayuan-diagnostics`，权限复用 MAAYUAN 板块的运营岗位范围（含超级管理员），与原未分派诊断工单的工作台可见判断一致。下表中管理端基路径为 `/v1/admin/maayuan-diagnostics`（JWT），AI 基路径为 `/open-api/maayuan-diagnostics`（Integration Token）。成功 JSON 沿用 `{status_code:200,data:...}`；无权限返回 HTTP 403，过期或不存在的事件/媒体返回 404。媒体返回文件流，禁止缓存。

| 方法与相对路径 | 语义 |
|---|---|
| `GET /issues` | `status=NEW|FIXED|IGNORED|ALL`（默认 NEW）、`reason` 精确匹配组的 `reason` 或 `reasons`、`q` 搜索 subject/OCR 样本/目录中的中文名或别名（最多 100 字符）；`sort=lastSeen|count|firstSeen`（默认 lastSeen，倒序）；`page` 从 1 开始、每页 1～100，管理端参数 `pageSize`、AI 参数 `page_size`，默认 20 |
| `GET /issues/{id}` | 问题组、近 90 天去重用户数、最近 20 条事件摘要、对象/候选中文名及 `subject_in_catalog`；OCR 对象按目录名称或空白/逗号等分隔的别名精确匹配，其他对象返回 null |
| `GET /events/{eventId}` | 完整事件摘要、内联 `manifest` JSON、`images[{asset_id,role,issue_index,expired,status,url?}]`；status 为 pending/ready/missing/invalid，旧数据缺省 ready；url 仅管理端为未过期 cos+ready 图片签发，AI 不返回；不返回上报用户或账号 ID；协议没有明确 issue 关联时 `issue_index` 为 null |
| `GET /events/{eventId}/media/{assetId}` | 校验资产属于事件、仍在保留期且为私有诊断文件后返回文件流；不可跨事件访问 |
| `PATCH /issues/{id}`（仅管理端） | `{status,note?}`，status 必填，备注最多 4000 字；记录操作人与时间，省略 note 保留原备注 |
| `PUT /issues/{id}/analysis`（仅 AI） | `{summary,suggested_action,source,model?}`；必填字段不为空，长度分别最多 4000、40、40，model 最多 120；仅替换 `agent_analysis`，不修改 status |

列表同时返回 `status_counts`、`reason_counts` 和 `pending_count/recent_event_count/regressed_count`。状态计数保留搜索与原因条件，忽略当前状态；原因计数保留搜索与状态条件，忽略当前原因。三项页头统计为全局授权范围内的待处理组数、近 7 天事件数、当前待处理且曾修复后复发的组数。

签名键为 `原因|对象`：原因优先 `issue.reason`，缺省使用 `issue.code`；仅 `identity_unresolved` 或 `data_review` 且有密探 ID 时使用 `op:<id>`（多个 ID 分组），identity_unresolved 无 ID 但有 OCR 样本时使用 `ocr:<第一条样本>`，其余一律使用 `stage:<stage>`，避免页面/环境问题按密探拆组。身份类 `identity_unresolved` 的 operator/ocr_name 对象统一以 code 作为签名原因；同一事件中与非 collector_exception issue 有相同明确 reason 的外层 collector_exception 不参与分组，但完整事件摘要保留所有 issue；组的 `reason` 保存签名原因，新增 `reasons` 去重保存实际原因（缺省取 code，旧文档默认空数组），管理端与 AI 响应均返回该字段，原因计数仍按组的 `reason` 聚合。问题组 ID 为键的 SHA-1 十六进制前 24 位。同一事件内相同签名只计一次、合并阶段；组的 `operator_ids` 记录进入该组的 issue 的密探 ID，按最近出现去重保留最多 10 个，旧文档缺省空数组，管理端与 AI 响应透传，详情环境区非空时显示「涉及密探」（优先目录中文名，否则原 ID）；最近去重 OCR 样本最多 8 条，MaaFW 客户端/资源/目录版本各最多 10 个，资源和界面简繁按事件计数。FIXED 后再次出现回到 NEW 并记录 `regressed_at`；IGNORED 仍计数但不自动重开。用户数只按仍保留的事件去重计算，不永久保存用户集合。

Integration Token 的 scope 单独从 `GET /user/integration-tokens/scopes`（JWT）读取，不能混入上方连接码 Scope 表。通过现有 `POST /user/integration-tokens` 创建时须明确设置 `feedback_areas:["MAAYUAN"]`（允许包含其他板块），并授予所需 scope；省略板块范围不视为诊断授权。Token 所有者仍须具备 MAAYUAN 的反馈查看权限。

| Integration Scope | 用途 |
|---|---|
| `diagnostics:read` | 读取上述问题、事件、内联 manifest 与私有媒体 |
| `diagnostics:analysis:write` | 写入 AI 分析；不授予问题状态修改或隐含读取权限 |

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
