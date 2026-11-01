// 将 status >= 2 的旧管理员迁移到 HubBackend 的显式角色绑定。
//
// 先填写 SUPER_ADMIN_USER_IDS（至少一名）和 PLATFORM_ADMIN_USER_IDS；默认 DRY-RUN。
// APPLY 前会校验目标用户存在且 status > 0，并输出旧管理员中尚未纳入迁移的账号。
const maaDatabase = db.getSiblingDB("MaaBackend");
const hubDatabase = db.getSiblingDB("HubBackend");

const APPLY = false;
const SUPER_ADMIN_USER_IDS = [];
const PLATFORM_ADMIN_USER_IDS = [];
const MIGRATION_ACTOR = "migration:20260830-admin-role-bindings";

const unique = (values) => [...new Set(values)];
const toMongoId = (id) => ObjectId.isValid(id) ? new ObjectId(id) : id;
const superAdminIds = unique(SUPER_ADMIN_USER_IDS);
const platformAdminIds = unique(PLATFORM_ADMIN_USER_IDS).filter((id) => !superAdminIds.includes(id));
const targetIds = [...superAdminIds, ...platformAdminIds];
const targetMongoIds = targetIds.map(toMongoId);
const legacyAdmins = maaDatabase.maa_user
  .find({ status: { $gte: 2 } }, { _id: 1, userName: 1, email: 1, status: 1 })
  .toArray();

print(`发现旧管理员 ${legacyAdmins.length} 名:`);
legacyAdmins.forEach((user) => printjson(user));

if (superAdminIds.length === 0) {
  throw new Error("SUPER_ADMIN_USER_IDS 至少需要一名已激活用户");
}

const targetUsers = maaDatabase.maa_user
  .find({ _id: { $in: targetMongoIds }, status: { $gt: 0 } }, { _id: 1, userName: 1, status: 1 })
  .toArray();
const foundIds = new Set(targetUsers.map((user) => user._id.toString()));
const invalidIds = targetIds.filter((id) => !foundIds.has(id));
if (invalidIds.length > 0) {
  throw new Error(`以下用户不存在或未激活: ${invalidIds.join(", ")}`);
}

const omittedLegacyIds = legacyAdmins
  .map((user) => user._id.toString())
  .filter((id) => !targetIds.includes(id));
print(`计划迁移 SUPER_ADMIN ${superAdminIds.length} 名，PLATFORM_ADMIN ${platformAdminIds.length} 名。`);
print(`未纳入迁移的旧管理员: ${omittedLegacyIds.length === 0 ? "无" : omittedLegacyIds.join(", ")}`);

if (!APPLY) {
  print("DRY-RUN 完成，未写入任何数据。核对名单后将 APPLY 改为 true。");
  quit(0);
}

const now = new Date();
const migrate = (userId, roles) => {
  const bindingId = toMongoId(userId);
  const before = hubDatabase.admin_role_bindings.findOne({ _id: bindingId });
  hubDatabase.admin_role_bindings.updateOne(
    { _id: bindingId },
    {
      $set: { roles, updatedBy: MIGRATION_ACTOR, updatedAt: now },
      $setOnInsert: { grantedBy: MIGRATION_ACTOR, grantedAt: now, version: NumberLong(0) },
    },
    { upsert: true },
  );
  hubDatabase.admin_audit_logs.insertOne({
    actorUserId: MIGRATION_ACTOR,
    action: before ? "ROLE_REPLACED" : "ROLE_GRANTED",
    targetUserId: userId,
    targetResource: `admin_role_bindings/${userId}`,
    before: { roles: before?.roles || [] },
    after: { roles },
    occurredAt: now,
    requestId: null,
  });
};

superAdminIds.forEach((id) => migrate(id, ["SUPER_ADMIN"]));
platformAdminIds.forEach((id) => migrate(id, ["PLATFORM_ADMIN"]));

const usableSuperAdmins = hubDatabase.admin_role_bindings.countDocuments({ roles: "SUPER_ADMIN" });
if (usableSuperAdmins < 1) {
  throw new Error("迁移后没有超级管理员，请立即检查数据库状态");
}
print(`APPLY 完成，当前显式超级管理员绑定 ${usableSuperAdmins} 名。`);
