// 清理指向不存在子账号的孤儿 API Token(HubBackend.open_api_token)。
//
// 背景:open_api_token 历经「v2 库存账号」「统一子账号」两次迁移。期间可能存在
// (userId, accountId) 在 sub_accounts 中找不到对应行的 token(旧版按 kind 撤销的
// 遗漏、20260819 迁移未校验 token 引用、历史 accountId 缺字段等)。这类行会让
// GET /user/open-api/tokens 在 OpenApiTokenService.list() 抛
// "Token references a missing account" 直接 500。
//
// 本脚本:
//   1) 孤儿判定 = accountId 缺失/为空,或 (userId, accountId) 无对应 sub_accounts 行;
//   2) 只删孤儿行,不改任何正常数据,事务内落地;
//   3) 打印受影响 token 及回收其 Redis 热缓存所需的 redis-cli 命令
//      (键前缀 open-api-token:<token>,否则 validate() 仍可能放行已删除 token)。
//
// 用法:
//   1. 先跑一次(默认 DRY_RUN):打印统计与影响清单,不写库;
//   2. 确认无误后把下方 APPLY 改为 true 再跑一次落地;
//   3. 落地后在应用所在机器执行脚本打印的 redis-cli DEL 命令清缓存。
const database = db.getSiblingDB("HubBackend");

const APPLY = false; // true = 真正删除;false = dry-run 预览

function warn(msg) {
  print("[警告] " + msg);
}

// 有效子账号键集合:"userId|accountId"
const valid = new Set();
database.sub_accounts.find({}, { userId: 1, accountId: 1 }).forEach((a) => {
  valid.add(a.userId + "|" + a.accountId);
});

// 孤儿判定:accountId 缺失/为空,或 (userId, accountId) 在 sub_accounts 中不存在
const orphans = [];
database.open_api_token.find().forEach((t) => {
  const key = t.userId + "|" + t.accountId;
  if (!t.accountId || !valid.has(key)) {
    orphans.push(t);
  }
});
orphans.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));

print(`校验:sub_accounts 共 ${valid.size} 个,open_api_token 共 ` +
  `${database.open_api_token.countDocuments()} 个,孤儿 token ${orphans.length} 个`);
const affectedUsers = new Set(orphans.map((t) => t.userId));
print(`统计:受影响用户 ${affectedUsers.size} 个`);
for (const t of orphans) {
  print(`  孤儿 tokenId=${t._id} userId=${t.userId} accountId=${t.accountId} token=${t.token} createTime=${t.createTime}`);
}

// 打印清 Redis 热缓存的命令(键 = open-api-token:<token>)
const redisKeys = orphans.map((t) => "open-api-token:" + t.token);
if (redisKeys.length > 0) {
  print("清 Redis 缓存(在应用所在机器执行;若部署配置了非 0 的 redis 库,加 -n <db>):");
  print("  redis-cli DEL " + redisKeys.join(" "));
} else {
  print("无需清理 Redis 缓存。");
}

if (!APPLY) {
  print("DRY-RUN 完成:未删除任何数据。确认后将 APPLY 改为 true 再运行一次落地。");
  quit(0);
}

const client = database.getMongo();
const session = client.startSession();
try {
  session.withTransaction(() => {
    const sessionDb = session.getDatabase("HubBackend");
    for (const t of orphans) {
      sessionDb.open_api_token.deleteOne({ _id: t._id });
    }
  });
} finally {
  session.endSession();
}
print("已删除孤儿 token " + orphans.length + " 个。请务必在应用机器执行上方 redis-cli DEL 清缓存。");
