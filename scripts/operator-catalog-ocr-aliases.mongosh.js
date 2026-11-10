// 默认 dry-run；仅 APPLY=1 写入。只处理 HubBackend.operator_catalog，不修改用户养成数据。
// 用法：mongosh <连接参数> --file scripts/operator-catalog-ocr-aliases.mongosh.js
// 写入：APPLY=1 mongosh <连接参数> --file scripts/operator-catalog-ocr-aliases.mongosh.js
// APPLY 使用事务，要求 MongoDB replica set / sharded cluster；不支持事务时直接失败。
const additions = [
  ['char_042_wangcan', '技能消耗能量-1', ['技能消耗能量1']],
  ['char_051_pangtong', '防御时恢复生命', ['防御时回复生命']],
  ['char_039_guojie', '郭解不会再退场', ['郭解不再会退场']],
  ['char_089_zhangxiu', '孤阳偾', ['孤阳债']],
  ['char_069_zhangmiao', '风属性密探强化', ['风属性密探强0O化', '风属性密探强8化']],
  ['char_090_dongbai', '汔可休息', ['汽可休息']],
  ['char_080_mateng', '自彼氐羌', ['自彼氏羌']],
  ['char_072_zhugejin', '岂无鹡鸰', ['岂无鹡鸽']],
  ['char_099_pangxi', '临战', ['临战di']],
  ['char_101_lvbu', '马踏血泥', ['马蹋血泥']],
  ['char_121_menghuo', '骸兽仙飨', ['骇兽仙飨']],
  ['char_097_zhongyao', '馀弦更兴', ['徐弦更兴']],
  ['char_107_guonvwang', '两声对', ['两生对']],
  ['char_074_xunyou', '初始能量+3', ['初是能量+3', '初是+3']],
  ['char_084_chendengsp', '初始能量+3', ['初是+3']],
  ['char_096_xiahouyuan', '攻击力大幅提升', ['攻击力提升12%']],
  ['char_125_zhaoyun', '为汉爪士', ['为汉爪土']],
];

// 从指定 live_opcat.json 快照筛选出的准确 11 个 ID，禁止扩展到其他差异。
const maximumHpIds = [
  'char_080_mateng', 'char_081_linghumao', 'char_084_chendengsp',
  'char_085_shizimiaosp', 'char_086_kuaiyue', 'char_087_miheng',
  'char_088_liubao', 'char_089_zhangxiu', 'char_090_dongbai',
  'char_094_yufan', 'char_095_zhangyan',
];
const renames = [
  ['char_055_xiahoudun', '拔失啖睛', '拔矢啖睛'],
  ['char_058_machao', '防御使恢复生命', '防御时恢复生命'],
  ...maximumHpIds.map(id => [id, '最大生命值中幅提升', '最大生命中幅提升']),
];

// 原样取 MaaYuan agent/operators.json 的陈琳命盘顺序，只重排已有对象。
const chenlinOrder = [
  '入木三分', '飞翰绝迹', '攻击力中幅提升', '技能伤害小幅增加',
  '普攻伤害小幅增加', '檄文如箭', '防御时恢复生命', '最大生命小幅提升',
  '初始能量+1', '防御减伤提升', '最大生命中幅提升', '指桑骂槐',
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(`预检失败，未提交任何写入：${message}`);
}

function normalized(value) {
  return value.normalize('NFKC').replace(/\s/gu, '');
}

function appendAliases(disc, values) {
  const aliases = disc.aliases || [];
  const known = new Set(aliases.map(normalized));
  for (const value of values) {
    if (!known.has(normalized(value))) {
      aliases.push(value);
      known.add(normalized(value));
    }
  }
  disc.aliases = aliases;
}

function prepare(collection) {
  const original = collection.find({}).sort({ operatorId: 1 }).toArray();
  requireCondition(original.length > 0, '目录为空');
  const rows = EJSON.parse(EJSON.stringify(original));
  const byId = new Map(rows.map(row => [row.operatorId, row]));
  requireCondition(byId.size === rows.length, 'operatorId 重复');
  for (const row of rows) {
    requireCondition(Array.isArray(row.discs), `${row.operatorId} 缺少 discs 数组`);
    for (const disc of row.discs) {
      requireCondition(typeof disc.otName === 'string' && disc.otName.length > 0, `${row.operatorId} 存在无效 otName`);
      requireCondition(disc.aliases == null || (Array.isArray(disc.aliases) && disc.aliases.every(alias => typeof alias === 'string')),
        `${row.operatorId} / ${disc.otName} 的 aliases 无效`);
    }
  }
  function operator(id) {
    requireCondition(byId.has(id), `目标密探不存在：${id}`);
    return byId.get(id);
  }
  function uniqueDisc(id, names) {
    const matches = operator(id).discs.filter(disc => names.includes(disc.otName));
    requireCondition(matches.length === 1, `${id} 目标命盘不存在或不唯一：${names.join(' / ')}`);
    return matches[0];
  }

  for (const [id, oldName, newName] of renames) {
    const disc = uniqueDisc(id, [oldName, newName]);
    disc.otName = newName;
    appendAliases(disc, [oldName]);
  }
  for (const [id, name, aliases] of additions) appendAliases(uniqueDisc(id, [name]), aliases);

  const chenlin = operator('char_130_chenlin');
  requireCondition(chenlin.discs.length === chenlinOrder.length, '陈琳命盘数量与指定顺序不一致');
  chenlin.discs = chenlinOrder.map(name => uniqueDisc(chenlin.operatorId, [name]));

  const allDiscs = rows.flatMap(row => row.discs.map(disc => ({ id: row.operatorId, disc })));
  for (const row of rows) {
    const keys = row.discs.map(disc => normalized(disc.otName));
    requireCondition(new Set(keys).size === keys.length, `${row.operatorId} 改名后存在重复命盘`);
  }
  for (const { id, disc } of allDiscs) {
    const aliases = disc.aliases || [];
    requireCondition(aliases.length <= 20 && aliases.every(alias => alias.trim().length > 0 && alias.trim().length <= 64),
      `${id} / ${disc.otName} 的别名超出限制`);
    for (const alias of aliases) {
      const key = normalized(alias);
      const conflict = allDiscs.find(other =>
        (other.disc.otName !== disc.otName && normalized(other.disc.otName) === key) ||
        (other.id === id && other.disc !== disc &&
          (normalized(other.disc.otName) === key || (other.disc.aliases || []).some(value => normalized(value) === key))));
      if (conflict) requireCondition(false, `${id} / ${disc.otName} 别名「${alias}」冲突：${conflict.id} / ${conflict.disc.otName}`);
    }
  }
  return rows.flatMap((row, index) => EJSON.stringify(row.discs) === EJSON.stringify(original[index].discs)
    ? [] : [{ before: original[index], after: row }]);
}

function showPlan(changes, apply) {
  print(`${apply ? '已提交' : 'DRY-RUN：计划'}更新 ${changes.length} 位密探，集合 HubBackend.operator_catalog`);
  for (const { before, after } of changes) {
    print(EJSON.stringify({
      operatorId: after.operatorId,
      before: before.discs.map(({ otName, aliases }) => ({ otName, aliases })),
      after: after.discs.map(({ otName, aliases }) => ({ otName, aliases })),
    }));
  }
}

const apply = process.env.APPLY === '1';
if (!apply) {
  showPlan(prepare(db.getSiblingDB('HubBackend').operator_catalog), false);
} else {
  const session = db.getMongo().startSession();
  let committed = [];
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    const collection = session.getDatabase('HubBackend').getCollection('operator_catalog');
    const changes = prepare(collection);
    if (changes.length > 0) {
      const version = new Date().toISOString();
      const result = collection.bulkWrite(changes.map(({ before, after }) => ({ updateOne: {
        filter: { _id: before._id, discs: before.discs, catalogVersion: before.catalogVersion },
        update: { $set: { discs: after.discs, catalogVersion: version } },
      } })), { ordered: true });
      requireCondition(result.matchedCount === changes.length, '目录已被并发修改，事务回滚');
    }
    session.commitTransaction();
    committed = changes;
  } catch (error) {
    session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
  showPlan(committed, true);
}
