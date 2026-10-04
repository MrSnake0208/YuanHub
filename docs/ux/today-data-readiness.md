# 今日一览的数据录入状态

沿用 auth/account/data/ready 阶段，分别判断密探、库存与星石，不把读取失败伪装成缺失，不因一项失败要求覆盖重录。

库存“正库存种类数”与“已有录入证据”独立。复用 `/v1/inventory/current` 的 `full_baseline_at` 与库存条目：完整基准存在时，即使entries为空或全部为零也属于已录入；有效零条目（包括listed局部盘点）表示已有录入，但不宣称完整盘点。正数量条目也表示已有录入；只有完整基准才能显示完整盘点说明，`updated_at`不作为完整盘点证据。

成功返回空数组表示没有当前库存记录；旧格式空文档、缺元信息或无有效证据时显示“录入状态待确认”；请求失败显示“暂时无法读取”。两种unknown均不展示重新录入按钮。零完整基准显示“已盘点，当前库存为零”，局部零录入显示“已有录入，当前库存为零”。

首页读取继续复用当前账号与现有sequence保护；切换账号后旧响应不得覆盖新账号。连接码授权仅代表允许同步，不作为盘点或同步成功证据。

最小回归：`node --test test/todayData.test.js test/todayPage.test.js`、`npm run test:behavior -- behavior/todayComingSoon.spec.js`。在YuanHub目录执行，由用户/CI负责运行。
