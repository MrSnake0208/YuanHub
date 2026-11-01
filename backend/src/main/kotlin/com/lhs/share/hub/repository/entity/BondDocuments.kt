package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

data class BondEntry(
    val bondId: String,
    val game: String,
    val members: List<String>,
    val action: String,
    val weather: String,
    val effect: String,
    val status: String = "active",
)

data class BondPublication(
    val catalogVersion: String,
    val game: String,
    val entries: List<BondEntry> = emptyList(),
    val publishedAt: Instant? = null,
    val publishedBy: String? = null,
    val achievementTargets: List<Long> = emptyList(),
)

@Document("bond_catalogs")
data class BondCatalog(
    @Id val game: String,
    val revision: Long = 0,
    val published: BondPublication,
    val draft: List<BondEntry> = emptyList(),
    val identities: List<BondEntry> = emptyList(),
    val history: List<BondPublication> = emptyList(),
    val writeFence: Long = 0,
)

@Document("bond_archives")
@CompoundIndex(name = "bond_owner", def = "{'userId': 1, 'accountId': 1}", unique = true)
data class BondArchive(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val game: String,
    val records: List<BondRecord> = emptyList(),
    @Version val version: Long? = null,
)

data class BondRecord(val bondId: String, val triggered: Boolean, val source: String, val updatedAt: Instant)
