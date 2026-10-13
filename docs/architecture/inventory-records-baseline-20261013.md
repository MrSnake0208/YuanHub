# 02：库存操作历史迁移前基线

**原两项删除确认阻塞已修复，后续定向验证 72/72 通过。** 03 仍需目标文件交接冻结，不在本次修复中启动。原始采集记录保留如下，修复证据见末节。日期：2026-10-13。

以下至「交付 diff 与提交边界」为原始采集提交 `5a4d7ce` 的历史记录：修改前 54/54 个既有用例通过；补充后 68 个用例中 66 通过、2 个删除安全不变量失败。原始采集没有修改生产源码。

## 依据、范围与执行计划

用户已在本次会话确认 [01 ADR](responsive-view-boundaries-adr-20261013.md) 的 P1 契约：共享模板/CSS、稳定父控制器持有状态/API、受控展示组件 props/emits。确认并不表示允许全面迁移。ADR 原文件未在本任务改写或提交。

本任务按 **L2** 执行：只扩展库存定向测试、局部测试辅助和本说明；不改变测试 runner、全局 setup、依赖、CI、路由、权限、API、数据模型或持久化。父工作区 rapid inline 模式下由主会话处理这个局部前端范围，不启用子 Agent；以本说明保留 03 所需的交接证据。验证执行人为 Agent，仅运行用户明确要求的定向用例及合成浏览器采集。

实施顺序：

1. 核对双仓库/worktree、01 契约、既有测试和运行服务，先执行未改动的定向套件。
2. 在现有 SFC/API mock 边界补行为不变量，用可派发 change/resize 的宽度 fixture 检查状态与请求。
3. 复用现有 Playwright CLI 与 5173 服务，采集合成状态、几何、焦点与危险操作证据。
4. 检查精确 diff、记录失败与未覆盖项；保留红测试，提交须另获授权，03 仍需解除阻塞并冻结目标文件。

## Git、并行任务与服务

| 范围 | 本次观察 | 使用限制 |
| --- | --- | --- |
| 父仓库 | `master` / `cd1d4a29af258ca3ccd414db34f8bf5159ae3c59`，已有大量 dirty 文件 | 本任务未修改父仓库 |
| YuanHub | 起始 `main` / `d7036babd77629d22f3a3ed421626ee9615984fc`；采集中并行招募提交使 HEAD 变为 `a5663a95674b7ab17cbe4312df76ea86f233ca52` | 该提交只涉及招募；随后 `PoolEditor.vue` 再次出现未提交改动，均未触碰 |
| 其它 worktree | 父仓库另有 `ao/yuanhub-all-9`、`ao/yuanhub-all-2`、`ao/yuanhub-all-4`；前端另有 `ao/yuanhub-all-9` / `f7d9e9f…` 和 `ao/yuanhub-all-4` / `05cc0ae…` | 不合并、不覆盖、不使用其它前端服务 |
| 相关任务 | `10-03-inventory-training-quick-entry` 为 in_progress，`10-05-inventory-resource-remediation` 为 review；01 另列历史库存任务重叠 | 记录状态不代表实时归属；03 前仍须维护者交接 |
| 服务 | 5173 的 cwd 是当前 YuanHub，`GET /inventory` 返回 200；5174 是另一个 worktree；8080 有 Java 监听 | 仅复用 5173；未启动、重启、停止开发服务，未调用后端验证数据 |

采集前后生产文件 `git hash-object` 一致：

```text
src/pages/inventory/index.vue  91bf3b9ff0be4bbbe5077b579bfbb49d2693bbd1
src/components/MobileHeader.vue  7c642eb11dfff8c3f724c08d5bd03f207787a141
src/styles/main.css  38f737da0f0b4eafa9fcfdd8a2c4688ab79f7194
```

## 最小旅程与现有时序

| 类型 | 旅程/状态 | 基线不变量与证据 |
| --- | --- | --- |
| 纯展示 | 记录类型、道具/心纸、时间、来源、体力、摘要、ID、生效状态 | 同一历史列表；字段两端可读取；长 ID 不造成页面横溢，实际展示截断；消耗记录显示负数且没有单独删除入口 |
| 关键行为 | `/inventory` 清单 → 操作历史；初始加载 | 先并行读取物品/密探目录，再读账号；随后读取当前库存，进入历史才请求记录；tabpanel 与 tab 的 ARIA 关联保留。加载中禁用筛选/刷新，不重复读取 |
| 关键行为 | 全部/道具/心纸、刷新、更多 | `all` 对应省略 entityType；筛选变化清列表与 cursor，相同值短路；首屏/刷新用 null cursor、limit=50；更多用服务端 cursor 并追加，末页隐藏更多 |
| 错误恢复 | 首屏失败、刷新失败、增量失败、空态/无账号 | 首屏失败有重试；刷新/增量失败保留已有节点和内容；重试保留原 reset 语义，增量仍用同一 cursor；空态说明来源，无账号不读写历史 |
| 危险操作 | 删除确认、取消、删除失败、成功撤销、恢复失败重试 | 确认含账号/摘要；取消或 A→B 不写；请求中禁用动作且重复按钮不双写；成功删除/恢复沿用历史及当前库存刷新、统计失效链路。A→B→A 和卸载后的迟到确认失败，见下文 |
| 账号/生命周期 | A→B→A、迟到成功/错误、resize、卸载 | 历史读取以 seq/account/type 过滤旧响应，不解除新请求 loading；resize 不重读、不重订阅、不丢筛选/游标/节点/焦点或奖励草稿；卸载取消订阅，迟到读取不再刷新 |

权限边界来自现有 `/inventory` 路由的 `requiresAuth` 与 `requiresBeta`，后端负责最终授权。Vitest mock 不验证服务端权限；浏览器使用合成 JWT 字符串和合成内测许可响应，不证明真实登录/内测鉴权有效。没有获准的可丢弃真实测试账号，因此没有连接真实账号或开发数据库做删除。

账号/auth/user/game watch 同步使历史读 seq 失效并清列表/游标；页面 ready 后按当前 tab 重读。当前库存读取另有 context 校验。事件订阅只有一份；`inventory_import`/重连经 180ms 合并刷新当前库存及已打开统计，**现状不会因此自动刷新操作历史**；编辑库存期间暂缓。事件内容/真实 SSE 重连未在浏览器回放，本轮不改变该语义。

## 实际自动化结果

实际命令（在 YuanHub）：

```bash
npm run test:behavior -- behavior/inventoryRecordsUx.spec.js behavior/inventoryStockBaseline.spec.js behavior/workspaceTabs.spec.js behavior/mobileHeader.spec.js
```

| 套件 | 修改前 | 最终复跑 | 本次覆盖 |
| --- | --- | --- | --- |
| `inventoryRecordsUx.spec.js` | 8 通过 | 19 通过、2 失败 | 新增 13 个定向用例，复用原 render/API mock；补分页重试参数断言 |
| `inventoryStockBaseline.spec.js` | 38 通过 | 38 通过 | 在已有保存中/真实奖励工作台草稿用例加入 resize，未 stub 被验证的奖励组件 |
| `workspaceTabs.spec.js` | 7 通过 | 7 通过 | 复用原键盘手动激活/焦点测试，无修改 |
| `mobileHeader.spec.js` | 1 通过 | 2 通过 | 新增 1080/1081 监听切换及卸载清理；640/641 不应切换导航 |

修改前命令 exit=0；最终命令 **exit=1**，66 passed / 2 failed。没有 skip、fails 标记或弱化断言，不可将这个结果称为可迁移、可合并或全绿。

**阻塞：`onDeleteRecord` 的确认只复核 accountId，没有复核发起时的 context generation 或页面是否已销毁。**

| 失败用例 | 合成复现 | 实际结果 / 期望 |
| --- | --- | --- |
| `[P0安全不变量] A→B→A 后迟到删除确认不得再写入` | A 打开确认，外部状态切 B 再切 A，旧确认 resolve(true) | `deleteRecord('reward:1', 'acc-1')` 仍调用 1 次 / 应为 0 |
| `[P0安全不变量] 卸载 后迟到删除确认不得再写入` | A 打开确认，卸载页面，旧确认 resolve(true) | 同样调用 1 次 / 应为 0 |

这是模拟异步上下文变化的 SFC/API 边界证据，不表示用户能穿过遮罩手动切账号，也不宣称真实服务器发生跨用户删除。需要独立修复并让两个断言通过，不能在 03 的展示抽取中隐藏或顺便更改。

## 浏览器、截图与状态基线

复用 `npx --no-install playwright cli`（本机已有 Playwright 1.63.0）和 `test-support/*.browser.js` 的 run-code 方法，没有增加依赖、runner 或 E2E 工程。新增 `test-support/inventoryRecords.browser.js` 是该模式的单个定向脚本。独立临时 Chrome/Chromium 会话从 about:blank 开始，不 attach 用户浏览器、不导入真实 storage。

脚本只允许当前 5173 的前端资源通过；API 全部 fulfill/abort，未知读与非预期写会记录错误并拦截，外部 API_BASE 也不会穿透。仅在内存 rows 中模拟 1 次 DELETE 和 1 次 restore POST。外部 Google Fonts 请求主动阻断，因此截图使用可用的本机 fallback 字体；它不证明正式字体下载或最终字形换行。

| 检查 | 最终结果 |
| --- | --- |
| 主基准/极窄 | 390、768、1440、320px 均采集成功态；长账号名、长 ID、来源/体力标签存在 |
| 临界/横屏 | 639/640/641、1079/1080/1081、844×390；历史 CSS 640 与导航 1080 是不同边界；1080 侧栏隐藏、1081 显示 |
| 几何 | 共 11 组采样，页面 scrollWidth 均等于 viewport width；每组只有一个可见历史列表；滚入视口后删除按钮中心命中可达 |
| 行为 | 筛选 reset、分页追加/终止、刷新与首次空列表错误恢复、账号 A→B→A、删除/恢复、取消不写通过；resize 历史请求增量=0 |
| 焦点/错误 | 删除确认初始焦点在框内、390→768→1440→390 时确认/焦点保留且零读写、连续 5 次 Tab 不逃逸、Escape 取消并返回删除按钮；最终 pageerror=0 |

**尺寸偏差如实保留：** 全部/道具/心纸按钮约 32px 高，“加载更多”40px；>640px 刷新约 35px、删除约 33px，≤640px 后两者为 44px。11 次采样合计 58 条重复目标尺寸记录，均低于项目 44px 目标；这是 border-box 测量，未证明有扩大命中区。未发现其它几何/未知请求 findings。不能把核心流程通过称为全部 UX 通过。

可复用同一 `core()` 字段/选中态断言及 API 参数/次数断言检查未来呈现分支；当前没有创建 Desktop/Mobile 两份组件，也没有用 390px 作为设备判定。`test-support/viewport.js` 只为 jsdom 提供 px min/max-width 的 change 与 resize，不模拟浏览器排版、hover、键盘或设备。

最终产物均被 Git 忽略，路径相对 YuanHub：

```text
.ux/audits/inventory-records-baseline-20261013/
  existing-vitest.log       # 改动前 54/54
  expanded-vitest.log       # 最终 66/68，含两项失败详情
  browser-final.log         # 最终独立浏览器会话结果
  browser-results.json      # 从最终 CLI 结果提取的几何/请求/发现
  task.diff                 # 仅本任务 6 文件的精确 patch（含新增文件）
  *.png                     # 14 张：4 个成功基准、横屏、加载、分页、刷新错误、确认、删除、恢复、空态、首次错误、无账号
.playwright-cli/traces/trace-1791900157229.trace
.playwright-cli/traces/trace-1791900157229.network
.playwright-cli/traces/resources/
```

采集脚本曾在退出 about:blank 时访问 storage 报错，另一次复跑只等待刷新按钮而抢在恢复请求完成前读取旧记录；已加同源 guard，并同时等待历史读取及删除/恢复 busy 结束。最终使用全新会话完整复核，pageerror=0。旧 `browser.log`/旧 trace 只作本地调试记录，不能当最终结果。采集会话均已关闭，开发服务保持运行。

## 复跑与后续人工验收

先确认 5173 仍属于本工作区、可访问；已有服务不能重复启动。仅当用户当前任务明确授权浏览器时运行：

```bash
mkdir -p .ux/audits/inventory-records-baseline-20261013
npx --no-install playwright cli -s=inventory-p0-review open about:blank --browser=chrome
npx --no-install playwright cli -s=inventory-p0-review tracing-start
npx --no-install playwright cli -s=inventory-p0-review run-code --filename=test-support/inventoryRecords.browser.js
npx --no-install playwright cli -s=inventory-p0-review tracing-stop
npx --no-install playwright cli -s=inventory-p0-review close
```

CLI 会在 Result 中输出 JSON。须同时查看 `coreAssertions`、`runtimeErrors`、`findings` 和请求，不能只依据 CLI exit code；采集脚本保留既有尺寸偏差而不把它们改成通过。重复采集会覆盖同目录截图，需要保留另一轮时先改脚本 output 目录或复制本地产物。不能向 Git 添加图片、trace、会话数据。

03 正式结构迁移验收仍需 320/390/430/768/1024/1440、640 与 1080 临界两侧；本轮未执行 430/1024，不把几何抽样等同于全矩阵。最小人工清单：

1. 在获准的可丢弃账号打开 `/inventory` → 操作历史，三个筛选、刷新、更多、失败重试应保留正确账号/记录/游标；在上述视口检查同一操作可达且不横溢。
2. 手机横屏及真实 iOS/Android 打开报告输入和软键盘，检查输入/提交/关闭、动态地址栏、Safe Area 与焦点不被遮挡；本轮 Chromium 横屏不模拟系统键盘。
3. 只对合成或可丢弃记录检查确认摘要、Tab/Escape、取消零写入和删除/恢复；保留草稿、错误、分页时 resize，状态不重置、不重复请求。

**未覆盖：** 真实已登录手机 E2E、真实后端鉴权/重建库存/删除备份、原生触控/屏幕阅读器、iOS 动态键盘/地址栏、安全区、真实网络超时/401 重放、真实 SSE 事件、撤销通知跨账号往返/迟到恢复的全部组合、实际滚动锚点的跨视口位移、主题/放大/字体加载矩阵。jsdom 焦点和节点保持不能证明像素位置或手机体验。

## 交付 diff 与提交边界

本次只交付以下 6 个文件（前三个为修改，后三个为新增）：

```text
behavior/inventoryRecordsUx.spec.js
behavior/inventoryStockBaseline.spec.js
behavior/mobileHeader.spec.js
test-support/viewport.js
test-support/inventoryRecords.browser.js
docs/architecture/inventory-records-baseline-20261013.md
```

已检查精确 diff、父/子仓库 `git diff --check`、新增文件空白与 JavaScript 语法。无全量测试、build 或 lint。建议最小用户复跑命令就是上面的四文件 Vitest 命令；安全修复完成后必须期望 68/68，而非忽略两项红测试。

未 stage/commit/push/PR/部署。若用户明确授权提交，建议单任务提交 `test(inventory): 采集操作历史双端行为基线`，仅 stage 本节 6 个文件；需明确接受两项现存失败仍会使定向命令/CI 变红。01 ADR、AGENTS、招募文件及所有忽略产物均不得混入；01 文档仍未跟踪，需由该任务单独交付。03 的放行条件是删除安全修复、上述定向用例通过及目标生产文件交接冻结。

## 删除确认阻塞修复（2026-10-13）

用户已另行授权修复上述阻塞。原始采集已单独提交为 `5a4d7ce`；本节为该提交之后的局部 **L2** 修复，尚未提交。范围只有 `src/pages/inventory/index.vue`、`behavior/inventoryRecordsUx.spec.js` 和本说明。

`onDeleteRecord` 在打开确认前捕获现有 `inventoryContextSeq`，确认返回后要求页面仍存活、上下文序号未改变且账号仍匹配。账号往返、游戏或登录身份变化、退出登录及卸载均使旧确认失效；不新建状态、监听或 API，不改变有效确认后的删除/恢复及刷新链路。

保留原两项安全断言，新增清空账号、切换游戏、更换登录身份、退出登录四种场景，并断言迟到确认不触发删除或额外库存/历史刷新。实际红绿证据：

| 阶段 | 命令/结果 |
| --- | --- |
| 修复前复现原两项 | `npm run test:behavior -- behavior/inventoryRecordsUx.spec.js -t P0安全不变量`：2 失败，exit=1 |
| 扩展场景、尚未修复 | 同一命令：5 失败、1 通过；清空账号原已受账号比较保护；19 项因 `-t` 筛选未运行，没有新增 skip |
| 修复后完整定向套件 | 本文原四文件 Vitest 命令：**72/72 通过，exit=0**；历史 25、盘点 38、Tabs 7、手机页头 2 |

日志在已忽略目录 `.ux/audits/inventory-records-baseline-20261013/`：`delete-confirm-red.log`、`delete-confirm-expanded-red.log`、`delete-confirm-green.log`；本轮三文件精确 patch 为 `delete-confirm-fix.diff`。已检查精确 diff 与父/子仓库 `git diff --check`。本轮未重跑浏览器、全量测试或 build；原截图仅为修复前合成基线，不代表修复后真实手机验收。已发出的删除/恢复请求及其迟到完成组合仍属于原未覆盖边界。

最小复跑仍为本文四文件 Vitest 命令，现在应为 72/72。人工可用合成或获准可丢弃账号进入操作历史：取消删除应零写入，正常确认删除及撤销仍可用；不得用生产数据验收。本次解除两项确认前安全阻塞，不替代 03 的交接冻结和后续结构迁移验收。
