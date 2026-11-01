# 账号公开分享契约

账号分享码由密探 BOX（`operator`）与星石背包（`star`）共用，两种授权独立。旧分享码缺少 scopes 时仅授权密探；旧密探撤销接口只关闭密探，账号级撤销和换码使两种旧链接失效。

## 自定义标签主动公开

- `PATCH /v1/accounts/share?account_id=...` 使用 `{ "scope": "operator_tags", "enabled": true }` 开启标签公开；关闭使用 `false`。仍要求 JWT、准入权限及账号归属。必须已开启 `operator`，否则返回 `422 share_scope_requires_operator`，不会自动开启 BOX。
- 默认、历史分享与缺少该 scope 的账号均不公开标签。关闭 `operator`（含旧密探撤销接口）会一并删除 `operator_tags`；再开启 BOX 不恢复标签权限。全部撤销清除所有权限；换码保留已选权限，旧码失效。星石分享独立，不受标签开关影响。
- 匿名 `GET /v1/operator/share/view/{code}` 增加 `tags` 数组，关闭时为 `[]`；开启时仅包含 `{ "id": "main", "name": "主力", "operator_ids": ["owned-id"] }`。成员与本次公开 `entries` 取交集，无公开成员的标签不返回；不公开未招募/未展示的密探 ID、置顶、分组顺序、账号身份或分类 revision。
- 标签为同一账号最新已保存分类的只读投影。查看者不能更改标签或分享权限；开关关闭后后续读取不再返回标签，已经打开的查看页面须刷新。公开响应沿用 `Cache-Control: no-store`。
- 权限变更沿用 owner/token/scopes 原子 CAS，重试会重新检查 BOX 权限，不接受客户端提供 owner 或整个 scopes 快照。无需数据迁移。上线时先更新后端，再更新前端。

用户执行的最小非浏览器验证：

```sh
./gradlew test --tests '*AccountShareScopesTest' --tests '*SubAccountShareContractTest' --tests '*OperatorShareServiceTest' --tests '*OperatorShareControllerContractTest' --tests '*OperatorShareSecurityTest' --tests '*StarShareServiceTest' --console=plain
./gradlew integrationTest --tests '*OperatorShareMongoTest' --console=plain
```

Mongo 检查必须使用测试自建可销毁容器；不连接现有开发数据库。更广的实际 HTTP/schema 检查仍可按下列隔离回归命令由用户发起。

- 管理接口：GET / PATCH / DELETE `/v1/accounts/share?account_id=...`，POST `/v1/accounts/share/regenerate?account_id=...`。要求 JWT、内测权限和账号归属；PATCH 请求为 `{ "scope": "star", "enabled": true }`。
- 匿名 GET `/v1/star/share/view/{code}` 返回分享码所属账号最新已保存 Inventory。条目只有 `kind/name/quality/level`，保留重复实例，不接受客户端指定 owner/account/generation，不公开计划、实例 ID、经验材料或佩戴关系；读取不修改状态。
- 尚未保存云端状态时 `has_state=false`、`updated_at=null`、`inventory=[]`；已保存空背包时 `has_state=true`。未开启分享时管理响应 `active=false`、`share_code=null`。旧密探分享响应的同名可空字段保留相同行为。
- OpenAPI 使用 3.1；`shareNullableSchemaCustomizer` 将以上分享响应的可空字段声明为 `type: ["string", "null"]`，与真实 JSON 响应一致，不改变其它领域的 Schema 解析。无效／撤销码为 404 `share_not_found`，未授权视图为 404 `share_not_authorized`；公开响应禁止缓存。

隔离回归命令：`./gradlew apiSchemaTest --tests '*OpenApiSchemaHarnessTest' integrationTest --tests '*OperatorShareMongoTest' --console=plain`。使用专属 TestMongo / TestRedis，不接入现有开发或生产数据库；HTTP 测试隔离了内测准入业务，保留真实 JWT、安全链、控制器、序列化及数据库。
