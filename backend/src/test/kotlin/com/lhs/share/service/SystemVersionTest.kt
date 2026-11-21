package com.lhs.share.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.SystemController
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.info.GitProperties
import org.springframework.mock.web.MockHttpServletResponse
import java.util.Properties

class SystemVersionTest {
    @Test
    fun `only the release client receives git metadata and no response is cacheable`() {
        val sha = "a".repeat(40)
        val git = GitProperties(
            Properties().apply {
                setProperty("commit.id", sha)
                setProperty("branch", "main")
            },
        )
        val provider = mockk<ObjectProvider<GitProperties>> { every { getIfAvailable() } returns git }
        val controller = SystemController(ShareProperties(), "release-fixture", provider)
        for (credential in listOf(null, "invalid")) {
            val response = MockHttpServletResponse()
            val public = jacksonObjectMapper().valueToTree<com.fasterxml.jackson.databind.JsonNode>(
                controller.getSystemVersion(credential, response).data,
            )
            for (name in listOf("git", "branch", "backendCommit", "commitTime")) assertFalse(public.has(name))
            assertEquals("private, no-store", response.getHeader("Cache-Control"))
        }
        assertEquals(sha, controller.getSystemVersion("release-fixture", MockHttpServletResponse()).data?.backendCommit)
    }
}
