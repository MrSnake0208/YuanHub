package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorReserveWorkspace
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.recruitment.RecruitmentService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant

@Service
class OperatorReserveWorkspaceService(
    private val accounts: SubAccountService,
    private val accountRepository: SubAccountRepository,
    private val workspaces: OperatorReserveWorkspaceRepository,
    private val validator: OperatorReserveWorkspaceValidator,
    private val mapper: ObjectMapper,
    private val events: AccountEventService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun workspace(userId: String, accountId: String): ObjectNode {
        val account = accounts.requireAccount(userId, accountId)
        return workspaces.findByUserIdAndAccountId(userId, accountId)?.let { response(it, account.game) }
            ?: mapper.createObjectNode().put("schema_version", 1).put("account_id", accountId)
                .put("game_snapshot", account.game).put("read_only", false).put("revision", 0)
                .putNull("updated_at").putNull("active_plan_id").also { it.putArray("plans") }
    }

    fun putWorkspace(userId: String, accountId: String, request: ObjectNode): ObjectNode {
        accounts.requireAccount(userId, accountId)
        val content = validator.workspace(request)
        val result = try {
            checkNotNull(
                transactions.execute {
                    val account = accounts.requireAccount(userId, accountId)
                    if (!accountRepository.fenceRecruitmentWrite(userId, accountId, account.game)) conflict()
                    val previous = workspaces.findByUserIdAndAccountId(userId, accountId)
                    if (previous != null && previous.gameSnapshot != account.game) {
                        throw OperatorApiException(HttpStatus.CONFLICT, "reserve_workspace_game_changed", "旧游戏方案仅可查看，请新建对应游戏账号继续")
                    }
                    val saved =
                        workspaces.replace(userId, accountId, account.game, validator.revision(request), content.toString(), Instant.now())
                            ?: conflict()
                    events.publishChange(userId, accountId, "operator_reserve_workspace", mapOf("revision" to saved.revision))
                    response(saved, account.game)
                },
            )
        } catch (_: DuplicateKeyException) {
            conflict()
        } catch (error: RuntimeException) {
            if (RecruitmentService.isWriteConflict(error)) conflict()
            throw error
        }
        return result
    }

    private fun response(document: OperatorReserveWorkspace, game: String): ObjectNode =
        (mapper.readTree(document.payloadJson) as ObjectNode).put("account_id", document.accountId)
            .put("game_snapshot", document.gameSnapshot).put("read_only", document.gameSnapshot != game)
            .put("revision", document.revision).put("updated_at", document.updatedAt.toString())

    private fun conflict(): Nothing = throw OperatorApiException(HttpStatus.CONFLICT, "reserve_workspace_revision_conflict", "方案已更新，请先读回比较")
}
