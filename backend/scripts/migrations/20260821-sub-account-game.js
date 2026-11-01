// 统一子账号游戏版本迁移。
//
// 默认 DRY_RUN：打印缺失、非法、已合法三类数量，不写库。
// 确认后把 APPLY 改为 true；仅修复 sub_accounts.game 并刷新被修复行的 updatedAt。
// 重复执行安全：第一次 APPLY 后再次运行应显示待修复数量为 0。
const database = db.getSiblingDB("HubBackend");

const APPLY = false;
const accounts = database.sub_accounts;
const legalGames = ["代号鸢", "如鸢"];

const missingFilter = {
  $or: [
    { game: { $exists: false } },
    { game: null },
    { game: "" },
  ],
};
const invalidFilter = {
  $and: [
    { game: { $exists: true, $ne: null } },
    { game: { $ne: "" } },
    { game: { $nin: legalGames } },
  ],
};

const missing = accounts.countDocuments(missingFilter);
const invalid = accounts.countDocuments(invalidFilter);
const legal = accounts.countDocuments({ game: { $in: legalGames } });

print(`sub_accounts.game 缺失/空值: ${missing}`);
print(`sub_accounts.game 非法值: ${invalid}`);
print(`sub_accounts.game 已合法: ${legal}`);

if (!APPLY) {
  print(`DRY-RUN 完成:待修复 ${missing + invalid} 行，未写入任何数据。确认后将 APPLY 改为 true。`);
  quit(0);
}

const result = accounts.updateMany(
  { $or: [missingFilter, invalidFilter] },
  { $set: { game: "代号鸢", updatedAt: new Date() } },
);

print(`APPLY 完成:匹配 ${result.matchedCount} 行，修改 ${result.modifiedCount} 行。`);
print("仅更新 sub_accounts；未触碰库存、operator_current 或 operator_records。");
