# 发布流程改造 Implementation Plan（L4）

基线：2026-11-04，`MrSnake0208/YuanHub`，main / origin/main 均为 `19c8e9008c40caefe5b86fa5397a40cc65825d8a`，开始时工作区干净。

1. 核对真实配置：经典保护强制管理员走 PR + PR merge gate；无 Ruleset；仅所有者为 admin；生产环境无审批。部署开关为 false。生产只读接口报告前端 0.1.14 / a8a3eb6，后端 v0.1.41 / e8cd247。没有仓库 Webhook。没有连接或修改服务器。
2. 日常事件全部停止自动 CI/部署；保留手动和 reusable CI。集中入口冻结 main SHA，复用前端全量回归、后端检查/构建和隔离数据库测试；stress 显式选择，不默认运行。
3. 候选记录绑定 SHA、组件版本、线上基线、API 配置和具体 Actions run/attempt。正式发布重新验证成功记录、有效期及产物；只有明确确认才推不可变标签并顺序触发后端、前端部署。
4. 版本参数注入前端构建和后端 JAR；保留 VERSION 作为本地默认。复用蓝绿/健康检查/原子切换与历史回滚，不启用部署开关。
5. 通过临时 Git、模拟 gh、失败/取消/SHA/版本/过期/重复发布/回滚边界、工作流语法与版本定向检查验证。更新操作文档、CODEOWNERS 和待批准远端方案；本轮不 commit/push/tag/部署。

范围：根 workflows、release.sh / scripts/release*.py、直接相关版本构建逻辑、发布测试及操作规范。不修改业务页面或用户数据。

已知发版阻塞：每日回归 run 41743234153 在 behavior/operatorGrowthOwnership.spec.js:668 失败（日期 aria 属性断言），195 个文件中 1 个失败。保留原测试，本任务不修改普通业务行为；集中门禁必须阻止带此失败的候选发布。

本地实施及隔离验证记录见 [验证记录](release-verification.md)。上述为原实施阶段计划；后续所有者仅授权远端切换第 1、2 步：先应用并验证 owner-only PR Ruleset，再解除经典 required PR/checks，最后审查并 commit/普通 fast-forward Push 改造。规则已回读生效（Ruleset 26521810），生产开关未改变；集中 CI 与生产切换尚未授权。最新执行顺序和恢复边界见 [远端切换配置](release-settings/README.md)。

补充远端审计：旧 BackEndV3-Share 的 Actions/Tag Release 仍 active，指向当前 API，production 无审批。新通道生产发布及回滚验证前保留旧能力，不写入旧仓库；正式切换窗口须协调两仓发布，最终退役单独授权。
