# 星石结构化同步与 JSON 手动补传

星石完整识别结果直接复用结构化同步服务，不上传截图。

- MaaYuan 自动同步：`POST /open-api/star/inventory-sync`，绑定账号连接码需要 `star:sync:write`（30003）。`GET /open-api/star/inventory-sync/{scan_id}` 查询持久回执。
- 网页手动补传：星石背包 → 更多 → 导入/导出 JSON → 导入档案。自动区分原有 YuanHub 备份、MaaYuan `inventory.json`（schemaVersion 2 / local-shadow）和 `inventory-sync.json`（maayuan-star-inventory / version 1）。不按文件名判断。
- 手动补传使用当前用户 JWT：`POST /v1/star/inventory-sync/preview?account_id=...` 只校验、预览；`POST /v1/star/inventory-sync?account_id=...` 确认保存。正文为 `{document, game, source_format}`，确认额外要求 `expected_generation`、`expected_revision`；`source_format` 为 `local-ocr` 或 `compact`。`document` 仍是现有严格精简协议，不含诊断或内部身份字段。
- 服务端校验账号所有权、游戏版本、标准名称/类别/品质/等级、完整扫描、分区及经验/背包数量。当前两款游戏共用名称目录；本地原始文件没有游戏账号身份，目标由网页当前账号和确认操作决定，不声称已自动识别文件所属账号。
- 精简批次保留原 `scan_id`。原始文件使用稳定业务内容标识，并按当前账号核对已保存的完整等价同步回执；相同结果已自动同步时也不再重建。无原批次编号的原始文件不能区分内容完全相同的不同扫描，保守视为已保存，不用于再次覆盖后续编辑。历史回执不会过期。
- 未完成主辅星扫描和错误字段会拒绝。精简同步批次与原始 OCR 文件的橙、紫、白经验星曜数量各自接受非负整数或显式 `null`，三项均未知也可同步，缺少数量字段会拒绝。原始文件含未知数量时，经验分区的 `complete` 和 `structured` 必须均为 `false`，主辅星扫描仍须完整。未知数量会替换旧值，背包显示为空，导入预览显示“未知”，养成计划的完整可用经验显示“—”。原始文件没有背包容量时保持未知，已确认的容量仍须通过背包校验。
- 沿用背包重建事务、恢复点、佩戴继承与失配清理、旧计划来源保护和继承待办。旧计划待办未处理时拒绝新的重建；请先进入养成计划确认继承或放弃，再重选文件。
- 确认前不写云端。预览过期、账号/游戏切换、云端版本变化、本机待保存业务或截图草稿会阻止提交。网络结果不明时保留原文件，重新加载核对后重试同一文件。

旧 `/open-api/star/captures*`、`/open-api/star/scans*`、`/v1/star/captures*`、`/v1/star/scans*` 接口与 `/star/scans` 页面已退役，权限 30001/30002 不复用。应用不再读写旧临时截图或扫描报告；本次不删除历史集合和文件。

网页手动上传截图、分类、重叠标记、本机 OCR 模型/Worker、人工核对、快照、分享及原有 JSON 备份导入导出继续保留。正式嵌入资源未改写；当前实际备份解析器仍使用 schemaVersion 1，不能把本地 OCR schemaVersion 2 当作备份格式。
