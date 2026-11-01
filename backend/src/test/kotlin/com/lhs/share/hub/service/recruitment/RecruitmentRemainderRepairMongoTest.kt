package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.testinfra.TestMongo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.concurrent.TimeUnit

@Tag("integration")
class RecruitmentRemainderRepairMongoTest {
    @Test
    fun `reviewed remainder repair preserves history scope and rollback and real launcher works`() {
        val database = TestMongo.database("recr_remain")
        val uri = TestMongo.uri(database)
        assertTrue(TestMongo.isOwnedUri(uri))
        val mapper = jacksonObjectMapper()
        val directory = Path.of("build/test-data/recruitment-remainder-repair").toAbsolutePath()
        Files.createDirectories(directory)
        val script = mapper.writeValueAsString(
            Path.of("scripts/migrations/20261016-recruitment-batch-remainders.mongo-test.js").toAbsolutePath().toString(),
        )
        val plan = mapper.writeValueAsString(directory.resolve("remainder-plan.json").toString())
        val output = directory.resolve("mongo.log")
        fun execute(builder: ProcessBuilder): String {
            val process = builder.redirectErrorStream(true).redirectOutput(output.toFile()).start()
            try {
                assertTrue(process.waitFor(60, TimeUnit.SECONDS), "mongosh timed out; see $output")
                val log = Files.readString(output)
                assertEquals(0, process.exitValue(), log)
                return log
            } finally {
                if (process.isAlive) process.destroyForcibly()
            }
        }
        try {
            val log =
                execute(
                    ProcessBuilder(
                        "mongosh",
                        uri,
                        "--quiet",
                        "--eval",
                        "(async () => { print(await require($script)(db, { Long, EJSON }, $plan)); })()",
                    ),
                )
            assertTrue(log.contains("RECRUITMENT_REMAINDER_MONGO_OK"), log)
            for (name in listOf("20261015-recruitment-duplicate-pools.js", "20261016-recruitment-batch-remainders.run.js")) {
                Files.copy(Path.of("scripts/migrations/$name"), directory.resolve(name), StandardCopyOption.REPLACE_EXISTING)
            }
            for ((action, status) in listOf(
                "dry-run" to "dry_run",
                "apply" to "applied",
                "apply" to "already_applied",
                "rollback" to "rolled_back",
            )) {
                val launcher = ProcessBuilder(
                    "mongosh",
                    uri,
                    "--quiet",
                    "--file",
                    "20261016-recruitment-batch-remainders.run.js",
                ).directory(directory.toFile())
                launcher.environment()["YUANHUB_REPAIR_ACTION"] = action
                launcher.environment()["YUANHUB_REPAIR_REVISION"] = "48"
                val result = mapper.readTree(execute(launcher))
                assertEquals(status, result.path("status").asText())
                if (action == "dry-run") assertEquals(49, result.path("deduction").asInt())
            }
        } finally {
            TestMongo.client().use { TestMongo.dropDatabase(it, database) }
        }
    }
}
