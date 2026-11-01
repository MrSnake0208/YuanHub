package com.lhs.share.hub.repository.entity

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_catalog")
@CompoundIndex(name = "idx_op_catalog_id_unique", def = "{'operatorId': 1}", unique = true)
data class OperatorCatalogEntity(
    // Mongo 内部 _id，不应作为业务 id 暴露给客户端（前端契约里 id 即密探 id）。
    @JsonIgnore @Id val id: String? = null,
    // 序列化为 id，与目录契约 { id, name, ... } 一致；否则客户端会误用 Mongo _id。
    @JsonProperty("id") val operatorId: String,
    val name: String,
    val alias: String? = null,
    val rarity: Int,
    // 第三项奇闻的管理员维护展示名称；上限和 oddity schema 均由服务端按 rarity 派生。
    val specialOddityName: String? = null,
    val prof: List<String>,
    val subProf: List<String>,
    val games: List<String>,
    val discs: List<OperatorDiscCatalog>,
    val starStones: List<OperatorStarStoneCatalog>,
    // SP 形态的"本体"密探 id（如 史子眇·赴烛 -> 史子眇）；普通密探为 null。
    val spOf: String? = null,
    // 密探头像 webp 相对路径（如 "/avatar/char_001_yangxiu.webp"）；未上传为 null。
    // 只能经管理员上传/删除头像接口写入，非自由文本字段。
    val avatar: String? = null,
    val catalogVersion: String,
    val createdAt: Instant = Instant.now(),
)

data class OperatorDiscCatalog(val otName: String, val abbreviation: String? = null, val color: String? = null, val desp: String? = null)
data class OperatorStarStoneCatalog(val name: String, val type: String)
