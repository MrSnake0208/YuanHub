# P3-B UI定向修正交付

## 2026-10-10 三仓收口

用户已人工验收主要UI，并授权本地提交及origin同名feature推送。源码最新9文件已提交为`836c40c4b55e7787e8ddf1ab47564354b495b82c`，实际clean；按顺序从clean提交重新build:embed并正式同步，12文件集合、字节及SHA-256一致，正式manifest记录该SHA及clean。开发dirty预览未用于正式同步，演示机制保留。

本次最小隔离测试复现了演示重置后旧pending恢复而虚拟回执已丢失的边界。重置与切换场景只清理虚构账号对应的原v1恢复键，其他用户、账号、游戏记录保持原样；正式完成幂等与持久格式未改。已新增两项回归测试。本次没有重新调整已验收UI。

源码重新运行UI26/26、完成命令32/32、growth-plan、typecheck及build:embed/OCR guard，均通过。宿主完成/云协调器/库存兼容48/48通过；provenance、生产构建及生产隔离检查的最终结果见下方本次收口验证。此前各表为历史验证，不代表本次全量重跑。

本次收口验证：宿主starCompletion、starCloudCoordinator、growthPlanInventory及yuanstarEmbedProvenance合计54/54，0失败/跳过，其中provenance6/6；源码编译的真实CompletionCommand与Mock重置集成2/2，确认当前演示恢复键已清、其他owner/game记录保留、新草稿可准备且未发第二个POST。宿主production build及OCR压缩校验通过；生产JS不含虚构身份/实例、Mock服务器存储键或dirty预览路径。两仓diff检查通过。Backend历史事务10/10、旧StarState11/11、旧Inventory5/5及定向单测82/82本轮均未重跑，没有启动Docker。

远端边界：本轮fetch及ls-remote均遇到GitHub连接重置或超时，当前未能可靠核对三仓同名feature，因此暂未执行push。本地提交及来源同步不依赖该网络结果；网络恢复后仍须逐仓确认远端不存在或为本地祖先，再按源码→宿主→Backend非强制推送并核对SHA，不可猜测远端状态。最终远端结果以本次最终报告为准。

宿主本次提交范围仍为已有17个相关文件；最终commit由本feature的git log和远端引用确认。Backend仍为`5788e39e9183792392bcdd839b1d6ccbce89fbb9`且clean，无新Backend提交或重跑Mongo。真实STAR_COMPLETION=false；不合并main、不开PR、不部署、不执行真实扣减。下文“未commit/旧正式embed”均为此前UI验收阶段状态，已由本节替代；push是否完成以本次最终报告为准。

本轮完成入口资源判断与紧凑弹窗，保留全部完成/回执业务。隔离演示仍为`http://127.0.0.1:5175/star?star_completion_demo=1`，新增开发场景选择：一色、两色、三色、251k不足、库存未知、六颗。所有场景均为原虚构账号及Mock transport，普通公开Backend预览未切换。没有真实资源写入，没有Backend修改、commit、push、merge、rebase、PR或部署。

## A. 本轮实际修改文件

源码9个（源文件在web/src，测试在web/tests）：

- `docs/growth-plan-p3b-ui-review.md`
- `web/package.json`
- `web/src/growth-plan.ts`
- `web/src/growth-plan-view.ts`
- `web/src/product.ts`
- `web/src/star-completion-dialog.ts`
- `web/src/star-completion.css`
- `web/src/star-completion-resource-view.ts`
- `web/tests/star-completion-ui.test.ts`

宿主6个，叠加于上一轮未提交成果：

- `src/pages/star/index.vue`
- `src/pages/star/dev/starCompletionDemo.js`
- `src/pages/star/dev/starCompletionMock.js`
- `test/starCompletion.test.js`
- `scripts/stage-star-completion-preview.mjs`
- `docs/growth-plan-p3b-ui-closeout.md`

正式`public/yuanstar-embed`、manifest及正式sync脚本本轮未变动；它们仍保留上轮未提交改动。全部旧成果保留，没有reset/clean/stash。

## B–C. 入口状态

| 状态 | 文案及行为 |
| --- | --- |
| 无选择 | 完成所选养成，禁用 |
| 选中集合资源已知足够 | 完成所选养成，开发演示可进入确认；真实feature仍关闭 |
| 任一项确定不足 | 养成资源不足，禁用 |
| 尚未确认需要的库存/规则 | 养成资源待确认，禁用 |
| 有原待定完成命令 | 完成结果待确认，禁用新的消费操作，按原命令恢复 |

只取选中stable ID集合并求sumGrowthDemand；不依赖路线分割线，也不计入未选中实例。三色经验已知后按原工作簿折合总量比较；每瓶单独核对。确定不足优先于其他未知；无需消费的未知瓶子不被误当成正数资源。选择、库存或计划变化后，原渲染路径重算；点击处理也重新检查一次，不能用过期按钮绕过。pending还检查账号隔离持久键，存储读取失败时阻止新命令。

浏览器确认：三颗302k需求与251k库存时禁用；取消43→60后需求134k，恢复可点击。未知橙库存显示“养成资源待确认”，与确定不足不同。保守入口判断只决定是否打开弹窗；Backend协议及用户实际数量允许低于估算/明确0的规则没有修改。

## D–G. 资源与输入

- 经验按橙→紫→白：库存>0保留；明确0库存且实际0隐藏；正数或非法数量保留并阻止确认；null显示未知，不转换成0。
- 标题始终独立成行；经验星曜每行最多两项，三色时橙紫同行、白下一行，没有占位资源。瓶子使用独立两列网格，从经验星曜全部结束后的新行开始。
- 只使用一个“实际资源消耗”标题（600字重）和一次“持有 → 剩余”提示。每项第一层是色块及数量，第二层是库存箭头关系；消费数字600，库存400。
- 经验是真实text/inputmode=numeric输入，范围及整数解析不变，去四边框与focus矩形阴影，底线复用养成路线序号的3px实线/3px间隔虚线，focus加深/加粗。无number spinner，键盘和触控保持。仅修改完成弹窗输入。
- 删除“实际折合经验”、经验星曜/突破材料等重复栏目；原经验算法仍用于默认建议、入口判断及测试。
- 瓶子按解注→解谪→解殃，仅本次正数消耗展示，两列自动换行，不可编辑。端点checkbox立即重算：40→50默认解谪50/解殃20；仅去起点两者隐藏；双端修正60/60。余额200→133、400→350等计算保留，未知为—→—。

## H. 列表滚动

1–5颗自然高度，不加内部高度限制。超过5颗测量前五行真实高度，独立纵向滚动，并保留第六颗等全部稳定ID及控件。窗口变化时ResizeObserver重测，窄屏可按视口进一步收紧。桌面五颗clientHeight=scrollHeight=199，六颗clientHeight=200、scrollHeight=240，前五行总高200。键盘End已能滚动到后续行。

## I. 实际验证

2026-10-10局部布局补修：UI专项26/26，0失败/跳过；源码typecheck、build:embed/OCR guard及git diff --check通过。只调整标题分行、经验/瓶子分组及输入虚线，未改变完成命令逻辑。下表保留上一轮已执行的验证记录，其他专项本次未重复执行。

补修浏览器验证：1440px及默认319px视口中，标题底部均在经验网格上方；橙紫同排，白在下一排，瓶子网格在全部经验项之后。两视口均无横向溢出。输入使用与路线序号相同的3px/3px渐变虚线，焦点加深并增至2px，没有矩形边框或阴影。没有点击确认完成；临时桌面视口已恢复。

| 专项 | 结果 |
| --- | --- |
| 新增源码UI状态/资源视图 | 25/25，0失败/跳过 |
| 原完成命令、持久恢复、权威采用 | 32/32，0失败/跳过 |
| 宿主完成/协调器及演示fixture | 20/20，0失败/跳过 |
| 编译后的真实DOM控件本地集成 | 8/8，0失败/跳过 |
| 上轮正式embed provenance | 6/6，0失败/跳过 |
| 原growth-plan专项 | 通过 |
| 源码typecheck、build:embed及OCR guard | 通过 |
| 宿主production build及OCR压缩 | 通过 |
| 两仓git diff --check | 通过 |

没有全量无关测试，也没有Backend/Mongo专项。DOM控件本地集成使用源码编译模块及宿主已有jsdom，证据脚本在被忽略的`.ux/audits/p3b-ui/dialog-dom.test.mjs`，未引入新依赖。

浏览器跑通新版响应丢失、输入冻结、刷新查原回执、成功关闭及选择清理；成功后按钮回到“完成所选养成”禁用状态，Undo禁用。CDP观察该区间真实completion网络请求0、库存POST/PATCH0。模拟结果未进入真实账号工作区，也没有第二个消费请求。

320/390/768/1440视口验证；320、390、768均scrollWidth=clientWidth。390触控模拟为coarse pointer，输入及按钮44px；桌面32px。Escape关闭草稿回到完成按钮。临时视口/触控设置已恢复。

最小复验：源码web内`npm run test:star-completion-ui`、`npm run test:star-completion`、`npm run typecheck`；宿主`node --test test/starCompletion.test.js test/starCloudCoordinator.test.js`。本地DOM复验需先运行源码UI编译，再将YUANSTAR_UI_TEST_ROOT设为源码checkout，执行上述忽略目录中的DOM测试。

## J. 截图

全部保存于被忽略的`.ux/audits/p3b-ui/`，没有写进Git：

- `p3b-ui-title-lines-desktop-20261010.jpg`：本次标题独立、三色经验分行、瓶子另起行与虚线输入的桌面效果。
- `p3b-ui-title-lines-mobile-20261010.jpg`：本次默认窄屏效果及虚线焦点。

- `insufficient-button.jpg`：302k/251k的右下按钮。
- `unknown-button.jpg`：未知资源的独立状态。
- `one-experience.jpg`：仅橙经验。
- `two-experience-two-bottles.jpg`：橙紫两列，白0隐藏，40→50两瓶并列。
- `three-experience.jpg`：上一轮三色标题同行布局，已由2026-10-10补修替代。
- `boundary-correction.jpg`：端点切换及库存变化。
- `five-stars-no-scroll.jpg`：五颗无内部滚动。
- `six-stars.jpg` / `six-stars-scrolled.jpg`：六颗及滚动查看。
- `mobile-six-stars.jpg`：390触控布局。
- `pending-frozen.jpg` / `recovered.jpg`：新版冻结及回执恢复。

## K–L. Git、来源及人工边界

两前端仓仍在`feat/growth-plan-workspace-p1`。源码HEAD仍`d9411b3abf6ad74c01df0c80c11037ede0dd9f9d`，本轮9个修改/新增文件未提交。宿主HEAD仍`185ee361faf42770993a3aca284903e2c7efbdbf`，共17个修改/新增文件（保留上轮15个，加本轮2个新文件），均未提交。Backend只读，HEAD保持`5788e39e9183792392bcdd839b1d6ccbce89fbb9`，工作树clean。

正式同步要求clean源码，而本轮禁止commit；因此只生成开发预览，不改正式产物/manifest，也不放宽正式sync门禁。`stage-star-completion-preview.mjs <source-checkout>`复制build:embed的12文件到忽略目录，校验字节与SHA-256，并记录baseCommit、dirty状态和实际修改源码hash。Dev-only demo读取该预览，其他账号仍读取上轮正式embed。生产JS中没有预览路径或Mock fixture。后续正式同步需要另行授权处理源码提交及来源。

ui-ux-pro-max及项目设计/响应式约束用于本轮定向修正。待用户确认紧凑度、下划线编辑体验与多颗滚动；实体手机软键盘和完整屏幕阅读器未验证。公开Backend未部署P3，真实完成POST保护保持关闭；没有生产数据库访问、真实库存写入或部署。本轮完成后停止等待人工验收。
