(async () => {
  const path = require("node:path");
  const migration = require(path.resolve("20261015-recruitment-duplicate-pools.js"));
  const source = migration.readSource("source.json");
  const action = process.env.YUANHUB_REPAIR_ACTION ?? "dry-run";
  if (!["dry-run", "apply", "rollback"].includes(action)) throw new Error("未知修复操作");
  const result = action === "rollback"
    ? await migration.rollback(db, `duplicate-pools:${source.source_account.account_id}:${source.archive_revision}`)
    : await migration.repair(db, source, { apply: action === "apply" });
  print(JSON.stringify({ database: db.getName(), ...result }, null, 2));
})().catch((error) => {
  console.error(error);
  quit(1);
});
