"use strict";

// Synthetic counterpart of the approved counting shape; no real account/history identifiers.
function fixture() {
  const source = {
    schema: "yuanhub.recruitment.v1", exported_at: "2026-10-15T00:00:00Z",
    source_account: { account_id: "acc_synthetic_repair" }, game: "如鸢", archive_revision: 28,
    baseline: 0, current_pool_id: null, pools: [], temporary_agents: [], events: [], batches: [],
  };
  const now = "2026-10-12T00:00:00.000Z";
  const deleted = "2026-10-13T00:00:00.000Z";
  const shapes = [
    { spans: [37, 37], progress: 0, total: 74 },
    { spans: [33, 37], progress: 0, total: 70, importedDeleted: true },
    { spans: [39], progress: 1, total: 40 },
    { spans: [39, 36], progress: 5, total: 80 },
    { spans: [20, 37], progress: 0, total: 60, importedDeleted: true, manualDeleted: true },
    { spans: [31, 38], progress: 0, total: 69, extraDeleted: true },
  ];
  const snapshot = (id) => ({
    name: `池${id}`, game: source.game, catalog_pool_id: id,
    up_agents: [1, 2].map((n) => ({ id: `${id}:up:${n}`, name: `密探${n}`, operator_id: `op_${id}_${n}`, active: true })),
  });
  const event = (id, pool, span, n, isDeleted, imported, batchId = null) => ({
    event_id: id, pool_id: pool.pool_id, pool_snapshot: pool.snapshot,
    agent_snapshot: { agent_id: imported ? pool.snapshot.up_agents[n].operator_id : pool.snapshot.up_agents[n].id,
      name: pool.snapshot.up_agents[n].name, temporary: false, rarity: 5 },
    pull_span: span, sort_order: source.events.length + 1, up_status: "up", acquired_date: null,
    note: imported ? "保留的导入备注" : null, source: "manual", batch_id: batchId,
    created_at: now, updated_at: isDeleted ? deleted : now, deleted_at: isDeleted ? deleted : null,
    deleted_revision: isDeleted ? 27 : null, import_batch_id: imported ? "import_synthetic" : null,
    imported_at: imported ? now : null,
  });
  const addBatch = (pool, total) => {
    const batch = { batch_id: `batch_${pool.pool_id}`, pool_id: pool.pool_id, total_pull_count: total,
      created_at: now, deleted_at: null, deleted_revision: null, import_batch_id: "import_synthetic", imported_at: now };
    source.batches.push(batch);
    return batch;
  };
  shapes.forEach((shape, index) => {
    const id = `xlsx_synthetic_${index}`;
    const canonical = { pool_id: `catalog:${id}`, snapshot: snapshot(id), progress: shape.progress, mapped_snapshot: null, wish_agent_ids: [] };
    const alias = { ...canonical, pool_id: id, progress: index === 5 ? 0 : null };
    source.pools.push(canonical, alias);
    const batch = addBatch(alias, shape.total);
    shape.spans.forEach((span, n) => {
      source.events.push(event(`manual_${index}_${n}`, canonical, span, n, !!shape.manualDeleted, false));
      source.events.push(event(`import_${index}_${n}`, alias, span, n, !!shape.importedDeleted, true, batch.batch_id));
      if (shape.extraDeleted) source.events.push(event(`old_${index}_${n}`, canonical, span, n, true, false));
    });
    if (shape.manualDeleted) source.events.push(event("older_deleted", canonical, 37, 0, true, false));
  });
  for (let index = 0; index < 14; index += 1) {
    const id = `other_${index}`;
    const pool = { pool_id: id, snapshot: snapshot(id), progress: null, mapped_snapshot: null, wish_agent_ids: [] };
    source.pools.push(pool);
    const batch = addBatch(pool, index === 13 ? 647 : 100);
    for (let n = 0; n < (index < 4 ? 5 : 4); n += 1) {
      source.events.push(event(`other_event_${index}_${n}`, pool, 10, 0, false, true, batch.batch_id));
    }
  }
  return source;
}

function toStored(source, userId = "synthetic_owner") {
  const camel = (value) => {
    if (Array.isArray(value)) return value.map(camel);
    if (value == null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      key.endsWith("_at") && child != null ? new Date(child) : camel(child),
    ]));
  };
  const owner = { userId, accountId: source.source_account.account_id };
  const converted = camel(source);
  return {
    archive: { _id: `${userId}:${owner.accountId}`, ...owner, gameSnapshot: source.game,
      archiveRevision: source.archive_revision, baseline: source.baseline, currentPoolId: null,
      pools: converted.pools, temporaryAgents: [], nextEventOrder: source.events.length + 1,
      updatedAt: new Date(source.exported_at) },
    events: converted.events.map((event) => ({ _id: `${userId}:${owner.accountId}:${event.eventId}`, ...owner, ...event })),
    batches: converted.batches.map((batch) => ({ _id: `${userId}:${owner.accountId}:${batch.batchId}`, ...owner, ...batch })),
    account: { _id: `${userId}:${owner.accountId}`, ...owner, game: source.game, recruitmentFence: 0 },
  };
}

module.exports = { fixture, toStored };
