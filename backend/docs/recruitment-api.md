# 招募档案 API（MVP）

## 个人心愿 UP

管理员卡池与快照新增 `allow_custom_up:boolean`，默认 `false`，与 `pool_type` 独立；只有管理员明确开启的池允许个人自选。管理员创建/编辑支持该字段，编辑时省略保留原值，显式 null 或非布尔值拒绝；目录 JSON 导入也支持。开启或关闭均随卡池 revision 的 CAS 更新写入 Mongo，随后管理员与公开目录 GET 返回持久化后的值；保存响应不能替代重新读取验收。公开目录不包含任何用户选择。

个人池新增 `wish_agent_ids:string[]`，默认空数组。通过 `pool_records_save` 的可选同名字段保存，必须恰好两位不同、当前游戏图鉴中 rarity=5 的密探；未开放、隐藏或停用池不允许修改心愿。仅修改心愿时可发送 `entries:[]`、`remaining_pulls:null`。沿用用户/账号隔离、archive revision CAS、request_id 幂等和账号事务；不创建公共 UP 槽。省略字段保留当前选择。

开启心愿的池，archive 投影的 UP 名单由个人选择组成，operator_id 使用图鉴 ID；已有同密探管理员槽时复用其稳定 id（兼容历史次数），其余槽 id 使用图鉴 ID。未选择时 UP 为空、状态 unknown，不回退管理员固定名单。前端以个人选择推导后续手工录入的 UP 状态。修改选择不改写已有事件的 `up_status` 或历史心愿快照。

完整 v1 备份新增可选 `pools[].wish_agent_ids` 与快照 `allow_custom_up`；旧备份默认未选。空档案恢复或显式 `use_backup` 状态策略可恢复心愿；`keep_current` 和普通记录导入不替换已选心愿。存在心愿的档案不视为可自动覆盖的空档案；备份不能自行开放普通池。历史事件保留当时 UP 状态。

个人路径 `/v1/recruitment`，管理员目录路径 `/v1/admin/recruitment-catalog`。成功沿用 `{status_code:200,data:...}`；错误使用真实 HTTP 状态与 `{error:{code,message}}`。除 GET `/catalog` 外个人接口须 JWT、全站内测资格及账号所有权，由 `BetaAccessPolicy` 统一校验。独立招募授权/模式已退役，历史数据及遗留管理 API 保留，不再控制当前招募或账号接口准入。个人读取不创建档案，不播种目录；响应 `Cache-Control: no-store`。卡池定义和固定 UP 名单由管理员维护；明确开启心愿模式的池，个人 UP 由用户选择。

## 读接口

纯日期字段（卡池日期、个人池快照日期、出货日期）新写入 Mongo 时保存为 `YYYY-MM-DD` 字符串，查询与跨时区读取使用同一转换器；空值继续表示未知。日期筛选和分页同时兼容新字符串与旧 BSON Date，旧日期沿用原有本地时区的读取/查询边界；读取不迁移数据，不能在缺少原始写入时区的情况下自动改写历史日期。

- `GET /catalog?game=如鸢|代号鸢` → `{catalog_revision,pools}`。池字段 `pool_id,game,name,pool_type,start_date,end_date,enabled,revision,up_agents`，兼容保留派生的 `up_agent_ids,up_agent_names,unmapped_up_agent_names,up_status`；未知日期为空。目录含停用池和退役槽以便解析历史，新增时服务端校验启用状态。
- `GET /archive?account_id=...` → `{account_id,game_snapshot,archive_revision,baseline,current_pool_id,pools,temporary_agents,summary,pool_summaries,game_mismatch}`。pool_summaries为以pool_id为key的summary对象，不含账号baseline，基于服务端完整历史聚合；空档案 revision=0、baseline=0；pools 自动展示账号真实游戏的全部公共卡池（含停用池），合并已有个人池，保留其 ID 和进度。未保存的目录池使用响应中的稳定 pool_id，progress=null；读取不创建档案，summary 只统计实际保存的状态。游戏快照不一致时仅投影原个人池，保持只读。
- `GET /events?account_id=...&pool_id=...&cursor=...&limit=50&order=desc&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` → `{items,next_cursor,archive_revision}`。limit 1–100，pool/date可省略；order为asc（从早到晚）或desc（从新到旧，默认），按用户录入/调整的顺序排序，不声称真实获得时刻排序。游标绑定作用域、筛选、方向和revision，修改后继续旧页返回409，应重新读首页，切换方向须从首页重读。日期筛选不包含未知日期。尚未保存的本游戏公共池也可筛选，返回空历史，不写入个人档案。
- `GET /batches?account_id=...&pool_id=...&cursor=...&limit=50` → `{items,next_cursor,archive_revision}`，仅有效计数批次；pool/cursor可省略，limit1–100，按创建时间/ID倒序。包括节点已单独删完但仍有未分配抽数或总量为零的批次。游标绑定scope/pool/revision，旧页409。与archive/events组合时比较三者revision；同样支持未保存的本游戏公共池筛选。

`pools` 条目：`{pool_id,snapshot,progress,mapped_snapshot}`。snapshot=`{name,game,catalog_pool_id,start_date,end_date,up_agents,up_agent_ids,up_status,up_agent_names,unmapped_up_agent_names,catalog_revision}`；up_status目录枚举为verified/partial/selection/unknown，仅verified且名单非空时可辅助UP判断。`mapped_snapshot` 仅为旧用户临时池的存量兼容字段，不能再新建或映射临时池。progress=null表示未知。目录展示不等于用户已开始抽取；只有实际保存的未知进度计入账号 unknown_progress_count。显式使用兼容 pool_create 时必须提供初始进度：未知填null，确认没有尾抽填0，已知则填非负整数；不得将未确认的进度默认为0。已保存卡池的未知进度计入summary的unknown_progress_count，当前录入前需先校准。

`up_agents` 条目：`{id,name,operator_id,active}`。管理员配置的 N 个有效项仅代表 UP 名单，非 UP 仍可从本游戏4星/5星图鉴（含照影SP）选择。`id` 是固定的池内身份，格式为 `<catalog_pool_id>:up:<标识>`；`operator_id=null` 表示占位，管理员绑定图鉴密探后仍保留同一 `id`。选 UP 项录入时 `agent_id` 使用槽 `id`、`temporary=false`；选图鉴非 UP 时使用官方图鉴 ID。新增或编辑换选时直接提交当前 UP 的官方 ID，服务端也规范为同池槽 ID；用户明确填写的 `up_status` 不被覆盖。普通用户不能创建槽或绑定图鉴。

`temporary_agents` 条目 `{agent_id,name,mapped_agent_id,mapped_name}` 仅保留旧数据。事件原始agent_snapshot=`{agent_id,name,temporary,catalog_revision,rarity:4|5}`。GET archive/events 根据当前管理员目录投影最新池名、UP 名和图鉴绑定；只改变读响应，不修改个人 revision、事件 ID、抽数、进度、顺序、日期、备注和批次。export 保留原始快照与固定引用，同时更新池快照的 `up_agents` 解释信息，让离线备份保存当前占位绑定；恢复后目录优先，备份不能修改公共定义。pool snapshot 另保留 pool_type；目录无法解析时原快照仍可解释旧记录。

事件：`{event_id,pool_id,pool_snapshot,agent_snapshot,pull_span,sort_order,up_status,acquired_date,note,source,batch_id,created_at,updated_at,deleted_at,deleted_revision,import_batch_id,imported_at}`。up_status为`up|non_up|unknown`，来源首版`manual`；pull_span正整数或null，acquired_date日期或null；响应不暴露数据库_id/user_id/account_id。import_batch_id/imported_at是独立导入元信息，不替换原source。批次也可携带同类导入元信息。

acquired_date和snapshot的start_date/end_date在API与Mongo内均为YYYY-MM-DD日历日期字符串，不用时间点表达；UTC RFC3339时间仅用于created_at/updated_at等时间戳。日期和时间字段仅接受对应格式的字符串或可选null，拒绝数字、数组及非法日期422；跨服务器时区读取不应改变日期或日期筛选结果。

summary=`{known_total_pulls,recorded_pulls,batch_pulls,known_progress,event_count,exact_event_count,unknown_event_count,unknown_progress_count,has_unknown,up_agent_counts}`。总数=baseline+有效独立事件span+有效批次total+已知进度。批次内span不重复贡献累计；unknown标记不能解释为0抽事实。

`pool_summaries[pool_id].up_agent_counts` 为 `{UP槽id: 获得次数}`，例如 `{"catalog_p:up:A":2,"catalog_p:up:B":0}`。键使用 `up_agents[].id`，不是 `operator_id`：占位绑定图鉴后仍统计原有记录。服务端在当前用户/账号范围一次聚合所有未删除事件，按池和原始 agent_id 分组，再按当前投影快照的有效 UP 槽筛选；兼容同一密探旧图鉴 ID，重复出货累加，批次每条事件算一次，不依赖 pull_span/up_status。退役或非 UP 结果不输出。历史池、未保存公共池同口径，当前有效槽无结果也明确返回0；目录缺失回退已保存快照。全局 summary 此字段为null。GET不写个人状态、不返回完整events、不逐池查询。字段或某槽键缺失表示摘要未知，客户端必须显示“—”等未知状态，不能自行补0；并行目录更新新增了尚未包含在archive中的槽时也遵循此规则。此字段仅为读摘要，不改备份协议或Mongo持久化结构。

`pool_summaries[pool_id]` 包含两个可空数值：
- `average_gold_pulls`：未删除5星事件中正整数 `pull_span` 的均值，四舍五入保留一位小数。包含批次中已知单条间隔，不使用批次总量、不包含当前垫抽，缺少有效样本为 null。
- `small_pity_win_rate`：每池首条5星默认小保底，按 `sortOrder,eventId` 升序推演，小保底UP成功后重置、非UP失败后转大保底，大保底UP不进入分子分母并重置。结果为百分数（如66.7），与抽数无关；4星和删除记录不推进状态。无样本、未知UP/稀有度或大保底非UP的矛盾顺序为 null，有样本但无成功为0。常驻池的适用性沿用前端卡池分类规则，不展示该比例。

全局 `summary.average_gold_pulls` 按相同有效样本口径汇总当前账号所有卡池，仅在最终均值四舍五入保留两位小数，不平均已舍入的各池均值；不包含 baseline。前端固定显示两位小数（如 `26.33`、`12.00`）；卡池均值仍保留一位小数。无有效样本为 null。`summary.small_pity_win_rate` 仍为 null，不跨池推演保底。

`summary` 与 `pool_summaries[pool_id]` 另提供以下尾部可空字段，不改变持久化或交换协议：

| 字段 | 含义 |
| --- | --- |
| `up_gold_count` | 适用池中归属为 `up` 的五星条数 |
| `known_up_gold_count` | 归属为 `up` / `non_up` 的五星条数（总 UP 率分母） |
| `unknown_up_gold_count` | 归属未知的五星条数，单列且不进入分母 |
| `total_up_rate` | UP 五星 / 归属已知五星 × 100，四舍五入一位小数；分母为 0 返回 null |
| `guaranteed_gold_count` | 首金假定小保底后，合法 non_up→up 已实际出保证金的次数；待出保证金不计。未知/非法保证顺序返回 null |
| `pity_history_assumption` | 适用时固定 `first_gold_small_pity`，展示“按现有历史、首金小保底推断” |
| `pity_status` | `no_samples` 无五星样本 / `inferred` 按历史推断 / `insufficient_history` 历史不足以推断 / `not_applicable` 无 UP 机制或永久池 |

适用池为非永久且投影快照或原归档快照有 UP 槽定义的池；永久判定沿用 `isPermanentRecruitmentPool`，inactive 槽、隐藏/停用目录和旧归档 UP 定义仍保留历史机制，不因当前目录移除槽位而抹去。完全无 UP 定义不适用。四星不计，不推进保底；UP 归属计数在保底失效后仍继续，未知绝不当作 non_up。

无五星样本但适用时：三项计数为 0、保证金次数 0、两项命中率 null，状态 `no_samples`。不适用时：新增计数/比例/假设为 null，状态 `not_applicable`，单池小保底率也为 null。旧后端字段缺失表示未提供，前端不能补 0。

账号总 UP 率先合计适用池原始分子/分母，再最终舍入，不平均各池百分比。大保底次数分池推断，所有适用池均有效才相加，任一池未知或违规则合计 null；账号状态同样为 `insufficient_history`。没有适用池时为 `not_applicable`。`summary.small_pity_win_rate` 继续为 null；不使用跨池的账户平均出金累计器推断保底。读取仍按认证用户和授权子账号隔离，沿用未删除事件流；无新增写入或去重逻辑。

例如 non_up,up,up：总 UP 率 66.7%、大保底 1 次、小保底 50%；unknown,up：总 UP 率 100%（未知1条）、两项保底推断为 null；池A只有 non_up、池B只有 up：账号总 UP 率 50%、大保底 0 次。

全局 `summary` 还提供以下可空字段（旧后端字段缺失表示未知；`pool_summaries` 内保持 null）：
- `permanent_known_total_pulls`：无限期常驻池已知累计。以投影后池快照的 `pool_type` 为准，忽略大小写及首尾空格，接受 permanent、standard、常驻、常驻卡池、常驻招募且 `end_date=null`，与前端常驻识别一致；累计所有对应个人池的有效独立记录抽数、有效批次总量和已知 progress，不含 baseline，不重复累计批次间隔；没有对应池/已知抽数时为0。
- `most_obtained_gold_agents`：本账号未删除五星中获得次数最多的密探，包含普池、照影SP、批次事件及未知间隔。
- `most_non_up_gold_agents`：非普池中显式 `non_up` 的五星记录次数最多的密探；排除 UP状态未知、普池及无法识别所属池的记录。
- `most_permanent_gold_agents`：所有常驻池合计，未删除五星中获得次数最多的密探。常驻判定与 `permanent_known_total_pulls` 相同，使用 `mapped_snapshot` 优先的投影快照，不按池名或 `non_up` 猜测；不受当前选中卡池影响。隐藏、停用池保留历史，目录缺失回退档案快照；池类型无法确认的记录不计入此榜。`null` 表示未提供/未知，`[]` 表示已统计且没有符合条件的记录；单池摘要仍为 `null`。原获得榜和非 UP 榜口径不变。

排行格式为 `[{agent_id,name,count}]`，并列第一全部返回，按 `agent_id` 排序。空数组表示已统计但无符合条件的记录。按原始图鉴ID、当前池槽绑定的 operator_id、临时密探 mapped_agent_id 合并稳定身份，不按名字合并，不合并独立SP身份。name为展示回退值，客户端可使用当前图鉴名称。计次不依赖 pull_span，不因批次已包含总抽数而跳过出货事件。

这些值在首次 archive 请求中计算完整历史，独立于 events 分页。服务端在原有账号校验及读取事务内，一次打开当前 userId/accountId、未删除且非4星的有序游标，只投影 poolId、agentSnapshot.rarity/agentId/name、pullSpan、upStatus；按池保存保底/均值状态，同次遍历同步累计账号均值及每个密探的获得/非UP/常驻池次数，关闭游标，不下载完整快照、不逐池查库、不写Mongo。响应不携带逐条投影数据，不新增接口、查询、缓存或备份字段。保存后重新读取 archive 即得新值。


## 管理员目录

以下接口须 JWT 与 `recruitment_catalog:write`，复用现有平台管理员/超级管理员权限；普通登录用户返回403。GET 不写入 Hub 数据库；经核对的静态目录是只读初值，管理员覆盖保存在 `recruitment_catalog`。

- `GET /v1/admin/recruitment-catalog` → `{pools}`，含两游戏、隐藏池、停用池及退役槽。
- `POST /v1/admin/recruitment-catalog` → 新池，`expected_revision=0`。
- `PUT /v1/admin/recruitment-catalog/{poolId}` → 更新，路径 ID 须匹配 body，`expected_revision` 必须等于当前 `revision`，并发修改409。

写 body：`{pool_id,game,name,expected_revision,start_date?,end_date?,pool_type?,enabled?,hidden?,allow_custom_up?,up_agents?}`。UP 数量等于 `up_agents` 中 `active=true` 的数量，最多120个有效项、500个含退役项。槽 ID 必须属于本池；`operator_id` 非空时须为同游戏 rarity=4/5 的图鉴密探（含照影SP），有效槽不得重复绑定同一图鉴密探。`pool_id`、游戏和已有槽 ID 保持稳定。省略旧槽会将其退役保留；`enabled=false` 停用卡池。停用/退役阻止普通新增结果，仍可读取、维护既有记录和恢复真实历史备份。绑定占位时无需改写个人历史。

## 写接口

`POST /commands` 公共外壳：

```json
{"account_id":"acc_...","expected_revision":0,"request_id":"uuid","operation":"progress_set","data":{"pool_id":"catalog:admin_pool_id","progress":0}}
```

成功→`{archive_revision,event_ids,pool_id,agent_id,batch_id}`，调用后GET权威状态。每次新草稿/重确认用新request_id；同作用域成功原请求重试先返回原结果，即使expected_revision过期也成功，且不重复发送SSE。同request_id不同内容409。

set_current_pool、progress_set、event_create、batch_create 可直接使用 archive 响应中的未保存公共池 ID，服务端在同一账号 fence / CAS 事务内按需保存目标池，不需先 pool_create。新保存的池默认进度未知，校正命令的明确值除外；current 录入仍要求先校正，historical 可直接补录。未操作的目录池不会保存，也不会进入 export；启用状态校验继续用于新增结果。兼容保留 pool_create，但页面不再提供手动添加入口。

| operation | data |
| --- | --- |
| pool_create | `{progress,pool_id?,catalog_pool_id}`，progress须显式null或非负整数；目录须为本游戏启用的管理员卡池，提供name、缺少目录ID或已有同目录个人关联（含旧映射）拒绝422 |
| set_current_pool | `{pool_id}` |
| pool_records_save | `{pool_id,entries,remaining_pulls,deleted_event_ids?}`：每条entry须带event_id，修改/新增最多120条、删除最多120条；remaining_pulls须显式整数1–40或null，有值时同事务保存所有记录改动和progress=40-N，null保留原进度（含未知） |
| progress_set | `{pool_id,progress}`，非负整数或null；N由客户端按40-N换算 |
| baseline_set | `{baseline}`，账号级非负整数 |
| event_create | `{pool_id,mode,entries,tail_progress?,extract_from_baseline?}` |
| event_update | `{event_id,entry}`，完整替换展示业务字段；不得改ID/池/批次 |
| event_delete | `{event_id}` |
| event_restore | `{event_id}`，expected_revision须等于删除返回revision |
| event_reorder | `{pool_id,event_ids}`，有效事件完整ID序列，最早到最新；最多20000 |
| batch_create | `{pool_id,mode,total_pull_count,entries,tail_progress?,batch_id?,extract_from_baseline?}` |
| batch_delete | `{batch_id,confirm_total_pull_count}`，确认当前批次数量，整批软删除 |
| batch_restore | `{batch_id}`，仅在删除revision没有后续写入时撤销 |

entry=`{agent_id,pull_span,event_id?,up_status?,acquired_date?,note?}`，每次1–120条。新增密探须是该启用池的有效 UP 槽，或同游戏绝密图鉴密探；其他池的占位不可串用。`temporary_agent_create/pool_map/agent_map` 均拒绝422；旧临时池和密探保持可读、可导出以及已存在记录的维护、删除/撤销，不作为新增入口。事件ID为1–128位字母数字/`._:-`，名称1–128字符，备注≤1000字符。未知字段/小数/类型错拒绝422。

### 原子历史插入与顺序维护

`pool_records_save.data` 可选 `ordered_event_ids`，表示**本次新增/修改/删除之后**同池全部有效事件ID，方向为最早→最新；省略时完全保留原有追加行为。该字段最多20000条、不可重复、不可遗漏其他页或包含其它池/已删除ID；服务端读取20001条进行上限校验，集合不一致或实际超限返回409，重复或请求超限返回422。不能把搜索结果或单页ID当作完整顺序。

```json
{"pool_id":"p","remaining_pulls":19,"entries":[{"event_id":"lu","agent_id":"char_038_luxun","pull_span":null}],"deleted_event_ids":[],"ordered_event_ids":["A","lu","B"]}
```

顺序意图与出货字段、删除、保底、revision CAS、账号写入fence和requestId回执处于同一个Hub事务；任何失败整体回滚。只分配本池保存后有效记录原有及新增的全局sort_order槽，不改其他池或tombstone的槽，不重新计算pull_span、日期、UP/稀有度、基准、批次成员或总量。排序以及4星/5星记录的新增、编辑或删除均可提供`remaining_pulls:null`以保留原保底（含未知）。已有`event_reorder`完整集契约保持不变。

客户端须以同revision完整分页核对预期ID顺序，不能把HTTP200当作已确认；回读失败沿原回执重读，网络提交结果未知沿原request_id/expected_revision及相同内容重试，409保留草稿并重新核对。JSON v1保持sort_order及null，CSV沿导出事件顺序输出；本次不改变备份格式。

`mode=current` 的独立精确事件要求旧进度已知、首条span大于旧进度、全部span已知、tail_progress显式提供（非负或null未知），提交同事务消费旧进度并设置尾抽；已知累计增量=sum(spans)-old_progress+已知tail。`mode=historical` 不改变进度；extract_from_baseline=true时同事务按本次明确计入量从基准扣除，余额不足拒绝。未知独立span不计入已知总数，不能单独从基准提取。

`batch_create` 保存已知总量、最多120个绝密节点；span可部分未知，但已知span之和不得超出total_pull_count。批次总量不包括tail_progress。current模式要求旧进度已知、total大于旧进度，tail可为null表示未知；historical不改进度。更新批次内某个span不能导致已知span之和超出批次总量；累计仍只计批次total一次。删除批次中的单个节点时，从批次 total 扣除该节点的已知 pull_span；未知 span 不猜测扣数，未分配给节点的剩余抽数保留。批次 total 可扣到零，备份可导出并恢复零总量批次；batch_create 和普通记录导入的新批次仍要求正整数。撤销本次删除加回实际扣除的抽数，兼容旧版本未扣数的删除，不重复加回。整批删除移除当前剩余 total。整批撤销只恢复此次批量删除的节点，不复活此前已删除节点。

删除独立B31：A17+B31+C17→A17+C17，累计65→34；其他span/progress/baseline不变。撤销同ID，旧撤销409。所有真实写入原子CAS、请求记录和生命周期fence，SSE只在commit后发送`recruitment_changed`。

上限：基准/单次抽数/进度≤1,000,000,000；个人池≤500，旧临时密探兼容上限1000。HTTP401未认证，403内测/权限，404无账号/节点（不泄露他人账号），409revision/重复ID/游戏快照/过期撤销，422校验。存量game_mismatch可读，普通写409。有实质招募数据（含tombstone）不能改游戏；仅公共池+零进度的偏好和零基准不锁游戏，改游戏事务内移除这类空档案/请求。首版无整模块清空；账号删除级联清除所有招募集合。账号更新与删除分别提交后推送account_updated（game）与account_deleted，客户端重新读取账号列表。

账号生命周期保护包括原有密探分享接口：分享码创建/更换/撤销只执行所属账号的非upsert字段CAS，不能用迟到的整账号快照覆盖game/name/招募fence或复活已删账号。若撤销时分享码已经更换，返回409 `share_code_changed`，刷新后重试。

## JSON备份与恢复

`GET /export?account_id=...` → `{schema:"yuanhub.recruitment.v1",exported_at,source_account:{account_id},game,archive_revision,baseline,current_pool_id,pools,temporary_agents,events,batches}`。data可直接保存为JSON文件。读取同一Hub事务快照中的完整档案，包含所有有效/已删除事件和批次，不使用分页，不输出截断备份；存量游戏不一致允许导出。所有时间UTC RFC3339，纯日期YYYY-MM-DD，未知保持null。source原值、pool_type、rarity、个人原始/映射快照保留；池快照的up_agents补入当前管理员解释信息（含退役槽和operator_id），不改写数据库或事件快照。目录缺失时使用原有槽快照。数据库ID、user_id及认证信息不进入文件。

机器协议：[recruitment-exchange-v1.schema.json](schema/recruitment-exchange-v1.schema.json)。紧凑UTF-8 JSON文档最大5MiB；事件和批次各最多20000（包含删除标记），导出、预览、合并结果超限整包422。服务端额外验证唯一稳定ID/顺序、同游戏、所有引用、删除时间/版本配对和批次有效span总和≤total。不接受未知字段、小数抽数或错误类型；池进度必须显式提供（未知为null），历史密探快照rarity必须显式4或5。真实管理员池即使停用、UP槽退役仍能恢复历史；新增池引用必须存在于管理员目录，新增结果须引用该池固定UP槽或本游戏4星/5星图鉴（含照影SP）。伪造catalog_pool_id、跨池占位、新增用户自定义池/临时密探均拒绝422，备份不能写公共目录。已存在的旧临时项可导出、判重及冲突保留，不能借导入新增旧临时池的结果或批次。

`POST /import/preview`：

```json
{"account_id":"acc_target","document":{},"options":{"state_strategy":"keep_current","confirm_count_change":false}}
```

options可省略，默认为上述值。`state_strategy`只有`keep_current`/`use_backup`。返回：

```json
{"preview_token":"recruitment_preview_uuid","document_hash":"sha256","target_revision":7,"expires_at":"2026-10-01T01:10:00Z","items":[{"entity_type":"event","id":"e1","status":"count_overlap","reason":"尚未明确确认抽数覆盖风险"}],"stats":{"added":0,"duplicates":0,"conflicts":0,"skipped":1},"risks":["计数覆盖风险说明"],"current_known_total":100,"backup_known_total":80,"candidate_known_total":100,"can_commit":true}
```

逐项entity_type为pool/agent/event/batch/state；status为add/duplicate/conflict/skip/count_overlap。stats统计每类计划条目（包含state）；conflict保留当前，其关联新增项跳过。预览无任何业务写入/SSE。token绑定用户、目标账号、原文档hash、选项hash和目标revision，有效10分钟；进程内最多4096个，过期/被淘汰/服务重启后必须重新预览。多实例部署须共享预览存储或sticky routing，当前预览不跨实例；已经成功的请求仍可跨重启按持久化记录重试。修改选项或文件须新预览，hash无关对象字段排列但保留数组排列。

空逻辑档案（无事件/批次/临时密探、零基准，且仅有已明确进度为零的公共池偏好；临时池和未知进度属于实质数据）恢复备份全部逻辑状态。源archive_revision只是备份元数据，目标从当前CAS revision递增；导入tombstone采用目标不可撤销标记0，旧源删除版本不会变成当前撤销权限。

已有档案按稳定ID和业务内容判重，忽略导入元信息、存储/更新时间、目标排序号与目标删除revision；管理员池同catalog_pool_id/game的名称、日期、名单、映射等显示元信息，以及非临时密探同agent_id/rarity的名称、目录版本，不作为业务冲突。固定池/密探身份、span、UP确认状态、获得日期、备注、source、批次和删除状态仍参与判重；旧用户临时池/密探的名称仍参与。管理员绑定占位后再次导入旧备份不会伪报冲突。同ID业务内容或删除状态不同为conflict。当前tombstone不复活，备份tombstone不删除当前live；新tombstone以不参与抽数的记录导入。新增事件在保留目标顺序后按备份相对顺序追加，重复项不改变当前用户顺序。原source保留，每次新导入单独记录import_batch_id/imported_at。

默认保留当前baseline、progress和偏好；新池进度为未知。新增独立事件/计数批次遇到当前或备份的非零基准、同池未知/非零进度、已有有效批次时默认count_overlap跳过；关联批次未导入则其节点不能拆开导入。已有同ID同内容批次的新节点仅在不超过该批次总抽数时增加，批次总量不重复计入。确认覆盖风险后设置confirm_count_change=true重新预览，再核对candidate_known_total。`use_backup`替换基准和匹配卡池进度、采用备份当前池，保留当前独有记录/池；状态从不相加，有状态差异时必须明确确认候选总抽数，否则can_commit=false。冲突池的状态仍保留当前。此功能不自动判断两个文件是否覆盖同一段现实抽卡历史。

`POST /import/commit`：原预览body增加`preview_token,document_hash,expected_revision（target_revision）,request_id`，options必须相同。成功返回commands同形的`{archive_revision,event_ids,pool_id:null,agent_id:null,batch_id:null}`；客户端重读权威状态。账号所有权、游戏、token绑定、期限、文件hash、revision、选项和候选可提交状态都复核，生命周期fence、档案CAS、所有新增批次/事件、成功请求记录在一个Hub事务内原子提交；失败全部回滚。SSE仅提交后发送一次。使用原request_id和完全相同body成功重试先读持久化结果，即使token过期、服务重启或revision过时仍返回原结果；同request_id不同内容409。新request_id再次导入同文件不新增重复记录，但会保存新的成功请求并推进revision。

失效token409 `recruitment_preview_expired`；身份/文件/选择不匹配409 `recruitment_preview_mismatch`；并发目标变化409 `recruitment_revision_conflict`。完整导入失败保留当前档案。首版不提供清空、覆盖删除当前记录或跨游戏恢复。

CSV由前端使用同一完整export文档生成，标准CSV转义并处理所有用户文本的公式注入，row_type区分event/baseline/pool_state；密探名称按同一个人卡池的固定UP身份采用当前绑定解释，无法匹配时回退原事件快照。CSV供阅读和迁移辅助，不保证往返恢复。


## 卡池弹窗逐条保存（2026-10-01）

`pool_records_save` 维护某个池的每次出货，同一agent_id允许重复，身份按event_id区分。entries仅包含改动或新增；存在ID更新原记录（保留排序和批次归属），新ID新增独立事件（按请求顺序追加），deleted_event_ids明确软删除指定有效节点。两组ID唯一且互不重叠，不能修改/删除其他池或已删除节点。未知span须显式null，已知span为正整数，未提交的历史不覆盖。新增/换密探沿用目录、游戏/稀有度、固定UP槽校验，停用池仍可改已有抽数和删除但不能新增。

remaining_pulls有值时按40抽口径替换当前进度0–39；null保留原进度（含未知），不清除原值。null且没有记录或顺序修改的空请求拒绝422。span和尾抽各计一次，不额外消费或累加旧进度，不自动从基准拆出。改单条独立事件只替换其抽数贡献；删一条不改相邻跨度。批次内节点纯编辑不改变批次总量；删除时扣减被删记录的已知 span，所有变更完成后的有效 span 之和须≤扣减后的批次 total。删除不改相邻记录或当前垫抽。整次请求复用账号fence/CAS/幂等账本和Hub事务，任一校验或请求记录存储失败全部回滚；提交后才发SSE。旧current/historical命令、JSON/CSV公开字段不变；内部 batchCountDeducted 标记只用于区分实际已扣数的删除，不对外导出。

```json
{"account_id":"a","expected_revision":1,"request_id":"dialog-1","operation":"pool_records_save","data":{"pool_id":"p","entries":[{"event_id":"E","agent_id":"catalog_p:up:A","pull_span":17}],"deleted_event_ids":[],"remaining_pulls":19}}
```

界面打开弹窗后分页读取本池events，并使用该页archive_revision提交。读取失败不可当空池覆盖；网络重试保留新event_id和request_id，409重读并核对草稿。再次保存相同已有event_id不会新增出货计数。


## 目录隐藏与安全修正（2026-10-08）

`recruitment_catalog.hidden` 是独立布尔值，旧 Mongo 文档缺失时读为 false。hidden 比 enabled 优先；隐藏时原 enabled 保留，恢复必须明确选择正常显示或停用但显示。PUT 省略 hidden 保留已有值，POST 省略默认 false；显式 null、字符串或数字均为 422。批量导入仍只新增，不覆盖已有 ID；新池可带布尔 hidden。

| 状态 | 公共 catalog / 无个人池账号 | 已保存个人池 | 新出货 / 批次 | 已有事件与真实进度 |
| --- | --- | --- | --- | --- |
| hidden=false, enabled=true | 展示并自动投影 | 保留 | 按原规则允许 | 允许维护 |
| hidden=false, enabled=false | 仍展示并自动投影 | 保留 | 拒绝 | 允许维护 |
| hidden=true | 不展示、不自动追加、不允许首次关联 | 原 pool_id / progress / 摘要保留 | 拒绝 | 允许维护、编辑、删除及原规则撤销 |

public catalog 的 catalog_revision 来自本游戏完整目录，隐藏/恢复和隐藏池编辑仍改变版本，但响应不泄露隐藏池条目。archive 额外返回 `pool_states: {个人池ID: "enabled"|"disabled"|"hidden"}`，仅描述返回的池；该状态不写入个人 snapshot，不进入 JSON 备份 schema。GET 不创建或删除个人档案。events/batches/摘要/UP 次数及累计不因隐藏而删除；历史入口无需公共 catalog 中存在该项。

pool_create 和 newEvents（event_create / batch_create / pool_records_save 新事件）均由服务端拒绝隐藏池；set_current_pool / progress_set / pool_records_save 自动关联只能从非隐藏投影选择。已经保存的隐藏池允许选择、真实进度校正、原事件换选/抽数/日期/备注维护及删除。pool_records_save 在任何写入前区分旧 ID 与新 ID，混合新增+编辑/删除整包失败，保留原事务、CAS、request_id 幂等和账号 fence。

preview 与 commit 均重新检查隐藏状态。隐藏池备份只允许目标账号已有相同个人池和固定目录身份，事件/批次须有服务端相同存量身份；有效与 tombstone 都能判重/冲突保留，不能借 JSON 创建新结果。export 和离线读取保持原 schema 和历史事实。**安全边界：**v1 备份无可信来源证明，无法区分已丢失的真实离线结果与伪造新结果。隐藏期间不能向空账号首次恢复隐藏池，也不能恢复服务端从未保存的事件/批次；先由管理员明确恢复显示再按原恢复校验执行。没有放宽校验或清理旧数据。

安全编辑保持 pool_id/game 不可修改；录错身份请先隐藏错误卡池，再新建正确卡池。名称、类型、日期、状态修改不会重写抽数事实。未变更的历史 UP 绑定保留，不因图鉴暂不可用阻止 metadata 保存；已经正式绑定的固定槽不再换绑，错配退役旧槽并新增正确槽，省略旧槽仍退役保留。已保存占位名称保留，首次图鉴映射继续沿用固定槽身份。此策略保守保护离线备份和潜在历史引用，未提供永久删除或槽 ID 复用。

已修复两个编辑缺陷：更新 revision=0/缺失的旧目录文档曾误走 insert 造成重复 ID 409；未变更的旧绑定曾被重新按最新图鉴校验，导致名称/日期等无关修正被 422 拦住。现在 create 使用唯一 _id，update 按原 revision CAS（缺失等价0），并同时更新 hidden、updatedBy/updatedAt；真正并发冲突仍 409，不自动覆盖。

公共活动日历的招募派生项也排除隐藏池，避免错误卡池从另一个公共入口出现；招募管理员目录仍完整保留。

### 4星计次与照影SP

图鉴名称唯一匹配且属于当前游戏的导入占位会自动绑定，保留池ID与UP槽ID；未知/重名保持占位，显式ID仍严格校验。4星事件的 `pull_span` 必须为 null，只累计 `event_count`、`four_star_count` 与对应UP次数，不计绝密间隔，也不制造未知间隔。`exact_event_count/unknown_event_count` 仅包含5星，`event_count-four_star_count` 为5星条数。仅4星的 current 录入不会读取/覆盖保底；混合录入按首个5星校验旧进度。照影SP按图鉴5星参与原有规则。显式批次总抽数仍只累计一次。备份4星必须为空间隔且稀有度与图鉴一致；旧记录保留原始稀有度和身份。

`pool_records_save.remaining_pulls` 字段仍须显式提供；维护4星或5星均可传null，表示保留当前进度（含未知）。用户界面的当前保底为选填，有值时仍须为1–40整数。

兼容历史：曾以占位槽录入的原始5星快照，即使该槽后来绑定到4星，备份仍按固定槽身份与原始稀有度恢复。新录入由图鉴派生稀有度；新4星快照须与图鉴一致，原历史不回写。

## 导入来源账号可选（2026-10-14）

招募 JSON 的 `source_account` 可省略或为 `null`。外部资料/AI 生成的文件无需提供或编造账号 ID；提供对象时，其 `account_id` 必须为符合 ID 格式的 JSON 字符串，数字、布尔值等类型不会自动转换。导出完整备份继续携带来源信息，旧文件兼容。

导入目标始终是页面当前选择的游戏账号，后端按请求目标验证所有权、游戏、预览绑定及版本。来源已知且与当前账号不同时才提示跨账号；无来源时不提示。导入仍需先预览，切换账号会清空原文件及预览，必须重新选择文件。

## 普通记录导入与备份恢复（2026-10-14）

导入预览/提交继续使用原接口，根据 `document.schema` 自动识别。`yuanhub.recruitment.v1` 是完整备份，保留恢复状态、原身份和历史快照；新增 `yuanhub.recruitment.import.v1` 用于外部记录，仅追加，不替换当前基准、池进度或当前池。普通导入只允许 `state_strategy=keep_current`，计数重叠仍需确认后重新预览。

```json
{"schema":"yuanhub.recruitment.import.v1","game":"如鸢","events":[{"event_id":"550e8400-e29b-41d4-a716-446655440000","catalog_pool_id":"xlsx-1e717a2211d8b823e02bb46f","agent_id":"char_099_pangxi","pull_span":37}]}
```

示例为虚构出货。记录 UUID 必须小写且稳定，重复导入/修订保留，不使用 `evt_1` 流水号。使用公共卡池 ID，不添加 `catalog:`；密探使用图鉴 ID 或所属卡池的管理员 UP 槽 ID。系统查目录生成快照/稀有度，保留官方角色ID，不自动推断UP。数组顺序代表先后。`up_status` 可选，默认 `unknown`；`acquired_date`、`note`、`batch_id` 可选。5星间隔为正整数或null；4星只计次，间隔必须null。

可选 `batches`：每条 `{batch_id,catalog_pool_id,total_pull_count}`，batch_id同样为稳定小写UUID。关联事件填写batch_id，必须同池，其已知间隔之和不得超过批次总抽数；累计仅计批次总量一次。events必填，可空但不能和batches同时为空。最多5MiB、各20000条事件/批次、500个公共池；超过或非法整包拒绝。

普通文件不接受 `source_account`、`exported_at`、`archive_revision`、`baseline`、`pools`、快照、排序号、时间戳等备份字段。同目录有多份个人池时拒绝歧义，使用完整备份明确归属。前后端继续绑定当前账号/原文件/选项/版本；提交重新解析目录，解析结果变化要求重新预览。写入时生成时间，重复导入仍按事件身份判重，不按名字/日期合并。

普通导入预览统计只计记录/批次，items增加可选 `display_name`，显示解析后的池名、密探名和抽数；完整备份维持原统计语义。UI自动识别，普通文件隐藏恢复状态选项。下载入口按目的命名：获取导入规范（实时公开目录与示例）、下载完整备份（JSON）、导出表格（CSV）。规范文件不可直接导入，CSV仍仅用于阅读/分析；外部AI负责转换。

## 个人卡池关联去重（2026-10-15）

公共卡池由管理员维护；个人 `pool_id` 是历史记录的稳定归属，不是公共目录身份。同一账号新增个人卡池时，一个有效 `catalog_pool_id` 只能关联一个个人池（旧池优先取 `mapped_snapshot.catalog_pool_id`）。`pool_create` 和完整备份的预览/提交均校验此约束：已有 `catalog:<目录ID>` 时，不能再通过 `pool_id=<目录ID>` 或其他自造 ID 新增同目录个人池；单个备份包含多个新个人 ID 指向同一目录也返回 422。`confirm_count_change=true` 和 `use_backup` 均不能绕过关联去重。不同目录 ID 的同名/复刻池仍独立保存。

外部资料或 AI 转换必须使用 `yuanhub.recruitment.import.v1` 和页面下载的最新导入规范，只提供公共目录身份、稳定记录/批次 UUID 和抽卡事实；不要生成完整备份的个人池 ID、状态或快照。完整备份保留原身份，仅用于真实档案恢复。正常备份恢复到空账号、同身份重复导入继续有效；已有其他个人 ID 指向相同目录的目标账号会拒绝新增别名，不自动重写事件/批次归属或相加进度。

生产升级不需要数据库迁移、索引变更或前端同步更新，不会启动时扫描/修改历史。存量重复池继续可读、可导出、可维护，按原 ID 导入回同一账号仍可判重，但不能新增第三份；带重复个人身份的旧备份不能原样恢复到尚未保存这些身份的账号，需先人工核对整理。新增校验在事务写入之前执行；拒绝不会改变档案版本、抽数、事件、批次、成功请求账本或发送变更通知。并发写入继续使用账号 fence、档案 CAS 和事务，已成功请求的幂等重试仍优先返回持久化结果。

本修复只阻止新增重复关联，不推断两份真实历史是否相同，也不自动清理旧数据。仅从备份删除池/事件再导入不会删除服务器存量。存量修复必须核对池身份、记录、删除标记、进度及批次总数；旧版本删除批次内出货明细不会扣减批次计数，不能据此断言抽数已经去重；本次逐条删除同步扣减及历史补扣规则见上文和专用流程。上线后先用测试账号检查“正常普通导入/真实备份恢复成功、重复别名备份预览报错且原抽数不变”，再单独处理经用户确认的历史重叠。

已确认六组相同历史、2673 -> 2340 的单账号案例使用[专用运维修复流程](recruitment-duplicate-pool-repair.md)：只读预演、原始 BSON 事务备份、定向合并和有版本保护的回滚。该工具由运维明确执行，不作为通用自动迁移，也不能用于未经核对的其他账号。

旧版本已删除但未扣减的批次记录不会在读取时自动修改。定向补扣工具及预演、版本校验和回滚步骤见 [历史删除抽数补扣](recruitment-deleted-counts-repair.md)。
