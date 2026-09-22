import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findLegacyHostAccount,
  retargetWorkspaceSnapshot,
} from "../src/pages/star/legacyHostAccountMigration.js";

test("finds one legacy YuanStar account with the same name and game version", function () {
  const legacy = {
    accountId: "legacy-local-id",
    displayName: "殿下",
    gameVersion: "如鸢",
  };
  const result = findLegacyHostAccount(
    [
      legacy,
      {
        accountId: "other-game",
        displayName: "殿下",
        gameVersion: "代号鸢",
      },
    ],
    {
      accountId: "yuanhub-account-id",
      displayName: "殿下",
      gameVersion: "如鸢",
    },
  );

  assert.equal(result, legacy);
});

test("does not guess when legacy account matching is ambiguous", function () {
  const result = findLegacyHostAccount(
    [
      {
        accountId: "legacy-a",
        displayName: "殿下",
        gameVersion: "如鸢",
      },
      {
        accountId: "legacy-b",
        displayName: "殿下",
        gameVersion: "如鸢",
      },
    ],
    {
      accountId: "yuanhub-account-id",
      displayName: "殿下",
      gameVersion: "如鸢",
    },
  );

  assert.equal(result, null);
});

test("retargets only the workspace account id while preserving business state", function () {
  const snapshot = {
    schemaVersion: 1,
    accountId: "legacy-local-id",
    revision: 12,
    gameVersion: "如鸢",
    bag: { currentCount: 42, capacity: 200 },
    inventory: [{ starInstanceId: "star-1" }],
  };

  const migrated = retargetWorkspaceSnapshot(
    snapshot,
    "legacy-local-id",
    "yuanhub-account-id",
  );

  assert.notEqual(migrated, snapshot);
  assert.equal(migrated.accountId, "yuanhub-account-id");
  assert.equal(migrated.revision, 12);
  assert.deepEqual(migrated.inventory, snapshot.inventory);
});

test("star page runs legacy migration before embedded host-account sync", function () {
  const page = readFileSync(
    new URL("../src/pages/star/index.vue", import.meta.url),
    "utf8",
  );

  const syncStart = page.indexOf("async function syncHostAccount()");
  const syncMigration = page.indexOf(
    "await migrateLegacyYuanStarHostAccount(host)",
    syncStart,
  );
  const hostSync = page.indexOf(
    "await currentHandle.setHostAccount(host)",
    syncStart,
  );
  assert.ok(syncStart >= 0);
  assert.ok(syncMigration > syncStart);
  assert.ok(hostSync > syncMigration);

  const mountStart = page.indexOf("async function mountProduct()");
  const mountMigration = page.indexOf(
    "await migrateLegacyYuanStarHostAccount(initialHostAccount)",
    mountStart,
  );
  const embedMount = page.indexOf(
    "product.mountYuanStar(mountRoot.value",
    mountStart,
  );
  assert.ok(mountStart >= 0);
  assert.ok(mountMigration > mountStart);
  assert.ok(embedMount > mountMigration);
});
