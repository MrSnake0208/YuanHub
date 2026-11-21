package com.lhs.share.integration

import com.lhs.share.openapi.OpenApiTokenCipher
import com.lhs.share.testinfra.TestMongo
import org.bson.Document
import org.bson.types.ObjectId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.util.Base64
import java.util.concurrent.TimeUnit

/** Manual migration verification requires the same mongosh CLI used by operators. */
@Tag("integration")
class OpenApiCredentialMigrationTest {
    @Test
    fun `mongosh migrates owned fixture once and the Kotlin service decrypts it`() {
        val database = TestMongo.database("tokenmigrate")
        val key = Base64.getEncoder().encodeToString(ByteArray(32) { it.toByte() })
        val cipher = OpenApiTokenCipher(key)
        TestMongo.client().use { client ->
            try {
                val rows = client.getDatabase(database).getCollection("open_api_token")
                val id = ObjectId()
                val code = "synthetic-legacy-credential"
                rows.insertOne(Document("_id", id).append("userId", "u").append("token", code))
                fun migrate(apply: Boolean, encodedKey: String = key): Int {
                    val script = Path.of("scripts/migrations/20261121-openapi-credentials.js").toAbsolutePath()
                    val builder = ProcessBuilder("mongosh", "--norc", "--quiet", TestMongo.uri(database), "--file", script.toString())
                    builder.environment().putAll(
                        mapOf(
                            "YUANHUB_CREDENTIAL_DATABASE" to database,
                            "YUANHUB_OPENAPI_STORAGE_KEY" to encodedKey,
                            "YUANHUB_APPLY_CREDENTIAL_MIGRATION" to if (apply) "yes" else "no",
                        ),
                    )
                    val process = builder.redirectErrorStream(true).start()
                    try {
                        assertTrue(process.waitFor(30, TimeUnit.SECONDS))
                        val output = process.inputStream.bufferedReader().readText()
                        assertTrue(code !in output && encodedKey !in output)
                        if (encodedKey == key) assertEquals(0, process.exitValue(), output)
                        return process.exitValue()
                    } finally {
                        process.destroyForcibly()
                    }
                }
                migrate(false)
                assertEquals(code, rows.find().first()!!.getString("token"))
                migrate(true)
                val migrated = rows.find().first()!!
                assertEquals(OpenApiTokenCipher.digest(code), migrated.getString("token"))
                assertEquals(code, cipher.decrypt(migrated.getString("encryptedSecret"), id.toHexString(), "u"))
                migrate(true)
                assertEquals(migrated, rows.find().first())
                assertNotEquals(0, migrate(true, Base64.getEncoder().encodeToString(ByteArray(32))))
            } finally {
                TestMongo.dropDatabase(client, database)
            }
        }
    }
}
