# 星石写入明确拒绝后的恢复

YuanHub PR #23 引入的持久化意图用于保护响应丢失的写入。明确返回
400/401/403/404/409/422（不含 `request_identity_changed`）的拒绝，不应留下永久待确认锁。

宿主协调器现在只在明确拒绝时回退该次操作：

- OCR：删除同账号、同来源恢复点、同代次及同新实例集合的 `prepared` 继承标记，并清理本次云端 rebuild 意图。
- 计划继承：移除同账号、同代次、同确认版本及同目标映射的 `confirmation`，保留旧计划待办；重新加载云端后可再次预览或放弃继承。
- 计划继承的前置读取失败且尚未发出 PATCH 时，同样回退本次确认标记。
- 网络失败、超时及登录身份变化继续保留意图和确认锁，不以旧版本回读解除保护。

`starPlanIntentRecovery.js` 复用现有数据库打开工具，在同一个 IndexedDB `meta`
读写事务内核对并回退标记。工作区、截图、恢复点及其他账号均不修改。
当前 embed 没有拒绝回退端口，宿主适配器依赖 PR #23 的标记结构；上游提供端口后应改用公开接口。
本次没有修改生成产物、manifest 或私有源码仓。

已有“结果未知”标记不自动清除：旧记录没有保留证明写入被拒绝的证据，不能安全推断为失败。

## 最小验证

```bash
node --test test/starCloudCoordinator.test.js test/starPlanIntentRecovery.test.js
node node_modules/vitest/vitest.mjs run behavior/starPlanInheritance.spec.js
```

人工验收由用户在测试账号进行：服务端明确拒绝 OCR 或计划继承后，重新加载 `/star`，
应可重新识别或重新预览/放弃旧计划；旧截图与恢复点保留。网络响应丢失时仍应显示待确认并阻止重复写入。
桌面及手机各检查一次即可；不要对真实账号制造丢包或重复写入。
