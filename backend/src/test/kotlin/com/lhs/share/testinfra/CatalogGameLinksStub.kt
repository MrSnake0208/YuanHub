package com.lhs.share.testinfra

import com.lhs.share.hub.service.operator.CatalogGameLinkService
import io.mockk.every
import io.mockk.mockk

// Existing catalog fixtures have no version associations; dedicated sync tests use the real service.
fun catalogGameLinksStub(): CatalogGameLinkService = mockk<CatalogGameLinkService>(relaxed = true).also {
    every { it.supportedIds(any()) } returns mockk<Set<String>> { every { containsAll(any()) } returns true }
    every { it.available(any(), any()) } returns true
    every { it.errors(any(), any()) } returns emptyList()
}
