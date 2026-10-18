# Work V1 API

状态：原生 Work V1 与下列 HTTP 接口已实现；MaaYuan/YuanAssist Adapter 部分支持。格式见[Work V1](../exchange-specs/work-v1.md)，映射见[Adapter 规则](../exchange-specs/work-adapters-v1.md)。没有 Work OpenAPI Token Scope。

## 公共读取与预览

| 方法与路径 | 认证 / Scope | 参数 / 请求 | 成功 data |
|---|---|---|---|
| `GET /v1/works` | 公共 / 无 | page默认1、limit默认20（1..100） | `{page,limit,total,has_next,items}` |
| `GET /v1/works/{id}` | 公开作品无需认证 | 作品 ID | `{metadata,conversion,work,...}` |
| `GET /v1/works/{id}/compatibility` | 公开作品无需认证 | 必填 `to=MAAYUAN|YUANASSIST` | 目标兼容性结果 |
| `POST /v1/works/compatibility` | 公共 / 无 | to同上；`{document:<WORK_V1_OBJECT>}` | 未保存文档兼容性结果，不写数据 |

原生 ID 为 `w_...`，旧公开作业 ID 为数字字符串。原生草稿只能由作者 JWT 访问，不存在、不可见或已删除统一404。列表仅基础分页，不宣称支持搜索、标签或自定义排序。

```bash
curl --fail-with-body "$BASE_URL/v1/works?page=1&limit=20"
curl --fail-with-body --get --data-urlencode 'to=MAAYUAN' \
  "$BASE_URL/v1/works/REPLACE_WITH_PUBLIC_WORK_ID/compatibility"
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @work-compatibility-request.json \
  "$BASE_URL/v1/works/compatibility?to=YUANASSIST"
```

POST 请求须把协议文档包装在 `document` 中，不能直接提交裸 Work JSON。

## 原生创作（JWT）

| 方法与路径 | 参数 / 请求 | 成功 data |
|---|---|---|
| `POST /v1/works` | `{document}` | 原生详情，固定初始 DRAFT |
| `GET /v1/works/mine` | page、limit 同公共列表 | 本人分页列表 |
| `PUT /v1/works/{id}` | `{expected_revision,document}` | 更新后的详情 |
| `POST /v1/works/{id}/publish` | `{expected_revision}` | 已发布详情 |
| `POST /v1/works/{id}/unpublish` | `{expected_revision}` | 草稿详情 |
| `DELETE /v1/works/{id}` | JSON `{expected_revision}` | true，软删除 |

所有写操作要求作者普通 JWT；owner 不从请求体指定。revision 每次成功变更加一，只有原生作品可编辑。非作者与不存在统一404；版本冲突409并给出 `data.current_revision`。

```bash
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  -H 'Content-Type: application/json' --data-binary @work-create-request.json \
  "$BASE_URL/v1/works"
```

## 兼容性与错误

`conversion.status` 和目标分析状态是 `exact|partial|unsupported`。只有 exact 返回 `target_document`，partial/unsupported 不返回可执行降级文件。检查 issues 中的路径和原因；MAAYUAN 的当前结果是标准化 round_actions，不是完整 Pipeline；YUANASSIST 只有可确认语义才返回 `scriptContent/instructions/config`，这些目标字段保留 camelCase。

HTTP400 表示分页、目标、结构或语义错误，可能带 `data=[{path,code,message}]`；401 未登录；404 不可见；409 revision 冲突。所有成功响应使用 `status_code/message/data`。不因返回 work 就宣称所有目标平台可执行，也不删除未知动作来取得 exact。
