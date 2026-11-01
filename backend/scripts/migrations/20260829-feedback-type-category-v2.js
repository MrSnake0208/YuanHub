// 反馈工单字段语义迁移:
//   type = BUG / FEATURE / CONTENT / ACCOUNT / REPORT / OTHER
//   category = INVENTORY / OPERATOR / LEDGER / PLAZA / ACCOUNT / UI / OTHER
//
// 旧格式为 type=FEEDBACK, category=反馈性质, area=前端板块。本脚本只补新语义，
// 保留 area 作为过渡字段，不删除数据。默认 DRY_RUN，确认统计后再把 APPLY 改为 true。
//
// 用法:
//   mongosh 'mongodb://<host>:27017/HubBackend' --quiet \
//     scripts/migrations/20260829-feedback-type-category-v2.js
const database = db.getSiblingDB("HubBackend");
const APPLY = false;

const types = new Set(["BUG", "FEATURE", "CONTENT", "ACCOUNT", "REPORT", "OTHER"]);
const categories = new Set(["INVENTORY", "OPERATOR", "LEDGER", "PLAZA", "ACCOUNT", "UI", "OTHER"]);

function upper(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalize(document) {
  const type = upper(document.type);
  const legacyCategory = upper(document.category);
  const area = upper(document.area);
  const category = categories.has(area)
    ? area
    : (categories.has(legacyCategory) ? legacyCategory : "OTHER");
  const normalizedType = type === "FEEDBACK" && types.has(legacyCategory)
    ? legacyCategory
    : (type || "FEEDBACK");
  return { type: normalizedType, category };
}

const updates = [];
database.feedback_tickets.find().forEach((document) => {
  const fields = normalize(document);
  if (document.type === fields.type && document.category === fields.category) return;
  updates.push({ id: document._id, before: { type: document.type, category: document.category, area: document.area }, after: fields });
});

print(`反馈工单总数 ${database.feedback_tickets.countDocuments()}，待更新 ${updates.length} 条`);
updates.forEach((item) => print(JSON.stringify(item)));

if (!APPLY) {
  print("DRY-RUN 完成：未写入任何数据。确认清单后将 APPLY 改为 true 再运行。");
  quit(0);
}

const session = database.getMongo().startSession();
try {
  session.withTransaction(() => {
    const sessionCollection = session.getDatabase("HubBackend").feedback_tickets;
    updates.forEach((item) => {
      sessionCollection.updateOne(
        { _id: item.id },
        { $set: { type: item.after.type, category: item.after.category } },
      );
    });
  });
} finally {
  session.endSession();
}

database.feedback_tickets.createIndex(
  { status: 1, type: 1, category: 1, createdAt: -1 },
  { name: "idx_status_type_category_created" },
);
print(`迁移完成：已更新 ${updates.length} 条，旧 area 字段保留。`);
