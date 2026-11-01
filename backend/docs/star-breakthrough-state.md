# 星石实际突破次数

`StarStateEntry.breakthroughStage` 持久化实际完成突破次数，HTTP 字段为 `breakthrough_stage`。0 表示尚未完成一次突破，null 表示未知；源面板表的行编号为次数加一。它是用户养成事实，不是计算系数。

| 品质 | 等级上限 | 突破次数上限 |
| --- | --- | --- |
| white | 30 | 2 |
| green | 40 | 3 |
| blue | 50 | 4 |
| purple / orange | 60 | 5 |

非节点及品质满级只有一种合法次数；未满级的整数十级有突破前/后两种。例：橙色20级为1或2次，21级为2次，60级为5次；白色30级为2次，不能再突破。

## 请求与历史兼容

StarState GET、PATCH、rebuild、restore、恢复点快照、完成回执和星石分享保留字段，沿用 generation/revision CAS、账号归属、事务和幂等。

- 同代 PATCH 缺字段：实例 ID、kind、name、quality、level 均未变则保留原值，包括历史异常；不因老客户端保存其它信息抹除已知突破。
- 新实例或身份/等级变化且缺字段：只有唯一合法次数时推断，节点留 null。新写入拒绝品质超限等级及不匹配次数。
- 显式 null：清除确认值；整数必须符合等级/品质。缺失、null、数字字符串和小数不混为一谈。
- rebuild/跨代替换：按新快照决定，不继承被替换库存中的同名或同 ID 突破事实。restore 使用恢复点自身内容，历史快照没记录就保持未知。
- 养成完成：`start_already_broken` 必须与已知存量一致，否则 409 `star_breakthrough_changed`；未知时接受本次声明。成功在原扣料事务内写入终点等级和实际突破次数，回滚、幂等重放不重复扣料。

读取不补写历史档案，面板计算可推断唯一状态；未知节点返回 incomplete。密探配装页可对已装备实例补录，选择后立即 CAS 保存，不等待密探编辑保存；取消密探编辑不会撤销星石的独立保存。

## YuanStar 接入边界

宿主 `starCloudCoordinator.js` 双向透传可选 `breakthroughStage` ↔ `breakthrough_stage`，保留缺失和显式 null。旧重建结果比较兼容服务端唯一状态推断，不把它误认为保存不确定。旧客户端同代 PATCH 缺字段可保留服务器事实；旧 JSON 导入/rebuild 没有该事实时，节点依然未知。

当前私有嵌入版源码不在本机；用户已指定由源码拥有人反向同步。本次没有手改构建产物，也没有宣称其本地存储、Undo、JSON 导出已支持新字段。具体接入清单见 YuanHub 的 `docs/yuanstar-panel-handoff.md`。部署前先更新后端，再更新宿主和嵌入源码；不要回滚到会整条覆盖并丢弃新字段的后端。
