# 快速接入

目标：先读取公共目录，再使用用户授权的 OpenAPI Token 读取一次真实库存。以下命令只有明确占位符，不含真实连接码。

## 1. 选择 API 地址

`BASE_URL` 是你要接入的 YuanHub 后端根地址，末尾不带 `/`，不是文档页面地址。询问对应站点维护者取得实际值；不要把示例域名直接用于生产。

```bash
BASE_URL='https://YOUR_YUANHUB_API_ORIGIN'
curl --fail-with-body "$BASE_URL/v1/inventory/catalog"
```

公共目录无需登录，响应 `data` 中包含 `format`、`version`、`catalog_version` 和 `entities`。密探目录为 `/v1/operator/catalog`；招募目录为 `/v1/recruitment/catalog?game=如鸢`（中文参数应 URL 编码）。使用目录中的稳定 ID，不从名称推断 ID。

## 2. 取得用户授权

用户进入[账号与连接码](/user/profile)，创建或选择一个游戏账号，再创建绑定该账号的应用连接。游戏账号也是 API 文档里的“子账号”。

连接码即 OpenAPI Token，只能访问绑定的一个子账号。读取库存授予 `inventory:read` 即可；导出需要独立的 `inventory:export`，扫描密探需要 `operator:scan:write`，不要无理由索取写入权限。

Token 由用户确认授权，创建与修改 Scope 仍受后端当前 Beta 策略限制。本中心公开访问不等于任何用户都能创建 Token。连接列表只显示元数据，用户可按需复制本人连接码、调整 Scope 或撤销连接。

JWT 是站内登录凭据；第三方接入不要要求用户提供登录密码、刷新令牌或 JWT，也不要将 JWT 当作 OpenAPI Token。

## 3. 确认账号并读取库存

```bash
OPENAPI_TOKEN='REPLACE_WITH_USER_AUTHORIZED_OPENAPI_TOKEN'
curl --fail-with-body \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/inventory/account"

curl --fail-with-body \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/inventory/current?entity_type=item"
```

第一个请求只要求有效 Token，返回绑定账号。第二个请求还要求 `inventory:read`，返回 `data` 数组；新账号没有库存时数组可以为空，这仍是成功读取。

```json
{"status_code":200,"data":[]}
```

普通成功响应使用 `status_code/message/data`；`message` 为 null 时会省略。库存与密探 export 则直接返回交换 JSON，不能统一读取 `data`。HTTP 状态和业务 `status_code` 都要检查；领域错误还可能使用 `error.code`。详见[API 约定](./api.md)。

## 4. 写入前检查

选择[正式协议](./protocols.md)，先用对应 JSON Schema 校验结构，再调用服务端接口验证目录、游戏、账号、覆盖范围和业务约束。Schema 通过不等于能提交成功。

库存 V2 和密探 V2 文档内的目标账号必须与 Token 绑定账号一致；V3/V4/V5 扫描只有一个本地来源，服务端强制映射到绑定账号。不向 URL 追加 `account_id` 尝试切换 Token 账号。

`listed` 只修改明确列出的内容，`full` 是完整领域快照，可能重置未列出的内容。采集不完整时不能宣称 `full`；密探扫描接口拒绝所有 `full` 和主观标注。重试保留同一正文、业务时间和 `record_id`。

## 5. 保护连接码

在自己的应用中安全保存；日志、截图、错误上报、仓库及公开链接不包含 Token。连接失效时提示用户重新授权；Scope 不足时说明所需权限，不循环重试。不要把真实连接码写进本文示例。

下一步：[库存 API](./api-inventory.md)、[密探 API](./api-operator.md)、[日历与历练 API](./api-calendar.md)。
