# 第三方应用接入指南

面向正在开发微信小程序、网站、App、桌面软件或其他产品的开发者。目标是让应用用户使用各自的 YuanHub 数据。开发者负责集成，用户知情、自愿授权，YuanHub 负责验证 Token、Scope 和账号边界。

## 1. 认识公开与私有接口

`BASE_URL` 是目标站点的 API 后端根地址，末尾不带 `/`，不是 `/developers` 文档地址。请向目标站点维护者确认部署值，生产请求使用 HTTPS。以下域名仅为占位符。

| 数据能力 | 认证与边界 | 参考 |
|---|---|---|
| 密探、库存、招募公共目录 | 无需用户授权，不含用户私有养成或库存 | [公共目录](../exchange-specs/catalogs.md) |
| 用户密探养成 | 每位用户的 Token + `operator:read`，绑定一个游戏子账号 | [密探接入教程](/developers/use-cases/operator-read) |
| 用户背包库存 | 每位用户的 Token + `inventory:read` | [库存 API](./api-inventory.md) |
| 活动日历与用户订阅 | OpenAPI 接口仍需用户 Token + `calendar:read`；活动本身公开不代表此接口匿名可调 | [日历 API](./api-calendar.md) |
| 今日历练 | 每位用户的 Token，仅读取推荐 `operator:read` | [历练 API](./api-calendar.md#每日历练读取) |

```bash
BASE_URL='https://YOUR_YUANHUB_API_ORIGIN'
curl --fail-with-body --connect-timeout 10 --max-time 30 "$BASE_URL/v1/operator/catalog"
```

密探目录响应在 `data.operators` 数组中，按 `id/name` 映射密探名称；库存目录为 `/v1/inventory/catalog`，招募目录为 `/v1/recruitment/catalog?game=如鸢`（中文参数应 URL 编码）。不同目录结构以各自 API 为准，不能统一套用同一个列表字段。使用稳定 ID，不从名称推断 ID。

Token 完整密探 V5 备份、招募档案和结构化星石背包等尚未开放。站内 JWT 功能和可下载 Schema 不等于已提供第三方 API，详见[缺口清单](./gaps.md)。

## 2. 选择数据与最小 Scope

只读取密探养成，申请 `operator:read` 即可，不需要写入或导出权限。读取库存使用 `inventory:read`，库存导出另外需要 `inventory:export`。需要其他能力时按 [API 参考](./api.md)核对，不要求用户勾选所有权限。

Token 绑定用户的一个游戏子账号，不能通过额外 `account_id` 切换。JWT 是站内登录凭据，第三方应用不得要求用户提供登录密码、JWT 或刷新令牌，也不能用 Token 自行扩权或代管站内登录。

## 3. 使用开发者测试账号调通 API

开发者可在自己拥有的测试账号上按下方[用户操作说明](#用户操作说明)创建只读 Token。此步骤用于调试，不是为整个应用生成共用凭据；公开目录接入无需先创建个人连接码。

```bash
# Bash / zsh；不要把真实 Token 写入代码、命令历史或发给 AI。
export BASE_URL='https://YOUR_YUANHUB_API_ORIGIN'
printf 'Test OpenAPI Token: '
read -r -s OPENAPI_TOKEN
export OPENAPI_TOKEN
printf '\n'
curl --fail-with-body --connect-timeout 10 --max-time 30 \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/account"
curl --fail-with-body --connect-timeout 10 --max-time 30 \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/current"
unset OPENAPI_TOKEN
```

`account` 只要求有效 Token，用于核对绑定账号；`current` 还要求 `operator:read`。同时检查 HTTP 状态和业务 `status_code`，成功为 200。`data` 是档案数组，每项含 `user_id/account_id/game/updated_at`，`entries` 是以密探 ID 为键的映射。空数组或空 entries 表示读取成功但没有记录。缺失/null 字段显示未知，不从 `elite` 推算独立化极。

```json
{"status_code":200,"data":[]}
```

`current` 是当前档案 DTO，不是完整 V5 交换备份；Token 密探 export 仍输出 V2。其他 export 也可能直接返回交换 JSON，不能统一读取 `data`。错误可能使用 `status_code/message` 或 `error.code/message`，详见[响应约定](./api.md#响应和错误)。

**测试 Token 只能访问它绑定的测试账号。禁止把开发者自己的 Token 打包到分发应用中，让所有用户共用。** 服务端示例与完整 AI 提示词见[密探接入教程](/developers/use-cases/operator-read)。

## 4. 让应用用户连接自己的账号

当前只有用户手动配置 OpenAPI Token 的方式，没有 OAuth、一键 YuanHub 账号授权或自动换取 Token。

1. 在应用中说明用途、所需 Scope、读取哪些数据和凭据保存方式，用户自愿选择连接。
2. 引导用户按[用户操作说明](#用户操作说明)为本应用创建连接码，并通过应用受保护的入口提供；有后端时经 HTTPS 提交给后端。
3. 根据本应用已认证的用户身份保存独立连接，核对 `/open-api/operator/account` 和所需读取接口；成功后显示绑定账号及已连接状态，失败不得误报连接成功。
4. 401 时停止该用户的自动重试并提示重新连接；403 提示检查 Scope/Beta；网络失败显示暂时不可用，不推断已撤销。
5. 提供“断开本应用”，停止请求和任务，删除本应用凭据及私有缓存，阻止未完成请求回写；提示用户到 YuanHub 撤销对应 Token。删除本应用记录不等于 YuanHub Token 已失效。

例如有 500 名玩家的小程序：每位玩家分别创建自己的连接码，后端维护 500 份按应用用户隔离的连接；开发者不能用自己的一个 Token 自动访问这 500 人的数据。玩家的 YuanHub 用户 ID/子账号 ID 是外部数据标识，不能替代你的应用登录身份。

## 5. 多用户隔离与上线约束

| 目标环境 | 当前建议与边界 |
|---|---|
| 有后端的网站、小程序、App 或桌面应用 | 后端按已认证应用用户加密存储凭据，密钥单独管理，由服务端调用 YuanHub；客户端仅获得本用户需要的数据 |
| 纯前端网站、无后端小程序 | 优先采用受控后端；长期凭据在客户端可能因脚本注入、调试或依赖问题泄漏，localStorage 等不能提供服务器级安全保护。直连还需确认 CORS、请求域名等平台限制 |
| 无后端桌面客户端或 App | 只使用当前用户自行提供的凭据，优先系统安全凭据库；设备失窃、本地恶意程序或逆向仍可能泄漏长期 Token |

连接记录、请求、缓存和后台任务全部按本应用用户隔离。用户身份取自已验证服务端会话，不能信任请求体中的用户 ID；不得提供可任意切换 `account_id` 的数据代理。切换、替换连接和断开后清理旧状态，阻止旧响应写回。私有数据不进入公共缓存，公共目录可独立缓存。

禁止将 Token 写进前端公开包、应用内置常量、公开仓库、URL、日志、截图或错误上报。不要记录 Authorization 头，也不要将真实 Token 发给 AI。`OPENAPI_TOKEN` 环境变量仅用于单账号调试，正式多用户应用不能用它存共用凭据；`.env.example` 只含占位符，`.env` 加入忽略规则。API 地址由受控配置决定，不向用户任意指定的外部地址转发凭据。

每个游戏子账号最多 5 个 Token（不是整个应用最多 5 名用户），长期有效，没有自动到期或刷新流程。用户在 YuanHub 撤销后，后续请求无法再用该凭据通过验证；撤销不会收回第三方已经取得的数据。建议每个应用使用独立 Token，发生泄漏时撤销并重新创建。

**创建 Token、修改 Scope 和 API 调用均受 Token 所有者的当前 Beta 资格限制。** 文档公开不代表所有玩家都有访问资格。上线 500 人应用前，应确认用户资格与目标环境，不承诺已有正式应用授权体系、统一速率配额或规模化服务保障。正式第三方授权能力另立[后续任务](./gaps.md#后续任务建议正式第三方应用授权)。

## 用户操作说明

本节供第三方产品直接引用：[用户创建与撤销连接码](/developers/guide#doc-用户操作说明)。以下由实际拥有 YuanHub 数据的应用用户操作。

1. 登录 [YuanHub 个人中心](/user/profile)，在“应用与数据连接”确认自己的游戏子账号；没有账号时先创建。
2. 展开“开发者与第三方 API”，选择“绑定游戏账号”，仅勾选应用说明需要的 Scope；仅读密探为 `operator:read`。填写可辨认的连接名称，再点击“创建 API 访问凭证”；提示 Beta 资格或数量限制时按站点提示处理。
3. 点击“复制连接码”，仅在你信任的应用连接入口填写。不要发给聊天、AI 或公开链接，也不提供登录密码、JWT 或刷新令牌。以后可在“现有连接”复制同一凭据。
4. 要断开第三方应用，先使用该应用的断开入口，停止其请求并删除所存凭据；这一步不代表 YuanHub 已撤销 Token。
5. 要撤销授权，返回 YuanHub“现有连接”，找到该应用与游戏账号对应的连接，点击“停止连接”并确认。成功后该 Token 不能继续读取或上传；若失败须重试，不能认为已经撤销。若多个工具共用同一 Token，它们都会受影响；撤销不会删除已被第三方保存的数据。

## 写入与协议参考

本指南的密探展示只需只读能力。确实需要上传或交换数据时，先选择[正式协议](./protocols.md)，用 JSON Schema 校验，再验证目录、游戏、账号和业务约束；Schema 通过不等于服务端会接收。

库存 V2 和密探 V2 的目标账号须与 Token 一致；V3/V4/V5 扫描仅允许单来源 `scan + listed`，来源被映射到绑定账号，不接受 `full` 或主观标注。完整快照可能重置未列出内容，采集不完整不能宣称 `full`；重试保留正文、业务时间及 `record_id`。下载与历史协议保持在[协议支持矩阵](./protocols.md)。
