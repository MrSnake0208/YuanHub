# 星石页面 main 兼容合并报告（2026-10-11）

本次仅在 `feat/growth-plan-workspace-p1` 合并最新 main，保留 feature 已验收的页面和三套步骤式教程。风险等级 L3，验证由 agent 执行。没有 push、PR、部署、真实库存扣减，其他仓库只读或未访问。

## Git 基线与冲突

- 合并前 HEAD：`8ff79680001a4906587b2042b4a5d881e49e2b74`。工作树干净，与 fetch 后的 `origin/feat/growth-plan-workspace-p1` 相同。
- `origin` / `upstream` 本轮 fetch 成功，两个 main 均为 `89ef44116c80584d2010f93bdea53c14a1ce9478`。
- 安全引用：`refs/backup/codex/growth-plan-workspace-p1-before-main-20261011`，指向合并前 HEAD。
- 使用 `merge --no-commit --no-ff`；提交是包含上述两个父提交的本地 merge commit，最终 SHA 以交付时的 `git log -1` 为准。不修改本地 main 引用。
- `YuanHub-main-tutorial-preview` 保持 detached `89ef441`，不更改其代码、依赖或 5176 服务。

| 显式冲突文件 | 原因与解决 |
| --- | --- |
| `src/config/features.js` | 合并 `TUTORIALS` 与 feature 的 `STAR_COMPLETION` / `STAR_COMPLETION_DEMO`；教程精确字符串 true 才开启，真实完成保持 false，演示仍须 DEV 与显式 URL。 |
| `src/pages/star/index.vue` | main 单步任务导航/帮助和 feature 三教程/新工作区冲突。保留 feature 页面、P3/瓶子接线和手动入口；接入开关、状态异常、过期响应、OCR 运行检查及关闭状态清理；空背包仅显示说明。 |
| `src/pages/star/RecognitionTutorial.vue` | 单步卡片与步骤卡片 API 冲突。保留三模式、前后翻页、步骤数、遮罩、高亮、原示例和手机拖动；加入业务弹窗/OCR 暂停及焦点让位，不引入任务推进门槛。 |
| `behavior/starRecoveryUx.spec.js` | 单步/只读示例断言与 feature 宿主测试冲突。保留原业务恢复、账号隔离和库存回归，新增开关、空背包、旧键、状态异常专项；实际背包存在时仍覆盖首次 OCR 引导。 |
| `test/recognitionTutorial.test.js` | 单步 API 与步骤 API 冲突。保留步骤算法与已读独立性，补 v2 只读兼容与 localStorage 属性读取抛错回归。 |
| `test/bagTutorial.test.js` | 单步配置与步骤/养成教程冲突。保留 7 步和 4 步，修正失效选择器与必需的错误陈述。 |

另有自动合并的语义冲突：`bagTutorial.js` 删除步骤数组后留下 `bagTutorialSteps[6]`；`recognitionTutorial.js` 删除组件使用的函数；`RecognitionExampleModal.vue` 删除核对说明 API 并改为裁剪示例。均保留 feature API/示例，未采用整批 ours/theirs。

main 的 `BagTutorialDemo`、单步帮助系统不接入星石页面。main 的全站 Onboarding、招募/安装教程、账号与认证保护、全局组件和 `useModalFocus` 更新保留；相关文件与 main 相同。养成回归中旧双背包复选框断言改为单表/稳定行身份/资源摘要断言，没有恢复废弃 UI。

## 教程语义

- 识别 6 步、使用 7 步、养成 4 步保持独立。手动翻页不执行业务操作，不强制切页；目标不存在时不高亮，但文字、上/下一步与关闭仍可用。
- 关闭只记录对应教程 v1 键；手动入口忽略已读状态。原历史账号保护、首次 OCR 成功且有核对证据的条件和账号过期响应保护保留。
- main v2 已读键只作为识别教程的只读兼容来源；不改写旧记录，不推断使用或养成已读，不把三个教程一起标记。
- 开关关闭时不挂载教程、不注册专属观察器、不调用状态读取或补写教程记录；业务工作区、普通帮助、OCR、库存错误和完成协议不受影响。
- 空背包点击使用教程显示“背包暂时为空”说明，留在当前页；用户自行点击导入入口。没有虚构星石、只读示例或真实数据写入。
- 原桌面紧凑按钮 32px 与其他既有尺寸保留；星石宿主、教程与示例组件样式未改。弹窗和 OCR 期间隐藏教程卡片/高亮，恢复后仍是用户选中的步骤；关闭示例保留父层焦点规则。

本轮只修正旧双背包、编辑区方位、养成目标所在工作区与资源摘要的明显错误陈述，并修复相应选择器。正式文案、步骤顺序及示例设计未重写。下一轮仍需审校：识别教程中的 MaaYuan 采集可用性陈述、背包教程跨工作区的说明方式、养成教程对组目标/预览分配/路线排序及完成安全开关的详细讲解。

## 实际专项验证

| 检查 | 结果 |
| --- | --- |
| Node：教程、开关、P3 port/mock、瓶子 writer、provenance | 71/71 |
| Node：main Onboarding（显式测试开关） | 16/16 |
| 行为：识别、背包、星石宿主、开关开启/关闭 | 77/77 |
| 行为：正式 embed、养成工作区、库存 API/身份、main Onboarding/App、关闭安装教程、招募隔离练习 | 133/133；首轮养成测试有 1 条旧 UI 断言失败，修正后该文件 47/47，其余 86 条通过 |
| 新增正式 embed P3 完成弹窗 | 3/3；隔离 mock 下验证草稿/瓶子成本、实际数量/CAS、响应丢失后恢复且不重复扣减 |
| 修正目标说明后的教程复查 | Node 8/8、行为 18/18（包含在上面的唯一测试数中） |
| 受影响源码语法 | 53 个 JS/MJS、22 个 Vue SFC 解析/脚本/模板编译通过 |
| 正式 embed | 12 文件集合、每个 SHA-256、权威源码 `web/dist/embed` 字节、合并前 feature 字节均一致；source HEAD 为 `17f28628a126c4255c4d3e502b365f56ed02bcbc` 且 clean |
| 生产构建 | `npm run build` 通过；既有 auth/beta 混合导入 chunk 提示不是失败 |
| OCR 压缩 | 构建生成并校验，`npm run verify:ocr-compression` 通过 |

最小复查命令：

```sh
node --test test/recognitionTutorial.test.js test/bagTutorial.test.js test/features.test.js test/starCompletion.test.js test/growthPlanInventory.test.js test/yuanstarEmbedProvenance.test.js
node --import ./test-support/enableTutorials.js --test test/onboarding.test.js
npm run test:behavior -- behavior/recognitionTutorial.spec.js behavior/bagTutorial.spec.js behavior/starRecoveryUx.spec.js behavior/tutorialFeatures.spec.js behavior/tutorialsDisabled.spec.js behavior/embedProduct.spec.js behavior/growthPlanEmbed.spec.js behavior/growthPlanInventoryApi.spec.js behavior/growthPlanInventoryIdentity.spec.js behavior/starCompletionEmbed.spec.js
npm run build
```

没有全量 CI、真实 OCR 截图上传、真实完成 POST 或生产库存扣减。没有修改 TypeScript 源码，宿主无独立 typecheck 脚本；只读 YuanStar 源码未执行会产出文件的 typecheck/build。P3 API 与 writer 文件无 diff。

## 预览证据与边界

复用既有 [5175 feature](http://127.0.0.1:5175/star)，公开 Backend 仍为 `https://api-hub.maayuan.com`，不连接本地 8080。5176 main 服务保留，工作树和 SHA 不变。

桌面实际看到 6:4 单表背包、32px 教程按钮和 1/7 使用教程。390×844 手机模拟无页面横向溢出，卡片移动后仍有前后翻页；5/7 的养成目标在背包页不存在时，高亮数为 0，页面保持背包整理，未切到养成页。浏览器截图与本轮检验脚本仅保存在 `.ux/audits/2026-10-11-main-compat/`，不提交截图。

浏览器只操作教程、页面切换与查看，不修改业务输入。当前真实账号非空，空态和实际完成演示均由隔离单测验证；没有将测试数据注入真实账号。不声称真实手机、弱网、生产扣减或后端事务已经验收。
