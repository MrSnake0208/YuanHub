# P2-D 名称汇总批量目标编辑交付报告

日期2026-10-09；risk_level=L3；verification_owner=agent。P2-C两仓已本地提交；P2-D未提交，停止等待人工验收。

## P2-C 本地提交

- authoritative source：`2af9d51a40ea6b083a7f597b28c9d28963f27de5`，`fix(growth): 完善库存恢复展示与资源状态`，限定5个文件，包含此前用户认可UI。
- YuanHub：`7cec39af300b197a84b93659b22b9ef9d5ca96e3`，`fix(star): 完善突破瓶子库存冲突恢复`，限定15个文件，先核对暂存清单再提交。
- 两仓分支保持`feat/growth-plan-workspace-p1`。源码提交后在干净工作树正式build:embed，完整同步12文件并更新clean provenance，经校验后提交宿主。
- 本次最后修正只改显示适配/专项：pending保存目标不再覆盖资源摘要；保存/读取中、未确认或无可靠读回为未知；可靠冲突显示实际数量，目标留在提示中；冲突不可估算/不可编辑。writer幂等状态机未修改。
- Git元数据index.lock普通沙箱权限不足时，重试同一限定操作，未使用reset、clean、stash、merge或rebase。

## P2-D 文件清单

源码（10项）：
- `web/src/growth-group-plan.ts`：新增纯函数，品质组筛选、结果分布、校验、智能分配、人工换选与快照指纹。
- `web/src/growth-group-view.ts`：新增组草稿类型与紧凑编辑/预览HTML。
- `web/src/business/session.ts`：新增原子setPlanTargets，整批验证后单次历史记录。
- `web/src/product.ts`：组选择/品质/草稿/预览接线，过期保护、保存中切号保护和历史接线。
- `web/src/growth-plan-view.ts`：复用原左下区域显示组编辑器。
- `web/src/product.css`：仅新增组编辑区样式、局部滚动/换行与新控件触屏覆盖。
- `web/tests/growth-group.test.mjs`：新增26项算法/Session专项。
- `web/tests/product-data-transfer.test.ts`：组批量目标与现有JSON/新ID导入回归。
- `web/package.json`：仅增加test:growth-group定向命令，不改依赖。
- `web/docs/growth-plan-p2d-review.md`：源码审查包。

宿主（7项）：`behavior/growthPlanEmbed.spec.js`、`test/yuanstarEmbedProvenance.test.js`、`public/yuanstar-embed/yuanstar-embed.js`、`public/yuanstar-embed/yuanstar-embed.css`、`docs/yuanstar-embed-manifest.json`、`docs/yuanstar-embed-sync.md`、本报告。

## 入口、品质与档位

名称汇总单击仍经过原220ms计时选择，左下展示组目标编辑器；双击取消单击计时并下钻逐颗明细，返回使用原筛选/滚动/选择逻辑。右侧路线不依赖左侧分组筛选。品质选择只列出当前名称/大类实际存在的品质，优先当前选中实例品质，否则按橙/紫/蓝/绿/白稳定顺序选择。

组成员取当前workspace完整实例集合，精确匹配大类+名称+品质，不混入其他品质或名称，也不把pending-only显示范围误当成实际总数。只读当前分布取实际等级；初始档位取max(当前等级,有效planTargets)结果分布，预填可编辑60/50/40/30，有效目标55等额外等级同样显示；未设目标的1级实例保持未分配余量，不默认增加目标档位。无名额的预设是明确0，与库存未知独立。

档位可改等级/数量、删除和添加（优先新增55，已存在则选下一个未用等级），完成输入/添加时降序排序。等级为1–60整数、数量为非负安全整数，重复等级明确拒绝，名额总数超过本品质组数量提示数量不足。草稿与预览不写计划、不进入导出。

## 智能分配和人工预览

纯函数按目标等级从高到低分配。先使用实际等级已达到该目标的实例，其次最小升级等级增量；同等条件优先保持已有合理计划，仍并列按provenance.sourceOrder/行列/稳定starInstanceId。按ID占用名额，每个实例只出现一次；临时表格排序不改变结果。

预览列出每个实例的新增/修改/移除/保持不变，展示稳定序号、当前等级与旧目标；长ID仅作为控件内部值。人工选择未占用实例可替换，选择已占用实例则交换名额，不能跨品质或重复占用。已经达到目标直接满足名额，不降低实际等级、不生成已完成计划，不另弹删除确认。

初始档位表示真实结果分布。如果60级实例满足50级名额，确认不会把它降到50；重新打开会按真实60级重新推导，不保留一份独立的50级名额表。这是只有planTargets权威且无groupGoals的边界，需要人工确认文案是否清楚。

## 原子保存、Undo与保护

确认通过一次WorkspaceSession.setPlanTargets更新当前品质组的受影响实例。全部ID/等级先校验，再生成一条历史动作；其他名称/品质不变，inventory、经验和瓶子无扣减。既有snapshot规范自动清理达成/取消目标、修剪路线引用；剩余顺序保持，新待养成追加路线末尾。

现有controller一次IndexedDB事务、一条业务变更回调；测试验证record revision只增加1、云业务提交回调只一次、重复确认不重复写。Undo恢复旧计划与路线；保留原逐颗编辑与历史链路。

预览绑定账号、record revision、上下文epoch和完整业务事实指纹（含库存、实例当前等级/身份/provenance、计划、路线、经验、包与OCR证据）。比较库存时按ID规范化排列，避免云快照与Session排序不同造成误报。确认点击和进入Session回调均校验；其他页面直接改IDB导致revision冲突时由原CAS原子拒绝并重载，旧预览失效。保存中禁止切号，同值generation替换也使预览失效；账号切换丢掉页面草稿。

不改变现有JSON schema：批量结果仍是逐颗目标和路线索引，导出目标正确、导入生成新ID并恢复相应目标/顺序，旧JSON继续兼容。草稿/预览不导出；不改OCR身份，也不迁移跨generation计划。

## 已运行验证

- P2-C修正提交前：源码typecheck、test:growth-plan、正式构建通过；受影响行为74/74；writer/provenance32/32；clean正式来源provenance6/6；宿主构建通过。
- P2-D纯函数/Session专项26/26。源码typecheck、test:growth-plan、test:product-workspace、test:product-data-transfer通过。
- 实际产物行为104/104：growthPlanEmbed40（13项新增P2-D）、embedProduct17、starRecoveryUx40、growthPlanInventoryApi2、growthPlanInventoryIdentity5。
- 库存writer/provenance32/32，其中writer26保持0数量、原幂等正文、已确认不重复POST、恢复编辑、账号隔离等原有约束。
- 正式build:embed（含OCR资产guard）和宿主build（含OCR gzip校验）通过；两仓diff --check通过。
- 所有批量确认、资源/库存写入测试为mock/fixture。没有向真实账号写虚构计划或库存，没有真实OCR或资源扣减测试，没有全仓无关测试。

最小复验命令：

```sh
# authoritative source/web
npm run typecheck
npm run test:growth-group
npm run test:growth-plan
npm run test:product-workspace
npm run test:product-data-transfer
# YuanHub
node node_modules/vitest/vitest.mjs run behavior/growthPlanEmbed.spec.js behavior/embedProduct.spec.js behavior/starRecoveryUx.spec.js behavior/growthPlanInventoryApi.spec.js behavior/growthPlanInventoryIdentity.spec.js
node --test test/growthPlanInventory.test.js test/yuanstarEmbedProvenance.test.js
```

改源码后需正式build:embed及完整同步，不能修改生成JS/CSS。构建只保留原有动态/静态import并存提示，无构建错误。

## 预览、截图和人工验收

当前预览：`http://127.0.0.1:5175/star`。5175已经运行；本轮启动尝试因端口占用退出，随后只复用服务，未停止/重启它。公开Backend要求沿用`https://api-hub.maayuan.com`；本轮未变更API/Vite配置，真实宿主页当前显示已同步；`/ready`401只表示代理可达，不是就绪成功，未单独读取运行进程的环境变量证明proxy target。

截图与UX证据均位于`.ux/audits/p2d/`（gitignored）：
- `live-desktop.jpg`：真实宿主1440px，只读选择天府组，60×5/40×1/1×5当前分布，两栏等宽、按钮32px。
- `live-mobile.jpg`：真实宿主390px，组编辑自然单列，按钮沿宿主32px硬覆盖、新输入触屏44px，无横向溢出。
- `desktop-editor.jpg`、`desktop-custom55.jpg`、`desktop-preview.jpg`、`desktop-applied.jpg`：隔离fixture，多品质、新增55×2/降序、人工按ID换选与应用后逐颗变化。
- `mobile-editor.jpg`、`mobile-preview.jpg`：隔离fixture手机触屏编辑/预览。
- `responsive.json`：隔离fixture320/390/430/768/1024/1440px无横向溢出。首次320pxfixture漏了宿主已有min-width:0，补齐fixture约束后通过；没有为此改产品布局。
- `fixture.html`、`ux-review.md`：可重复的隔离演示和结构性审查。实际写入确认只在fixture操作，真实宿主页未点击确认或保存。

临时设备尺寸/触控仿真均已恢复。未安装额外skill；环境无usability-audit/audit-cuj，使用ui-ux-pro-max的批量操作/反馈原则、仓库规范、静态+真实/隔离浏览器证据做相应审查，未伪称执行缺失skill。

需用户人工确认：初始结果分布与低档位可由高等级抵扣的文案；桌面双列档位/手机单列；组内稳定序号和交换名额的理解；400px局部滚动；宿主手机按钮继续32px的现有覆盖。真实手机软键盘、真机触控/屏幕阅读器、在线多设备并发尚未验证。

## 停止边界与 Git

P2-D两仓均未commit/暂存；源码HEAD仍为`2af9d51a40ea6b083a7f597b28c9d28963f27de5`，宿主HEAD仍为`7cec39af300b197a84b93659b22b9ef9d5ca96e3`。manifest以P2-C提交为基线，如实记录P2-D dirty source及10个改动/新增文件hash，完整12文件产物与dist/embed/manifest一致。worker、模型、ORT和规则资源字节保持不变。

未push、未rebase、未merge、未开PR、未修改YuanStar-public、未修改Backend、未进行真实库存写入测试。没有跨generation继承或P3。完成后停止，等待人工验收。
