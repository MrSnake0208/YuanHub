# 星石本地识别传输

旧 myshare-star-scan@1 暂存、网页专属扫描核对页以及跨端 PNG 传输接口已经退役。历史 star_scan_records 集合与临时文件本轮不清理。

当前使用 `/open-api/star/inventory-sync` 完整结构化同步；网页补传使用用户 JWT `/v1/star/inventory-sync/preview` 与 `/v1/star/inventory-sync`，复用同一服务及事务。详见 [同步契约](standards/star-inventory-sync-v1.md) 和 [前端 API 说明](../../frontend/docs/developers/api-star.md)。网页截图 OCR 保留。
