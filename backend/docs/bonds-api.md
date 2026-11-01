# 羁绊目录、档案与管理接口

本模块原生复用网站JWT、Beta资格、游戏账号与密探目录；没有外部账号体系、个人localStorage权威存储或库存奖励写入。所有接口沿用ApiResult、snake_case及InventoryError，响应 `Cache-Control: no-store`。

所有玩家及目录管理接口（含 catalog）要求网站登录和 `archive:access`：暂仅超级管理员和平台管理员拥有，普通用户、内测用户及历史 `ARCHIVE_USER` 不放行。目录管理另须原有 `bond_catalog:write`；历史记录与角色绑定保留。

## 数据与计数

`bond_catalogs` 每游戏一文档，含 revision、published、draft、永久 identities 及最近5份历史；`bond_archives` 按 userId/accountId 隔离，以确定性文档ID和 @Version 保证CAS。档案记录仅 bond_id/triggered/source/updated_at；时间和来源由服务生成，不代表游戏内首次触发。空档案只在响应中构造，读操作不创建档案或目录。

公共条目固定七字段：bond_id/game/members/action/weather/effect/status。ID为YuanHub首次生成的 `bond_` 加32位UUID；转换器生成的本站ID可随目录导入。2或3名不同成员均使用现有密探ID，成员顺序归一化；同游戏成员＋行动＋天气唯一，效果 positive/negative 不是新身份。效果/状态更正保留ID，身份变化不得挪用ID。新发布遗漏的旧条目保留为 retired，invalid 保持 invalid；历史身份不回收。

行动枚举：arson纵火、rumor传谣、poison下毒、undercover卧底、gather搜集、extinguish灭火、purify净水、rescue营救。天气：sunny晴天、rain雨天、fog大雾、wind狂风、light_snow小雪、heavy_snow大雪、hurricane飓风、thunder雷鸣。

summary.triggered_count 每次从记录与目录重算，包含 active/retired 的不同已触发ID，排除invalid；active_triggered_count/available_total只统计active。重复记录不增加，取消立即重算，没有第二份持久累计。历史条目不能手动新增触发，但允许取消和从原生备份恢复；invalid恢复后仍不计数。档案含缺失历史身份时报409，不伪造零进度。

## 玩家接口

| 方法与路径 | 输入与行为 |
| --- | --- |
| GET /v1/bonds/catalog | game；授权用户读取 published、版本，无草稿或个人信息，published_by为null |
| GET /v1/bonds/archive | account_id；返回账号、游戏、revision、catalog_version、records、summary |
| PATCH /v1/bonds/records/{id} | account_id、expected_revision、catalog_version、triggered |
| POST /v1/bonds/batch | 上述上下文和records数组，每项bond_id/triggered；1–50个不同ID，整批原子 |
| GET /v1/bonds/export | account_id；完整原生备份，含历史条目，不受页面筛选影响 |
| POST /v1/bonds/import/preview | account_id、document、strategy及可选source_account/source_game；只预览 |
| POST /v1/bonds/import/confirm | 同上加expected_revision/catalog_version/preview_token/skip_unknown；原子确认 |

除公共目录外均验证JWT/Beta及账号归属，游戏取服务器账号，拒绝客户端总数、归属、游戏、来源、时间等写入字段。档案/目录版本过期409，非法字段/游戏/条目422；JSON损坏或重复对象字段400，请求封装超限413。所有保存均返回完整档案和重算计数，相同状态不改变档案revision或时间。

写事务同时对现有账号和发布目录做fence，再执行档案CAS。批量失败全部回滚；账号删除/游戏更改与迟到写入竞争返回409，不复活孤儿。账号有任何羁绊记录即保护游戏修改；删除账号同时清理档案和本进程导入预览。

## 备份、旧助手导入

原生格式 `yuanhub-bonds`，schema_version=1，含game/catalog_version/exported_at/source_account.name/records。无JWT、用户ID或权限凭据。记录来源和时间仅供备份查看，恢复时不信任文件元数据；实际内容变化统一由服务器赋source=import和当前updated_at。手动保存source=manual。

默认strategy=merge，只合并true，false和缺项不清除现有记录；原生可明确use_file采用显式false，缺项仍保留。原生不接受成就备份格式。最多5000条、2MiB；保存前校验完整原生备份大小，防止写入无法导出的档案。旧助手多账号文件最多8MiB，每次只选择一个来源账号和现有目标账号；HTTP封装额外允许4KiB。

旧格式来源 `ry::名字`/`dyy::名字`、明确旧名称前缀或__server__提供游戏提示，冲突即拒绝；缺少信息必须传source_game，绝不默认猜测。用当前目录及本站密探名称**生成完整旧键索引**，不拆含下划线的字符串；未知或未发布资料列unknown，不新增公共条目。__missing__和服别可用性覆盖仅忽略，不修改密探拥有/成长或公共资料。

预览逐项返回add/same/conflict/unknown/mismatched/invalid及affected；unknown需显式skip_unknown，mismatched或invalid阻止整批。预览token有效10分钟，绑定用户、目标账号/游戏、来源账号/游戏、revision、目录版本、策略和文件摘要。确认重新校验及计算，重复导入幂等；任何绑定变化返回409。缓存总计512份、每用户账号一份；重启失效，当前多实例部署需要粘性路由或共享预览存储（尚未实现）。

## 管理端

`/v1/admin/bonds/catalog` 所有读写均需 `bond_catalog:write`，仅部署配置指定的激活资料所有者，且仍须具有PLATFORM_ADMIN/SUPER_ADMIN身份，匿名401/普通玩家403。不受玩家Beta前端开关控制，不开放外部token。

| 方法与后缀 | 输入与行为 |
| --- | --- |
| GET 空后缀 | game；完整管理目录，无个人档案 |
| GET /export | game、scope=published/draft；format=yuanhub-bond-catalog/schema_version=1/game/entries |
| POST /draft | game查询；expected_revision、entries；允许新条目省略ID，由后端发号 |
| POST /preview 或 /publish | game查询；expected_revision、可选restore_version；预览或发布/恢复 |
| POST /discard | game查询；expected_revision；草稿恢复到published |

目录请求2MiB，含历史身份最多5000条，目录含历史快照最多12MiB。未知成员拒绝保存；active成员游戏不可用时拒绝发布，允许留草稿供核查。恢复旧版本仍产生新版本，并保留遗漏的当前历史身份。所有目录替换以revision CAS，冲突不覆盖草稿。网页本地文件预览/合并不写数据库，需明确保存和发布。

## 成就接入与验证

现有10字段成就契约已具备，已接通同账号只读 `linked_metrics`：`{metric:"yuan_bond_variants",value,source_revision,source_catalog_version}`。仅配置该linked_metric的有效正整数target使用，具体目标来自已发布目录；不依赖名称。指标读取失败使请求失败，不返回伪零。不写回人工progress、不取最大或相加；完成由用户确认，取消羁绊不撤销已确认成就，成就也不反向生成羁绊或库存奖励。原生成就备份不含该派生指标。

定向测试：BondRulesTest、BondContractTest、BondMongoTest。Mongo测试只使用TestMongo自有可抛弃副本集，覆盖账号隔离、CAS/并发、批量回滚、账号删改竞争、历史身份、导入幂等、预览绑定、原生往返及1207条合成容量。真实资料与恢复备份保存在仓库外；生产只接受所有者手动操作，见 [私有资料维护](private-archive-data.md)。

目录响应 achievement_targets 是当前游戏已发布成就的有效羁绊目标排序去重结果，不进入羁绊身份，不自动修改个人记录。读取成就目标失败时返回错误，不用固定门槛或伪零替代。
