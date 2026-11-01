"use strict";

const SOURCE_FILE_NAME = "levels (2).json";
const EXPECTED_SOURCE_COUNT = 143;
const PLANNED_CATALOG_COUNT = 84;
const REQUIRED_FIELDS = ["catOne", "catTwo", "catThree", "name", "levelId", "stageId"];
const CATALOG_FIELDS = [
  "game",
  "catOne",
  "catTwo",
  "catThree",
  "name",
  "levelId",
  "stageId",
  "endTime",
];
const GAME_NAMES = ["代号鸢", "如鸢", "通用"];
const MAPPING_RULES = ["dai_hao*", "ru*", "tong*", "other*"];
const STAGE_ID_CORRECTION = Object.freeze({
  levelId: "dai_hao/bai_gu/2_0_2_7_nian_1_1",
  before: "2_0_2_5_nian_1_1",
  after: "2_0_2_7_nian_1_1",
});

function mapGame(levelId) {
  const prefix = levelId.split("/", 1)[0];
  if (prefix.startsWith("dai_hao")) return { game: "代号鸢", rule: "dai_hao*" };
  if (prefix.startsWith("ru")) return { game: "如鸢", rule: "ru*" };
  if (prefix.startsWith("tong")) return { game: "通用", rule: "tong*" };
  return { game: "通用", rule: "other*" };
}

function stableLevelKey(game, levelId) {
  // Reversible identity encoding keeps migration keys deterministic without a hash/checksum.
  const encoded = Buffer.from(`${game}\0${levelId}`)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `lvl_${encoded}`;
}

function normalizeRequiredField(record, field, errors) {
  if (typeof record[field] !== "string") {
    errors.push({ field, message: "must be a string" });
    return null;
  }
  const value = record[field].trim();
  if (!value) errors.push({ field, message: "must not be empty" });
  return value;
}

function normalizeEndTime(record, errors) {
  if (record.endTime === undefined || record.endTime === null) return null;
  if (typeof record.endTime !== "string") {
    errors.push({ field: "endTime", message: "must be a string or null" });
    return null;
  }
  const value = record.endTime.trim();
  if (!value) return null;
  if (!Number.isFinite(Date.parse(value))) errors.push({ field: "endTime", message: "must be an ISO date" });
  return value;
}

function contentKey(document) {
  return JSON.stringify(CATALOG_FIELDS.map((field) => document[field]));
}

function normalizeRecord(record, index) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { error: { index, fields: [{ field: "record", message: "must be an object" }] } };
  }

  const errors = [];
  const values = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, normalizeRequiredField(record, field, errors)]));
  const endTime = normalizeEndTime(record, errors);
  if (errors.length > 0) return { error: { index, fields: errors } };

  const mapping = mapGame(values.levelId);
  const document = {
    levelKey: stableLevelKey(mapping.game, values.levelId),
    game: mapping.game,
    catOne: values.catOne,
    catTwo: values.catTwo,
    catThree: values.catThree,
    name: values.name,
    levelId: values.levelId,
    stageId: values.stageId,
    endTime,
    status: "ACTIVE",
    isOpen: true,
    sortOrder: index,
    revision: 0,
  };
  const correction = document.levelId === STAGE_ID_CORRECTION.levelId && document.stageId === STAGE_ID_CORRECTION.before
    ? {
        index,
        levelId: document.levelId,
        before: document.stageId,
        after: STAGE_ID_CORRECTION.after,
      }
    : null;
  if (correction) document.stageId = correction.after;

  return {
    document,
    contentKey: contentKey(document),
    mapping,
    correction,
  };
}

function addBusinessMatch(map, key, item) {
  const values = map.get(key);
  if (values) values.push(item);
  else map.set(key, [item]);
}

function normalizeLevels(records) {
  if (!Array.isArray(records)) throw new TypeError("levels source must be an array");

  const levels = [];
  const errors = [];
  const duplicates = [];
  const conflicts = [];
  const corrections = [];
  const gameCounts = Object.fromEntries(GAME_NAMES.map((game) => [game, 0]));
  const mappingRuleCounts = Object.fromEntries(MAPPING_RULES.map((rule) => [rule, 0]));
  const seenContent = new Map();
  const byStage = new Map();
  const byLevel = new Map();

  records.forEach((record, index) => {
    const normalized = normalizeRecord(record, index);
    if (normalized.error) {
      errors.push(normalized.error);
      return;
    }

    const { document, contentKey: key, mapping, correction } = normalized;
    gameCounts[document.game] += 1;
    mappingRuleCounts[mapping.rule] += 1;
    if (correction) corrections.push(correction);

    const previous = seenContent.get(key);
    if (previous) {
      duplicates.push({
        index,
        duplicateOf: previous.index,
        levelKey: document.levelKey,
        businessKey: { game: document.game, levelId: document.levelId, stageId: document.stageId },
      });
      return;
    }

    const matches = new Map();
    for (const item of byStage.get(`${document.game}\0${document.stageId}`) || []) {
      if (item.contentKey !== key) matches.set(item.index, { item, keys: new Set(["stageId"]) });
    }
    for (const item of byLevel.get(`${document.game}\0${document.levelId}`) || []) {
      if (item.contentKey !== key) {
        const match = matches.get(item.index);
        if (match) match.keys.add("levelId");
        else matches.set(item.index, { item, keys: new Set(["levelId"]) });
      }
    }
    for (const { item, keys } of matches.values()) {
      conflicts.push({
        index,
        conflictWith: item.index,
        levelKey: document.levelKey,
        conflictLevelKey: item.document.levelKey,
        keys: [...keys],
        businessKeys: {
          game: document.game,
          stageId: document.stageId,
          levelId: document.levelId,
        },
      });
    }

    const item = { index, document, contentKey: key };
    seenContent.set(key, item);
    addBusinessMatch(byStage, `${document.game}\0${document.stageId}`, item);
    addBusinessMatch(byLevel, `${document.game}\0${document.levelId}`, item);
    levels.push(document);
  });

  const summary = {
    sourceFile: SOURCE_FILE_NAME,
    sourceCount: records.length,
    expectedSourceCount: EXPECTED_SOURCE_COUNT,
    plannedCount: PLANNED_CATALOG_COUNT,
    deviationFromPlan: records.length - PLANNED_CATALOG_COUNT,
    validCount: records.length - errors.length,
    invalidCount: errors.length,
    normalizedCount: levels.length,
    duplicateCount: duplicates.length,
    conflictCount: conflicts.length,
    correctionCount: corrections.length,
    importCount: levels.length,
    gameCounts,
    mappingRuleCounts,
    canApply: errors.length === 0 && conflicts.length === 0,
  };

  return { levels, errors, duplicates, conflicts, corrections, summary };
}

function summarize(normalized) {
  if (Array.isArray(normalized)) return normalizeLevels(normalized).summary;
  if (normalized && normalized.summary) return normalized.summary;
  throw new TypeError("summarize expects normalized levels or source records");
}

function buildImportDocument(normalized) {
  const result = Array.isArray(normalized) ? normalizeLevels(normalized) : normalized;
  if (!result || !Array.isArray(result.levels)) throw new TypeError("buildImportDocument expects normalized levels");
  return {
    levels: result.levels.map((level) => ({
      id: level.levelKey,
      game: level.game,
      cat_one: level.catOne,
      cat_two: level.catTwo,
      cat_three: level.catThree,
      name: level.name,
      level_id: level.levelId,
      stage_id: level.stageId,
      status: level.status,
      is_open: level.isOpen,
      end_time: level.endTime,
      sort_order: level.sortOrder,
    })),
  };
}

const exported = {
  CATALOG_FIELDS,
  EXPECTED_SOURCE_COUNT,
  GAME_NAMES,
  MAPPING_RULES,
  PLANNED_CATALOG_COUNT,
  SOURCE_FILE_NAME,
  STAGE_ID_CORRECTION,
  buildImportDocument,
  mapGame,
  normalizeLevels,
  stableLevelKey,
  summarize,
};

if (typeof module !== "undefined") module.exports = exported;
