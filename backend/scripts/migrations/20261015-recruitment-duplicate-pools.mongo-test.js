"use strict";

const assert = require("node:assert/strict");
const migration = require("./20261015-recruitment-duplicate-pools.js");
const { fixture, toStored } = require("./20261015-recruitment-duplicate-pools.fixture.js");

// Invoked only by the JUnit bridge using a URI allocated and verified by TestMongo.
module.exports = async function run(database, bson, launcherSourcePath) {
  assert.match(database.getName(), /^yuanhub_test_/);
  const scan = async () => {
    const lines = [];
    await require("node:vm").runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,
      "20261015-recruitment-deleted-counts.scan.js"), "utf8"), {
      db: database, print: (line) => lines.push(JSON.parse(line)), console,
      quit: () => { throw new Error("scan failed"); },
    });
    return { batches: lines.filter((line) => line.type === "batch"), summary: lines.at(-1) };
  };
  for (const name of ["sub_accounts", "recruitment_archives", "recruitment_events", "recruitment_batches"]) {
    await database.createCollection(name);
  }
  const emptyScan = await scan();
  assert.equal(emptyScan.summary.suspectedAccounts, 0);
  assert.equal(emptyScan.summary.candidateBatches, 0);
  assert.equal(emptyScan.batches.length, 0);
  for (const name of await database.getCollectionNames()) assert.equal(await database.getCollection(name).countDocuments({}), 0);
  const source = fixture();
  const raw = toStored(source);
  raw.archive.archiveRevision = bson.Long.fromNumber(28);
  raw.archive.baseline = bson.Long.fromNumber(0);
  raw.archive.nextEventOrder = bson.Long.fromNumber(86);
  raw.events.forEach((e) => { e.pullSpan = bson.Long.fromNumber(e.pullSpan); e.sortOrder = bson.Long.fromNumber(e.sortOrder); });
  const owner = { userId: raw.archive.userId, accountId: raw.archive.accountId };
  await database.getCollection("sub_accounts").insertOne(raw.account);
  await database.getCollection("recruitment_archives").insertOne(raw.archive);
  await database.getCollection("recruitment_events").insertMany(raw.events);
  await database.getCollection("recruitment_batches").insertMany(raw.batches);
  const foreignSource = fixture();
  foreignSource.source_account.account_id = "acc_other_synthetic";
  const foreign = toStored(foreignSource, "other_owner");
  await database.getCollection("sub_accounts").insertOne(foreign.account);
  await database.getCollection("recruitment_archives").insertOne(foreign.archive);
  await database.getCollection("recruitment_events").insertMany(foreign.events);
  await database.getCollection("recruitment_batches").insertMany(foreign.batches);
  const orphan = { ...raw.events[0], _id: "orphan_event", userId: "orphan_owner" };
  await database.getCollection("recruitment_events").insertOne(orphan);
  await database.getCollection("recruitment_requests").insertOne({ _id: "old_request", ...owner, archiveRevision: 28 });
  const image = async () => {
    const result = {};
    for (const name of ["sub_accounts", "recruitment_archives", "recruitment_events", "recruitment_batches", "recruitment_requests", migration.AUDIT]) {
      result[name] = await (await database.getCollection(name).find()).sort({ _id: 1 }).toArray();
    }
    return bson.EJSON.stringify(result, { relaxed: false });
  };
  const original = await image();
  const initialScan = await scan();
  assert.equal(initialScan.summary.suspectedAccounts, 2);
  assert.equal(initialScan.summary.candidateDeletedPulls, 254);
  assert.equal(initialScan.summary.reviewBatches, 0);
  assert.equal(initialScan.summary.readOnly, true);
  assert(initialScan.batches.every((row) => row.status === "candidate" && row.userId !== "orphan_owner"));
  assert.equal(await image(), original, "fleet scan wrote data");
  const suspect = initialScan.batches.find((row) => row.userId === owner.userId);
  const batchScope = { ...owner, batchId: suspect.batchId };
  const suspectBatch = await database.getCollection("recruitment_batches").findOne(batchScope);
  await database.getCollection("recruitment_batches").updateOne(batchScope, { $set: { totalPullCount: 0 } });
  const inconsistentImage = await image();
  const inconsistentScan = await scan();
  assert.equal(inconsistentScan.summary.reviewBatches, 1);
  assert(inconsistentScan.batches.some((row) => row.status === "needs_review" && row.reasons.includes("inconsistent_counts")));
  assert.equal(await image(), inconsistentImage, "inconsistent fleet scan wrote data");
  await database.getCollection("recruitment_batches").updateOne(batchScope, { $set: { totalPullCount: suspectBatch.totalPullCount, deletedAt: new Date(), deletedRevision: 27 } });
  const deletedBatchImage = await image();
  assert.equal((await scan()).summary.candidateDeletedPulls, 254 - suspect.candidateDeletedPulls);
  assert.equal(await image(), deletedBatchImage, "deleted batch fleet scan wrote data");
  await database.getCollection("recruitment_batches").replaceOne(batchScope, suspectBatch);
  assert.equal(await image(), original);
  const dry = await migration.repair(database, source);
  assert.equal(dry.status, "dry_run");
  assert.equal(dry.after.total, 2340);
  assert.equal(await image(), original, "dry run wrote data");

  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: 30 } });
  await assert.rejects(migration.repair(database, source, { apply: true }));
  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: bson.Long.fromNumber(28) } });
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: "manual_0_0" }, { $set: { note: "later edit" } });
  await assert.rejects(migration.repair(database, source, { apply: true }));
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: "manual_0_0" }, { $set: { note: null } });
  await database.getCollection("sub_accounts").updateOne(owner, { $set: { game: "代号鸢" } });
  await assert.rejects(migration.repair(database, source, { apply: true }));
  await database.getCollection("sub_accounts").updateOne(owner, { $set: { game: source.game } });
  const ambiguous = { ...raw.archive, _id: "ambiguous_owner", userId: "ambiguous_owner" };
  await database.getCollection("recruitment_archives").insertOne(ambiguous);
  await assert.rejects(migration.repair(database, source, { apply: true }));
  await database.getCollection("recruitment_archives").deleteOne({ _id: ambiguous._id });
  assert.equal(await image(), original, "refused repair wrote data");

  // Force the last archive write to fail after history/audit writes, proving transaction abort.
  await database.runCommand({ collMod: "recruitment_archives", validator: { archiveRevision: { $ne: 29 } }, validationLevel: "strict" });
  await assert.rejects(migration.repair(database, source, { apply: true }));
  assert.equal(await image(), original, "failed repair was not atomic");
  await database.runCommand({ collMod: "recruitment_archives", validator: {}, validationLevel: "strict" });

  const concurrent = await Promise.allSettled([
    migration.repair(database, source, { apply: true }), migration.repair(database, source, { apply: true }),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled" && r.value.status === "applied").length, 1);
  assert(concurrent.every((r) => r.status === "rejected" || ["applied", "already_applied"].includes(r.value.status)));
  const repeat = await migration.repair(database, source, { apply: true });
  assert.equal(repeat.status, "already_applied");
  const current = {
    archive: await database.getCollection("recruitment_archives").findOne(owner),
    events: await (await database.getCollection("recruitment_events").find(owner)).toArray(),
    batches: await (await database.getCollection("recruitment_batches").find(owner)).toArray(),
  };
  const audit = await database.getCollection(migration.AUDIT).findOne({ _id: repeat.repairId });
  const expected = migration.transform(source, audit.appliedAt);
  migration.assertMatches(expected.after, current);
  assert.equal(current.archive.nextEventOrder.toString(), "86");
  assert.equal((await database.getCollection("sub_accounts").findOne(owner)).recruitmentFence, 1);
  assert.equal(await database.getCollection(migration.AUDIT).countDocuments({}), 1);
  const appliedImage = await image();
  await migration.repair(database, source, { apply: true });
  assert.equal(await image(), appliedImage, "repeat apply wrote data");
  for (const [name, rows] of [["recruitment_archives", [foreign.archive]], ["recruitment_events", foreign.events], ["recruitment_batches", foreign.batches]]) {
    assert.equal(bson.EJSON.stringify(await (await database.getCollection(name).find({ userId: "other_owner" })).sort({ _id: 1 }).toArray()),
      bson.EJSON.stringify([...rows].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0)));
  }
  assert.equal(await database.getCollection("recruitment_requests").countDocuments({ _id: "old_request", archiveRevision: 28 }), 1);
  assert.equal(bson.EJSON.stringify(await database.getCollection("recruitment_events").findOne({ _id: orphan._id }), { relaxed: false }),
    bson.EJSON.stringify(orphan, { relaxed: false }));

  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: 30 } });
  const stale = await image();
  await assert.rejects(migration.rollback(database, repeat.repairId));
  assert.equal(await image(), stale, "stale rollback wrote data");
  await database.getCollection("recruitment_archives").updateOne(owner, { $set: { archiveRevision: 29 } });
  const rolledBack = await migration.rollback(database, repeat.repairId);
  assert.equal(rolledBack.archiveRevision, 30);
  const restored = await database.getCollection("recruitment_archives").findOne(owner);
  assert.equal(restored.pools.length, 26);
  for (const [name, rows] of [["recruitment_events", raw.events], ["recruitment_batches", raw.batches]]) {
    assert.equal(bson.EJSON.stringify(await (await database.getCollection(name).find(owner)).sort({ _id: 1 }).toArray(), { relaxed: false }),
      bson.EJSON.stringify([...rows].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0), { relaxed: false }));
  }
  assert.equal((await database.getCollection("sub_accounts").findOne(owner)).recruitmentFence, 2);
  const rollbackImage = await image();
  assert.equal((await migration.rollback(database, repeat.repairId)).status, "already_rolled_back");
  assert.equal(await image(), rollbackImage);
  await assert.rejects(migration.repair(database, source, { apply: true }));
  assert.equal(await image(), rollbackImage);
  const missed = await migration.reconcileDeletions(database, owner.accountId);
  assert.equal(missed.deduction, 127);
  assert.equal(await image(), rollbackImage, "reconciliation dry run wrote data");
  const excluded = raw.events.filter((event) => event.deletedAt != null && event.batchId != null).slice(0, 2);
  assert.equal(excluded.length, 2);
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: excluded[0].eventId }, { $set: { deletedRevision: 0 } });
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: excluded[1].eventId }, { $set: { batchCountDeducted: true } });
  const excludedImage = await image();
  assert.equal((await scan()).summary.candidateDeletedPulls,
    254 - Number(excluded[0].pullSpan) - Number(excluded[1].pullSpan));
  assert.equal(await image(), excludedImage, "fleet scan changed excluded history");
  assert.equal((await migration.reconcileDeletions(database, owner.accountId)).deduction,
    127 - Number(excluded[0].pullSpan) - Number(excluded[1].pullSpan));
  assert.equal(await image(), excludedImage, "excluded tombstone preview wrote data");
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: excluded[0].eventId }, { $set: { deletedRevision: excluded[0].deletedRevision } });
  await database.getCollection("recruitment_events").updateOne({ ...owner, eventId: excluded[1].eventId }, { $unset: { batchCountDeducted: "" } });
  assert.equal(await image(), rollbackImage);
  await assert.rejects(migration.reconcileDeletions(database, owner.accountId, { apply: true, expectedRevision: 29 }));
  await database.runCommand({ collMod: "recruitment_archives", validator: { archiveRevision: { $ne: 31 } }, validationLevel: "strict" });
  await assert.rejects(migration.reconcileDeletions(database, owner.accountId, { apply: true, expectedRevision: 30 }));
  assert.equal(await image(), rollbackImage, "failed count reconciliation was not atomic");
  await database.runCommand({ collMod: "recruitment_archives", validator: {}, validationLevel: "strict" });
  const reconciled = await migration.reconcileDeletions(database, owner.accountId, { apply: true, expectedRevision: 30 });
  assert.equal(reconciled.knownTotalBefore, 2673);
  assert.equal(reconciled.knownTotalAfter, 2546);
  assert.equal((await migration.reconcileDeletions(database, owner.accountId)).status, "no_changes");
  const reconciledImage = await image();
  assert.equal((await scan()).summary.candidateDeletedPulls, 127);
  assert.equal(await image(), reconciledImage, "post-repair fleet scan wrote data");
  assert.equal((await migration.reconcileDeletions(database, owner.accountId, { apply: true, expectedRevision: 30 })).status, "already_applied");
  assert.equal(await image(), reconciledImage);
  assert.equal((await migration.rollback(database, reconciled.repairId)).archiveRevision, 32);
  for (const [name, rows] of [["recruitment_events", raw.events], ["recruitment_batches", raw.batches]]) {
    assert.equal(bson.EJSON.stringify(await (await database.getCollection(name).find(owner)).sort({ _id: 1 }).toArray(), { relaxed: false }),
      bson.EJSON.stringify([...rows].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0), { relaxed: false }));
  }
  const launcherSource = fixture();
  launcherSource.source_account.account_id = "acc_launcher_synthetic";
  const launcherRaw = toStored(launcherSource);
  await database.getCollection("sub_accounts").insertOne(launcherRaw.account);
  await database.getCollection("recruitment_archives").insertOne(launcherRaw.archive);
  await database.getCollection("recruitment_events").insertMany(launcherRaw.events);
  await database.getCollection("recruitment_batches").insertMany(launcherRaw.batches);
  require("node:fs").writeFileSync(launcherSourcePath, JSON.stringify(launcherSource), { mode: 0o600 });
  return "RECRUITMENT_REPAIR_MONGO_OK: dry-run, refusal, abort, concurrency, isolation, repeat, rollback";
};
