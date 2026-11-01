package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.operator.response.OperatorMilestoneItem
import com.lhs.share.hub.controller.operator.response.OperatorMilestoneResponse
import com.lhs.share.hub.repository.OperatorMilestoneRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorMilestones
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class OperatorMilestoneService(
    private val accounts: SubAccountRepository,
    private val catalog: OperatorCatalogService,
    private val repository: OperatorMilestoneRepository,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun get(user: String, account: String, game: String, operator: String): OperatorMilestoneResponse {
        val subject = subject(user, account, game, operator)
        return response(user, account, game, operator, subject, repository.find(user, account, game, operator))
    }

    fun put(user: String, account: String, game: String, operator: String, body: JsonNode): OperatorMilestoneResponse {
        val subject = subject(user, account, game, operator)
        if (!body.isObject || body.fieldNames().asSequence().toSet() != setOf("expected_revision", "dates")) invalid("请提供日期与记录版本")
        val revision = body.path("expected_revision")
        if (!revision.isIntegralNumber || !revision.canConvertToLong() || revision.asLong() < 0 || revision.asLong() == Long.MAX_VALUE) {
            invalid("记录版本无效")
        }
        val values = body.path("dates")
        val keys = keys(subject)
        if (!values.isObject || values.fieldNames().asSequence().any { it !in keys }) invalid("不支持的化极阶段")
        val today = LocalDate.now(clock.withZone(ZoneId.of("Asia/Shanghai")))
        val dates = linkedMapOf<String, String>()
        for (key in keys) {
            val value = values.get(key) ?: continue
            if (value.isNull) continue
            if (!value.isTextual || !Regex("""\d{4}-\d{2}-\d{2}""").matches(value.asText())) invalid("日期须为 YYYY-MM-DD")
            val date = runCatching { LocalDate.parse(value.asText()) }.getOrElse { invalid("日期不存在") }
            if (date.year < 1 || date > today) invalid("日期不能晚于今天")
            if (dates.values.lastOrNull()?.let { it > value.asText() } == true) invalid("后续星级日期不能早于前一阶段")
            dates[key] = value.asText()
        }
        val saved = try {
            transaction.execute {
                subject(user, account, game, operator)
                if (!accounts.fenceRecruitmentWrite(user, account, game)) conflict()
                repository.replace(user, account, game, operator, revision.asLong(), dates) ?: conflict()
            }!!
        } catch (error: RuntimeException) {
            if (error is DuplicateKeyException || RecruitmentService.isWriteConflict(error)) conflict()
            throw error
        }
        return response(user, account, game, operator, subject, saved)
    }

    private fun subject(user: String, account: String, game: String, operator: String): OperatorCatalogEntity {
        val owner = accounts.findByUserIdAndAccountId(user, account)
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "账号不存在")
        if (owner.game != game) invalid("游戏版本与账号不一致")
        return catalog.getOperator(operator)?.takeIf { game in it.games }
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "operator_not_found", "密探不存在")
    }

    private fun keys(subject: OperatorCatalogEntity): List<String> =
        (1..(1 + (OperatorHuajiRules.maximum(subject) - 1) / 6)).map { "star_$it" } +
            if (OperatorHuajiRules.awakeningSupported(subject)) listOf("awakening") else emptyList()

    private fun response(
        user: String,
        account: String,
        game: String,
        operator: String,
        subject: OperatorCatalogEntity,
        saved: OperatorMilestones?,
    ) = OperatorMilestoneResponse(
        account,
        game,
        operator,
        saved?.revision ?: 0,
        keys(subject).map { key ->
            OperatorMilestoneItem(key, saved?.dates?.get(key), repository.observedAt(user, account, game, operator, key))
        },
    )

    private fun invalid(message: String): Nothing = throw OperatorApiException(HttpStatus.BAD_REQUEST, "invalid_milestone", message)
    private fun conflict(): Nothing = throw OperatorApiException(HttpStatus.CONFLICT, "milestone_revision_conflict", "记录已变化，请重新读取后保存")
}
