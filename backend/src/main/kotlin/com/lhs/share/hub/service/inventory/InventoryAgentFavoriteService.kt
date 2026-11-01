package com.lhs.share.hub.service.inventory

import com.lhs.share.hub.controller.inventory.response.InventoryAgentFavoriteListResponse
import com.lhs.share.hub.controller.inventory.response.InventoryAgentFavoriteResponse
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.entity.InventoryAgentFavorite
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.mongodb.MongoException
import org.springframework.dao.DataAccessException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
class InventoryAgentFavoriteService(
    private val repository: InventoryAgentFavoriteRepository,
    private val accountService: SubAccountService,
    private val catalogService: EntityCatalogService,
    private val transactionTemplate: TransactionTemplate,
    private val accountEvents: AccountEventService? = null,
) {
    fun list(userId: String, accountId: String): InventoryAgentFavoriteListResponse {
        accountService.requireAccount(userId, accountId)
        return InventoryAgentFavoriteListResponse(
            accountId = accountId,
            agentIds = repository.findAllByUserIdAndAccountIdOrderByAgentIdAsc(userId, accountId)
                .map { it.agentId }
                .distinct()
                .sorted(),
        )
    }

    fun add(userId: String, accountId: String, agentId: String): InventoryAgentFavoriteResponse {
        validate(userId, accountId, agentId)
        val response = InventoryAgentFavoriteResponse(accountId, agentId, favorite = true)
        if (repository.existsByUserIdAndAccountIdAndAgentId(userId, accountId, agentId)) return response

        repeat(MAX_TRANSACTION_ATTEMPTS) { attempt ->
            try {
                transactionTemplate.executeWithoutResult {
                    repository.save(
                        InventoryAgentFavorite(
                            userId = userId,
                            accountId = accountId,
                            agentId = agentId,
                        ),
                    )
                }
                accountEvents?.publishChange(userId, accountId, "operator_favorites")
                return response
            } catch (_: DuplicateKeyException) {
                return response
            } catch (exception: DataAccessException) {
                if (!exception.isTransientMongoTransactionError()) throw exception
                if (repository.existsByUserIdAndAccountIdAndAgentId(userId, accountId, agentId)) return response
                if (attempt == MAX_TRANSACTION_ATTEMPTS - 1) throw exception
            }
        }
        error("Unreachable")
    }

    fun remove(userId: String, accountId: String, agentId: String): InventoryAgentFavoriteResponse {
        validate(userId, accountId, agentId, requireCatalog = false)
        transactionTemplate.executeWithoutResult {
            repository.deleteByUserIdAndAccountIdAndAgentId(userId, accountId, agentId)
        }
        accountEvents?.publishChange(userId, accountId, "operator_favorites")
        return InventoryAgentFavoriteResponse(accountId, agentId, favorite = false)
    }

    private fun validate(userId: String, accountId: String, agentId: String, requireCatalog: Boolean = true) {
        accountService.requireAccount(userId, accountId)
        if (!AGENT_ID.matches(agentId)) {
            throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_agent_id",
                "Invalid agent id: $agentId",
                entryId = agentId,
            )
        }
        if (requireCatalog && !catalogService.exists("agent", agentId)) {
            throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "unknown_agent",
                "Unknown agent id: $agentId",
                entryId = agentId,
            )
        }
    }

    private fun Throwable.isTransientMongoTransactionError(): Boolean = generateSequence(this) { it.cause }
        .filterIsInstance<MongoException>()
        .any { it.code == WRITE_CONFLICT_CODE || it.hasErrorLabel(TRANSIENT_TRANSACTION_ERROR_LABEL) }

    companion object {
        private const val MAX_TRANSACTION_ATTEMPTS = 5
        private const val WRITE_CONFLICT_CODE = 112
        private const val TRANSIENT_TRANSACTION_ERROR_LABEL = "TransientTransactionError"
        private val AGENT_ID = Regex("^char_[0-9]+_[a-z0-9_]+$")
    }
}
