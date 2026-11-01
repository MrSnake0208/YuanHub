# PR 自动化半小时优化实施记录

范围：本地审核编排、测试选择、证据记录与统计。风险 L4；保留 SHA、账号/数据隔离、分支保护和合并防重约束，不修改 GitHub Actions 门禁。

## 实施顺序

1. 在本树 `.dev/orca-pr-automation-v3/` 制作独立候选，增加总预算、阶段计时与到期拒绝派发/合并；现有定时任务仍使用 v2。
2. 收窄 `scripts/testing/impact.py` 和 `run.py`：组件范围、明确 base、前置失败停止、总执行预算。
3. 统一阶段环境与验证证据；旧 SHA、零测试、跳过及服务不可用不能成为通过证据。
4. 快速通道一轮修复，候选 CI 与独立复审重叠；失败保留具体原因，不循环新增审核。
5. 扩展已有 JSON 并提供只读汇总；真实 20 个 PR 数据由启用后的正常运行积累，不能用 fixture 冒充达标。

## 验证边界

使用 Python unittest 的临时 Git、伪时钟、伪 GitHub/Orca 返回值及受控子进程验证：CSS/文档、两端业务、协议、未知路径、删除重命名；超时、失败停止、旧证据；阶段转移、锁归属、合并模糊失败及统计区间。

不启动浏览器、数据库、开发服务或真实 worker，不运行全量业务测试，不向 GitHub 写入。临时数据位于当前树忽略目录。独立代码审查只检查本次最终修改。

## 启用与验收

候选代码与提示经本地验证后，另行确认切换定时任务。切换前必须确认旧任务无在途 owner/worker，并迁移现有 state/decisions/jobs，不自动重置授权或失败历史。不得同时启用两个队列。

目标是普通 PR P95 ≤30分钟；任何任务超时均明确阻塞并保留恢复记录，不能保证任意缺陷都能在30分钟内修复合并。统计须同时公开排队、转人工、超时和返工，不筛掉失败样本。

## 本地验证结果（2026-11-01）

- 测试入口：`PYTHONPATH=scripts/testing python3 -m unittest test_harness test_scope_budget test_launcher test_monorepo_ci`，81 项通过，4.580 秒。
- 自动化候选：`python3 -m unittest discover -s .dev/orca-pr-automation-v3 -p 'test_*.py'`，47 项通过，0.085 秒。两组均设置当前树 `TMPDIR=.test-artifacts/optimization-tmp` 与 `PYTHONDONTWRITEBYTECODE=1`。
- 独立审查发现并修复：契约测试直接输入漏选、旧 JUnit 输出误用、人工结算丢失失败统计；修复范围复核无新增阻断项。上述实际运行已包含新增回归断言。
- 现有 v2 源文件与复制时指纹一致；候选无 `enabled.json`。只读统计输出样本 0、P95 null，没有真实运行达标证据。
- 未执行真实 Gradle/业务回归、真实 worker 或远端写入；未 commit/push。候选位于 Git 忽略目录，不随代码提交，需要按候选 README 单独部署和备份。

日志：`.test-artifacts/optimization-runner-tests.log`、`.test-artifacts/optimization-automation-tests.log`。上线前需要用户确认切换现有定时任务；启用后积累前 20 个真实 PR 的全部尝试，验证 P95 与失败/超时比例。

## 启用记录（2026-11-01）

用户明确授权“启用v3”后，暂停原任务，确认无 active owner，73 条历史调度均 completed/skipped_precheck，最后一个历史 worker 已 completed。旧运行目录完整备份至 `.dev/orca-pr-automation-v3/activation-backup/v2-runtime/`；授权、失败、接管与阶段报告原样迁移，保留原报告路径可读。

同一个定时任务 `fe12fabf-9391-4bc4-90c6-508be8d457f6` 已切换至 v3 prompt/precheck 并启用；每 5 分钟、原工作树、模型参数与 fresh-session 设置不变。启用前 precheck 输出 `[]`，退出码 1 表示无合格待处理 PR，没有启动 worker。最终配置回读已确认启用与入口一致，凭据见 `activation-backup/enabled-readback.json`。

这里启用的是编排脚本；本树 `scripts/testing/` 优化仍未提交，不会自动进入新 PR 的隔离工作树。真实 PR 耗时仍待后续样本验证。
