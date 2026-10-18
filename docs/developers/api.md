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
| `star:capture:write` | 临时星石 PNG 采集上传 |
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
