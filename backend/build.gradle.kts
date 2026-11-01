import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jlleitschuh.gradle.ktlint.reporter.ReporterType

plugins {
    java
    id("org.springframework.boot") version "3.5.3"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.gorylenko.gradle-git-properties") version "2.5.2"

    val ktVersion = "2.2.0"
    kotlin("jvm") version ktVersion
    kotlin("plugin.spring") version ktVersion
    kotlin("kapt") version ktVersion

    id("org.jlleitschuh.gradle.ktlint") version "13.0.0"
    id("info.solidsoft.pitest") version "1.19.0"
}

group = "com.lhs"
version = "0.1.0-SNAPSHOT"

springBoot {
    mainClass.set("com.lhs.share.ShareApplicationKt")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
        jvmTarget = JvmTarget.JVM_21
    }
}

kapt {
    keepJavacAnnotationProcessors = true
}

repositories {
    maven(url = "https://maven.aliyun.com/repository/public")
    maven(url = "https://maven.aliyun.com/repository/spring")
    maven(url = "https://maven.aliyun.com/repository/spring-plugin")
    maven(url = "https://maven.aliyun.com/repository/gradle-plugin")
    mavenCentral()
}

// Stay on Testcontainers 1.x for Boot 3.5; 1.21.4 includes the Docker 29 API fix.
extra["testcontainers.version"] = "1.21.4"

dependencies {
    val hutoolVersion = "5.8.39"
    val mapstructVersion = "1.6.3"

    kapt("org.springframework.boot:spring-boot-configuration-processor")

    testImplementation("io.mockk:mockk:1.14.4")
    testImplementation("org.testcontainers:junit-jupiter:1.21.4")
    testImplementation("org.testcontainers:mongodb:1.21.4")
    testImplementation("org.testcontainers:testcontainers:1.21.4")
    testImplementation("com.tngtech.archunit:archunit:1.4.1")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    implementation("com.networknt:json-schema-validator:1.5.8")

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-data-mongodb")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-cache")

    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.9")
    implementation("com.github.therapi:therapi-runtime-javadoc:0.15.0")
    kapt("com.github.therapi:therapi-runtime-javadoc-scribe:0.15.0")

    // kotlin
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test")

    // kotlin-logging
    implementation("io.github.oshai:kotlin-logging-jvm:7.0.7")

    // hutool
    implementation("cn.hutool:hutool-jwt:$hutoolVersion")
    implementation("cn.hutool:hutool-extra:$hutoolVersion")
    // Hutool 5.x mail uses the legacy javax.mail namespace at runtime.
    // Spring Boot 3 no longer brings JavaMail onto the classpath implicitly.
    implementation("com.sun.mail:javax.mail:1.6.2")

    // mapstruct
    implementation("org.mapstruct:mapstruct:$mapstructVersion")
    kapt("org.mapstruct:mapstruct-processor:$mapstructVersion")

    // caffeine 进程内缓存
    implementation("com.github.ben-manes.caffeine:caffeine:3.2.2")

    // freemarker 邮件模板
    implementation("org.freemarker:freemarker:2.3.34")

    // commons-lang3
    implementation("org.apache.commons:commons-lang3:3.17.0")

    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
}

tasks.test {
    useJUnitPlatform { excludeTags("integration", "architecture", "api-schema", "realistic", "stress") }
}

// These properties belong to test JVMs, never the application or a developer's
// live services. Full-context tests additionally validate them before bean creation.
val safeTestProperties = mapOf(
    "spring.profiles.active" to "test",
    "spring.config.location" to "classpath:/application.yml,classpath:/application-test.yml",
    "spring.config.import" to "",
    "spring.data.mongodb.uri" to "mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
    "share.mongo.hub-uri" to "mongodb://127.0.0.1:1/yuanhub_test_unit_hub?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
    "spring.data.mongodb.auto-index-creation" to "false",
    "spring.data.redis.host" to "127.0.0.1",
    "spring.data.redis.port" to "1",
    "spring.data.redis.url" to "redis://127.0.0.1:1",
    "debug.email.no-send" to "true",
    "server.address" to "127.0.0.1",
    "share.info.public-base-url" to "http://127.0.0.1",
    "share.avatar.dir" to layout.buildDirectory.dir("test-data/avatars").get().asFile.absolutePath,
    "share.media.dir" to layout.buildDirectory.dir("test-data/media").get().asFile.absolutePath,
    "share.media.private-dir" to layout.buildDirectory.dir("test-data/private").get().asFile.absolutePath,
    "share.star-capture.dir" to layout.buildDirectory.dir("test-data/star-captures").get().asFile.absolutePath,
    "logging.file.name" to layout.buildDirectory.file("test-logs/spring.log").get().asFile.absolutePath,
)

tasks.withType<Test>().configureEach {
    systemProperties(safeTestProperties)
    environment = environment.filterKeys { key ->
        !key.startsWith("SPRING_") && !key.startsWith("SHARE_") && !key.startsWith("YUANHUB_BETA_") &&
            key !in setOf("PLANNER_TEST_MONGO_URI", "BETA_TEST_MONGO_URI", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS")
    }
    environment("TESTCONTAINERS_RYUK_DISABLED", "false")
    environment("TESTCONTAINERS_REUSE_ENABLE", "false")
    maxParallelForks = 1
    maxHeapSize = "1g"
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

fun isolatedSuite(taskName: String, tag: String) = tasks.register<Test>(taskName) {
    group = "verification"
    description = "Local isolated $tag tests; missing infrastructure is a failure, not a skip."
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform { includeTags(tag) }
    outputs.upToDateWhen { false }
    shouldRunAfter(tasks.test)
}
val integrationTest = isolatedSuite("integrationTest", "integration")
val realisticTest = isolatedSuite("realisticTest", "realistic")
val stressTest = isolatedSuite("stressTest", "stress").also { provider ->
    provider.configure {
        description = "Large disposable dataset: 2000 users x 2 accounts with inventory/operator/star history."
        maxHeapSize = "2g"
    }
}
val architectureTest = isolatedSuite("architectureTest", "architecture")
val apiSchemaTest = isolatedSuite("apiSchemaTest", "api-schema")
tasks.check { dependsOn(integrationTest, realisticTest, architectureTest, apiSchemaTest) }

pitest {
    pitestVersion.set("1.19.6")
    junit5PluginVersion.set("1.2.3")
    threads.set(2)
    targetClasses.set(
        providers.gradleProperty("pitTargetClasses").map { it.split(",").toSet() }.orElse(
            setOf(
                "com.lhs.share.hub.service.account.SubAccountService",
                "com.lhs.share.hub.service.operator.OperatorRequirementRules",
                "com.lhs.share.hub.service.operator.OperatorPlannerValidator",
            ),
        ),
    )
    targetTests.set(
        providers.gradleProperty("pitTargetTests").map { it.split(",").toSet() }.orElse(
            setOf(
                "com.lhs.share.hub.service.account.SubAccountServiceTest",
                "com.lhs.share.hub.service.operator.OperatorRequirementRulesTest",
                "com.lhs.share.hub.service.operator.OperatorPlannerServiceTest",
                "com.lhs.share.hub.service.operator.OperatorCoreInvariantTest",
            ),
        ),
    )
    // Exact top-level targets deliberately omit nested Kotlin data classes,
    // Spring wiring, coroutine state machines and generated accessor contracts.
    excludedMethods.set(setOf("component*", "copy*", "equals", "hashCode", "toString"))
    outputFormats.set(setOf("XML", "HTML"))
    timestampedReports.set(false)
    failWhenNoMutations.set(true)
    timeoutConstInMillis.set(5000)
    // PIT serializes JVM arguments as a comma-separated CLI value. Use the
    // single safe profile resource, not a comma-containing config-location list.
    jvmArgs.set(
        (safeTestProperties + ("spring.config.location" to "classpath:/application-test.yml")).map { (key, value) ->
            "-D$key=$value"
        },
    )
}

gitProperties {
    failOnNoGitDirectory = false
    keys = listOf("git.branch", "git.commit.id", "git.commit.id.abbrev", "git.commit.time")
}

ktlint {
    ignoreFailures = false
    baseline.set(
        file(
            if (providers.gradleProperty("strictKtlint").orNull ==
                "true"
            ) {
                "config/ktlint/empty-baseline.xml"
            } else {
                "config/ktlint/baseline.xml"
            },
        ),
    )
    filter {
        val selected = providers.gradleProperty("ktlintFiles").orNull?.split(",")?.toSet()
        // Exclusions override ktlint's default **/*.kt includes; another include
        // would be OR-ed with those defaults and accidentally format all sources.
        if (selected !=
            null
        ) {
            exclude { element -> !element.isDirectory && element.file.relativeTo(projectDir).invariantSeparatorsPath !in selected }
        }
    }

    reporters {
        reporter(ReporterType.PLAIN)
    }
}
