package com.lhs.share.architecture

import com.lhs.share.config.mongo.HubMongoConfig
import com.lhs.share.config.mongo.MaaMongoConfig
import com.lhs.share.hub.repository.entity.SubAccount
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories
import org.springframework.web.bind.annotation.RestController

@Tag("architecture")
class ArchitectureRulesTest {
    companion object {
        private val classes by lazy {
            ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.lhs.share")
        }
    }

    @Test
    fun `REST controllers do not bypass services and access repositories`() {
        noClasses().that().areAnnotatedWith(RestController::class.java)
            .should().dependOnClassesThat().haveSimpleNameEndingWith("Repository")
            .because("request authentication and orchestration must not bypass service invariants")
            .check(classes)
    }

    @Test
    fun `services and repositories do not depend on REST controller implementations`() {
        noClasses().that().resideInAnyPackage("..service..", "..repository..")
            .should().dependOnClassesThat().areAnnotatedWith(RestController::class.java)
            .because("request and response DTO dependencies are allowed, controller implementation dependencies are not")
            .check(classes)
    }

    @Test
    fun `Hub and Maa repository scans cannot cross datasource boundaries`() {
        val hub = HubMongoConfig::class.java.getAnnotation(EnableMongoRepositories::class.java)
        val maa = MaaMongoConfig::class.java.getAnnotation(EnableMongoRepositories::class.java)
        assertEquals(listOf("com.lhs.share.hub.repository"), hub.basePackages.toList())
        assertEquals("hubMongoTemplate", hub.mongoTemplateRef)
        assertEquals(listOf("com.lhs.share.repository"), maa.basePackages.toList())
        assertEquals("mongoTemplate", maa.mongoTemplateRef)
        assertFalse(hub.basePackages.toSet().intersect(maa.basePackages.toSet()).isNotEmpty())
    }

    @Test
    fun `current backend account-name uniqueness is owner-wide not game-scoped`() {
        val indexes = SubAccount::class.java.getAnnotation(CompoundIndexes::class.java).value
        val nameIndex = indexes.single { it.name == "idx_sub_user_account_name_unique" }
        val keys = org.bson.Document.parse(nameIndex.def)
        assertTrue(nameIndex.unique)
        assertEquals(setOf("userId", "name"), keys.keys)
        assertFalse(keys.containsKey("game"))
        // YuanStar's LOCAL unique name is instead (gameVersion, displayName).
        // This test records existing backend semantics; it does not migrate indexes.
    }
}
