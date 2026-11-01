// 统一子账号迁移:把 inventory_accounts 与 operator_accounts 合并为 sub_accounts(库存 × 密探共用)。
//
// 覆盖范围:仅账号表合并 + 索引。业务数据集合(inventory_current / inventory_records /
// inventory_agent_favorites / operator_current / operator_records)已按 (userId, accountId)
// 分键,accountId 原样保留,无需改写。open_api_token 不重写:自统一起 token 的域完全由 scope
// 决定,kind 字段保留但不再参与判定。
//
// 同名冲突(同一用户在两域各建了同名账号、accountId 不同且各有数据):两行都保留,后到者
// 改名 "name（密探）"(冲突则追加序号),保证 (userId,name) 唯一;其业务数据仍按各自 accountId
// 关联,不受影响。
//
// 用法:
//   1. 先运行一次(默认 DRY_RUN):会打印统计、改名清单与校验,不写库;
//   2. 确认无误后把下方 APPLY 改为 true 再运行一次落地。
const database = db.getSiblingDB("HubBackend");
const client = database.getMongo();

const APPLY = false; // true = 真正写入;false = dry-run 预览

function warn(msg) {
  print("[警告] " + msg);
}

// ---------- 1. 合并两域账号 ----------
const rows = new Map(); // key `${userId}|${accountId}`
function collect(collection, source) {
  collection.find().forEach((a) => {
    const key = a.userId + "|" + a.accountId;
    if (rows.has(key)) {
      warn(`accountId 碰撞:${key} 同时存在于 ${rows.get(key).source} 与 ${source},保留前者、忽略后者`);
      return;
    }
    rows.set(key, {
      userId: a.userId,
      accountId: a.accountId,
      name: a.name,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      source: source,
    });
  });
}
collect(database.inventory_accounts, "inventory_accounts");
collect(database.operator_accounts, "operator_accounts");

const inventoryCount = database.inventory_accounts.countDocuments();
const operatorCount = database.operator_accounts.countDocuments();
print(`账号合并:库存 ${inventoryCount} + 密探 ${operatorCount} -> 唯一子账号 ${rows.size}`);

// ---------- 2. 同名冲突处理(保证 (userId, name) 唯一) ----------
const usedName = new Map(); // key `${userId}|${name}` -> accountId
const renames = [];
function uniqueName(userId, base) {
  let candidate = base + "（密探）";
  for (let i = 2; usedName.has(userId + "|" + candidate); i++) {
    candidate = base + "（密探" + i + "）";
  }
  return candidate;
}
for (const row of rows.values()) {
  const nameKey = row.userId + "|" + row.name;
  if (usedName.has(nameKey)) {
    const before = row.name;
    row.name = uniqueName(row.userId, row.name);
    renames.push({ userId: row.userId, accountId: row.accountId, from: before, to: row.name, source: row.source });
    print(`改名:${row.userId} 的 ${row.source} 账号 ${row.accountId} "${before}" -> "${row.name}"`);
  }
  usedName.set(row.userId + "|" + row.name, row.accountId);
}
print(`同名冲突改名 ${renames.length} 个`);

// ---------- 3. 业务数据引用校验(账号 id 全部仍有效) ----------
const allAccountKeys = new Set([...rows.keys()]);
function checkRefs(name) {
  let missing = 0;
  database[name].aggregate([
    { $group: { _id: { userId: "$userId", accountId: "$accountId" } } },
  ]).forEach((group) => {
    if (!allAccountKeys.has(group._id.userId + "|" + group._id.accountId)) {
      missing++;
      warn(`${name} 引用了不存在的子账号 ${group._id.userId}|${group._id.accountId}`);
    }
  });
  return missing;
}
const refMissing = [
  "inventory_current",
  "inventory_records",
  "inventory_agent_favorites",
  "operator_current",
  "operator_records",
].reduce((sum, col) => sum + checkRefs(col), 0);
print(`业务数据引用校验:缺失引用 ${refMissing} 处(应为 0)`);

// ---------- 4. 落地写入 ----------
if (!APPLY) {
  print("DRY-RUN 完成:未写入任何数据。确认后将 APPLY 改为 true 再运行一次落地。");
  quit(0);
}

const session = client.startSession();
try {
  session.withTransaction(() => {
    const sessionDb = session.getDatabase("HubBackend");
    const target = sessionDb.sub_accounts;
    target.deleteMany({});
    rows.forEach((row) => {
      target.insertOne({
        userId: row.userId,
        accountId: row.accountId,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });
  });
} finally {
  session.endSession();
}

function dropIndexIfPresent(collection, name) {
  if (collection.getIndexes().some((index) => index.name === name)) {
    collection.dropIndex(name);
  }
}
dropIndexIfPresent(database.sub_accounts, "idx_sub_user_account_unique");
dropIndexIfPresent(database.sub_accounts, "idx_sub_user_account_name_unique");
database.sub_accounts.createIndex(
  { userId: 1, accountId: 1 },
  { name: "idx_sub_user_account_unique", unique: true },
);
database.sub_accounts.createIndex(
  { userId: 1, name: 1 },
  { name: "idx_sub_user_account_name_unique", unique: true },
);

print("sub_accounts 已写入子账号 " + database.sub_accounts.countDocuments() + " 个并建好双唯一索引。");
print("提示:确认无误后,可 drop 旧集合 inventory_accounts / operator_accounts(建议观察一轮后再删)。");
