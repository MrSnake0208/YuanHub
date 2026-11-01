// Only metadata is JavaScript. Protocol bodies remain separate, authoritative files.
export const developerDocuments = [
  {
    "id": "home",
    "title": "开发者中心",
    "path": "/developers",
    "source": "developers/index.md",
    "version": "V1",
    "status": "公开入口",
    "summary": "接入能力、正式协议与维护状态",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "guide",
    "title": "第三方接入指南",
    "path": "/developers/guide",
    "source": "developers/guide.md",
    "version": "V1",
    "status": "接入指南",
    "summary": "能力选择、开发调试、逐用户授权与上线安全",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api",
    "title": "API 参考",
    "path": "/developers/api",
    "source": "developers/api.md",
    "version": "2026-10-18",
    "status": "代码已核对",
    "summary": "认证、Scope、响应及功能索引",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-inventory",
    "title": "库存及物品",
    "path": "/developers/api/inventory",
    "source": "developers/api-inventory.md",
    "version": "V2",
    "status": "正式支持",
    "summary": "物品、心纸、奖励读写与导出",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-operator",
    "title": "密探及养成",
    "path": "/developers/api/operator",
    "source": "developers/api-operator.md",
    "version": "V2–V5",
    "status": "部分支持",
    "summary": "Token 扫描限制与 JWT 完整备份",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-recruitment",
    "title": "招募档案",
    "path": "/developers/api/recruitment",
    "source": "developers/api-recruitment.md",
    "version": "V1",
    "status": "JWT 支持",
    "summary": "招募备份、恢复与抽数风险",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-calendar",
    "title": "日历与每日历练",
    "path": "/developers/api/calendar",
    "source": "developers/api-calendar.md",
    "version": "当前接口",
    "status": "正式支持",
    "summary": "活动只读、历练读取与完成勾选",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-star",
    "title": "星石临时采集",
    "path": "/developers/api/star",
    "source": "developers/api-star.md",
    "version": "采集 V1",
    "status": "部分支持",
    "summary": "PNG 临时上传，不是结构化背包 API",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "api-work",
    "title": "作业与兼容性",
    "path": "/developers/api/work",
    "source": "developers/api-work.md",
    "version": "V1",
    "status": "部分支持",
    "summary": "原生创作、公开读取与 Adapter 边界",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "protocols",
    "title": "数据交换协议",
    "path": "/developers/protocols",
    "source": "developers/protocols.md",
    "version": "2026-10-18",
    "status": "支持矩阵",
    "summary": "正式、兼容旧版与尚未实现的能力",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "inventory-v2",
    "title": "库存交换 V2",
    "path": "/developers/protocols/inventory-v2",
    "source": "exchange-specs/inventory-v2.md",
    "version": "V2",
    "status": "正式 · 推荐",
    "summary": "奖励增量、完整和局部快照",
    "updated": "2026-10-18",
    "downloads": [
      "exchange-specs/schemas/inventory-exchange-v2.schema.json",
      "exchange-specs/examples/inventory-full-snapshot.json",
      "exchange-specs/examples/inventory-listed-agent-snapshot.json",
      "exchange-specs/examples/inventory-reward-delta.json"
    ]
  },
  {
    "id": "operator-v5",
    "title": "密探交换 V5",
    "path": "/developers/protocols/operator-v5",
    "source": "operator-growth-data-exchange-protocol-v5.md",
    "version": "V5",
    "status": "正式 · 备份推荐",
    "summary": "等级突破与历史观测，继承 V3/V4",
    "updated": "2026-10-18",
    "downloads": [
      "schemas/operator-growth-exchange-v5.schema.json",
      "examples/operator-growth-exchange-v5/boundary.valid.json",
      "developers/examples/operator-scan-v5.json"
    ]
  },
  {
    "id": "recruitment-v1",
    "title": "招募备份 V1",
    "path": "/developers/protocols/recruitment-v1",
    "source": "developers/recruitment-v1.md",
    "version": "V1",
    "status": "正式 · JWT",
    "summary": "完整档案备份，不是普通增量导入",
    "updated": "2026-10-18",
    "downloads": [
      "developers/schemas/recruitment-exchange-v1.schema.json",
      "developers/examples/recruitment-v1.json"
    ]
  },
  {
    "id": "work-v1",
    "title": "Work V1",
    "path": "/developers/protocols/work-v1",
    "source": "exchange-specs/work-v1.md",
    "version": "V1",
    "status": "正式协议",
    "summary": "自动战斗作业的原生语义格式",
    "updated": "2026-10-18",
    "downloads": [
      "exchange-specs/schemas/work-protocol-v1.schema.json",
      "exchange-specs/examples/work-v1.json"
    ]
  },
  {
    "id": "work-adapters",
    "title": "Work Adapter",
    "path": "/developers/protocols/work-adapters",
    "source": "exchange-specs/work-adapters-v1.md",
    "version": "V1",
    "status": "部分支持",
    "summary": "MaaYuan 与 YuanAssist 映射规则",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "operator-v4",
    "title": "密探 V4（历史）",
    "path": "/developers/protocols/operator-v4",
    "source": "operator-growth-data-exchange-protocol-v4.md",
    "version": "V4",
    "status": "兼容旧版",
    "summary": "独立化极，不含等级突破",
    "updated": "2026-10-18",
    "downloads": [
      "schemas/operator-growth-exchange-v4.schema.json",
      "examples/operator-growth-exchange-v4/independent.valid.json",
      "examples/operator-growth-exchange-v4/legacy31.valid.json",
      "examples/operator-growth-exchange-v4/unowned-stage.invalid.json"
    ]
  },
  {
    "id": "operator-v3",
    "title": "密探 V3（历史）",
    "path": "/developers/protocols/operator-v3",
    "source": "operator-growth-data-exchange-protocol-v3.md",
    "version": "V3",
    "status": "兼容旧版",
    "summary": "双命盘、标注、分区与旧化极标量",
    "updated": "2026-10-18",
    "downloads": [
      "schemas/operator-growth-exchange-v3.schema.json",
      "examples/operator-growth-exchange-v3/full-backup.valid.json",
      "examples/operator-growth-exchange-v3/scan-sp.valid.json",
      "examples/operator-growth-exchange-v3/schema-invalid.json",
      "examples/operator-growth-exchange-v3/semantic-review.json",
      "examples/operator-growth-exchange-v3/discarded-listed.valid.json"
    ]
  },
  {
    "id": "operator-v2",
    "title": "密探 V2（历史）",
    "path": "/developers/protocols/operator-v2",
    "source": "exchange-specs/operator-v2.md",
    "version": "V2",
    "status": "兼容旧版",
    "summary": "第三方 export 当前仍输出此版",
    "updated": "2026-10-18",
    "downloads": [
      "exchange-specs/schemas/operator-exchange-v2-import.schema.json",
      "exchange-specs/examples/operator-v2-listed-snapshot.json"
    ]
  },
  {
    "id": "common",
    "title": "公共约定",
    "path": "/developers/protocols/common",
    "source": "exchange-specs/common-conventions.md",
    "version": "当前约定",
    "status": "正式",
    "summary": "JSON、时间、幂等与覆盖范围",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "transport",
    "title": "传输与鉴权",
    "path": "/developers/protocols/transport",
    "source": "exchange-specs/transport.md",
    "version": "当前接口",
    "status": "正式",
    "summary": "JWT 与 Token 不可互换",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "catalogs",
    "title": "公共目录",
    "path": "/developers/protocols/catalogs",
    "source": "exchange-specs/catalogs.md",
    "version": "V1",
    "status": "正式",
    "summary": "合法 ID、目录版本与客户端缓存",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "changelog",
    "title": "协议更新记录",
    "path": "/developers/changelog",
    "source": "developers/changelog.md",
    "version": "2026-10-18",
    "status": "独立记录",
    "summary": "格式、兼容性与公开接口变化",
    "updated": "2026-10-18",
    "downloads": []
  },
  {
    "id": "gaps",
    "title": "第三方能力缺口",
    "path": "/developers/gaps",
    "source": "developers/gaps.md",
    "version": "2026-10-18",
    "status": "尚未实现",
    "summary": "明确未开放的 API 与转换边界",
    "updated": "2026-10-18",
    "downloads": []
  }
]

export const developerFiles = [...new Set(developerDocuments.flatMap(doc => [doc.source, ...doc.downloads]))]

export const developerPageLinks = ["/user/profile", "/changelog", "/developers", "/developers/use-cases/operator-read"]
