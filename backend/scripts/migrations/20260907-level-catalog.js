"use strict";

const fs = require("fs");
const path = require("path");
const SCRIPT_DIRECTORY = typeof __dirname === "undefined"
  ? path.resolve("BackEndV3-Share/scripts/migrations")
  : __dirname;
const {
  CATALOG_FIELDS,
  buildImportDocument,
  normalizeLevels,
  summarize,
} = require(path.join(SCRIPT_DIRECTORY, "level-catalog-normalizer.js"));

const COLLECTION_NAME = "level_catalog";
const REVISION_COLLECTION_NAME = "level_catalog_revisions";
const MIGRATION_ACTOR = "migration:20260907-level-catalog";
const DEFAULT_SOURCE_PATH = path.resolve(SCRIPT_DIRECTORY, "../../../levels (2).json");
const UNIQUE_INDEXES = [
  { name: "level_catalog_level_key_unique", key: { levelKey: 1 } },
  { name: "level_catalog_game_stage_unique", key: { game: 1, stageId: 1 } },
  { name: "level_catalog_game_level_unique", key: { game: 1, levelId: 1 } },
];

function parseArgs(args) {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  if (apply && dryRun) throw new Error("--apply 与 --dry-run 不能同时使用");

  let sourcePath = DEFAULT_SOURCE_PATH;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--source") continue;
    if (!args[index + 1]) throw new Error("--source 需要文件路径");
    sourcePath = path.resolve(args[index + 1]);
    index += 1;
  }
  return { apply, sourcePath };
}

function readSource(sourcePath) {
  return JSON.parse(fs.readFileSync(sourcePath, "utf8"));
}

function getCollectionByName(database, name) {
  if (typeof database.getCollection === "function") return database.getCollection(name);
  return database[name];
}

function getCollection(database) {
  return getCollectionByName(database, COLLECTION_NAME);
}

function indexKey(index) {
  return JSON.stringify(index.key);
}

function verifyUniqueIndexes(collection) {
  const indexes = collection.getIndexes();
  for (const expected of UNIQUE_INDEXES) {
    const matches = indexes.filter((index) => indexKey(index) === indexKey(expected));
    if (matches.length === 0) throw new Error(`缺少唯一索引 ${expected.name}`);
    if (!matches.some((index) => index.unique === true)) {
      throw new Error(`索引 ${expected.name} 存在但不是 unique`);
    }
  }
  return indexes;
}

function ensureUniqueIndexes(collection) {
  const before = collection.getIndexes();
  for (const expected of UNIQUE_INDEXES) {
    const sameKey = before.find((index) => indexKey(index) === indexKey(expected));
    if (sameKey) {
      if (sameKey.unique !== true) throw new Error(`已有索引 ${sameKey.name} 不是 unique，拒绝覆盖`);
      continue;
    }
    collection.createIndex(expected.key, { name: expected.name, unique: true });
  }
  return verifyUniqueIndexes(collection);
}

function normalizeStoredValue(field, value) {
  if (field !== "endTime") return value ?? null;
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toISOString();
}

function sameCatalogFields(existing, expected) {
  return CATALOG_FIELDS.every((field) => normalizeStoredValue(field, existing[field]) === normalizeStoredValue(field, expected[field]));
}

function findExisting(collection) {
  return collection.find({}, {}).toArray();
}

function validateNonEmptyCatalog(existing, levels, actor = MIGRATION_ACTOR) {
  if (existing.length === 0) return { mode: "empty", matchedCount: 0 };

  const byLevelKey = new Map(levels.map((level) => [level.levelKey, level]));
  const byBusinessKey = new Map(levels.map((level) => [`${level.game}\0${level.levelId}\0${level.stageId}`, level]));
  const matched = new Set();
  for (const document of existing) {
    const expected = byLevelKey.get(document.levelKey)
      || byBusinessKey.get(`${document.game}\0${document.levelId}\0${document.stageId}`);
    if (
      !expected
      || document.levelKey !== expected.levelKey
      || document.createdBy !== actor
      || !sameCatalogFields(document, expected)
    ) {
      throw new Error("level_catalog 非空且不是本迁移已写入的完全匹配数据，拒绝盲目覆盖");
    }
    matched.add(expected.levelKey);
  }
  return { mode: "idempotent-resume", matchedCount: matched.size };
}

function toMongoDocument(level, now, actor) {
  return {
    ...level,
    endTime: level.endTime === null ? null : new Date(level.endTime),
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  };
}

function toEntityLevel(entry) {
  return {
    levelKey: entry.id,
    game: entry.game,
    catOne: entry.cat_one,
    catTwo: entry.cat_two,
    catThree: entry.cat_three,
    name: entry.name,
    levelId: entry.level_id,
    stageId: entry.stage_id,
    status: entry.status,
    isOpen: entry.is_open,
    endTime: entry.end_time,
    sortOrder: entry.sort_order,
    revision: 0,
  };
}

function revisionSnapshot(level) {
  return {
    levelKey: level.levelKey,
    game: level.game,
    catOne: level.catOne,
    catTwo: level.catTwo,
    catThree: level.catThree,
    name: level.name,
    levelId: level.levelId,
    stageId: level.stageId,
    status: level.status,
    isOpen: level.isOpen,
    endTime: level.endTime,
    sortOrder: level.sortOrder,
  };
}

function validateStoredCatalog(collection, levels) {
  const documents = collection.find({}, {}).toArray();
  if (documents.length !== levels.length) {
    throw new Error(`迁移后记录数 ${documents.length} 与预期 ${levels.length} 不一致`);
  }
  const expectedKeys = new Set(levels.map((level) => level.levelKey));
  for (const document of documents) {
    if (!expectedKeys.has(document.levelKey)) throw new Error(`迁移后出现未预期 levelKey: ${document.levelKey}`);
    const requiredFields = [
      "levelKey",
      ...CATALOG_FIELDS,
      "status",
      "isOpen",
      "sortOrder",
    ];
    if (!requiredFields.every((field) => document[field] !== undefined)) {
      throw new Error(`迁移后记录缺少公共 API 字段: ${document.levelKey}`);
    }
  }
  return documents.length;
}

function assertCanApply(normalized) {
  const report = summarize(normalized);
  if (report.invalidCount > 0) throw new Error(`存在 ${report.invalidCount} 条 malformed 记录，停止 apply`);
  if (report.conflictCount > 0) throw new Error(`存在 ${report.conflictCount} 个业务键冲突，停止 apply`);
}

function applyCatalog(database, normalized, options = {}) {
  assertCanApply(normalized);
  const collection = getCollection(database);
  const revisionCollection = getCollectionByName(database, REVISION_COLLECTION_NAME);
  const actor = options.actor || MIGRATION_ACTOR;
  const now = options.now || new Date();
  const levels = buildImportDocument(normalized).levels.map(toEntityLevel);
  const existing = findExisting(collection);
  const safety = validateNonEmptyCatalog(existing, levels, actor);

  ensureUniqueIndexes(collection);
  let insertedCount = 0;
  let matchedCount = 0;
  for (const level of levels) {
    const result = collection.updateOne(
      {
        $or: [
          { levelKey: level.levelKey },
          { game: level.game, levelId: level.levelId },
          { game: level.game, stageId: level.stageId },
        ],
      },
      { $setOnInsert: toMongoDocument(level, now, actor) },
      { upsert: true },
    );
    if (result.upsertedCount === 1) insertedCount += 1;
    else matchedCount += 1;
    if (result.upsertedCount === 1 && revisionCollection) {
      revisionCollection.insertOne({
        levelKey: level.levelKey,
        action: "IMPORT",
        revision: level.revision,
        actorUserId: actor,
        before: null,
        after: revisionSnapshot(level),
        occurredAt: now,
      });
    }
  }

  const finalCount = validateStoredCatalog(collection, levels);
  const indexes = verifyUniqueIndexes(collection);
  return {
    safety,
    insertedCount,
    matchedCount,
    finalCount,
    expectedCount: levels.length,
    revisionCount: insertedCount,
    indexNames: indexes.filter((index) => index.unique === true).map((index) => index.name),
  };
}

function createDryRunReport(normalized, sourcePath) {
  const report = summarize(normalized);
  return {
    mode: "dry-run",
    sourcePath,
    ...report,
    corrections: normalized.corrections,
    duplicates: normalized.duplicates,
    conflicts: normalized.conflicts,
    errors: normalized.errors,
  };
}

function printJson(value) {
  if (typeof print === "function") print(JSON.stringify(value, null, 2));
  else console.log(JSON.stringify(value, null, 2));
}

function getMongoDatabase() {
  if (typeof db === "undefined" || !db || typeof db.getSiblingDB !== "function") {
    throw new Error("--apply 只能通过 mongosh 执行；Node runner 仅支持 dry-run");
  }
  return db.getSiblingDB("HubBackend");
}

function run(args) {
  const options = parseArgs(args);
  const normalized = normalizeLevels(readSource(options.sourcePath));
  if (!options.apply) {
    const report = createDryRunReport(normalized, options.sourcePath);
    printJson(report);
    return report;
  }

  assertCanApply(normalized);
  const result = applyCatalog(getMongoDatabase(), normalized);
  const report = {
    mode: "apply",
    sourcePath: options.sourcePath,
    ...summarize(normalized),
    ...result,
    corrections: normalized.corrections,
  };
  printJson(report);
  return report;
}

if (
  typeof db !== "undefined"
  || (typeof module !== "undefined" && typeof require !== "undefined" && require.main === module)
) {
  try {
    run(typeof process === "undefined" ? [] : process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof print === "function") {
      print(`迁移失败: ${message}`);
      if (typeof db !== "undefined") throw error;
    } else {
      console.error(`迁移失败: ${message}`);
      process.exitCode = 1;
    }
  }
}

const exported = {
  COLLECTION_NAME,
  DEFAULT_SOURCE_PATH,
  MIGRATION_ACTOR,
  UNIQUE_INDEXES,
  REVISION_COLLECTION_NAME,
  applyCatalog,
  assertCanApply,
  createDryRunReport,
  ensureUniqueIndexes,
  normalizeStoredValue,
  parseArgs,
  run,
  sameCatalogFields,
  validateNonEmptyCatalog,
  verifyUniqueIndexes,
};

if (typeof module !== "undefined") module.exports = exported;
