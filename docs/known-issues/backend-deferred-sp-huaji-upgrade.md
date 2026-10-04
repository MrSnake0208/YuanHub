# SP 密探化极专属材料待接入

状态：2026-10-05 已实现后端拒绝保护；专属材料规则仍待确认。回归与事务测试已补，尚待用户/CI 执行，不代表已经上线。

`POST /v1/operator/upgrades/preview` 与新执行的 `execute` 在公共计算入口识别 `spOf != null && dimension=huaji`，返回 HTTP 422 `sp_huaji_upgrade_not_supported`。execute 重新验证目录，旧 token 不能绕过限制；失败不扣库存、不改变成长和 revision、不写升级事务/消耗流水、不发布升级事件。相同 key 的成功历史交易重试按原幂等结果返回。

前端保留不扣库存的手动星级校正（0..5），不展示 SP 快捷化极、普通化极节点或觉醒目标；规划不估算 SP 星级材料，明确提示未知。等级/修为共享提升通过本体养成路径计算材料并同步关联组。

原测试名 `SP direct star range uses the same frontend stage costs` 错把普通节点成本描述成 SP 成本，已更正为普通节点测试，并在 `OperatorUpgradeServiceTest` 新增 SP 拒绝与无副作用断言。

重新开放前必须确认每阶段真实材料、稳定库存 ID、规则适用范围和跨阶段累计方式，再实现独立材料分支及原子扣库测试。不得复用普通心纸表。本次不处理历史错误扣库，须先审计交易与正确材料规则后再确定补偿方案。
