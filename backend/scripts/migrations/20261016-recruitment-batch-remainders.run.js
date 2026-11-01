(async () => {
  const migration = require(require("node:path").resolve("20261015-recruitment-duplicate-pools.js"));
  const plan = migration.readSource("remainder-plan.json");
  const action = process.env.YUANHUB_REPAIR_ACTION ?? "dry-run";
  if (!["dry-run", "apply", "rollback"].includes(action)) throw new Error("未知修正操作");
  const expectedRevision = process.env.YUANHUB_REPAIR_REVISION == null ? undefined : Number(process.env.YUANHUB_REPAIR_REVISION);
  if (action === "rollback" && !Number.isSafeInteger(expectedRevision)) throw new Error("回滚需要原预演版本");
  const result = action === "rollback"
    ? await migration.rollback(db, `batch-remainders:${plan.accountId}:${expectedRevision}`)
    : await migration.reconcileRemainders(db, plan, { apply: action === "apply", expectedRevision });
  print(JSON.stringify({ database: db.getName(), ...result }, null, 2));
})().catch((error) => { console.error(error); quit(1); });
