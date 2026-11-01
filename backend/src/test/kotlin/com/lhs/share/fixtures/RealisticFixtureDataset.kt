package com.lhs.share.fixtures

import org.bson.Document
import java.time.Instant
import java.util.Date

data class FixtureScale(
    val users: Int,
    val accountsPerUser: Int = 2,
    val inventoryRecordsPerAccount: Int = 60,
    val operatorsPerAccount: Int = 100,
    val starEntriesPerAccount: Int = 15,
    val batchAccounts: Int = 50,
) {
    init {
        require(users > 0)
        require(accountsPerUser > 0)
        require(inventoryRecordsPerAccount > 0)
        require(operatorsPerAccount > 0)
        require(starEntriesPerAccount > 0)
        require(batchAccounts > 0)
    }

    val accountCount: Int get() = users * accountsPerUser
    val inventoryRecordCount: Long get() = accountCount.toLong() * inventoryRecordsPerAccount
    val operatorEntryCount: Long get() = accountCount.toLong() * operatorsPerAccount
    val starEntryCount: Long get() = accountCount.toLong() * starEntriesPerAccount
    val businessObjectCount: Long
        get() = users.toLong() + accountCount + inventoryRecordCount + operatorEntryCount + starEntryCount
}

data class FixtureBatch(
    val accounts: List<Document>,
    val inventoryRecords: List<Document>,
    val operatorCurrents: List<Document>,
    val starStates: List<Document>,
)

/**
 * Deterministic synthetic workload generated in bounded account batches.
 * The stress suite therefore measures Mongo behavior instead of fixture heap growth.
 */
object RealisticFixtureDataset {
    val realistic = FixtureScale(users = 200)
    val stress = FixtureScale(users = 2_000)

    private val epoch = Instant.parse("2026-09-01T00:00:00Z")

    fun forEachBatch(scale: FixtureScale, consume: (FixtureBatch) -> Unit) {
        var firstAccount = 0
        while (firstAccount < scale.accountCount) {
            val end = minOf(scale.accountCount, firstAccount + scale.batchAccounts)
            val accounts = ArrayList<Document>(end - firstAccount)
            val inventory = ArrayList<Document>((end - firstAccount) * scale.inventoryRecordsPerAccount)
            val operators = ArrayList<Document>(end - firstAccount)
            val stars = ArrayList<Document>(end - firstAccount)
            for (globalAccount in firstAccount until end) {
                val userNumber = globalAccount / scale.accountsPerUser + 1
                val accountNumber = globalAccount % scale.accountsPerUser + 1
                val userId = userId(userNumber)
                val accountId = accountId(userNumber, accountNumber)
                accounts += account(userId, accountId, accountNumber)
                repeat(scale.inventoryRecordsPerAccount) { index ->
                    inventory += inventoryRecord(userId, accountId, index)
                }
                operators += operatorCurrent(userId, accountId, accountNumber, scale.operatorsPerAccount)
                stars += starState(userId, accountId, scale.starEntriesPerAccount)
            }
            consume(FixtureBatch(accounts, inventory, operators, stars))
            firstAccount = end
        }
    }

    fun userId(number: Int): String = "fixture_user_${number.toString().padStart(4, '0')}"

    fun accountId(userNumber: Int, accountNumber: Int): String = "${userId(userNumber)}_account_$accountNumber"

    private fun account(userId: String, accountId: String, accountNumber: Int): Document = Document("_id", "mongo_$accountId")
        .append("userId", userId)
        .append("accountId", accountId)
        .append("name", "测试账号$accountNumber")
        .append("game", if (accountNumber % 2 == 0) "代号鸢" else "如鸢")
        .append("createdAt", Date.from(epoch))
        .append("updatedAt", Date.from(epoch))

    private fun inventoryRecord(userId: String, accountId: String, index: Int): Document {
        val dispatch = index % 4 == 0
        val effectiveAt = epoch.plusSeconds((index % 20 * 86_400L) + (index % 24 * 3_600L))
        return Document("recordId", "fixture:${(index + 1).toString().padStart(4, '0')}")
            .append("userId", userId)
            .append("accountId", accountId)
            .append("recordType", "reward_delta")
            .append("entityType", "item")
            .append("acquisitionChannel", if (dispatch) "派遣-洛阳" else "据点情报")
            .append("staminaCost", if (dispatch) 8L + index % 40 else null)
            .append("snapshotScope", null)
            .append("effectiveAt", Date.from(effectiveAt))
            .append("receivedAt", Date.from(effectiveAt.plusSeconds(5)))
            .append("producer", Document("platform", "fixture").append("version", "stress-v1"))
            .append(
                "entries",
                listOf(
                    Document("id", if (index % 2 == 0) "baijinbi" else "niaoshi").append("count", (index % 17 + 1).toLong()),
                    Document("id", "mazi").append("count", (index % 5 + 1).toLong()),
                ),
            )
            .append("stockEffect", "applied")
    }

    private fun operatorCurrent(userId: String, accountId: String, accountNumber: Int, count: Int): Document {
        val entries = Document()
        repeat(count) { index ->
            val number = index + 1
            entries["char_fixture_${number.toString().padStart(3, '0')}"] =
                Document("elite", index % 18)
                    .append("starLevel", index % 32)
                    .append("level", 1 + index % 100)
                    .append("discs", emptyList<Any>())
                    .append(
                        "starStones",
                        listOf(
                            Document("name", "测试主星").append("type", "main1").append("level", index % 60),
                            Document("name", "测试辅星").append("type", "support1").append("level", index % 60),
                        ),
                    )
                    .append("discLoadouts", emptyList<Any>())
                    .append("revision", index.toLong())
                    .append("updatedAt", Date.from(epoch.plusSeconds(index.toLong())))
        }
        return Document("_id", "$userId:$accountId")
            .append("userId", userId)
            .append("accountId", accountId)
            .append("game", if (accountNumber % 2 == 0) "代号鸢" else "如鸢")
            .append("fullBaselineAt", Date.from(epoch))
            .append("entries", entries)
            .append("updatedAt", Date.from(epoch.plusSeconds(3_600)))
    }

    private fun starState(userId: String, accountId: String, count: Int): Document {
        val inventory = (0 until count).map { index ->
            Document("instanceId", "fixture_star_${index + 1}")
                .append("kind", if (index % 4 == 3) "support" else "main")
                .append("name", "测试星石${index + 1}")
                .append("quality", listOf("white", "blue", "purple", "orange")[index % 4])
                .append("level", 1 + index % 60)
        }
        val targets = (0 until count step 3).map { index ->
            Document("instanceId", "fixture_star_${index + 1}").append("targetLevel", 60)
        }
        return Document("_id", "$userId:$accountId")
            .append("userId", userId)
            .append("accountId", accountId)
            .append("generation", 3L)
            .append("revision", 7L)
            .append("inventory", inventory)
            .append("planTargets", targets)
            .append("experience", Document("orange", 4).append("purple", 20).append("white", 80))
            .append("bag", Document("currentCount", count).append("capacity", 200))
            .append("updatedAt", Date.from(epoch.plusSeconds(7_200)))
            .append("loadoutFence", 2L)
    }
}
