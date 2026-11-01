# 密探私人分类 API

`GET /v1/operator/organization?account_id=...` 与 `PUT /v1/operator/organization?account_id=...` 使用普通登录 JWT 和现有私有 API 访问策略。服务端从身份读取用户 ID，不接受请求指定用户；非本人子账号返回 `404 account_not_found`。

本接口仅管理展示分类，独立于 annotation、objective、favorite、MaaYuan 采集和 v3/v4 密探交换。数据存入 `operator_organization`，按用户和子账号唯一；删除子账号在同一事务内级联删除。GET 未找到记录时返回 revision 0 的默认快照，不创建数据。

分类 API 始终仅限本人读写。分享者显式开启 `operator_tags` 后，密探 BOX 单独投影已公开密探的标签名称和关联；不公开完整分类快照、置顶或分组顺序，关闭 BOX 一并撤销标签公开。详见 [账号公开分享契约](./account-sharing.md#自定义标签主动公开)。

## 快照契约

响应使用现有 `ApiResult` 包装，`data` 示例：

```json
{
  "account_id": "sub-account-id",
  "revision": 1,
  "schema_version": 1,
  "status_order": ["skip", "active", "graduated", "discarded"],
  "pinned_ids": ["operator-id"],
  "tags": [{ "id": "main", "name": "主力", "operator_ids": ["operator-id"] }]
}
```

PUT 提交整个快照内容，将响应的 `account_id`、`revision` 去掉，并携带 `expected_revision`（首次为 `0`）。不支持局部合并或未知字段。

| 字段 | 约束 |
| --- | --- |
| `schema_version` | 整数 `1` |
| `expected_revision` | 整数 `0..9007199254740990`，必须等于当前版本 |
| `status_order` | `active/graduated/skip/discarded` 四态的完整、不重复排列；前端隐藏弃置时仍保留该值 |
| `pinned_ids` | 有序、不重复，最多 1000 个密探 ID |
| `tags` | 最多 20 个；稳定 ID 为 1–80 个 ASCII 字母、数字、下划线或连字符且唯一 |
| `tags[].name` | 去除首尾空白后 1–40 字且唯一 |
| `tags[].operator_ids` | 不重复，最多 1000 个密探 ID；同一密探可属于多个标签 |

所有密探 ID 为 1–128 字符，必须存在于图鉴且属于子账号游戏版本。标签和顺序不要求改变已招募资料，也不推导新的养成状态。

## 并发与错误

写入在 hub Mongo 事务内先对所属账号加现有写入 fence，再对分类 revision 执行 CAS。与账号删除/游戏切换竞争时不会重建孤立文档。成功后 revision 加一，事务提交后发布账号 SSE `operator_organization`，事件数据含新 revision。服务端不自动覆盖旧版本；客户端收到冲突后重新读取。

| HTTP | code | 含义 |
| --- | --- | --- |
| 404 | `account_not_found` | 子账号不存在或不属于当前用户 |
| 409 | `operator_organization_revision_conflict` | revision 过期、并发首次创建或账号写入竞争 |
| 422 | `invalid_operator_organization` | 字段、版本、标签或图鉴/游戏约束错误，含 `field_path` |
| 422 | `schema_validation_failed` | JSON 请求体无法解析为对象 |

## 验证

在 `BackEndV3-Share/` 执行非容器单元/HTTP 契约测试：

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew test --tests '*OperatorOrganizationServiceTest' --tests '*OperatorOrganizationControllerTest' --tests '*SubAccountServiceTest' --offline --console=plain
```

Mongo CAS 创建/更新竞争、用户/账号隔离及级联删除检查只使用测试自建可销毁容器，须先确保 Docker 可用：

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew integrationTest --tests '*OperatorOrganizationMongoTest' --offline --console=plain
```

Agent 仅检查代码和编译，未执行上述测试。真实页面与跨设备 SSE 由用户验收。发布顺序为后端在先、前端在后，无需迁移旧标注或采集数据。
