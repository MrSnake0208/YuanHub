package com.lhs.share.handler

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.http.HttpMethod
import org.springframework.web.servlet.resource.NoResourceFoundException

class GlobalExceptionHandlerLoggingTest {
    private val handler = GlobalExceptionHandler()
    private val logger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java) as Logger

    @Test
    fun `missing resource logs one-line error normally and stack trace in debug`() {
        val originalLevel = logger.level
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)

        try {
            logger.level = Level.INFO
            handler.handleNoResourceFoundException(missingResourceException())

            assertThat(appender.list).hasSize(1)
            val normalEvent = appender.list.single()
            assertThat(normalEvent.level).isEqualTo(Level.ERROR)
            assertThat(normalEvent.formattedMessage).isEqualTo("请求资源不存在, resource: med_missing.png")
            assertThat(normalEvent.throwableProxy).isNull()

            appender.list.clear()
            logger.level = Level.DEBUG
            handler.handleNoResourceFoundException(missingResourceException())

            assertThat(appender.list).hasSize(2)
            assertThat(appender.list[0].level).isEqualTo(Level.ERROR)
            assertThat(appender.list[0].throwableProxy).isNull()
            assertThat(appender.list[1].level).isEqualTo(Level.DEBUG)
            assertThat(appender.list[1].formattedMessage).isEqualTo("请求资源不存在详细信息")
            assertThat(appender.list[1].throwableProxy).isNotNull()
        } finally {
            logger.detachAppender(appender)
            appender.stop()
            logger.level = originalLevel
        }
    }

    private fun missingResourceException() = NoResourceFoundException(HttpMethod.GET, "med_missing.png")
}
