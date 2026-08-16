# 物品图标目录

把物品图标放到本目录，**文件名 = 对象 id**（与「对象目录 / 导出档案」中的 id 完全一致）。

- 扩展名：`.png`（如需其它格式，请改 `src/pages/inventory/index.vue` 顶部 `ICON_EXT` 常量）
- 示例：对象 id 为 `baijinbi`（白金币）的图片 → `inventory-icons/items/baijinbi.png`
- 建议尺寸：正方形（如 128×128 / 256×256），格子内会裁剪为方形显示
- 图片上传后刷新页面即自动显示；未上传的对象显示「图」印占位

参考：id 列表见后端 `GET /v1/inventory/catalog`（公开接口）。
