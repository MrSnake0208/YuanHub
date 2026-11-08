// 养成规划默认清单补存：取消系统自动补出的「特别关注」前，保留老账号的清单入口。
// 仅处理没有工作区、但有 favorites 日程（含空日程）或养成目标的子账号。
// 已保存的工作区不变；仅有标星记录的账号不补存。默认 DRY-RUN，确认统计后再将 APPLY 改为 true。
// 应在取消默认清单的后端版本上线前执行，避免老账号暂时失去日程入口。
//
// 用法（从 backend/ 执行）：
//   mongosh 'mongodb://<host>:27017/HubBackend' --quiet \
//     scripts/migrations/20261108-planner-default-favorites-backfill.js
const database = db.getSiblingDB("HubBackend");
const APPLY = false;

const existing = new Set();
const candidates = new Map();
const key = (document) => JSON.stringify([document.userId, document.accountId]);
database.operator_training_workspace.find({}, { _id: 0, userId: 1, accountId: 1 }).forEach((document) => {
  existing.add(key(document));
});
const collect = (document, source) => {
  const accountKey = key(document);
  if (existing.has(accountKey)) return;
  const candidate = candidates.get(accountKey) || { userId: document.userId, accountId: document.accountId };
  candidate[source] = true;
  candidates.set(accountKey, candidate);
};
database.operator_stamina_schedule.find({ planId: "favorites" }, { _id: 0, userId: 1, accountId: 1 }).forEach((document) => collect(document, "schedule"));
database.operator_growth_target.find({}, { _id: 0, userId: 1, accountId: 1 }).forEach((document) => collect(document, "target"));

const payloadJson = JSON.stringify({
  schema_version: 1,
  active_plan_id: "favorites",
  training_levels: { fh: 12, ds: 12, yy: 12, experience: 8 },
  plans: [{ id: "favorites", name: "特别关注", source: "favorites", operator_ids: [], excluded_operator_ids: [], targets: {} }],
});
let scheduleOnly = 0;
let targetOnly = 0;
let both = 0;
let inserted = 0;
for (const candidate of candidates.values()) {
  if (candidate.schedule && candidate.target) both++;
  else if (candidate.schedule) scheduleOnly++;
  else targetOnly++;
  if (!APPLY) continue;
  const { userId, accountId } = candidate;
  const result = database.operator_training_workspace.updateOne(
    { _id: `${userId}:${accountId}` },
    { $setOnInsert: { userId, accountId, revision: 1, updatedAt: new Date(), payloadJson } },
    { upsert: true },
  );
  inserted += result.upsertedCount;
}
print(`${APPLY ? "APPLY" : "DRY-RUN"}：总目标数 ${candidates.size}，仅日程 ${scheduleOnly}，仅目标 ${targetOnly}，两者都有 ${both}，实际写入数 ${inserted}`);
