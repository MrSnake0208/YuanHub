package com.lhs.share.openapi

import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.operator.OperatorPanelService
import com.lhs.share.hub.service.operator.OperatorService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class OperatorMatchService(
    private val connections: OperatorMatchConnectionService,
    private val accounts: SubAccountRepository,
    private val operators: OperatorService,
    private val panels: OperatorPanelService,
    private val authorization: AdminAuthorizationService,
    private val starState: StarStateCurrentRepository,
    private val starLoadouts: StarLoadoutCurrentRepository,
) {
    fun accounts(bearer: String?): OperatorMatchAccounts {
        val connection = connections.authenticate(bearer)
        return OperatorMatchAccounts(
            connection.id,
            accounts.findAllByUserIdOrderByCreatedAtAsc(connection.userId).map { OperatorMatchAccount(it.accountId, it.name, it.game) },
        )
    }

    fun roster(bearer: String?, accountId: String): OperatorMatchRoster {
        val connection = connections.authenticate(bearer)
        val userId = connection.userId
        val account = accounts.findByUserIdAndAccountId(userId, accountId)
            ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "子账号不存在")
        val current = operators.current(userId, accountId, account.game).firstOrNull()
        val entries = current?.entries.orEmpty()
        val calculated = if (authorization.hasPermission(userId, AdminPermission.OPERATOR_PANEL_USE) && entries.isNotEmpty()) {
            panels.saved(userId, accountId, entries.keys)
        } else {
            emptyMap()
        }
        val state = starState.findByUserIdAndAccountId(userId, accountId)
        val loadouts = starLoadouts.findByUserIdAndAccountId(userId, accountId)
            ?.takeIf { state != null && it.generation == state.generation }
        val inventory = state?.inventory.orEmpty().associateBy { it.instanceId }
        val equipment = loadouts?.loadouts.orEmpty().associate { it.operatorId to it.slots.asMap() }
        val roster = entries.mapValues { (id, entry) ->
            val huaji = entry.huaji
            val panel = calculated[id]
            val slots = equipment[id].orEmpty()
            fun stars(prefix: String): List<String> = slots.filterKeys { it.startsWith(prefix) }.values
                .mapNotNull { inventory[it]?.name?.takeIf(String::isNotBlank) }
            OperatorMatchEntry(
                owned = huaji?.owned,
                level = entry.level.takeIf { it > 0 },
                elite = entry.elite.takeIf { it >= 0 && entry.level > 0 },
                stars = huaji?.stage?.takeIf { huaji.owned && it in 1..25 }?.let { (it - 1) / 6 + 1 },
                panel = OperatorMatchPanel(
                    status = panel?.status ?: "unavailable",
                    attack = panel?.attack?.takeIf { panel.status == "calculated" },
                    hp = panel?.hp?.takeIf { panel.status == "calculated" },
                    reason = panel?.reason ?: if (panel == null) "panel_permission_required" else null,
                ),
                discs = entry.discLoadouts.map { loadout -> loadout.discs.map { it.otName } },
                mainStars = stars("main"),
                assistStars = stars("support"),
            )
        }
        return OperatorMatchRoster(
            connection.id,
            OperatorMatchAccount(account.accountId, account.name, account.game),
            listOfNotNull(current?.updatedAt, state?.updatedAt, loadouts?.updatedAt).maxOrNull(),
            roster,
        )
    }
}

data class OperatorMatchAccount(val id: String, val name: String, val game: String)
data class OperatorMatchAccounts(val connectionId: String, val accounts: List<OperatorMatchAccount>)
data class OperatorMatchRoster(
    val connectionId: String,
    val account: OperatorMatchAccount,
    val updatedAt: Instant?,
    val operators: Map<String, OperatorMatchEntry>,
    val version: Int = 1,
)
data class OperatorMatchEntry(
    val owned: Boolean?,
    val level: Int?,
    val elite: Int?,
    val stars: Int?,
    val panel: OperatorMatchPanel,
    val discs: List<List<String>>,
    val mainStars: List<String>,
    val assistStars: List<String>,
)
data class OperatorMatchPanel(val status: String, val attack: Long?, val hp: Long?, val reason: String?)
