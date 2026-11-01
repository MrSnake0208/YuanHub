"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const migration = require("./20261015-recruitment-duplicate-pools.js");
const { fixture, toStored } = require("./20261015-recruitment-duplicate-pools.fixture.js");
const now = new Date("2026-10-15T00:00:00.000Z");

test("merge six pairs once, retain all records, progress, notes and pre-existing tombstones", () => {
  const source = fixture();
  const original = JSON.stringify(source);
  const plan = migration.transform(source, now);
  assert.equal(JSON.stringify(source), original);
  assert.deepEqual(plan.result, { pools: 20, liveEvents: 69, liveBatches: 15, total: 2340 });
  assert.equal(plan.after.events.length, 85);
  assert.equal(plan.after.batches.length, 20);
  assert.equal(plan.after.archive_revision, 29);
  assert.equal(plan.after.pools.find((p) => p.pool_id === "catalog:xlsx_synthetic_2").progress, 1);
  assert.equal(plan.after.pools.find((p) => p.pool_id === "catalog:xlsx_synthetic_3").progress, 5);
  const groups = new Map(plan.groups.map((g) => [g.alias, g]));
  source.events.forEach((before, index) => {
    const after = plan.after.events[index];
    if (!groups.has(before.pool_id)) assert.deepEqual(after, before);
    assert.equal(after.note, before.note);
    if (before.deleted_at) {
      assert.equal(after.deleted_at, before.deleted_at);
      assert.equal(after.deleted_revision, before.deleted_revision);
    }
  });
  const retained = plan.after.batches.find((b) => b.batch_id === "batch_xlsx_synthetic_4");
  assert.equal(retained.total_pull_count, 60);
  assert.equal(retained.deleted_at, null);
  source.batches.forEach((before, index) => {
    if (!groups.has(before.pool_id)) assert.deepEqual(plan.after.batches[index], before);
  });
});

test("reject unreviewed revisions, history, progress, wishes and ambiguous operator matches", () => {
  const changes = [
    (s) => { s.archive_revision += 1; },
    (s) => { s.events[1].pull_span += 1; },
    (s) => { s.events[1].agent_snapshot.agent_id = "another_operator"; },
    (s) => { s.pools[1].progress = 10; },
    (s) => { s.pools[1].wish_agent_ids = ["some_wish"]; },
    (s) => { s.events[0].acquired_date = "2026-10-12"; },
    (s) => { s.events[1].import_batch_id = null; },
  ];
  for (const change of changes) {
    const source = fixture();
    change(source);
    assert.throws(() => migration.transform(source, now));
  }
});

test("stored comparison ignores refreshed display metadata but rejects altered business data", () => {
  const source = fixture();
  const stored = toStored(source);
  stored.archive.pools[0].snapshot.upAgents = [];
  migration.assertMatches(source, stored);
  stored.events[0].note = "a later edit";
  assert.throws(() => migration.assertMatches(source, stored), /note/);
});
