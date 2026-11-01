package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.service.account.SubAccountService
import io.mockk.mockk
import org.springframework.transaction.support.TransactionTemplate

internal object OperatorReserveWorkspaceFixtures {
    const val PLAN = "00000000-0000-4000-8000-000000000001"
    const val DEMAND = "00000000-0000-4000-8000-000000000002"

    fun request(mapper: ObjectMapper, revision: Long = 0): ObjectNode = mapper.readTree(
        """{"schema_version":1,"expected_revision":$revision,"active_plan_id":"$PLAN","plans":[
            {"id":"$PLAN","name":"未来主队","demands":[{"id":"$DEMAND","count":2,"attribute":"阴","profession":"破军",
            "current":{"level":100,"elite":13,"breakthrough_stage":9},"target":{"level":100,"elite":17}}]}]}""",
    ) as ObjectNode

    fun accounts(repository: SubAccountRepository, reserves: OperatorReserveWorkspaceRepository, transactions: TransactionTemplate) =
        SubAccountService(
            repository, mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
            mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
            mockk(relaxed = true), transactions, reserveWorkspaces = reserves,
        )
}
