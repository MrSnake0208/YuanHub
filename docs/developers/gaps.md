# 第三方接入缺口

这些能力未在本次实现，也不因已有文档、Schema 或站内 UI 而成为公开 API。

## 尚未实现

| 能力 | 当前边界 |
|---|---|
| Token 完整密探 V5 导出 | `/open-api/operator/export` 固定 V2；不能表达完整突破、双命盘和主观数据 |
| Token 完整密探恢复和主观写入 | V3/V4/V5 仅单来源 `scan + listed` 客观记录 |
| Token 招募档案读取、导入和导出 | 无招募 OpenAPI Scope；现有备份接口只接受 JWT |
| Token 星石背包结构化 CRUD/导出 | 只有临时截图上传；截图不直接写结构化背包 |
| Token Work 创作及通用目标导出 | 原生创作需 JWT；Adapter 只返回确认无损的目标文档 |

## 部分支持

Work V1 已有实际 HTTP 接口，MAAYUAN/YUANASSIST Adapter 仍存在未映射动作与未确认执行语义。MAAYUAN 目标结果不是完整 MaaFramework Pipeline；必须检查 `status/issues`，不得丢动作后包装成 exact。星石采集是临时私有中转，需用户在站内识别、核对后处理。

## 没有正式承诺

任意 Pipeline 通用转换、跨账号 Token、绕过 Beta 资格、在线协议管理后台及统一 API 速率服务均不属于 V1。历史规划或 Draft 不自动转为支持承诺；后续必须独立设计、实现并取得验证证据后再更新本中心。
