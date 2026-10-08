# 全局安装提示与新手教程策略（2026-10-04）

基准提交：`3288262`。本次修订针对主站，全站设计与响应式标准不变。

## 自动安装邀请

| 页面或状态 | 行为 |
| --- | --- |
| 今日一览（`today`）、更新日志（`changelog`）、反馈广场（`feedback-plaza`） | 满足安装事件/平台/偏好条件后才可自动邀请 |
| 未知路由、404、无权限、登录/注册/密码恢复、内测资格、管理、编辑及业务工作区（含星石、密探、库存、账房） | 默认不自动邀请；不显示自动邀请的失败恢复面板 |
| 路由加载、今日一览资格待确认、教程、移动导航抽屉、业务模态或内测群弹窗 | 暂时隐藏；阻碍解除后重新等待1.8秒 |
| 切换路由（包括两个允许页之间） | 隐藏并重新等待1.8秒 |
| `/install`与现有导航手动入口 | 始终保留原有安装/说明能力 |

- 正常邀请和当前组件已发起安装失败后的恢复指南共用页面/状态策略。
- 今日一览资格状态沿用路由边界：OPEN模式游客可正常邀请；加载/错误或登录用户资格未就绪时延后。
- 保留有效`beforeinstallprompt`要求、七天关闭冷却、session取消和永久停止推广偏好；不把推广偏好解释成设备安装事实。
- 使用已有`useModalFocus`栈的活跃投影与`body.mobile-nav-open`，卸载时清理观察器和计时器。
- 业务固定底栏路由不自动邀请，因此本轮不新增全局底部高度协议或调整z-index。
- 安装指南仍是非阻断区域；离场动画期间卡片不接收点击。

## 实操教程（2026-10-08 取代七步 Tour）

首次进入今日一览只推荐一次轻量、非遮罩邀请：「跟着做一次」与「直接使用 / 暂时关闭」同等明确。可勾选「以后不自动提示」。回访旧 Tour 用户不重新自动推荐；旧 Tour 的 completed/skipped 不迁移为实操成果。

「更多 → 实操教程」始终打开任务选择/继续入口，目前开放：

- **录入第一位密探**：真实登录 → 真实游戏账号（没有时在账号与连接码创建）→ 密探名册「开始录入密探」→ 正常快捷录入与保存确认 → GET current 确认当前账号、游戏存在已招募条目。
- **第一次连接 MaaYuan**：真实「连接 MaaYuan」→ 自选游戏账号 → 核对原权限并创建连接码 → 剪贴板确认成功 → MaaYuan「百宝箱 · 自动识别背包」开启同步、粘贴、运行 → YuanHub 只读查询该连接的真实已生效库存记录。已有连接与已有匹配成果直接复用；不创建无意义测试数据。
- **建立第一个游戏账号**：真实登录 → 真实账号表单创建 → GET accounts 验证账号已存在；已有账号直接复用，不要求再创建。

教程不提供「下一步」来跳过业务动作，不填字段、不点业务按钮、不提交、不使用演示数据。业务页仍可正常操作；跨页不会自动拉回。创建/保存失败或读结果未知时不标记完成；当前页的真实错误与重试入口保持可用。

## 退出、恢复与焦点

- `tutorialCompleted` 只由自愿参与后的权威业务证据设置；`dismissedForNow` 关闭本次并抑制刷新打扰；`disableAutoGuide` 只来自明确的永久停止自动提示选择。暂停不会丢掉任务目标。
- 按登录身份持久化 `tutorialTask` / `waitingFor` 及完成凭据，不保存页码。刷新及重新进入时先读取真实账号与记录，不把历史等待条件当证据。游客主动开始的目标可跨真实登录交接；其他身份之间不共享完成凭据。
- 教学使用正常流中的 sticky 提示栏，没有遮罩或几何高亮。当前产品模态打开时，提示栏进入焦点栈的当前 panel，退出按钮属于相同焦点范围；产品控件保持可点击。移动端布局保留安全区域和导航高度。
- 退出按钮、Esc 在加载、表单、失败与确认框中立即移除教学；不调用产品 cancel、清表单或撤销已提交操作。已退出的教程不能被迟到读取或保存结果完成。
- 「返回任务选择」暂停当前教学；继续同一快捷录入任务时保留当前页面与草稿。
- 原有鉴权、权限守卫和取消导航工具保持其独立产品职责；教程不再注入路由信号或依赖 target wait / timeout / layout geometry。

## 其它任务的接入边界

在 `src/utils/onboardingTasks.js` 注册任务入口，定义只读完成证据；控制器重新读取账号及目标数据，再交给 `resolveTaskProgress`。产品页面成功读取的通知必须绑定身份、账号与游戏，禁止用成功 toast、点击次数或历史 stepIndex 作为完成证据。库存必须验证真实基准；星石必须验证真实 OCR 后进入背包的成果；MaaYuan 必须验证至少一次真实同步，生成连接码本身不算完成。库存盘点与星石教程尚未开放，不影响原有功能及页面帮助。

### MaaYuan 首次同步证据

保存 `maaYuan = { task: 'maayuan-first-sync', connectionId, accountId, phase }`，phase 为 choose-account/token-created/token-copied/waiting-sync/synced，不保存页码或明文连接码。完成凭据只包含服务端连接/账号、库存记录编号及接收时间。

恢复首先读取当前用户的账号与连接，再请求 `GET /user/open-api/tokens/{tokenId}/first-sync`。该接口只认服务端认证连接在库存导入事务中写入的来源，且 `stockEffect=applied`；手工上传、普通 updated_at/revision、预览 SSE、复制/创建成功 toast 都不能证明首次同步。历史无连接来源数据不追认；不改写幂等重复记录的来源。连接撤销或记录删除后，不能仅凭本地 synced/completed 再显示成功。

站外 MaaYuan 打开任务、开启选项、粘贴、运行不可由网页直接观察，仅作为等待点；第一次建议背包，不要求理解其他任务。等待时每15秒、页面 focus/重新可见、匹配账号的非预览 inventory_import SSE 唤醒只读查询。SSE不是完成依据；账号切换不改变教程绑定账号；离开个人页后继续验证。读失败/后端尚无接口时保留任务元数据，允许稍后重新检查或立即退出，不伪造成功。

退出暂停验证，不撤销连接、不取消在途业务、不清草稿。暂停期间正常同步仍可发生，手动重入再读取成果。星石网页端截图识别可用，MaaYuan 自动采集仍在接入中，不能作为本教程成功示例。

## 定向验证

```bash
node --test test/onboarding.test.js
npm run test:behavior -- behavior/onboardingTour.spec.js behavior/onboardingApp.spec.js behavior/islandSidebar.spec.js behavior/pwaInstallPrompt.spec.js behavior/operatorQuickFlow.spec.js behavior/operatorEntryDefaults.spec.js behavior/gameAccountManager.spec.js behavior/dialogAccessibility.spec.js behavior/mobileHeader.spec.js behavior/authStartupGuard.spec.js
```

API 边界测试使用合成身份与记录，实际 Vue 业务组件、确认框及教学状态机运行；生产实现没有 mock 分支。浏览器验证使用独立测试会话覆盖 320/390/430/768/1024/1440 与 844×390 横屏，测试服务响应与真实服务实操须分开报告。PWA 真机安装与完整 CI 属于用户/CI 验证范围。
