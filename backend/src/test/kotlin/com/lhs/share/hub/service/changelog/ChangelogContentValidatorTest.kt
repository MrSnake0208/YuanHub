package com.lhs.share.hub.service.changelog

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.Optional

class ChangelogContentValidatorTest {
    private val repository = mockk<MediaAssetRepository>()
    private val mapper = jacksonObjectMapper()
    private val validator = ChangelogContentValidator(mapper, repository)

    @Test
    fun `校验并规范化当前用户上传的图片`() {
        every { repository.findById("med_1") } returns
            Optional.of(
                MediaAsset("med_1", "editor", "shot.webp", "image/webp", 10, "/media/med_1.webp", kind = MediaKind.IMAGE),
            )
        val result = validator.validate(
            mapper.readTree(
                """
                {"type":"doc","content":[
                  {"type":"image","attrs":{"src":"https://example.test/media/med_1.webp","alt":"截图","title":null,"media_id":"med_1"}}
                ]}
                """.trimIndent(),
            ),
            "editor",
            emptySet(),
        )

        assertEquals(setOf("med_1"), result.mediaIds)
        assertEquals("/media/med_1.webp", ((result.body["content"] as List<*>)[0] as Map<*, *>)["attrs"].let { (it as Map<*, *>)["src"] })
    }

    @Test
    fun `拒绝脚本节点和其他用户的新图片`() {
        assertThrows(ChangelogApiException::class.java) {
            validator.validate(mapper.readTree("""{"type":"doc","content":[{"type":"script"}]}"""), "editor", emptySet())
        }
        every { repository.findById("med_2") } returns
            Optional.of(
                MediaAsset("med_2", "other", "shot.png", "image/png", 10, "/media/med_2.png", kind = MediaKind.IMAGE),
            )
        assertThrows(ChangelogApiException::class.java) {
            validator.validate(
                mapper.readTree(
                    """
                    {"type":"doc","content":[
                      {"type":"image","attrs":{"src":"/media/med_2.png","alt":"","title":null,"media_id":"med_2"}}
                    ]}
                    """.trimIndent(),
                ),
                "editor",
                emptySet(),
            )
        }
    }

    @Test
    fun `接受 Tiptap 有序列表并拒绝危险链接和错误嵌套`() {
        validator.validate(
            mapper.readTree(
                """
                {"type":"doc","content":[{"type":"orderedList","attrs":{"start":1,"type":null},"content":[
                  {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"第一项"}]}]}
                ]}]}
                """.trimIndent(),
            ),
            "editor",
            emptySet(),
        )

        assertThrows(ChangelogApiException::class.java) {
            validator.validate(
                mapper.readTree(
                    """
                    {"type":"doc","content":[{"type":"paragraph","content":[
                      {"type":"text","text":"危险","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}
                    ]}]}
                    """.trimIndent(),
                ),
                "editor",
                emptySet(),
            )
        }
        assertThrows(ChangelogApiException::class.java) {
            validator.validate(
                mapper.readTree("""{"type":"doc","content":[{"type":"text","text":"不能直接放在根节点"}]}"""),
                "editor",
                emptySet(),
            )
        }
        assertThrows(ChangelogApiException::class.java) {
            validator.validate(
                mapper.readTree("""{"type":"doc","content":[{"type":"heading","attrs":{"level":"2"}}]}"""),
                "editor",
                emptySet(),
            )
        }
    }
}
