// Run once against HubBackend before enabling the agent favorites endpoints.
const database = db.getSiblingDB("HubBackend");

database.inventory_agent_favorites.createIndex(
  { accountId: 1, agentId: 1 },
  { name: "idx_account_agent_favorite_unique", unique: true },
);

database.inventory_agent_favorites.createIndex(
  { userId: 1 },
  { name: "userId" },
);

print("Inventory agent favorites indexes are ready.");
