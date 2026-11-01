// Run once against HubBackend with mongosh before starting the v2 backend.
const database = db.getSiblingDB("HubBackend");
const client = database.getMongo();

const legacyUsers = new Map();
database.inventory_current.distinct("userId", { accountId: { $exists: false } }).forEach((userId) => {
  legacyUsers.set(userId.toString(), userId);
});
database.inventory_records.distinct("userId", { accountId: { $exists: false } }).forEach((userId) => {
  legacyUsers.set(userId.toString(), userId);
});

legacyUsers.forEach((userId) => {
  const session = client.startSession();
  try {
    session.withTransaction(() => {
      const sessionDb = session.getDatabase("HubBackend");
      const accounts = sessionDb.inventory_accounts;
      let account = accounts.findOne({ userId, name: "默认账号" });
      if (account === null) {
        account = {
          userId,
          accountId: `acc_${new ObjectId().toHexString()}`,
          name: "默认账号",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        accounts.insertOne(account);
      }

      sessionDb.inventory_records.updateMany(
        { userId, accountId: { $exists: false } },
        { $set: { accountId: account.accountId } },
      );

      sessionDb.inventory_current.find({ userId, accountId: { $exists: false } }).forEach((current) => {
        const replacement = {
          ...current,
          _id: `${userId}:${account.accountId}:${current.entityType}`,
          accountId: account.accountId,
        };
        sessionDb.inventory_current.deleteOne({ _id: current._id });
        sessionDb.inventory_current.insertOne(replacement);
      });
    });
  } finally {
    session.endSession();
  }
});

function dropIndexIfPresent(collection, name) {
  if (collection.getIndexes().some((index) => index.name === name)) {
    collection.dropIndex(name);
  }
}

dropIndexIfPresent(database.inventory_current, "idx_user_entity");
dropIndexIfPresent(database.inventory_records, "idx_user_record_unique");
dropIndexIfPresent(database.inventory_records, "idx_user_effective");
dropIndexIfPresent(database.inventory_records, "idx_user_type_effective");

database.inventory_accounts.createIndex(
  { userId: 1, accountId: 1 },
  { name: "idx_user_account_unique", unique: true },
);
database.inventory_accounts.createIndex(
  { userId: 1, name: 1 },
  { name: "idx_user_account_name_unique", unique: true },
);
database.inventory_current.createIndex(
  { userId: 1, accountId: 1, entityType: 1 },
  { name: "idx_user_account_entity", unique: true },
);
database.inventory_records.createIndex(
  { userId: 1, accountId: 1, recordId: 1 },
  { name: "idx_user_account_record_unique", unique: true },
);
database.inventory_records.createIndex(
  { userId: 1, accountId: 1, effectiveAt: 1 },
  { name: "idx_user_account_effective" },
);
database.inventory_records.createIndex(
  { userId: 1, accountId: 1, recordType: 1, effectiveAt: 1 },
  { name: "idx_user_account_type_effective" },
);

const revokedLegacyTokens = database.open_api_token.deleteMany({ accountId: { $exists: false } }).deletedCount;

print(`Migrated ${legacyUsers.size} inventory users to v2 accounts.`);
print(`Revoked ${revokedLegacyTokens} legacy user-scoped API tokens.`);
