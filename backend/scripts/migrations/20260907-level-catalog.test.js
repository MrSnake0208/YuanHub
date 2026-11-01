"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const {
  buildImportDocument,
  mapGame,
  normalizeLevels,
  stableLevelKey,
} = require("./level-catalog-normalizer");
const {
  COLLECTION_NAME,
  MIGRATION_ACTOR,
  applyCatalog,
  assertCanApply,
  createDryRunReport,
  run,
} = require("./20260907-level-catalog");

const source = JSON.parse(fs.readFileSync("levels (2).json", "utf8"));

function record(overrides = {}) {
  return {
    catOne: "分类",
    catTwo: "子分类",
    catThree: "无",
    name: "关卡",
    levelId: "dai_hao/demo/level",
    stageId: "demo_stage",
    ...overrides,
  };
}

class FakeCollection {
  constructor(documents = []) {
    this.documents = documents.map((document) => ({ ...document }));
    this.indexes = [{ name: "_id_", key: { _id: 1 }, unique: true }];
  }

  getIndexes() {
    return this.indexes.map((index) => ({ ...index, key: { ...index.key } }));
  }

  createIndex(key, options) {
    this.indexes.push({ name: options.name, key: { ...key }, unique: options.unique === true });
    return options.name;
  }

  find() {
    return { toArray: () => this.documents.map((document) => ({ ...document })) };
  }

  updateOne(filter, update, options) {
    const clauses = filter.$or || [filter];
    const existingIndex = this.documents.findIndex((document) => clauses.some((clause) => (
      Object.entries(clause).every(([field, value]) => document[field] === value)
    )));
    if (existingIndex >= 0) return { matchedCount: 1, upsertedCount: 0 };
    assert.equal(options.upsert, true);
    const inserted = { ...update.$setOnInsert, _id: `fake_${this.documents.length + 1}` };
    this.documents.push(inserted);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  insertOne(document) {
    this.documents.push({ ...document, _id: `fake_${this.documents.length + 1}` });
    return { acknowledged: true };
  }
}

function fakeDatabase(collection, revisions = new FakeCollection()) {
  return {
    getCollection: (name) => name === COLLECTION_NAME ? collection : revisions,
  };
}

test("normalizes the real source without confusing 143 rows with the 84-row plan", () => {
  const normalized = normalizeLevels(source);
  assert.equal(source.length, 143);
  assert.equal(normalized.summary.sourceCount, 143);
  assert.equal(normalized.summary.expectedSourceCount, 143);
  assert.equal(normalized.summary.plannedCount, 84);
  assert.equal(normalized.summary.deviationFromPlan, 59);
  assert.equal(normalized.summary.invalidCount, 0);
  assert.equal(normalized.summary.duplicateCount, 0);
  assert.equal(normalized.summary.conflictCount, 0);
  assert.equal(normalized.summary.normalizedCount, 143);
  assert.equal(normalized.summary.correctionCount, 1);
  assert.deepEqual(normalized.summary.gameCounts, { "代号鸢": 35, "如鸢": 5, "通用": 103 });
  assert.deepEqual(normalized.summary.mappingRuleCounts, {
    "dai_hao*": 35,
    "ru*": 5,
    "tong*": 18,
    "other*": 85,
  });

  const corrected = normalized.levels.find((level) => level.levelId === "dai_hao/bai_gu/2_0_2_7_nian_1_1");
  assert.equal(corrected.stageId, "2_0_2_7_nian_1_1");
  assert.deepEqual(normalized.corrections, [{
    index: 83,
    levelId: "dai_hao/bai_gu/2_0_2_7_nian_1_1",
    before: "2_0_2_5_nian_1_1",
    after: "2_0_2_7_nian_1_1",
  }]);
  assert.equal(new Set(normalized.levels.map((level) => level.levelKey)).size, 143);
});

test("trims fields, applies explicit game mapping, and creates a stable key", () => {
  assert.deepEqual(mapGame("dai_hao_yuan/foo"), { game: "代号鸢", rule: "dai_hao*" });
  assert.deepEqual(mapGame("ru_yuan/foo"), { game: "如鸢", rule: "ru*" });
  assert.deepEqual(mapGame("tong_yong/foo"), { game: "通用", rule: "tong*" });
  assert.deepEqual(mapGame("di_gong/foo"), { game: "通用", rule: "other*" });

  const normalized = normalizeLevels([record({
    catOne: " 分类 ",
    name: " 名称 ",
    levelId: " dai_hao_yuan/foo ",
    stageId: " stage ",
    endTime: " 2027-01-01T00:00:00.000+08:00 ",
  })]);
  const [level] = normalized.levels;
  assert.equal(level.catOne, "分类");
  assert.equal(level.name, "名称");
  assert.equal(level.levelId, "dai_hao_yuan/foo");
  assert.equal(level.stageId, "stage");
  assert.equal(level.game, "代号鸢");
  assert.equal(level.levelKey, stableLevelKey("代号鸢", "dai_hao_yuan/foo"));
  assert.equal(level.endTime, "2027-01-01T00:00:00.000+08:00");
});

test("reports malformed rows instead of allowing apply", () => {
  const normalized = normalizeLevels([record({ name: "  " }), null]);
  assert.equal(normalized.summary.invalidCount, 2);
  assert.equal(normalized.levels.length, 0);
  assert.throws(() => assertCanApply(normalized), /malformed/);
});

test("counts exact duplicates but reports different business-key content as conflicts", () => {
  const duplicate = record();
  const exact = normalizeLevels([duplicate, { ...duplicate }]);
  assert.equal(exact.summary.duplicateCount, 1);
  assert.equal(exact.summary.conflictCount, 0);
  assert.equal(exact.levels.length, 1);

  const stageConflict = normalizeLevels([
    record({ levelId: "dai_hao/a", stageId: "same-stage" }),
    record({ levelId: "dai_hao/b", stageId: "same-stage" }),
  ]);
  assert.equal(stageConflict.summary.duplicateCount, 0);
  assert.equal(stageConflict.summary.conflictCount, 1);
  assert.deepEqual(stageConflict.conflicts[0].keys, ["stageId"]);
  assert.throws(() => assertCanApply(stageConflict), /业务键冲突/);
  const conflictCollection = new FakeCollection();
  assert.throws(() => applyCatalog(fakeDatabase(conflictCollection), stageConflict), /业务键冲突/);
  assert.equal(conflictCollection.documents.length, 0);

  const levelConflict = normalizeLevels([
    record({ levelId: "dai_hao/same", stageId: "stage-a" }),
    record({ levelId: "dai_hao/same", stageId: "stage-b" }),
  ]);
  assert.equal(levelConflict.summary.conflictCount, 1);
  assert.deepEqual(levelConflict.conflicts[0].keys, ["levelId"]);
});

test("dry-run report is pure and contains no database operation", () => {
  const normalized = normalizeLevels([record()]);
  const report = createDryRunReport(normalized, "/tmp/levels.json");
  assert.equal(report.mode, "dry-run");
  assert.equal(report.sourceCount, 1);
  assert.equal(report.importCount, 1);
  assert.equal(report.sourcePath, "/tmp/levels.json");
});

test("runner dry-run never asks for a Mongo database", () => {
  const previousDb = global.db;
  const previousPrint = global.print;
  let databaseAccessed = false;
  global.db = { getSiblingDB: () => { databaseAccessed = true; throw new Error("unexpected database access"); } };
  global.print = () => {};
  try {
    const report = run(["--dry-run"]);
    assert.equal(report.mode, "dry-run");
    assert.equal(databaseAccessed, false);
  } finally {
    if (previousDb === undefined) delete global.db;
    else global.db = previousDb;
    if (previousPrint === undefined) delete global.print;
    else global.print = previousPrint;
  }
});

test("apply is idempotent and never overwrites a non-migration non-empty collection", () => {
  const normalized = normalizeLevels([record(), record({ levelId: "ru/demo/level", stageId: "ru-stage" })]);
  const collection = new FakeCollection();
  const revisions = new FakeCollection();
  const database = fakeDatabase(collection, revisions);
  const now = new Date("2026-09-07T00:00:00.000Z");

  const first = applyCatalog(database, normalized, { now });
  assert.equal(first.insertedCount, 2);
  assert.equal(first.revisionCount, 2);
  assert.equal(revisions.documents.length, 2);
  assert.equal(first.finalCount, 2);
  const beforeSecondApply = JSON.stringify(collection.documents);
  const second = applyCatalog(database, normalized, { now: new Date("2026-09-08T00:00:00.000Z") });
  assert.equal(second.insertedCount, 0);
  assert.equal(second.matchedCount, 2);
  assert.equal(second.revisionCount, 0);
  assert.equal(revisions.documents.length, 2);
  assert.equal(second.finalCount, 2);
  assert.equal(JSON.stringify(collection.documents), beforeSecondApply);
  assert.equal(collection.indexes.filter((index) => index.unique).length, 4);

  const unsafe = new FakeCollection([{ levelKey: "lvl_other", createdBy: "operator" }]);
  assert.throws(() => applyCatalog(fakeDatabase(unsafe), normalized), /非空/);
  assert.equal(unsafe.indexes.length, 1);
});

test("import document matches the backend snake_case contract and required public fields", () => {
  const normalized = normalizeLevels([record({ endTime: null })]);
  const document = buildImportDocument(normalized);
  assert.equal(document.levels.length, 1);
  assert.deepEqual(Object.keys(document.levels[0]), [
    "id",
    "game",
    "cat_one",
    "cat_two",
    "cat_three",
    "name",
    "level_id",
    "stage_id",
    "status",
    "is_open",
    "end_time",
    "sort_order",
  ]);
  assert.equal(document.levels[0].id, normalized.levels[0].levelKey);
  assert.equal(document.levels[0].end_time, null);
  assert.ok(["game", "cat_one", "cat_two", "cat_three", "name", "level_id", "stage_id"]
    .every((field) => Object.hasOwn(document.levels[0], field)));
});

test("migration actor is the marker used for safe repeat apply", () => {
  assert.equal(typeof MIGRATION_ACTOR, "string");
  assert.match(MIGRATION_ACTOR, /^migration:20260907-/);
});
