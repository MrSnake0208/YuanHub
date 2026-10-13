# 已验收成果提交与两个 UI 细节收口

2026-10-13，Asia/Shanghai。仅本地提交与联调验收，风险 L2，verification_owner=agent。

## A. 开始状态与稳定提交点

| 仓库 | 现有分支 | 开始 HEAD | 开始工作树 |
| --- | --- | --- | --- |
| YuanStar-dev | fix/star-ocr-plan-inheritance | 07a4b015d72f1272ee1d6b1360a10167360773a0 | 干净，928dda7 / 07a4b01 不重复提交 |
| YuanHub | fix/star-ocr-plan-inheritance-host | 7166577a829a65a7e5b245a67faf23257d39c4bb | 仅已验收接线、测试、记录与正式 embed |
| Backend | fix/star-ocr-plan-inheritance-backend | ed7c1a13619c35a5ad12f9c581829025f5d4f226 | 干净，无本轮修改 |

宿主原14个状态条目包含旧/新 worker 两个路径，提交显示13个逻辑文件。明确文件清单暂存、检查 staged diff；不包含 .ux 预览/截图、缓存、配置或私有数据。原 manifest 来源07a4b01，已与干净源码构建完整12项逐字节/SHA-256核对，provenance 6/6。

先完成宿主已验收成果提交：98b495982aa64dcc9f4b26e9b89f24b5c442e3f6，fix(star): 收口已验收的OCR保存与旧计划延后继承。该点工作树干净后才开始两个 UI 修复。

## B/C. 修改与根因

源代码 web/src/product.ts 的 openPendingPlanInheritance / restorePlanOnly 成功明确传 info，复用现有 product-toast-info。未修改失败默认 error、位置、焦点或2600ms消失行为；没有提前开展统一文案审查。

原 ReviewNavigationSnapshot 缺少滚动；返回调用 renderReview 的默认 keep，捕获的是明细页位置。setReviewView 共用导航变量，renderPage 替换 DOM 也没有恢复列表/路线。另有资源加载在下一帧前二次重绘，可能把上一页整页位置再次捕获。

现在原导航快照绑定列表/整页视口、选择、原组索引；双击所进入组作为返回高亮，返回明确使用原快照。bag / plan 各保留内存上下文和下钻来源，右侧路线独立保存最新位置。同步恢复后下一帧校正，按账号/视图/序号过滤旧回调。组消失选合理邻组，空数据取消组选择，位置限制到有效范围。账号切换、完整替换/恢复、OCR重建及显式新generation清理；不新增 Backend 字段，不写云端浏览位置。

源码提交0025f2f4ecb3c63cdd9630a72ce9aca0300f8c42，只含 product.ts、现有 product-capture-workspace.test.mjs 增补与源码审查记录。宿主新增 behavior/starReviewNavigation.spec.js，增补 starPlanInheritance.spec.js 成功tone断言；本阶段不再改宿主业务源码。

## D/E. 实际验证与来源

- 源码 node tests/product-capture-workspace.test.mjs 全部通过，新增 bag/plan 原视口、邻组回退/范围限制、两处成功tone与实际Toast失败默认/2600ms消失检查；原OCR手动/MaaYuan共用handoff、取消、版本/账号保护通过。
- 源码 npm run typecheck、npm run test:growth-plan 通过。
- 提交前预览的四个定向 Vitest 文件60/60：starReviewNavigation6、starPlanInheritance3、growthPlanEmbed48、starCompletionEmbed3。覆盖编辑后返回、筛选/排序、先选其他组再下钻、两个页面独立位置/来源、整页重绘、路线、删除原组/空数据、账号/代次清理，及原组目标、路线拖动/序号、选中与完成交互。模拟数据和端口，不产生真实扣减。
- 已提交、干净源码0025f2f执行正式build:embed / OCR资源guard通过；既有同步脚本完整12项字节/hash匹配。仅JS和manifest更新，CSS/worker/模型等其他资源不变。
- 正式宿主产物再跑 starReviewNavigation + starPlanInheritance：9/9；node --test test/yuanstarEmbedProvenance.test.js：6/6；npm run build通过，包括PWA和OCR压缩校验。仅现有动态import提示。
- 当前5175服务提供的JS已逐字节比较正式产物，2055071字节，SHA-256为ffc8edac8d6bb60e4b4e76d108de4561ad6a33300dc032a50ec3e93c11960463。
- 真实浏览器独立虚构页确认桌面及390px汇总下钻入口/返回列表与整页位置相等。正式手机计划示例：左辅，列表516.5px、整页243.5px，返回相等且左辅高亮；桌面计划例439.5px/340.5px相等。路线450px在返回和无关整页重绘后保留。浏览器入口观察在原生焦点定位之后记录，避免把浏览器点击前的自动定位误认成产品恢复差异。
- 正式继承成功实测class为product-toast product-toast-info，底色rgb(255,254,252)、文字rgb(47,43,40)。证据截图仅保存在忽略的.ux/audits/ocr-plan-inheritance-local-20261013。

最小复测：源码web下node tests/product-capture-workspace.test.mjs、npm run typecheck；宿主node node_modules/vitest/vitest.mjs run behavior/starReviewNavigation.spec.js behavior/starPlanInheritance.spec.js，以及node --test test/yuanstarEmbedProvenance.test.js。上述实际已执行；无需因此再跑全量。

本记录与产物在宿主后续独立本地提交收口，最新宿主SHA以本轮最终Git核对报告为准。保留原三个分支，无push/PR/main合并/部署。未运行全量测试，未操作真实线上账号、真实库存重建或材料扣减；Backend无改动及新提交。

## F/G. 本地运行与后续

前端http://127.0.0.1:5175/star，后端http://127.0.0.1:8080/ready，前端/ready代理亦200。监听进程分别27496 / 137860；本轮未重启。Docker backendv3-share-dev-mongodb-1（127.0.0.1:27018）和backendv3-share-dev-redis-1（127.0.0.1:6379）均healthy。

已打开主站需手动刷新一次加载新embed。浏览位置仅当前挂载会话内保留，刷新/切账号不承诺恢复旧位置。虚构导航页为http://localhost:5175/.ux/audits/ocr-plan-inheritance-local-20261013/navigation-fixture.html，正式继承示例页仍为同目录inheritance-fixture.html；均无真实账号API。

下一轮独立任务：统一审查导入截图、背包整理、养成计划三个页面的报错、警告与操作反馈，梳理触发条件、语义、用户下一步和自然中文。本轮仅记录，没有展开搜索或重写。
