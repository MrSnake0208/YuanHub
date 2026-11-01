package com.lhs.share.hub.service.recruitment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.recruitment.request.RecruitmentCommandRequest
import com.lhs.share.hub.controller.recruitment.response.RecruitmentArchiveResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentBatchResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentCommandResponse
import com.lhs.share.hub.controller.recruitment.response.RecruitmentEventPage
import com.lhs.share.hub.controller.recruitment.response.RecruitmentSummary
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.RecruitmentArchive
import com.lhs.share.hub.repository.entity.RecruitmentRequestRecord
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.util.Base64
import kotlin.math.roundToLong

@Service
class RecruitmentService(
    private val store: RecruitmentRepository,
    private val accountService: SubAccountService,
    private val accounts: SubAccountRepository,
    private val mutation: RecruitmentMutation,
    private val events: AccountEventService,
    private val mapper: ObjectMapper,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun archive(userId: String, accountId: String): RecruitmentArchiveResponse = checkNotNull(
        transactions.execute {
            val account = accountService.requireAccount(userId, accountId)
            val current = store.archive(userId, accountId) ?: empty(userId, accountId, account.game)
            val pools = mutation.projectPools(current.pools, account.game.takeIf { it == current.gameSnapshot })
            val totals = store.totals(userId, accountId)
            val byPool = store.poolTotals(userId, accountId)
            val agentCounts = store.poolAgentCounts(userId, accountId)
            val goldStatistics = mutableMapOf<String, RecruitmentGoldStatistics>()
            val accountGoldStatistics = RecruitmentGoldStatistics()
            val agentStatistics = RecruitmentAgentStatistics(pools, current.temporaryAgents)
            store.statisticEvents(userId, accountId).use { records ->
                records.forEach { record ->
                    goldStatistics.getOrPut(record.poolId) { RecruitmentGoldStatistics() }.add(record)
                    accountGoldStatistics.add(record)
                    agentStatistics.add(record)
                }
            }
            val archivedPools = current.pools.associateBy { it.poolId }
            val upStatistics = pools.filter { pool ->
                !isPermanentRecruitmentPool(pool.mappedSnapshot ?: pool.snapshot) &&
                    listOfNotNull(
                        pool.snapshot,
                        pool.mappedSnapshot,
                        archivedPools[pool.poolId]?.snapshot,
                        archivedPools[pool.poolId]?.mappedSnapshot,
                    )
                        .any { it.upAgents.isNotEmpty() }
            }.associate { it.poolId to (goldStatistics[it.poolId] ?: RecruitmentGoldStatistics()) }
            val progress = current.pools.sumOf { it.progress ?: 0 }
            val unknownProgress = current.pools.count { it.progress == null }
            RecruitmentArchiveResponse(
                accountId, current.gameSnapshot, current.archiveRevision, current.baseline,
                current.currentPoolId, pools, current.temporaryAgents,
                RecruitmentSummary(
                    current.baseline + totals.recordedPulls + totals.batchPulls + progress, totals.recordedPulls, totals.batchPulls,
                    progress, totals.eventCount, totals.exactCount, totals.unknownCount, unknownProgress,
                    totals.unknownCount > 0 || unknownProgress > 0,
                    fourStarCount = totals.fourStarCount,
                    averageGoldPulls = accountGoldStatistics.accountAverageGoldPulls,
                    permanentKnownTotalPulls = pools.filter { isPermanentRecruitmentPool(it.mappedSnapshot ?: it.snapshot) }.sumOf {
                        (byPool[it.poolId]?.recordedPulls ?: 0) + (byPool[it.poolId]?.batchPulls ?: 0) + (it.progress ?: 0)
                    },
                    mostObtainedGoldAgents = agentStatistics.mostObtained,
                    mostNonUpGoldAgents = agentStatistics.mostNonUp,
                    mostPermanentGoldAgents = agentStatistics.mostPermanent,
                ).withUpStatistics(upStatistics.values.toList()),
                current.gameSnapshot != account.game,
                pools.associate { pool ->
                    val count = byPool[pool.poolId]
                    val progress = pool.progress ?: 0
                    pool.poolId to RecruitmentSummary(
                        (count?.recordedPulls ?: 0) + (count?.batchPulls ?: 0) + progress,
                        count?.recordedPulls ?: 0, count?.batchPulls ?: 0, progress, count?.eventCount ?: 0, count?.exactCount ?: 0,
                        count?.unknownCount ?: 0,
                        if (pool.progress ==
                            null
                        ) {
                            1
                        } else {
                            0
                        },
                        (count?.unknownCount ?: 0) > 0 || pool.progress == null,
                        (pool.mappedSnapshot ?: pool.snapshot).upAgents.filter { it.active }.associate { slot ->
                            slot.id to listOfNotNull(slot.id, slot.operatorId).distinct().sumOf { agentId ->
                                agentCounts[pool.poolId]?.get(agentId) ?: 0L
                            }
                        },
                        count?.fourStarCount ?: 0,
                        averageGoldPulls = goldStatistics[pool.poolId]?.averageGoldPulls,
                        smallPityWinRate = goldStatistics[pool.poolId]?.smallPityWinRate,
                    ).withUpStatistics(listOfNotNull(upStatistics[pool.poolId]))
                },
                mutation.poolStates(pools),
            )
        },
    )

    fun page(
        userId: String,
        accountId: String,
        poolId: String?,
        cursor: String?,
        limit: Int,
        dateFrom: LocalDate?,
        dateTo: LocalDate?,
        order: String = "desc",
    ): RecruitmentEventPage = checkNotNull(
        transactions.execute {
            val account = accountService.requireAccount(userId, accountId)
            if (order !in setOf("asc", "desc")) throw recruitmentInvalid("排序只允许asc或desc")
            if (limit !in 1..100 ||
                dateFrom != null && dateTo != null && dateFrom > dateTo
            ) {
                throw recruitmentInvalid("分页数量或日期范围不正确")
            }
            val current = store.archive(userId, accountId)
            if (poolId != null && mutation.projectPools(
                    current?.pools.orEmpty(),
                    account.game.takeIf { current == null || it == current.gameSnapshot },
                ).none { it.poolId == poolId }
            ) {
                throw recruitmentNotFound("pool")
            }
            val revision = current?.archiveRevision ?: 0
            val scope = hash(mapper.valueToTree(listOf(userId, accountId, poolId, dateFrom?.toString(), dateTo?.toString(), order)))
            val after = cursor?.let {
                if (it.length > 2048) throw recruitmentInvalid("分页游标不正确，请重新加载")
                val node = try {
                    mapper.readTree(Base64.getUrlDecoder().decode(it))
                } catch (
                    _: Exception,
                ) {
                    throw recruitmentInvalid("分页游标不正确，请重新加载")
                }
                if (!node.path("order").isIntegralNumber || !node.path("id").isTextual ||
                    node.path("scope").asText() != scope
                ) {
                    throw recruitmentInvalid("分页游标不属于当前账号或筛选，请重新加载")
                }
                if (node.path("revision").asLong(-1) != revision) throw recruitmentConflict("档案已变化，请重新加载第一页")
                node
            }
            val page = store.page(
                userId,
                accountId,
                poolId,
                dateFrom,
                dateTo,
                after?.path("order")?.asLong(),
                after?.path("id")?.asText(),
                limit + 1,
                if (order == "asc") Sort.Direction.ASC else Sort.Direction.DESC,
            )
            val items = page.take(limit)
            val next = if (page.size > limit) {
                items.last().let { last ->
                    val node = mapper.createObjectNode().put(
                        "scope",
                        scope,
                    ).put("revision", revision).put("order", last.sortOrder).put("id", last.eventId)
                    Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(node))
                }
            } else {
                null
            }
            RecruitmentEventPage(mutation.projectEvents(items), next, revision)
        },
    )

    fun batches(userId: String, accountId: String, poolId: String?, cursor: String?, limit: Int): RecruitmentBatchResponse = checkNotNull(
        transactions.execute {
            val account = accountService.requireAccount(userId, accountId)
            if (limit !in 1..100) throw recruitmentInvalid("分页数量须为1至100")
            val archive = store.archive(userId, accountId)
            if (poolId != null && mutation.projectPools(
                    archive?.pools.orEmpty(),
                    account.game.takeIf { archive == null || it == archive.gameSnapshot },
                ).none { it.poolId == poolId }
            ) {
                throw recruitmentNotFound("pool")
            }
            val revision = archive?.archiveRevision ?: 0
            val scope = hash(mapper.valueToTree(listOf("batches", userId, accountId, poolId)))
            val after = cursor?.let {
                if (it.length > 2048) throw recruitmentInvalid("分页游标不正确，请重新加载")
                val node = try {
                    mapper.readTree(Base64.getUrlDecoder().decode(it))
                } catch (
                    _: Exception,
                ) {
                    throw recruitmentInvalid("分页游标不正确，请重新加载")
                }
                if (node.path("scope").asText() != scope || !node.path("id").isTextual ||
                    !node.path("created").isTextual
                ) {
                    throw recruitmentInvalid("分页游标不属于当前账号或筛选，请重新加载")
                }
                if (node.path("revision").asLong(-1) != revision) throw recruitmentConflict("档案已变化，请重新加载第一页")
                node
            }
            val created = after?.path("created")?.asText()?.let {
                try {
                    Instant.parse(it)
                } catch (
                    _: Exception,
                ) {
                    throw recruitmentInvalid("分页游标日期不正确，请重新加载")
                }
            }
            val page = store.batchPage(userId, accountId, poolId, created, after?.path("id")?.asText(), limit + 1)
            val items = page.take(limit)
            val next = if (page.size > limit) {
                items.last().let { last ->
                    val node = mapper.createObjectNode().put(
                        "scope",
                        scope,
                    ).put("revision", revision).put("created", last.createdAt.toString()).put("id", last.batchId)
                    Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(node))
                }
            } else {
                null
            }
            RecruitmentBatchResponse(items, next, revision)
        },
    )

    fun command(userId: String, input: RecruitmentCommandRequest): RecruitmentCommandResponse {
        if (input.expectedRevision < 0 || input.expectedRevision == Long.MAX_VALUE ||
            !ID.matches(input.requestId)
        ) {
            throw recruitmentInvalid("档案版本或请求ID格式不正确")
        }
        val requestHash = hash(mapper.valueToTree(input))
        // Ownership is checked before idempotency so deleted/foreign accounts cannot return old results.
        accountService.requireAccount(userId, input.accountId)
        retry(userId, input.accountId, input.requestId, requestHash)?.let { return it }
        return try {
            checkNotNull(
                transactions.execute {
                    retry(userId, input.accountId, input.requestId, requestHash)?.let { return@execute it }
                    val account = accountService.requireAccount(userId, input.accountId)
                    val existing = store.archive(userId, input.accountId)
                    val current = existing ?: empty(userId, input.accountId, account.game)
                    if (current.gameSnapshot !=
                        account.game
                    ) {
                        throw RecruitmentApiException(
                            HttpStatus.CONFLICT,
                            "recruitment_game_mismatch",
                            "档案所属游戏与账号不一致，当前只能读取和导出",
                        )
                    }
                    if (current.archiveRevision != input.expectedRevision) throw recruitmentConflict()
                    if (!accounts.fenceRecruitmentWrite(
                            userId,
                            input.accountId,
                            account.game,
                        )
                    ) {
                        throw recruitmentConflict("账号已变化或删除，请重新读取账号列表")
                    }
                    val now = Instant.now()
                    val changed = mutation.apply(current, input.operation, input.data, now)
                    if (!store.saveArchive(changed.archive, existing != null)) throw recruitmentConflict()
                    val result = changed.response
                    store.insertRequest(
                        RecruitmentRequestRecord(
                            "$userId:${input.accountId}:${input.requestId}", userId, input.accountId, input.requestId, requestHash,
                            result.archiveRevision, result.eventIds, result.poolId, result.agentId, result.batchId, now,
                        ),
                    )
                    events.publishChange(
                        userId,
                        input.accountId,
                        "recruitment_changed",
                        mapOf("archive_revision" to result.archiveRevision),
                    )
                    result
                },
            )
        } catch (error: RuntimeException) {
            if (!isWriteConflict(error)) throw error
            // Handles a committed request whose response/commit acknowledgement was lost.
            retry(userId, input.accountId, input.requestId, requestHash) ?: throw recruitmentConflict()
        }
    }

    internal fun retry(userId: String, accountId: String, requestId: String, requestHash: String): RecruitmentCommandResponse? {
        val previous = store.request(userId, accountId, requestId) ?: return null
        if (previous.requestHash !=
            requestHash
        ) {
            throw RecruitmentApiException(
                HttpStatus.CONFLICT,
                "recruitment_request_conflict",
                "该请求ID已用于其他内容，请用新的请求ID重试",
            )
        }
        return RecruitmentCommandResponse(previous.archiveRevision, previous.eventIds, previous.poolId, previous.agentId, previous.batchId)
    }

    internal fun hash(node: JsonNode): String {
        fun canonical(value: JsonNode): JsonNode = when {
            value.isObject -> mapper.createObjectNode().also { target ->
                value.fieldNames().asSequence().sorted().forEach { target.set<JsonNode>(it, canonical(value.path(it))) }
            }
            value.isArray -> mapper.createArrayNode().also { target -> value.forEach { target.add(canonical(it)) } }
            else -> value
        }
        return MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical(node))).joinToString("") { "%02x".format(it) }
    }

    internal fun empty(userId: String, accountId: String, game: String) = RecruitmentArchive("$userId:$accountId", userId, accountId, game)

    companion object {
        private val ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
        internal fun isWriteConflict(error: Throwable): Boolean = generateSequence(error) { it.cause }.any {
            it is DuplicateKeyException || it is com.mongodb.MongoException && (
                it.code in setOf(11000, 112, 251) ||
                    it.hasErrorLabel("TransientTransactionError") || it.hasErrorLabel("UnknownTransactionCommitResult")
                )
        }
    }
}

private fun RecruitmentSummary.withUpStatistics(statistics: List<RecruitmentGoldStatistics>): RecruitmentSummary {
    if (statistics.isEmpty()) return copy(smallPityWinRate = null, pityStatus = "not_applicable")
    val up = statistics.sumOf { it.upGoldCount }
    val known = statistics.sumOf { it.knownUpGoldCount }
    val unknown = statistics.sumOf { it.unknownUpGoldCount }
    val validPity = statistics.all { it.guaranteedGoldCount != null }
    return copy(
        upGoldCount = up,
        knownUpGoldCount = known,
        unknownUpGoldCount = unknown,
        totalUpRate = if (known == 0L) null else (up.toDouble() / known * 1000).roundToLong() / 10.0,
        guaranteedGoldCount = if (validPity) statistics.sumOf { checkNotNull(it.guaranteedGoldCount) } else null,
        pityHistoryAssumption = statistics.first().pityHistoryAssumption,
        pityStatus = when {
            !validPity -> "insufficient_history"
            known + unknown == 0L -> "no_samples"
            else -> "inferred"
        },
    )
}
