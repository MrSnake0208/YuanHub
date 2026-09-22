const YUANSTAR_DB_NAME = "yuanstar-static";
const CURRENT_ACCOUNT_META_KEY = "product.currentAccountId";
const REQUIRED_STORES = [
  "meta",
  "accounts",
  "workspaces",
  "images",
  "restorePoints",
  "restorePointImages",
];

function requestValue(request) {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("读取 YuanStar 本地数据失败。"));
    };
  });
}

function transactionDone(transaction) {
  return new Promise(function (resolve, reject) {
    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onabort = function () {
      reject(transaction.error || new Error("YuanStar 本地数据事务已中止。"));
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("YuanStar 本地数据事务失败。"));
    };
  });
}

function hasRequiredStores(database) {
  return REQUIRED_STORES.every(function (name) {
    return database.objectStoreNames.contains(name);
  });
}

async function openExistingDatabase(indexedDb) {
  if (!indexedDb || typeof indexedDb.open !== "function") return null;

  if (typeof indexedDb.databases === "function") {
    try {
      const databases = await indexedDb.databases();
      if (
        Array.isArray(databases) &&
        !databases.some(function (entry) {
          return entry && entry.name === YUANSTAR_DB_NAME;
        })
      )
        return null;
    } catch (_error) {}
  }

  return new Promise(function (resolve, reject) {
    let createdByProbe = false;
    const request = indexedDb.open(YUANSTAR_DB_NAME);

    request.onupgradeneeded = function (event) {
      if (event.oldVersion !== 0) return;
      createdByProbe = true;
      request.transaction?.abort();
    };
    request.onsuccess = function () {
      const database = request.result;
      if (createdByProbe) {
        database.close();
        resolve(null);
        return;
      }
      resolve(database);
    };
    request.onerror = function () {
      if (createdByProbe && request.error?.name === "AbortError") {
        resolve(null);
        return;
      }
      reject(request.error || new Error("无法打开 YuanStar 本地数据库。"));
    };
  });
}

export function findLegacyHostAccount(accounts, hostAccount) {
  const hostId = String(hostAccount?.accountId || "").trim();
  const displayName = String(hostAccount?.displayName || "").trim();
  const gameVersion = String(hostAccount?.gameVersion || "").trim();
  if (!hostId || !displayName || !gameVersion || !Array.isArray(accounts))
    return null;

  const matches = accounts.filter(function (account) {
    return (
      account &&
      account.accountId !== hostId &&
      account.displayName === displayName &&
      account.gameVersion === gameVersion
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

export function retargetWorkspaceSnapshot(snapshot, fromAccountId, toAccountId) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return snapshot;
  if (snapshot.accountId !== fromAccountId) return snapshot;
  return {
    ...snapshot,
    accountId: toAccountId,
  };
}

/**
 * Older standalone YuanStar builds generated their own local account id.
 * YuanHub later made the backend sub-account id canonical. When both records
 * describe the same game account, move the existing local workspace to the
 * canonical host id before the embedded bundle performs its uniqueness check.
 */
export async function migrateLegacyYuanStarHostAccount(
  hostAccount,
  indexedDb = globalThis.indexedDB,
) {
  const hostId = String(hostAccount?.accountId || "").trim();
  const displayName = String(hostAccount?.displayName || "").trim();
  const gameVersion = String(hostAccount?.gameVersion || "").trim();
  if (!hostId || !displayName || !gameVersion) return false;

  const database = await openExistingDatabase(indexedDb);
  if (!database) return false;

  try {
    if (!hasRequiredStores(database)) return false;

    const accountTransaction = database.transaction(["accounts"], "readonly");
    const accountTransactionDone = transactionDone(accountTransaction);
    const accounts = await requestValue(
      accountTransaction.objectStore("accounts").getAll(),
    );
    await accountTransactionDone;

    if (
      accounts.some(function (account) {
        return account?.accountId === hostId;
      })
    )
      return false;

    const legacyAccount = findLegacyHostAccount(accounts, {
      accountId: hostId,
      displayName,
      gameVersion,
    });
    if (!legacyAccount) return false;

    const legacyId = legacyAccount.accountId;
    const readTransaction = database.transaction(REQUIRED_STORES, "readonly");
    const readTransactionDone = transactionDone(readTransaction);
    const workspaceRequest = readTransaction
      .objectStore("workspaces")
      .get(legacyId);
    const targetWorkspaceRequest = readTransaction
      .objectStore("workspaces")
      .get(hostId);
    const imagesRequest = readTransaction.objectStore("images").getAll();
    const restorePointsRequest = readTransaction
      .objectStore("restorePoints")
      .getAll();
    const restorePointImagesRequest = readTransaction
      .objectStore("restorePointImages")
      .getAll();
    const currentAccountRequest = readTransaction
      .objectStore("meta")
      .get(CURRENT_ACCOUNT_META_KEY);

    const [
      workspace,
      targetWorkspace,
      images,
      restorePoints,
      restorePointImages,
      currentAccountId,
    ] = await Promise.all([
      requestValue(workspaceRequest),
      requestValue(targetWorkspaceRequest),
      requestValue(imagesRequest),
      requestValue(restorePointsRequest),
      requestValue(restorePointImagesRequest),
      requestValue(currentAccountRequest),
    ]);
    await readTransactionDone;

    if (!workspace || targetWorkspace) return false;

    const legacyImages = images.filter(function (record) {
      return record?.accountId === legacyId;
    });
    const legacyRestorePoints = restorePoints.filter(function (record) {
      return record?.accountId === legacyId;
    });
    const legacyRestorePointImages = restorePointImages.filter(function (record) {
      return record?.accountId === legacyId;
    });

    const now = new Date().toISOString();
    const writeTransaction = database.transaction(REQUIRED_STORES, "readwrite");
    const writeTransactionDone = transactionDone(writeTransaction);
    const accountStore = writeTransaction.objectStore("accounts");
    const workspaceStore = writeTransaction.objectStore("workspaces");
    const imageStore = writeTransaction.objectStore("images");
    const restorePointStore = writeTransaction.objectStore("restorePoints");
    const restorePointImageStore =
      writeTransaction.objectStore("restorePointImages");
    const metaStore = writeTransaction.objectStore("meta");

    accountStore.put({
      ...legacyAccount,
      accountId: hostId,
      displayName,
      gameVersion,
      updatedAt: now,
    });
    workspaceStore.put({
      ...workspace,
      accountId: hostId,
      snapshot: retargetWorkspaceSnapshot(
        workspace.snapshot,
        legacyId,
        hostId,
      ),
      updatedAt: now,
    });

    legacyImages.forEach(function (record) {
      imageStore.put({ ...record, accountId: hostId });
      imageStore.delete([legacyId, record.imageId]);
    });
    legacyRestorePoints.forEach(function (record) {
      restorePointStore.put({
        ...record,
        accountId: hostId,
        snapshot: retargetWorkspaceSnapshot(
          record.snapshot,
          legacyId,
          hostId,
        ),
      });
      restorePointStore.delete([legacyId, record.restorePointId]);
    });
    legacyRestorePointImages.forEach(function (record) {
      restorePointImageStore.put({ ...record, accountId: hostId });
      restorePointImageStore.delete([
        legacyId,
        record.restorePointId,
        record.imageId,
      ]);
    });

    accountStore.delete(legacyId);
    workspaceStore.delete(legacyId);
    if (currentAccountId === legacyId)
      metaStore.put(hostId, CURRENT_ACCOUNT_META_KEY);

    await writeTransactionDone;
    return true;
  } finally {
    database.close();
  }
}
