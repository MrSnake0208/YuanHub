# 密探面板服务端计算与私有规则

自动计算接口 `/v1/operator/panel/**` 暂仅 `SUPER_ADMIN` 或 `PLATFORM_ADMIN`（`operator_panel:use`）可调用，普通用户、内测用户及历史 `OPERATOR_PANEL_USER` 不放行。历史角色绑定保留；未登录返回 401，未授权返回 403。公开 BOX 仅对有该权限的查看者计算面板，其他查看者获得手填/采集值，不返回自动计算结果。已有数据不删除；现有 Beta 和账号归属检查继续生效。用权角色不等同平台管理员，不授予管理能力或管理员专用集成 token 权限。


YuanHub 编辑预览、已保存档案卡片和公开分享使用同一后端计算服务。客户端只提交养成信息和本人星石实例引用；成长表、星石属性与命格系数保存在 Hub MongoDB。未启用规则时返回 `unsupported / rules_unavailable`，保留原有手动值与观测值，不在浏览器重算。

## 面板来源与自动补全

每个游戏账号的 `operator_panel_auto_fill` 默认开启，旧 Mongo 文档缺少该字段也按开启读取，无需批量迁移。通过本人账号 `PATCH /v1/accounts/{accountId}` 修改；缺失或 null 保留，false 关闭。该更新不批量修改密探或覆盖面板，也不进入密探 JSON 备份。

密探沿用 `combat_stats.display_mode.attack/hp`，逐项选择：

| 偏好 | 显示规则 |
| --- | --- |
| null：跟随账号 | 手填优先，其次采集；只有缺失且账号开启补全时才用自动结果 |
| manual：使用手填／采集 | 手填优先，其次采集；缺失保持为空 |
| auto：使用自动计算 | 优先有效计算结果，不受账号开关影响；计算不可用时回退手填／采集 |

0 是有效录入值。改变等级、化极、星石等只提示原面板待核对，不自动丢弃原值或重置来源偏好；切换来源只改变显示，自动结果不写入手填或采集字段。只录入攻击时生命可独立补全。前端编辑提供三种来源选择和可展开的差异对比，切换与密探一起保存；账号开关单独保存并通过既有账号事件刷新其他页面。

开关控制默认显示与补全，计算服务仍可用于对比及明确选择自动的密探。计算失败或信息不足时回退录入值，不把失败当作 0。星石尚未录全的用户可保留游戏内面板，无需为使用手填面板先录完背包。

## 私有数据准备

`scripts/panel/convert-rules.mjs` 只解析源文件中的 JSON 赋值，不执行数据脚本。转换需要已审阅的 ID 映射清单；来源指纹变化则停止，必须重新核对。126 名源密探全部可存私有规则，其中 121 名绑定公共图鉴，额外 5 名不绑定也不开放查询。190 种星石通过已审阅的系列和品质映射到现有星石名称；名称变更需重新核对规则映射。

```sh
# 输出目录须预先创建在仓库外；生成包不得进入 Git、resources、public 或网站目录。
node scripts/panel/convert-rules.mjs /private/source/panel_calc_fixed /private/review/id-mapping.json panel_20261021_v1 /private/output/bundle.json
node scripts/panel/source-cases.mjs /private/source/panel_calc_fixed /private/review/id-mapping.json /private/output/cases.json
./gradlew -I scripts/panel/source-parity.gradle panelSourceParity \
  -PpanelBundle=/private/output/bundle.json -PpanelCases=/private/output/cases.json --console=plain
```

生成文件权限为 0600，拒绝覆盖已有文件。源对照脚本仅在显式离线验证时执行已核对 JS；应用及导入链路不会执行它。规则只保留常驻攻击/生命需要的四类属性，战斗增伤、抗性等不参与计算。

## 导入、启用与回退

维护工具是独立 JavaExec 任务，无 HTTP 维护接口，也没有应用启动导入。`springBoot.mainClass` 固定为 `ShareApplicationKt`，避免维护工具的 main 干扰应用启动及打包。

真实数据库写入应在确认环境、备份和授权后执行。以下命令已经实现，开发期没有向开发/生产数据库执行。

1. 设置私有环境变量 `PANEL_HUB_MONGO_URI`，明确包含目标 Hub 数据库名。不要把连接串写进命令示例、Git 或日志；工具不回退读取应用配置。
2. 导入完整未启用版本：

   ```sh
   ./gradlew -I scripts/panel/maintenance.gradle panelRulesMaintenance \
     -PpanelAction=import -PpanelBundle=/private/output/bundle.json --console=plain
   ```
3. 分别启用目标游戏；两游戏可以选择同一版本，也可独立切换：

   ```sh
   ./gradlew -I scripts/panel/maintenance.gradle panelRulesMaintenance \
     -PpanelAction=activate -PpanelGame=如鸢 -PpanelVersion=panel_20261021_v1 --console=plain
   ./gradlew -I scripts/panel/maintenance.gradle panelRulesMaintenance \
     -PpanelAction=activate -PpanelGame=代号鸢 -PpanelVersion=panel_20261021_v1 --console=plain
   ```
4. 回退时用同一 activate 命令切回已校验旧版本，不覆盖或删除规则，也不修改用户档案。首次上线没有旧规则版本时，先在隔离环境完成验证再启用。

工具在导入/启用前读取目标公共图鉴，拒绝缺失映射、重复 ID、稀有度/星级上限冲突；不会新增图鉴角色。源规则和适用游戏需要人工审核，目录匹配不等于游戏实测。

| 集合 | 内容与约束 |
| --- | --- |
| `operator_panel_rules` | 版本 + sourceId 唯一；版本内非空 operatorId 部分唯一，多名未映射角色可并存 |
| `star_panel_rules` | 版本 + sourceId 唯一；每系列五品质完整等级/突破行及现有背包名称 |
| `panel_rule_sets` | 版本元数据和命格；`active:<game>` 保存启用版本指针 |

导入校验完整性、整数范围和结构，建立必要索引，再通过 Hub 事务插入三组数据。失败不产生可启用的半包；重复版本拒绝覆盖。启用重新校验全包并原子更换该游戏指针。每个请求先读指针、固定一个快照，缓存最多四个不可变版本；读请求不建索引、不写规则或库存。缺失/损坏的已启用版本报错，不静默降档。

## 登录计算 API

成功沿用 `ApiResult`，结果在 `data`；失败沿用 operator 错误 envelope。两个接口需要 JWT，身份只取登录上下文；账号不存在或不属于当前用户返回 404。游戏来自账号，密探须在该游戏公共图鉴中。成功响应 `Cache-Control: no-store`。

| 接口 | 请求 | 限制 |
| --- | --- | --- |
| `POST /v1/operator/panel/preview` | 单密探草稿，见下例 | 60 次/60秒；只预览，不保存 |
| `POST /v1/operator/panel/current` | `{"account_id":"a","operator_ids":["char_001_yangxiu"]}` | 每次 1–100 个不同 ID，20 次/60秒 |

```json
{
  "account_id": "a",
  "operator_id": "char_001_yangxiu",
  "level": 100,
  "level_breakthrough_stage": 9,
  "elite": 17,
  "huaji": { "owned": true, "stage": 25, "awakened": false },
  "oddities": { "attack": 0, "hp": 0 },
  "loadout": { "main1": "owned-instance-id", "main2": null, "main3": null, "support1": null, "support2": null, "support3": null }
}
```

`loadout` 缺失使用已保存配装；提供时作为完整草稿，未填槽位为空。实例只能来自本人账号，后端核对主/辅槽位、职业/属性、品质等级、同实例与同系列重复及 generation。旧档案仅有名称星石而没有稳定实例配装时要求核对配装，不静默当作空配装。

等级、修为、突破、奇闻必须是整数或允许的 null，不接受数字字符串/小数；未知字段（包括 user_id、game、extra、系数、源 ID）拒绝。缺失养成返回 `incomplete`；格式、越界、非法组合返回 422。`huaji.owned` 必须为布尔；未拥有时 stage=0，awakened 不得 true。本体/SP 共享等级、突破、修为的既有档案语义不变。

觉醒是五星后的可选阶段：`awakened` 缺失、null 或 false 均按未觉醒计算，不出现在 `missing_fields` 中；true 叠加觉醒加成，必须为 stage=25。已确认觉醒且 stage 缺失/null 的历史记录按五星读取；明确传入低于五星的 stage 与 true 组合返回 422。编辑降星须同时清除觉醒；PATCH 未提供 awakened 仍保留已有记录。规则包不需要因此重新导入。

结果只有 `status, attack, hp, missing_fields, reason, rule_version`：

- `calculated`：最终整数攻击/生命。
- `incomplete`：需要确认等级突破、化极、奇闻或星石突破等；`missing_fields` 定位对应输入。
- `unsupported`：未拥有、游戏图鉴不支持、规则未映射或尚未启用；不返回伪造数值。

批量返回 operatorId → 结果映射。公开分享通过既有分享范围检查后，向各密探条目的 `panel` 附加同样结果，同时返回 `display_panel: {attack,hp,attack_source,hp_source}`，按账号开关和密探偏好给出最终显示值（来源为 manual/observed/calculated/missing）。分享页使用该投影，空值不再自行补全；不公开偏好、签名或私有规则，不允许匿名提交任意养成参数；分享入口沿用限频。导出仍导出用户事实和既有逐项来源偏好，不包含自动结果或私有规则。

## 数值及兼容边界

三星满 4★为 stage=19，无后续节点。历史超限值通过 `huaji_legacy` 保留、有效 stage 置未知；无关更新与导出不截断历史。两名已核对 SP 满五星后可记录觉醒，快捷扣料继续禁止，见[化极契约](./operator-huaji-compatibility.md)。

星石实际突破次数、旧 PATCH、重建、恢复和完成事务见[星石突破契约](./star-breakthrough-state.md)。未知整数十级节点不得猜为未突破。核心最多三主星、三辅星，命格取组合最低品质。基础/等级/突破/化极/修为使用累计行，额外修为按 step 累加，百分比用万分比整数，最后一次向下取整，Long 运算检查溢出。

前端已删除旧数值模块和本地公式，自动结果不写入手动/观测事实。编辑防抖 250ms，切换账号或输入立即使旧结果失效，迟到响应丢弃。卡片有未保存草稿时提示保存后更新自动面板。星石突破补录直接保存 StarState，成功后重新计算；它独立于密探编辑页的保存按钮。

后端私有化阻止直接下载原始表，限频限制请求量；最终结果仍可被观察和推算，不能承诺完全杜绝枚举。过去已公开的旧数据无法通过本次删除收回。

## 验证与交付边界

合成单元/契约测试覆盖计算、账号/实例归属、私有响应、异步失效；事务测试仅用 owned disposable TestMongo。14,466 组外部源对照证明已映射角色和星石组合的移植一致，不代替游戏可达性与实测。开发过程未导入真实库、未发布；真实 UI 和私有 YuanStar 源码往返由用户及源码拥有人验收。
