# 星石采集 API

星石支持 MaaYuan 本地 OCR 后上传结构化 JSON，网页人工核对后导入。旧 PNG 接口继续兼容已有客户端；新采集不再上传图片。

## 本地识别结果（初版）

需要新权限 `star:scan:write`；原 `star:capture:write` 不包含此权限。已有连接码由用户在个人中心明确补齐权限。

| 方法与路径 | 请求 | 成功 data |
|---|---|---|
| `GET /open-api/star/scans/account` | Token | `{account_id,name,game}` |
| `POST /open-api/star/scans` | Token + JSON | `{record_id,status}` |

先读取绑定账号并校验游戏，再采集。正文协议是 `myshare-star-scan@1`，不是星石备份格式：

```json
{
  "format": "myshare-star-scan", "version": 1,
  "record_id": "star-example", "expected_account_id": "acc_example", "game": "如鸢",
  "captured_at": "2026-10-23T00:00:00Z", "width": 720, "height": 1280, "dpi": 320,
  "sections": {"main": true, "support": true, "experience": true},
  "entries": [{"observation_id": "star-0001", "kind": "main", "name": "天府", "quality": "orange", "level": 20, "source": "main/1/col1/y355", "raw_text": "天府 / 20级"}],
  "experience": {"orange": null, "purple": null, "white": null},
  "bag": {"current_count": null, "capacity": null}, "warnings": []
}
```

名称使用简体目录名；品质为 `orange/purple/blue/green/white`。原始识别的名称、品质、等级及数量允许 null，应用前必须补齐星石字段。`observation_id` 仅标识本批观察，不是云端实例 ID。不得传图片、base64、计划或佩戴字段。每批最多 1000 条，每账号最多 20 批待核对结果。

`status` 为 `needs_review/applied/discarded`。相同账号、同批 ID、相同正文重传返回原状态；不同正文返回 409。上传仅暂存，不改背包。网络失败保留原文件、批次和时间，使用 MaaYuan「星石本地报告补传」。本地离线报告首次补传时绑定账号，绑定后不能换账号重传。

站内 JWT 接口使用 `account_id` 查询参数，均校验用户所有权与内测权限：

| 方法与路径 | 行为 |
|---|---|
| `GET /v1/star/scans/pending` | 待核对摘要列表 |
| `GET /v1/star/scans/{id}` | 原报告、当前背包、佩戴版本及关联 |
| `POST /v1/star/scans/{id}/discard` | 放弃报告，不修改背包 |
| `POST /v1/star/scans/{id}/apply` | 人工核对后事务应用 |

应用正文含 `expected_generation/expected_revision/expected_loadout_revision`，以及 `entries`、`experience`、`bag`、`confirm_removals`。条目含 `observation_id/existing_instance_id/kind/name/quality/level`；`existing_instance_id=null` 表示新增，省略观察表示排除误识别。旧实例必须具有相同分类、名称、品质，且一颗旧星石不能对应两条观察。移除旧实例必须明确确认。

应用在原 generation 内更新：保留对应实例的有效计划、佩戴、突破记录；等级变化导致失效的突破不沿用。未对应旧实例及其关联被移除。数量 null 保留旧值，0 是明确清零。变更前保存现有 `import_data_safety` 恢复点，状态、关联和回执同事务写入。相同核对命令重试返回回执，不重复新增；版本变化返回 409，须重新核对。

网页入口：星石背包 →「核对 MaaYuan 本地识别结果」。核对使用独立页面；返回背包时读取最新云端数据。初版不自动猜测同名重复星石的升级对应。

## 旧版分段图片上传

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

`POST /open-api/star/captures`，同 Token/Scope，multipart 字段 `manifest`（JSON文本）及重复的 `files`（所有 PNG）。可接收完整三区 manifest，也保留旧版 main 单区 manifest；旧客户端可继续使用完整分段上传。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -F 'manifest=<star-capture-manifest.json' \
  -F 'files=@REPLACE_WITH_DECLARED_IMAGE.png;type=image/png' \
  "$BASE_URL/open-api/star/captures"
```

成功 data 同 finalize。manifest 声明多张图片时重复 `-F files=@...`，不得省略。上传完成只表示临时截图可处理，不代表 OCR 或背包合并已成功。

## 错误与边界

401 无效 Token；403 Scope；404 账号或上传会话不存在/过期；409 同 capture_id 不同内容、同图片ID不同内容或缺图；422 manifest、图片签名、文件名、完整性或顺序错误。反向重试不能改写已上传图片事实，应保留原采集ID或发起真实的新批次。具体大小及有效期受目标部署配置限制，本页不编造统一数值配额。

## 站内 StarState 突破字段

站内 JWT StarState 当前档案、恢复和完成回执已支持可空 `inventory[].breakthrough_stage`，表示实际完成突破次数，不改变上面的截图采集协议。同一实例身份和等级未变时，同代 PATCH 缺字段保留已有事实；显式 null 清除确认，整数必须与品质和等级匹配。更新沿用 generation/revision CAS 与账号隔离；该字段属于站内 JWT 接口，不属于截图采集 OpenAPI。
