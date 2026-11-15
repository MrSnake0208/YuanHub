# MaaYuan 背包日志附件

背包沿用 diagnostics/intents 的 log 声明、COS 私有直传及 complete 接口，无新增公开下载入口。gzip 上限 4MiB，解压后 UTF-8 上限 16MiB；保留原有鉴权、归属、14 天保留期与每日配额。

新增 inventory_bag_scan issue code `bag_scan_log`：stage 为 bag_tab1/bag_tab3_1/bag_tab3_2，reason 为 completed 或 failed，count=1；用于没有数量诊断或异常退出的运行日志归档。outcome 沿用 data_review，异常是否发生以 reason=failed 和日志为准。原有 bag_count_suspect 仍可同时附完整日志。

先部署本后端，再发布新客户端。客户端只收集本次分类扫描的 debug/custom 日志，脱敏连接码、凭据、目录用户名和邮箱；不收集整天日志或 maa.log。超过边界时返回明确的日志收集失败摘要。

未运行自动化验证。需要上线后核对日志附件状态 ready、实际内容包含定位失败原因及完整单行；accepted 仅表示诊断接收成功，附件仍可能上传失败。
