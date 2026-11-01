"use strict";

// Standalone mongosh read-only audit. No repair imports, writes or index creation.
(async () => {
  const startedAt = new Date().toISOString();
  const required = ["recruitment_events", "recruitment_batches", "recruitment_archives", "sub_accounts"];
  const collections = await db.getCollectionNames();
  if (!required.every((name) => collections.includes(name))) throw new Error("缺少招募集合，请核对连接串中的 HubBackend 数据库名称");
  const scope = [{ $eq: ["$userId", "$$user"] }, { $eq: ["$accountId", "$$account"] }];
  const variables = { user: "$_id.userId", account: "$_id.accountId", batch: "$_id.batchId" };
  const cursor = await db.getCollection("recruitment_events").aggregate([
    { $match: { deletedAt: { $ne: null }, batchId: { $type: "string" }, deletedRevision: { $gt: 0 },
      batchCountDeducted: { $ne: true }, pullSpan: { $gt: 0 } } },
    { $group: { _id: { userId: "$userId", accountId: "$accountId", batchId: "$batchId" },
      deletedEventCount: { $sum: 1 }, candidateDeletedPulls: { $sum: "$pullSpan" },
      eventPoolIds: { $addToSet: "$poolId" }, lastDeletedRevision: { $max: "$deletedRevision" } } },
    { $lookup: { from: "recruitment_batches", let: variables, pipeline: [
      { $match: { deletedAt: null, $expr: { $and: [...scope, { $eq: ["$batchId", "$$batch"] }] } } },
      { $project: { _id: 0, poolId: 1, totalPullCount: 1 } },
    ], as: "batches" } },
    { $match: { "batches.0": { $exists: true } } },
    { $lookup: { from: "recruitment_events", let: variables, pipeline: [
      { $match: { deletedAt: null, $expr: { $and: [...scope, { $eq: ["$batchId", "$$batch"] }] } } },
      { $group: { _id: null, knownPulls: { $sum: { $ifNull: ["$pullSpan", 0] } }, poolIds: { $addToSet: "$poolId" } } },
    ], as: "live" } },
    { $lookup: { from: "recruitment_archives", let: variables, pipeline: [
      { $match: { $expr: { $and: scope } } }, { $limit: 2 },
      { $project: { _id: 0, archiveRevision: 1, gameSnapshot: 1, "pools.poolId": 1 } },
    ], as: "archives" } },
    { $lookup: { from: "sub_accounts", let: variables, pipeline: [
      { $match: { $expr: { $and: scope } } }, { $limit: 2 }, { $project: { _id: 0, game: 1 } },
    ], as: "accounts" } },
  ], { maxTimeMS: 60_000, allowDiskUse: false, batchSize: 100, readConcern: { level: "majority" } });
  const accounts = new Set();
  let candidateBatches = 0, candidateDeletedPulls = 0, reviewBatches = 0;
  while (await cursor.hasNext()) {
    const row = await cursor.next();
    const batch = row.batches[0];
    const archive = row.archives[0];
    const total = Number(batch.totalPullCount);
    const deduction = Number(row.candidateDeletedPulls);
    const live = Number(row.live[0]?.knownPulls ?? 0);
    const remaining = total - deduction;
    const reasons = [];
    if (row.batches.length !== 1) reasons.push("ambiguous_batch");
    if (row.archives.length !== 1 || row.accounts.length !== 1) reasons.push("missing_or_ambiguous_owner_archive");
    if (archive && row.accounts[0] && archive.gameSnapshot !== row.accounts[0].game) reasons.push("game_mismatch");
    if (archive && !(archive.pools ?? []).some((pool) => pool.poolId === batch.poolId)) reasons.push("pool_missing");
    if (row.eventPoolIds.some((id) => id !== batch.poolId) || (row.live[0]?.poolIds ?? []).some((id) => id !== batch.poolId)) reasons.push("pool_mismatch");
    if (![total, deduction, live, remaining].every(Number.isSafeInteger) || total < 0 || live < 0 || remaining < live) reasons.push("inconsistent_counts");
    if (archive && (!Number.isSafeInteger(Number(archive.archiveRevision)) || Number(row.lastDeletedRevision) > Number(archive.archiveRevision))) reasons.push("invalid_revision");
    accounts.add(JSON.stringify([row._id.userId, row._id.accountId]));
    if (reasons.length) reviewBatches++;
    else { candidateBatches++; candidateDeletedPulls += deduction; }
    print(JSON.stringify({ type: "batch", ...row._id, poolId: batch.poolId,
      archiveRevision: archive ? Number(archive.archiveRevision) : null,
      status: reasons.length ? "needs_review" : "candidate", reasons,
      batchTotal: total, deletedEventCount: Number(row.deletedEventCount),
      candidateDeletedPulls: deduction, estimatedRemaining: remaining, liveKnownPulls: live }));
  }
  print(JSON.stringify({ type: "summary", database: db.getName(), startedAt, finishedAt: new Date().toISOString(),
    readOnly: true, consistentSnapshot: false, suspectedAccounts: accounts.size,
    candidateBatches, candidateDeletedPulls, reviewBatches }));
})().catch((error) => { console.error("排查失败，结果不完整：", error.message); quit(1); });
