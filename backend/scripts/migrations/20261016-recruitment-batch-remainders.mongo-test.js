"use strict";

const assert = require("node:assert/strict");
const migration = require("./20261015-recruitment-duplicate-pools.js");
const { fixture, toStored } = require("./20261015-recruitment-duplicate-pools.fixture.js");

module.exports = async function run(database, bson, planPath) {
  assert.match(database.getName(), /^yuanhub_test_/);
  const source = fixture();
  const raw = toStored(source);
  raw.archive.archiveRevision = bson.Long.fromNumber(46);
  const owner = { userId: raw.archive.userId, accountId: raw.archive.accountId };
  const gaps = [6, 3, 4, 9, 6, 5, 5, 3, 8];
  const targets = raw.batches.filter((batch) => batch.batchId.startsWith("batch_other_")).slice(0, 9);
  for (let index = 0; index < targets.length; index++) {
    const batch = targets[index];
    batch.totalPullCount = bson.Long.fromNumber(raw.events.filter((event) => event.batchId === batch.batchId).reduce((n, event) => n + event.pullSpan, 0) + gaps[index]);
  }
  // Mirror cleared and partly re-entered records without changing the original imported excess.
  for (const index of [1, 5, 8]) {
    const batch = targets[index];
    const events = raw.events.filter((event) => event.batchId === batch.batchId);
    for (const event of events) Object.assign(event, { deletedAt: new Date(), deletedRevision: 45, batchCountDeducted: true });
    batch.totalPullCount = bson.Long.fromNumber(gaps[index]);
  }
  raw.events.push({ ...raw.events[0], _id: "later_independent", eventId: "later_independent", poolId: targets[5].poolId, pullSpan: 5, batchId: null });
  const plan = { accountId: owner.accountId, game: source.game, corrections: targets.map((batch, index) => ({
    batchId: batch.batchId, poolId: batch.poolId, importBatchId: batch.importBatchId, deduction: gaps[index], name: `合成批次${index}`,
  })) };
  await database.getCollection("sub_accounts").insertOne(raw.account);
  await database.getCollection("recruitment_archives").insertOne(raw.archive);
  await database.getCollection("recruitment_events").insertMany(raw.events);
  await database.getCollection("recruitment_batches").insertMany(raw.batches);
  const other = toStored(source, "other_owner");
  await database.getCollection("sub_accounts").insertOne(other.account);
  await database.getCollection("recruitment_archives").insertOne(other.archive);
  await database.getCollection("recruitment_events").insertMany(other.events);
  await database.getCollection("recruitment_batches").insertMany(other.batches);
  await database.getCollection("recruitment_requests").insertOne({ _id: "retained_request", ...owner });
  const image = async () => {
    const result = {};
    for (const name of ["sub_accounts", "recruitment_archives", "recruitment_events", "recruitment_batches", "recruitment_requests", migration.AUDIT]) {
      result[name] = await (await database.getCollection(name).find()).sort({ _id: 1 }).toArray();
    }
    return bson.EJSON.stringify(result, { relaxed: false });
  };
  const original = await image();
  await assert.rejects(migration.reconcileRemainders(database, plan)); // Same account ID on two owners is ambiguous.
  assert.equal(await image(), original);
  for (const name of ["sub_accounts", "recruitment_archives", "recruitment_events", "recruitment_batches"]) {
    await database.getCollection(name).updateMany({ userId: "other_owner" }, { $set: { accountId: "acc_other_remainder" } });
  }
  const ready = await image();
  const dry = await migration.reconcileRemainders(database, plan);
  assert.equal(dry.deduction, 49);
  assert.equal(dry.knownTotalBefore - dry.knownTotalAfter, 49);
  assert.equal(dry.corrections[5].remaining, 0);
  assert.equal(dry.corrections[5].poolKnownAfter, 5, "independent later record was counted twice or lost");
  assert.equal(dry.corrections[1].poolKnownAfter, 0);
  assert.equal(await image(), ready, "remainder dry run wrote data");
  await assert.rejects(migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 45 }));
  const event = raw.events.find((event) => event.batchId === targets[0].batchId);
  for (const patch of [{ pullSpan: null }, { pullSpan: event.pullSpan + 1 }, { deletedAt: new Date(), deletedRevision: 45, batchCountDeducted: false }]) {
    await database.getCollection("recruitment_events").updateOne({ _id: event._id }, { $set: patch });
    const changed = await image();
    await assert.rejects(migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 46 }));
    assert.equal(await image(), changed);
    await database.getCollection("recruitment_events").replaceOne({ _id: event._id }, event);
  }
  await database.runCommand({ collMod: "recruitment_archives", validator: { archiveRevision: { $ne: 47 } }, validationLevel: "strict" });
  await assert.rejects(migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 46 }));
  assert.equal(await image(), ready, "failed remainder repair was not atomic");
  await database.runCommand({ collMod: "recruitment_archives", validator: {}, validationLevel: "strict" });
  const applied = await migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 46 });
  assert.equal(applied.afterRevision, 47);
  assert.equal((await migration.reconcileRemainders(database, plan)).status, "no_changes");
  const audit = await database.getCollection(migration.AUDIT).findOne({ _id: applied.repairId });
  const currentArchive = await database.getCollection("recruitment_archives").findOne(owner);
  assert.equal(bson.EJSON.stringify(currentArchive.pools, { relaxed: false }), bson.EJSON.stringify(audit.before.archive.pools, { relaxed: false }));
  assert.equal(currentArchive.baseline, audit.before.archive.baseline);
  const currentBatches = await (await database.getCollection("recruitment_batches").find(owner)).toArray();
  for (const batch of audit.before.batches) {
    const correction = plan.corrections.find((item) => item.batchId === batch.batchId);
    const current = currentBatches.find((item) => item.batchId === batch.batchId);
    assert.equal(Number(current.totalPullCount), Number(batch.totalPullCount) - (correction?.deduction ?? 0));
  }
  for (const [name, rows] of [["recruitment_events", audit.before.events], ["recruitment_batches", other.batches]]) {
    const scope = name === "recruitment_events" ? owner : { userId: "other_owner" };
    const expected = name === "recruitment_events" ? rows : rows.map((row) => ({ ...row, accountId: "acc_other_remainder" }));
    assert.equal(bson.EJSON.stringify(await (await database.getCollection(name).find(scope)).sort({ _id: 1 }).toArray(), { relaxed: false }),
      bson.EJSON.stringify([...expected].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0), { relaxed: false }));
  }
  assert.equal(await database.getCollection("recruitment_requests").countDocuments({ _id: "retained_request" }), 1);
  const appliedImage = await image();
  assert.equal((await migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 46 })).status, "already_applied");
  assert.equal(await image(), appliedImage);
  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: 48 } });
  const stale = await image();
  await assert.rejects(migration.rollback(database, applied.repairId));
  assert.equal(await image(), stale);
  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: 47 } });
  assert.equal((await migration.rollback(database, applied.repairId)).archiveRevision, 48);
  await assert.rejects(migration.reconcileRemainders(database, plan, { apply: true, expectedRevision: 46 }));
  const restored = await (await database.getCollection("recruitment_batches").find(owner)).sort({ _id: 1 }).toArray();
  assert.equal(bson.EJSON.stringify(restored, { relaxed: false }), bson.EJSON.stringify([...raw.batches].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0), { relaxed: false }));
  require("node:fs").writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600 });
  return "RECRUITMENT_REMAINDER_MONGO_OK";
};
