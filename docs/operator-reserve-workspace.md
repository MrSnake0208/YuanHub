# 未来密探储备

在密探养成规划中展开「未来储备」，新建方案，填写人数、属性、职业、当前/目标等级与修为，检查费用后点击「保存储备方案」。下次打开或刷新从云端恢复。方案名称可编辑，可切换或新增方案；删除须确认并保存后生效。

每个方案是不同的假设：**独立试算，未预留库存**。真实清单也单独使用同一份库存试算，不能将多个方案解释为同时可完成。储备保存只写需求，不创建真实密探、不扣材料、不触发快捷提升或自动刷取日程。

## 费用与未知状态

复用现有 Wiki v9 revision93628 费用规则，先计算一人费用，再乘人数、汇总当前方案所有组，最后抵扣一次共享库存。三种兵书折算同一经验余额，五铢钱独立汇总为总需求。心纸、化极和觉醒费用不在本功能范围。

例如等级固定 100，阴/阳修为 13→17：一人需要五铢钱 1250000、宝石镜 940、水镜 2760、星汉镜 2100；两人各项乘二，再统一扣库存。两组同材料各需 100、库存 100，合计缺口为 100。

职业和属性须在给定选项内。混沌合法但目前暂无费用规则；当前整十等级的突破状态可保留「尚未确认」，目标跨过该节点时提示「需确认突破」，不产生确定费用。等级/修为范围及对应上限沿用真实养成规则。

库存尚未加载、读取失败或有效数量不可用时显示「库存暂不可用」，保留总需求，不显示确定缺口。仍可编辑和保存合法需求；不要把读取失败解释为零库存或材料足够。

## 保存与恢复

保存失败保留当前草稿。保存期间禁止重复提交和编辑，但可查看费用。成功/失败回执位于保存按钮旁；输入无效时聚焦错误摘要，链接可定位具体字段。

云端冲突时不会覆盖草稿。点击「读回云端比较」查看云端全部方案和需求，再明确选择：

- 「采用云端，替换草稿」：放弃当前本地修改，采用读回内容，不再发写请求。
- 「保留草稿，重试保存」：以读回版本重试，将整个云端工作区替换为当前草稿；若期间再次更新会再次冲突。

切换账号会清空本组件状态，旧账号请求的晚响应不会回填。切换游戏后旧游戏方案保留为只读，需新建对应游戏账号继续；删除账号会清理其储备。未保存草稿只在当前组件会话保留，离开页面或切换账号不保存草稿。

## 客户端协议与纯函数

独立 GET/PUT `/v1/operator/reserve-workspace?account_id=...`，沿用认证 request/ApiResult。GET 返回 schema_version=1、account_id、game_snapshot、read_only、revision、updated_at、active_plan_id、plans。空 GET 为 revision 0/plans []，不写数据。

PUT 只发送 `{schema_version:1, expected_revision, active_plan_id, plans}`；每计划为 `{id:UUID, name, demands}`；每需求为 `{id:UUID, count, attribute, profession, current:{level,elite,breakthrough_stage}, target:{level,elite}}`。最多 50 方案/每方案 50 组，名称 1–40 字符，人数 1–999。服务端校验全部范围与归属；未知字段拒绝。旧 training-workspace v1 和固定日程不混入储备字段。

`src/data/operatorReservePlans.js` 对后续调用方提供：

- `validateReserveDemand(demand)` → `{valid, errors:{[demandId]:{[fieldPath]:message}}}`，不强制转换输入。
- `reserveDemandCost(demand)` → `{items, experience, money, unsupportedReasons}`，已包含人数倍乘。非法/不支持时三项费用为 null。
- `reservePlanRequirements({demands}, stock=null)` → 同上总需求和 `shortage:{items,experience}|null`。stock 为成功读取的物品数量映射；null 表示不可用，{} 表示已读取的空库存。money 保留总需求。

unsupportedReasons 为 `{demandId,field,code,message}[]`，区分 invalid_demand、unsupported_attribute、unconfirmed_breakthrough、inventory_unavailable 等。任一组费用未知时不输出部分确定总额。

## 人工验收（未由 Node/jsdom 证明）

使用自己的测试账号，在 390/768/1440px 打开养成规划→未来储备，添加两组、改人数/目标并保存，刷新后确认恢复；确认名册和库存未改变。再检查删除、账号切换、键盘错误定位、窄屏单列及数字完整可读。网络失败/冲突时确认草稿保留并能按上述两条路径恢复。真实布局、触控、焦点遮挡和浏览器表现需人工验收。
