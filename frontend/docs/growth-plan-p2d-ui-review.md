# P2-D 组编辑 UI 调整交付

日期：2026-10-09。risk_level=L2，verification_owner=agent。只调整已有组编辑展示及轻微 DOM 接线；不 commit/push/PR。

## 本轮实际修改文件

保留此前未提交 P2-D 内容，本清单只列本次 UI 轮新增修改。

| 仓库 | 文件 | 内容 |
| --- | --- | --- |
| yuanstar-yuanhub | web/src/growth-group-view.ts | 档位小块、叉删除、加号、删除整句说明、简洁预览统计 |
| yuanstar-yuanhub | web/src/product.css | 4/3/2 列容器响应、扁平输入、居中空态、双栏路线空间联动 |
| yuanstar-yuanhub | web/src/product.ts | 养成区 select 自动接入既有 SoftDropdown；组选择保持草稿/焦点语义 |
| yuanstar-yuanhub | web/src/growth-route-controls.ts | 以旧卡片可视高度为下限提供布局变量，双栏组编辑解除固定上限 |
| yuanstar-yuanhub | web/docs/growth-plan-p2d-review.md | 补充本轮来源与边界 |
| YuanHub | behavior/growthPlanEmbed.spec.js | 简洁变化摘要断言、品质重选/切换/名额适配回归 |
| YuanHub | test/yuanstarEmbedProvenance.test.js | dirty source 清单增加 route-controls |
| YuanHub | docs/yuanstar-embed-manifest.json | 源码与12文件产物 SHA-256 |
| YuanHub | docs/yuanstar-embed-sync.md | 本轮构建同步说明 |
| YuanHub | public/yuanstar-embed/yuanstar-embed.js | 正式构建产物 |
| YuanHub | public/yuanstar-embed/yuanstar-embed.css | 正式构建产物 |
| YuanHub | docs/growth-plan-p2d-ui-review.md | 本报告 |

## UI 结果

- 档位合成“等级 × 数量”小块，删除为右上角叉；加号仅一个字符，32×32px。
- 所有养成区 select 自动复用页面既有 SoftDropdown，包括品质和预览名额；后续新增也进入相同接线。重选当前品质只关闭并恢复焦点，不重置草稿。
- 整句删除“组目标编辑器……”可见说明，只保留标题、当前等级分布和实际操作内容。
- 名称汇总未选中空态上下左右居中，字号 .875rem。
- 预览仅目标、实际名额下拉、按现有 changes 汇总的短句；没有逐颗流水账，也没有新算法或持久化结构。
- 双栏组编辑的路线滚动区随左侧增高；普通逐颗与单栏继续使用原卡片高度规则。实测同一真实账号编辑状态路线471px，预览570px；预览左右栏底部均941.35px。

## 受影响范围验证

- source `npm.cmd --prefix web run typecheck` 通过。
- source `npm.cmd --prefix web run build:embed` 通过，OCR guard 通过。存在既有静态/动态重复 import 提示，不影响构建。
- host `npm.cmd run test:behavior -- behavior/growthPlanEmbed.spec.js`：41/41；覆盖品质重选保留草稿、不同品质切换、名额交换、预览不写入、原子应用、撤销和陈旧预览拒绝。
- host `node --test test/yuanstarEmbedProvenance.test.js`：6/6。
- 两仓 `git diff --check` 通过。完整12文件同步，源码与产物哈希/字节相等；业务分配算法及 Session 相对本轮开始 hash 不变。
- 实际 `/star` 页面列数：1440px=4，1200px=3，1120px=2，390px=2，320px=1；均无页面级横向溢出。真实桌面档位输入、品质按钮、预览按钮均32px。
- 隔离 fixture 核对空态、预览、手机无溢出；没有在真实账号点击确认应用或更改资源。截图为真实账号只读 UI 浏览/草稿预览。
- 未运行全量测试、宿主全量构建、真实设备或服务端写入验证。

## 截图与证据

均放在被 Git 忽略的 `.ux/audits/p2d/`，不提交：

- `ui-desktop.jpg`：1440px 真实桌面四列组编辑。
- `ui-mobile.jpg`：390px 手机模拟两列组编辑。
- `ui-desktop-preview.jpg` / `ui-mobile-preview.jpg`：简洁预览。
- `ui-empty.png`：隔离空态。
- `ui-responsive.json`：运行时列数、高度和溢出证据。

## 后续拍板

没有必须补充的产品决定。卡片密度、叉按钮和变化短句可继续按用户目测微调；当前采用较紧凑、较少文字的方案。未改变分配、排序、多选、资源、库存恢复、JSON 导入导出、跨 generation 或 P3。
