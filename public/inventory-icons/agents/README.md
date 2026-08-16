# 角色图标目录

把角色（密探）图标放到本目录，**文件名 = 对象 id**（与「对象目录 / 导出档案」中的 id 完全一致）。

- 扩展名：`.png`（如需其它格式，请改 `src/pages/inventory/index.vue` 顶部 `ICON_EXT` 常量）
- 示例：对象 id 为 `agent_xxxx` 的图片 → `inventory-icons/agents/agent_xxxx.png`（以目录实际 id 为准）
- 建议尺寸：正方形（如 128×128 / 256×256），格子内会裁剪为方形显示
- 图片上传后刷新页面即自动显示；未上传的对象显示「图」印占位

参考：完整 id 列表见前端本地目录 `src/data/inventory/catalog.js` 的 `AGENT_CATALOG`（由 `scripts/build-inventory-catalog.mjs` 从上游 operators.json 生成），后端 `GET /v1/inventory/catalog` 亦可供核对。
