# OCR 工作区替换时序与继承弹窗：本轮交付

2026-10-13，Asia/Shanghai。继续原三个修复分支；本轮仅私有源码本地提交，Hub/Backend不提交、不push、不PR、不部署。风险L3，verification_owner=agent。

## A. 时序根因及证据

宿主 rebuildOcr 采用业务状态对象，里面额外有 generation/revision；源码 cloudBusinessSnapshotsEqual 对整个对象 canonical 比较，四字段快照与六字段回读因此不相等。云端已经提交，源码 beforeCommit 却误报不一致，本地新OCR证据事务尚未开始。
catch随后用云端业务数据更新 controller 并继续抛异常；page仍持旧 workspaceContext。进入计划时 preparePendingPlanForCurrent 才把 controller.current 应用到页面，所以背包数量延迟变化。此时标记仍为prepared；与之关联的旧来源已保存。源代码与专项证明不是prepared预写自动增加revision造成正常冲突；prepared创建不会变更工作区revision。

retire Draft仅在完整 commit/handoff之后执行。这条异常发生在retire之前，原截图留下属于正确的失败保留，不能强行清空来掩盖写入异常。

已使用独立虚构14张Blob、197颗结果以及fake-indexeddb标准语义模拟，复现同一报错与cause；修复后同一案例197颗/14张证据/pending/一次云端命令全部验证。没有用用户私人14张截图跑真实OCR，不能声称真实截图E2E已通过。

## B. 修复流程和边界

源码用现有validateCloudBusinessSnapshot投影、排序、验证回读。宿主产品返回值也只含inventory/planTargets/bag/experience；generation/revision继续保留在协调器的CAS、响应匹配和写锁中。仅计划PATCH同样修正了这个边界。

prepared来源点在最终事务中复用，不再覆盖同一旧点。IndexedDB同步异常主动abort，避免队列形成部分写入。云端已经确认的结果只允许一次本地补写，复用同一实例ID、图片和来源；仅当最新完整本地快照仍是原始状态、匹配同一authority hydration或同一完整结果时可收口，不覆盖其他本地新数据，不再POST rebuild。

成功返回须已有完整本地工作区和证据；此时page立即采用该上下文，源码和宿主标签一起切到bag并展开识别核对。之后才退休对应截图草稿并显示完成；单独清理失败保留明确警告，不能伪装为业务未保存。

持续本地失败保留原始cause及草稿，以cloud_ocr_local_pending独立显示“云端已保存、本地待恢复”；可验证的业务新背包立即更新page。不能自动修复的存储故障仍需恢复/空间处理，未假装成功。未决POST通过star_rebuild_uncertain独立显示，继续持久化意图和重复写入锁，旧版本首次回读不解锁。

待继承为后续计划待办：bag顶部短提示；plan自动预览，稍后保留；新的完整OCR/替换/恢复才阻断。完整OCR阻断信息在按钮旁，离开导入页清除该动作提示，不写成永久OCR进度错误。当前背包编辑与新计划冲突保护保留。

## C. 弹窗

标题只显示名称/品质，业务键仍含主/辅大类。组内只有旧背包、新背包等级数量分布，以及旧计划、新计划映射。删除旧目标重复统计、候选编号主文案和结果重复行；仅保留真实未匹配及版本错误。

640px起每行两条映射，窄屏一列；内部滚动，footer始终可达，桌面控件紧凑、手机/触控44px。顶部一句推测说明+总体统计，footer为“稍后处理”和“确认继承并保存”。
product-soft-dropdown从既有页面提取通用接线、同步、菜单选择和定位，页面与继承弹窗共同调用，并共用product.css的soft皮肤。弹窗菜单在native dialog内部top layer，支持方向键/Home/End/Enter/Escape/Tab、焦点返回、滚动；重复选中不触发change，刷新统计只同步值而不重绘选择DOM。候选显示当前等级/已达成，同级加第N颗辅助标识，原交换与唯一分配算法保留。

## D. 实际验证

- 源码继承算法与候选文案15/15，养成组37/37。
- controller专项通过：元数据响应、OCR证据完整写入、来源复用、一次故障补写、持续故障、并发hydration、刷新/取消、账号隔离、版本与待继承保护。
- 实际页面函数专项通过：manual/MaaYuan共用流程、首次新背包、同步bag标签/展开、按钮附近阻断、持续失败草稿保留；恢复列表单侧失败仍通过。
- product-ocr-commit-handoff、product-ocr-import、cloud-business、phase2b、growth-plan通过；TypeScript通过。
- 弹窗DOM模拟通过四信息布局、共同软控件、重选无change、键盘焦点、未匹配、候选交换和稍后/确认。
- 主站四个定向Vitest文件全部109/109：growthPlanEmbed48、starCompletionEmbed3、starRecoveryUx55、starPlanInheritance3。
- coordinator15/15、provenance6/6，共21/21。
- 干净源码build:embed/OCR资源guard通过；正式同步完整12项字节/SHA-256匹配；Hub生产build/PWA/OCR压缩验证通过。仅原有动态import提示。
- 真实浏览器虚构页：双列、三条映射、同级选项、交换、Arrow/End/Enter、Escape只关菜单/焦点返回、滚动到第三条、稍后后刷新自动重开通过。
- 弹窗320/390/430/768/1024/1440六视口均确认：实际宽度扣除滚动条后匹配、手机单列/宽屏双列、dialog不横向溢出、确认按钮可达；844×390横屏长内容内部滚动，footer可达。截图与尺寸证据在忽略的.ux/audits/ocr-plan-inheritance-local-20261013中；此为弹窗验证，不冒充宿主全页完整设备审查。

本轮未跑全量测试，未重跑无改动Backend测试（前轮事务11/11属历史结果），未执行真实OCR、MaaYuan设备E2E或真实资源扣减。真实iOS/软键盘、长分组滚动、用户14张截图整链路仍由人工验收。

最小复测：源码web下npm run test:product-account-controller、node tests/product-capture-workspace.test.mjs、npm run test:ocr-plan-inheritance；Hub下node --test test/starCloudCoordinator.test.js test/yuanstarEmbedProvenance.test.js，以及node node_modules/vitest/vitest.mjs run behavior/starPlanInheritance.spec.js behavior/starRecoveryUx.spec.js。

## E. Git、资源和运行环境

| 仓库 | 分支 | HEAD | 状态 |
| --- | --- | --- | --- |
| YuanStar-dev | fix/star-ocr-plan-inheritance | 07a4b015d72f1272ee1d6b1360a10167360773a0 | 新增本地提交，干净；上一提交928dda7保留 |
| YuanHub | fix/star-ocr-plan-inheritance-host | 7166577a829a65a7e5b245a67faf23257d39c4bb | 修改未提交，包含上一轮成果 |
| Backend | fix/star-ocr-plan-inheritance-backend | ed7c1a13619c35a5ad12f9c581829025f5d4f226 | 干净，本轮无修改/提交 |

源码本次提交13文件：docs/ocr-workspace-handoff-and-inheritance-ui-review.md；web/src/business/persistence/repository.ts；business/reconcile.ts；ocr-plan-inheritance-dialog.ts；ocr-plan-inheritance.css；ocr-plan-inheritance.ts；product-soft-dropdown.ts（新增）；product-workspace.ts；product.css；product.ts；web/tests/ocr-plan-inheritance.test.mjs；product-account-controller.test.ts；product-capture-workspace.test.mjs。

Hub接线涉及src/pages/star/index.vue、starCloudCoordinator.js；定向test/starCloudCoordinator.test.js、test/yuanstarEmbedProvenance.test.js、behavior/starPlanInheritance.spec.js及前轮保留的starRecoveryUx.spec.js；更新正式embed JS/CSS、manifest、同步记录和本记录。worker仍为DebJzGkA；旧BuVcSjOG删除是前轮保留的审查项。生成物均来自07a4b01，无手改。

Frontend http://127.0.0.1:5175/star，Backend http://127.0.0.1:8080/ready；进程留运行。前端/ready代理同一Backend返回200，实际提供本轮2052915字节embed。现有本地Mongo27018/Redis6379、local profile与隔离beta测试批次配置继续复用，本轮未重启或结束无关服务。
虚构验收页：http://localhost:5175/.ux/audits/ocr-plan-inheritance-local-20261013/inheritance-fixture.html。创建/重置后显示旧4颗、新5颗、3条计划，使用真实新版embed，云端hook为模拟，不连接真实账号API。

原先已经打开的页面需刷新一次加载新版embed。旧失败草稿不会自动当作完整成功而清空：可先核对当前权威背包与旧来源，处理继承后再检查留存截图；不要为清理草稿再次盲目完整rebuild。旧点仅计划继承入口继续保留；跨设备只读旧完整计划仍未支持。
无新分支、合并、rebase、push、PR或部署，本轮未发生合并冲突；未合并的新上游内容保持先前边界，不声称完成上游合并验收。
