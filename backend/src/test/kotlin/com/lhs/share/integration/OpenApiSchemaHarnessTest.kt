package com.lhs.share.integration

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.entity.DevelopmentCriterion
import com.lhs.share.hub.repository.entity.DevelopmentGoal
import com.lhs.share.hub.repository.entity.StarStateBag
import com.lhs.share.hub.repository.entity.StarStateCurrent
import com.lhs.share.hub.repository.entity.StarStateEntry
import com.lhs.share.hub.repository.entity.StarStateExperience
import com.lhs.share.hub.repository.entity.StarStatePlanTarget
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.beta.BetaApiException
import com.lhs.share.hub.service.beta.BetaService
import com.lhs.share.service.jwt.JwtService
import com.lhs.share.testinfra.TestMongo
import com.lhs.share.testinfra.TestRedis
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.http.HttpStatus
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Actual Spring HTTP + actual generated OpenAPI + isolated Mongo/Redis. This
 * deliberately bounded schema-driven harness never accepts a server URL, never
 * follows redirects, and never follows external schema references. */
@Tag("api-schema")
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OpenApiSchemaHarnessTest {
    companion object {
        private val maaDatabase = TestMongo.database("api_maa")
        private val hubDatabase = TestMongo.database("api_hub")

        @DynamicPropertySource
        @JvmStatic
        fun disposableServices(registry: DynamicPropertyRegistry) {
            registry.add("spring.data.mongodb.uri") { TestMongo.uri(maaDatabase) }
            registry.add("share.mongo.hub-uri") { TestMongo.uri(hubDatabase) }
            registry.add("spring.data.redis.host") { TestRedis.host }
            registry.add("spring.data.redis.port") { TestRedis.port }
            registry.add("spring.data.redis.url") { TestRedis.uri }
        }
    }

    @LocalServerPort private var port: Int = 0

    @Autowired private lateinit var mapper: ObjectMapper

    @Autowired private lateinit var jwt: JwtService

    @Autowired
    @Qualifier("hubMongoTemplate")
    private lateinit var mongo: MongoTemplate

    // Beta admission is a separate tested domain. Accounts, their transactions,
    // HTTP validation, security filters, JSON serialization and schema are real.
    @MockitoBean private lateinit var beta: BetaService
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10)).build()
    private lateinit var spec: JsonNode
    private lateinit var owner: String
    private val cases = mutableListOf<Map<String, Any>>()
    private val output = Path.of("build/reports/api-schema")

    @BeforeAll
    fun actualOpenApiAndEntityIndexes() {
        Files.createDirectories(output)
        val response = http.send(
            HttpRequest.newBuilder(local("/v3/api-docs")).timeout(Duration.ofSeconds(45)).GET().build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(200, response.statusCode())
        spec = mapper.readTree(response.body())
        assertTrue(spec.path("openapi").asText().startsWith("3."))
        rejectExternalReferences(spec)
        Files.writeString(output.resolve("openapi.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(spec))
        MongoPersistentEntityIndexResolver(mongo.converter.mappingContext).resolveIndexFor(SubAccount::class.java)
            .forEach { mongo.indexOps(SubAccount::class.java).ensureIndex(it) }
    }

    @BeforeEach
    fun newOwnerPerCaseGroup() {
        owner = "yuanhub_test_api_${UUID.randomUUID()}"
    }

    @AfterAll
    fun evidenceAndCleanup() {
        Files.createDirectories(output)
        Files.writeString(output.resolve("cases.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(cases))
        TestMongo.client().use { client ->
            TestMongo.dropDatabase(client, maaDatabase)
            TestMongo.dropDatabase(client, hubDatabase)
        }
    }

    private fun local(path: String): URI {
        require(path.startsWith("/") && !path.startsWith("//") && !path.contains("://"))
        return URI("http://127.0.0.1:$port$path").also {
            require(it.host == "127.0.0.1" && it.port == port && it.scheme == "http" && it.userInfo == null)
        }
    }

    private fun rejectExternalReferences(node: JsonNode) {
        if (node.isObject) {
            node.get("\$ref")?.let { require(it.asText().startsWith("#/")) { "External schema references are not allowed in local tests" } }
        }
        if (node.isContainerNode) node.elements().forEachRemaining(::rejectExternalReferences)
    }

    private fun dereference(node: JsonNode): JsonNode = node.get("\$ref")?.let { spec.at(it.asText().drop(1)) } ?: node

    private data class Reply(val status: Int, val body: JsonNode)

    private fun call(label: String, method: String, path: String, body: String? = null, user: String? = owner): Reply {
        val builder = HttpRequest.newBuilder(local(path)).timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
        if (user != null) builder.header("Authorization", "Bearer ${jwt.issueAuthToken(user, null, emptyList()).value}")
        builder.method(method, body?.let(HttpRequest.BodyPublishers::ofString) ?: HttpRequest.BodyPublishers.noBody())
        val response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        assertTrue(response.statusCode() < 500, "$label: HTTP ${response.statusCode()} ${response.body()}")
        val json = mapper.readTree(response.body())
        assertTrue(json.isObject, "$label: expected a JSON object response: $json")
        // Successful web responses use ApiResult; InventoryApiException uses
        // an HTTP 4xx domain error object. Keep both actual protocols unchanged.
        val businessStatus = json.get("status_code")?.asInt()
        if (response.statusCode() in
            200..299
        ) {
            assertTrue(businessStatus != null, "$label: successful ApiResult is missing status_code: $json")
        }
        assertTrue(response.statusCode() !in 300..399, "$label: APIs must not redirect this local harness")
        if (businessStatus !=
            null
        ) {
            assertTrue(businessStatus < 500, "$label: internal error encoded inside HTTP ${response.statusCode()}: $json")
        }
        val status = if (response.statusCode() >= 400) response.statusCode() else checkNotNull(businessStatus)
        val resourcePath = path.substringBefore('?')
        val operationPath = when {
            spec.path("paths").has(resourcePath) -> resourcePath
            resourcePath.startsWith("/v1/star/share/view/") -> "/v1/star/share/view/{code}"
            resourcePath.startsWith("/v1/operator/share/view/") -> "/v1/operator/share/view/{shareCode}"
            else -> "/v1/accounts/{accountId}"
        }
        val responses = spec.path("paths").path(operationPath).path(method.lowercase()).path("responses")
        val declared = responses.path(response.statusCode().toString()).path("content").path("application/json").path("schema")
        val documented = !declared.isMissingNode
        if (documented) {
            val schema = declared.deepCopy<ObjectNode>().apply { set<JsonNode>("components", spec.path("components")) }
            val errors = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schema).validate(json)
            assertTrue(errors.isEmpty(), "$label: response violates generated OpenAPI: $errors")
        } else {
            // Missing documentation is recorded separately from a 500/schema mismatch.
            assertTrue(status >= 400, "$label: successful response has no OpenAPI schema")
        }
        cases.add(
            mapOf(
                "case" to label,
                "method" to method,
                "path" to operationPath,
                "http_status" to response.statusCode(),
                "business_status" to status,
                "response_schema_documented" to documented,
            ),
        )
        return Reply(status, json)
    }

    private fun success(reply: Reply): JsonNode {
        assertEquals(200, reply.status, reply.body.toString())
        return reply.body.path("data")
    }

    @Test
    fun `authenticated sharing commands still require beta while anonymous views bypass it`() {
        val accountId = "share_${UUID.randomUUID()}"
        val code = UUID.randomUUID().toString()
        mongo.insert(
            SubAccount(userId = owner, accountId = accountId, name = "beta-sharing", shareToken = code, shareScopes = listOf("star")),
        )
        org.mockito.Mockito.doThrow(BetaApiException(HttpStatus.FORBIDDEN, "beta_access_required", "Not admitted"))
            .`when`(beta).requireAccess(owner)
        val manage = "/v1/accounts/share?account_id=$accountId"
        for ((method, path, body) in listOf(
            Triple("GET", manage, null),
            Triple("PATCH", manage, """{"scope":"star","enabled":false}"""),
            Triple("POST", "/v1/accounts/share/regenerate?account_id=$accountId", null),
            Triple("DELETE", manage, null),
        )) {
            assertEquals(403, call("beta rejects sharing $method", method, path, body).status)
        }
        success(call("public star bypasses beta", "GET", "/v1/star/share/view/$code", user = null))
        org.mockito.Mockito.verify(beta, org.mockito.Mockito.times(4)).requireAccess(owner)
        assertEquals(code, mongo.findOne(Query(Criteria.where("accountId").`is`(accountId)), SubAccount::class.java)!!.shareToken)
    }

    @Test
    fun `account sharing HTTP lifecycle preserves private state ownership and legacy operator scopes`() {
        val account = success(call("create sharing account", "POST", "/v1/accounts", """{"name":"sharing","game":"如鸢"}"""))
        val id = account.path("id").asText()
        val manage = "/v1/accounts/share?account_id=$id"
        val rotate = "/v1/accounts/share/regenerate?account_id=$id"
        assertFalse(success(call("sharing starts disabled", "GET", manage)).path("active").asBoolean())
        val enabled = success(call("enable only star", "PATCH", manage, """{"scope":"star","enabled":true}"""))
        val code = enabled.path("share_code").asText()
        assertEquals(listOf("star"), enabled.path("scopes").map { it.asText() })
        val star = "/v1/star/share/view/$code"
        val operator = "/v1/operator/share/view/$code"
        assertEquals(404, call("operator still private", "GET", operator, user = null).status)
        assertFalse(success(call("missing star document", "GET", star, user = null)).path("has_state").asBoolean())
        val saved = mongo.save(
            StarStateCurrent(
                userId = owner, accountId = id, generation = 1, revision = 2,
                inventory = listOf(
                    StarStateEntry("private-one", "main", "天府", "orange", 10),
                    StarStateEntry("private-two", "main", "天府", "orange", 10),
                ),
                planTargets = listOf(StarStatePlanTarget("private-one", 60)),
                experience = StarStateExperience(orange = 99), bag = StarStateBag(2, 100), updatedAt = Instant.EPOCH,
            ),
        )
        val before = mongo.findById(saved.id!!, StarStateCurrent::class.java)
        val accountBefore = mongo.findOne(Query(Criteria.where("accountId").`is`(id)), SubAccount::class.java)
        repeat(2) {
            val data = success(call("anonymous star read $it", "GET", "$star?account_id=foreign&generation=999", user = null))
            assertEquals(setOf("game", "available_views", "has_state", "updated_at", "inventory"), data.fieldNames().asSequence().toSet())
            assertEquals(2, data.path("inventory").size())
            data.path("inventory").forEach { entry ->
                assertEquals(setOf("kind", "name", "quality", "level"), entry.fieldNames().asSequence().toSet())
            }
        }
        assertEquals(before, mongo.findById(saved.id, StarStateCurrent::class.java))
        assertEquals(accountBefore, mongo.findOne(Query(Criteria.where("accountId").`is`(id)), SubAccount::class.java))
        for ((method, path, body) in listOf(
            Triple("GET", manage, null),
            Triple("PATCH", manage, """{"scope":"operator","enabled":true}"""),
            Triple("POST", rotate, null),
            Triple("DELETE", manage, null),
        )) {
            assertEquals(404, call("foreign sharing $method", method, path, body, owner + "_foreign").status)
        }
        mongo.save(saved.copy(generation = 2, revision = 3, inventory = saved.inventory.map { it.copy(level = 20) }))
        val latest = success(call("same code latest generation", "GET", star, user = null))
        assertEquals(listOf(20, 20), latest.path("inventory").map { it.path("level").asInt() })
        val legacy = "/v1/operator/share?account_id=$id"
        assertEquals(code, success(call("legacy enable operator", "PUT", legacy)).path("share_code").asText())
        assertTrue(success(call("operator now public without tags", "GET", operator, user = null)).path("tags").isEmpty)
        val consent = """{"scope":"operator_tags","enabled":true}"""
        assertEquals(401, call("anonymous tag consent denied", "PATCH", manage, consent, user = null).status)
        assertEquals(404, call("foreign tag consent denied", "PATCH", manage, consent, user = owner + "_foreign").status)
        assertEquals(
            listOf("operator", "operator_tags", "star"),
            success(call("owner enables tag consent", "PATCH", manage, consent)).path("scopes").map { it.asText() },
        )
        assertTrue(success(call("empty shared box hides all tags", "GET", operator, user = null)).path("tags").isEmpty)
        success(call("legacy revoke only operator", "DELETE", legacy))
        assertEquals(listOf("star"), success(call("star scope survives", "GET", manage)).path("scopes").map { it.asText() })
        assertEquals(422, call("tags cannot reopen revoked box", "PATCH", manage, consent).status)
        success(call("star remains public", "GET", star, user = null))
        val newCode = success(call("rotate shared code", "POST", rotate)).path("share_code").asText()
        assertTrue(newCode != code && newCode.isNotBlank())
        assertEquals(404, call("old star code revoked", "GET", star, user = null).status)
        assertEquals(404, call("old operator code revoked", "GET", operator, user = null).status)
        success(call("new star code works", "GET", "/v1/star/share/view/$newCode", user = null))
        success(call("revoke all sharing", "DELETE", manage))
        assertEquals(404, call("new code revoked", "GET", "/v1/star/share/view/$newCode", user = null).status)
        assertFalse(mongo.getCollection("sub_accounts").find(org.bson.Document("accountId", id)).first()!!.containsKey("shareToken"))
        assertEquals(2L, mongo.findById(saved.id, StarStateCurrent::class.java)!!.generation)
    }

    @Test
    fun `public development goals match generated schema and repeated reads never write`() {
        val id = "goal_${UUID.randomUUID()}"
        val goal = DevelopmentGoal(
            id,
            "公开开发目标",
            "独立验收交付",
            "PLANNED",
            listOf(DevelopmentCriterion("验收标准")),
            feedbackIds = listOf("nonpublic_reference"),
            createdAt = Instant.now(),
            updatedAt = Instant.now(),
        )
        mongo.save(goal)
        try {
            val before = mongo.findById(id, DevelopmentGoal::class.java)
            repeat(2) {
                val data = success(call("anonymous development goals $it", "GET", "/v1/development-goals", user = null))
                val item = data.path("data").first { entry -> entry.path("id").asText() == id }
                assertEquals("公开开发目标", item.path("title").asText())
                assertFalse(item.has("feedback_ids"))
                assertTrue(item.path("linked_feedback").isEmpty)
            }
            assertEquals(400, call("invalid development pagination", "GET", "/v1/development-goals?page=invalid", user = null).status)
            assertEquals(before, mongo.findById(id, DevelopmentGoal::class.java))
        } finally {
            mongo.remove(Query(Criteria.where("id").`is`(id)), DevelopmentGoal::class.java)
        }
    }

    @Test
    fun `schema-derived minimum and maximum legal names work and responses match the real schema`() {
        val request = dereference(
            spec.path("paths").path("/v1/accounts").path("post").path("requestBody")
                .path("content").path("application/json").path("schema"),
        )
        val name = request.path("properties").path("name")
        val minimum = name.path("minLength").asInt(-1)
        val maximum = name.path("maxLength").asInt(-1)
        assertTrue(minimum >= 1 && maximum >= minimum && maximum <= 1000, "OpenAPI must expose actual name boundaries")
        for ((index, length) in listOf(minimum, maximum).distinct().withIndex()) {
            val body = mapper.writeValueAsString(mapOf("name" to ('A' + index).toString().repeat(length), "game" to "如鸢"))
            val result = success(call("schema name length $length", "POST", "/v1/accounts", body))
            assertEquals(length, result.path("name").asText().length)
            assertTrue(result.path("id").asText().matches(Regex("acc_[0-9a-f]{32}")))
        }
    }

    @Test
    fun `schema-derived invalid names missing fields malformed bodies and illegal games never write or return 500`() {
        val request = dereference(
            spec.path("paths").path("/v1/accounts").path("post").path("requestBody")
                .path("content").path("application/json").path("schema"),
        )
        val max = request.path("properties").path("name").path("maxLength").asInt()
        val invalid = linkedMapOf(
            "missing required name" to "{}",
            "null name" to "{\"name\":null}",
            "empty name" to "{\"name\":\"\"}",
            "blank name" to "{\"name\":\"   \"}",
            "overlong name" to mapper.writeValueAsString(mapOf("name" to "x".repeat(max + 1))),
            "illegal game" to "{\"name\":\"test\",\"game\":\"unsupported\"}",
            "array instead of request" to "[]",
            "malformed JSON" to "{",
        )
        for ((label, body) in invalid) assertTrue(call(label, "POST", "/v1/accounts", body).status in 400..499)
        assertEquals(0L, mongo.count(Query(Criteria.where("userId").`is`(owner)), SubAccount::class.java))
    }

    @Test
    fun `repeated reads of an empty or populated account list never create or modify accounts`() {
        repeat(3) { assertEquals(0, success(call("empty query $it", "GET", "/v1/accounts")).size()) }
        assertEquals(0L, mongo.count(Query(Criteria.where("userId").`is`(owner)), SubAccount::class.java))
        success(call("explicit create", "POST", "/v1/accounts", "{\"name\":\"owned\"}"))
        val before = mongo.find(Query(Criteria.where("userId").`is`(owner)), SubAccount::class.java)
        repeat(3) { assertEquals(1, success(call("populated query $it", "GET", "/v1/accounts")).size()) }
        assertEquals(before, mongo.find(Query(Criteria.where("userId").`is`(owner)), SubAccount::class.java))
    }

    @Test
    fun `foreign tokens cannot list change or delete the owners canonical account`() {
        val created = success(call("create owner A", "POST", "/v1/accounts", "{\"name\":\"owner-A\",\"game\":\"如鸢\"}"))
        val id = created.path("id").asText()
        // Mongo dates persist millisecond precision; compare persisted reads
        // before/after the attempted cross-owner writes, not an unsaved Instant.
        val persisted = success(call("owner A before isolation checks", "GET", "/v1/accounts")).single()
        val other = owner + "_other"
        assertEquals(0, success(call("owner B list", "GET", "/v1/accounts", user = other)).size())
        assertEquals(404, call("owner B patch A", "PATCH", "/v1/accounts/$id", "{\"name\":\"stolen\"}", other).status)
        assertEquals(404, call("owner B delete A", "DELETE", "/v1/accounts/$id", user = other).status)
        assertEquals(persisted, success(call("owner A still intact", "GET", "/v1/accounts")).single())
        assertTrue(success(call("owner A delete", "DELETE", "/v1/accounts/$id")).asBoolean())
        assertEquals(0, success(call("owner A after delete", "GET", "/v1/accounts")).size())
    }

    @Test
    fun `backend owner-wide unique name remains independent from the local YuanStar game-scoped model`() {
        success(call("first game account", "POST", "/v1/accounts", "{\"name\":\"same-name\",\"game\":\"如鸢\"}"))
        assertEquals(
            409,
            call("same owner same name other game", "POST", "/v1/accounts", "{\"name\":\"same-name\",\"game\":\"代号鸢\"}").status,
        )
        assertEquals(1, success(call("conflict did not duplicate", "GET", "/v1/accounts")).size())
    }

    @Test
    fun `anonymous clients are rejected before querying private accounts`() {
        val response = call("anonymous list", "GET", "/v1/accounts", user = null)
        assertTrue(response.status in setOf(401, 403))
        assertFalse(response.body.has("data"))
    }
}
