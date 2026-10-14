import schema from '../../data/recruitmentImportSchema.json'
import { isRecruitmentOperator } from '../../utils/operatorForms.js'

export const RECORD_IMPORT_SCHEMA = 'yuanhub.recruitment.import.v1'

export function recruitmentImportGuide(game, catalog, operatorCatalog) {
  const pools = catalog.pools.filter(pool => pool.game === game && !pool.hidden).map(pool => ({
    catalog_pool_id: pool.pool_id, name: pool.name, game, start_date: pool.start_date, end_date: pool.end_date,
    pool_type: pool.pool_type, enabled: pool.enabled, up_status: pool.up_status, up_agents: pool.up_agents,
    source_note: pool.source_note,
  }))
  const operators = operatorCatalog.operators.filter(operator => isRecruitmentOperator(operator, game)).map(operator => ({
    id: operator.id, name: operator.name, alias: operator.alias, rarity: operator.rarity, games: operator.games,
  }))
  if (!pools.length || !operators.length) throw new Error('当前游戏目录不完整，暂不能生成导入规范，请稍后重试')
  return {
    format: 'yuanhub.recruitment.ai-guide.v2', game, generated_at: new Date().toISOString(),
    instructions: [
      '将本规范与原始资料交给AI；最终生成符合import_schema的完整JSON。本规范文件不能直接导入。',
      '优先提供可下载的UTF-8 .json文件；若无法提供文件，将完整JSON放在一个标记为json的Markdown代码块中，方便用户复制到招募档案的「粘贴 JSON」入口。',
      '不得拆分成多个代码块、使用省略号或混入解释文字；不得声称已生成实际不存在的附件或下载链接。输出长度不足时明确说明，不能将截断内容冒充可导入JSON。',
      '单个文件对应一个游戏，导入目标为页面当前账号。无需账号ID、快照、稀有度、创建时间、来源或排序编号；系统自动补齐。',
      '每条记录必填event_id（小写UUID）、catalog_pool_id、agent_id、pull_span。不同真实记录分别生成UUID；修订或再次导入同一记录必须保留ID。不要按名字/日期/抽数去重。',
      'catalog_pool_id用公共目录ID，不加catalog:前缀。agent_id用当前游戏图鉴ID，管理员占位也可用所属池up_agents[].id；禁止编造。复刻同名池必须按日期确认。',
      'events数组按用户确认的先后顺序排列。pull_span为5星出货间隔，正整数或null（未知）；4星必须null。不要将累计序号、尾抽或角色数量当作间隔。',
      'up_status可省略，默认unknown；只有明确知道时才填up/non_up。自选池不能凭候选名单推断用户选择。acquired_date可选YYYY-MM-DD或null，note可选。',
      '只知一批总抽数时可附batches，每批batch_id使用稳定小写UUID，填写catalog_pool_id和total_pull_count；组内事件引用batch_id。组内间隔不重复累计，其和不得超过批次总数；每批须同池。',
      '普通导入仅追加记录，保留原基准、进度和当前池；尾抽、状态恢复使用完整备份流程，不要塞进记录或批次重复计数。',
      '文件最多5MiB、20000条记录和20000个批次、500个池。目录匹配不唯一或数据不明时先询问，不得猜测或静默丢弃。记录与批次不能同时为空。',
      '用户先查看导入预览，再确认当前账号、记录和总抽数。已有基准/尾抽/批次可能包含同一段历史；不要无条件确认重叠。相同ID不同内容会冲突，不会覆盖。',
    ],
    catalog_revision: catalog.catalog_revision, operator_catalog_version: operatorCatalog.catalog_version,
    pools, operators,
    example_notice: '示例只有目录身份真实，出货事实与ID为教学生成；不得把示例当作用户记录导入。',
    example_document: { schema: RECORD_IMPORT_SCHEMA, game, events: [{ event_id: crypto.randomUUID(), catalog_pool_id: pools[0].catalog_pool_id, agent_id: operators[0].id, pull_span: operators[0].rarity === 4 ? null : 37 }] },
    import_schema: schema,
  }
}
