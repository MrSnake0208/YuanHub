# 星石临时采集 API

状态：部分支持。已开放的是短期私有 PNG 中转，不是结构化背包导入、CRUD 或完整导出。上传不直接确认识别结果，也不修改用户星石背包；用户仍需在 YuanHub 核对处理。截图会过期，不作为长期备份。

## 分段上传

所有接口使用 OpenAPI Token，Scope 为 `star:capture:write`，账号固定为 Token 绑定账号。

| 方法与路径 | Content-Type / 请求 | 成功 data |
|---|---|---|
| `POST /open-api/star/captures/init` | application/json，完整 manifest | `{capture_id,image_count}` |
| `POST /open-api/star/captures/{captureId}/images/{sourceImageId}` | multipart/form-data，字段 file | `{capture_id,source_image_id}` |
| `POST /open-api/star/captures/{captureId}/finalize` | 无请求体 | `{capture_id,section,image_count,created_at}` |

完整 manifest 使用 `schema_version=1,capture_id,source=maayuan,game_version,sections`。sections 恰好包含 `main,support,experience`，每区包含 `images,adjacent_relations,complete,stop_reason`；main/support 必须完整到底，stop_reason 为 `bottom_no_move`，experience 为 `single_capture`。图片含 `source_image_id,source_order,file_name`；全局顺序从1连续，ID/文件名唯一，上传真实 PNG，文件名与 manifest 一致。这里的 support 是采集传输键，不能与密探佩戴的 assist 槽位键混用。

相邻关系字段为 `previous_source_image_id,current_source_image_id,relation`，relation 使用 `overlap`；必须引用同区已声明图片并满足采集顺序。此处未发布独立星石数据交换 Schema，不把截图 manifest 称为正式背包交换格式。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @star-capture-manifest.json \
  "$BASE_URL/open-api/star/captures/init"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -F 'file=@REPLACE_WITH_DECLARED_IMAGE.png;type=image/png' \
  "$BASE_URL/open-api/star/captures/REPLACE_WITH_CAPTURE_ID/images/REPLACE_WITH_SOURCE_IMAGE_ID"
curl --fail-with-body -X POST -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/star/captures/REPLACE_WITH_CAPTURE_ID/finalize"
```

对每张声明图片上传后再 finalize。缺图返回 HTTP409、`status_code=409`，data 含 `capture_id,missing_source_image_ids`；补图后重试。不能忽略缺图响应而显示采集完成。

## 兼容一次性上传

`POST /open-api/star/captures`，同 Token/Scope，multipart 字段 `manifest`（JSON文本）及重复的 `files`（所有 PNG）。可接收完整三区 manifest，也保留旧版 main 单区 manifest；新采集优先完整分段上传。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -F 'manifest=<star-capture-manifest.json' \
  -F 'files=@REPLACE_WITH_DECLARED_IMAGE.png;type=image/png' \
  "$BASE_URL/open-api/star/captures"
```

成功 data 同 finalize。manifest 声明多张图片时重复 `-F files=@...`，不得省略。上传完成只表示临时截图可处理，不代表 OCR 或背包合并已成功。

## 错误与边界

401 无效 Token；403 Scope；404 账号或上传会话不存在/过期；409 同 capture_id 不同内容、同图片ID不同内容或缺图；422 manifest、图片签名、文件名、完整性或顺序错误。反向重试不能改写已上传图片事实，应保留原采集ID或发起真实的新批次。具体大小及有效期受目标部署配置限制，本页不编造统一数值配额。
