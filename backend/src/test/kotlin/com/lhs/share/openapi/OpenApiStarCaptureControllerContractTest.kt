package com.lhs.share.openapi

import com.lhs.share.hub.service.star.StarCaptureFinalizeResult
import com.lhs.share.hub.service.star.StarCaptureImageUploadResponse
import com.lhs.share.hub.service.star.StarCaptureMissingImagesResponse
import com.lhs.share.hub.service.star.StarCaptureTransportService
import com.lhs.share.hub.service.star.StarCaptureUploadResponse
import com.lhs.share.hub.service.star.StarCaptureUploadSessionResponse
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockMultipartFile
import java.time.Instant

class OpenApiStarCaptureControllerContractTest {
    private val tokenService = mockk<OpenApiTokenService>()
    private val captureService = mockk<StarCaptureTransportService>()
    private val controller = OpenApiStarCaptureController(tokenService, captureService)

    @Test
    fun `init image and finalize all use the dedicated scope and token bound account`() {
        val file = MockMultipartFile("file", "main-000.png", "image/png", byteArrayOf(1))
        every { tokenService.validateAuthorization("Bearer star", OpenApiPermission.STAR_CAPTURE_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { captureService.initUpload("u1", "acc1", "{}") } returns StarCaptureUploadSessionResponse("capture", 1)
        every { captureService.uploadImage("u1", "acc1", "capture", "image", file) } returns
            StarCaptureImageUploadResponse("capture", "image")
        every { captureService.finalizeUpload("u1", "acc1", "capture") } returns
            StarCaptureFinalizeResult(StarCaptureUploadResponse("capture", "full", 1, Instant.EPOCH))
        assertEquals("capture", controller.initUpload("Bearer star", "{}").data!!.captureId)
        assertEquals("image", controller.uploadImage("Bearer star", "capture", "image", file).data!!.sourceImageId)
        val finalized = controller.finalizeUpload("Bearer star", "capture")
        assertEquals(200, finalized.statusCode.value())
        assertEquals("capture", (finalized.body!!.data as StarCaptureUploadResponse).captureId)
        verify(exactly = 3) { tokenService.validateAuthorization("Bearer star", OpenApiPermission.STAR_CAPTURE_WRITE) }
        verify { captureService.initUpload("u1", "acc1", "{}") }
        verify { captureService.uploadImage("u1", "acc1", "capture", "image", file) }
        verify { captureService.finalizeUpload("u1", "acc1", "capture") }
    }

    @Test
    fun `missing images are a transport failure with explicit ids`() {
        every { tokenService.validateAuthorization("Bearer star", OpenApiPermission.STAR_CAPTURE_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { captureService.finalizeUpload("u1", "acc1", "capture") } returns
            StarCaptureFinalizeResult(missingSourceImageIds = listOf("image-2"))
        val result = controller.finalizeUpload("Bearer star", "capture")
        assertEquals(409, result.statusCode.value())
        assertEquals(409, result.body!!.statusCode)
        assertEquals(listOf("image-2"), (result.body!!.data as StarCaptureMissingImagesResponse).missingSourceImageIds)
    }

    @Test
    fun `invalid authorization cannot reach any upload session operation`() {
        every { tokenService.validateAuthorization(null, OpenApiPermission.STAR_CAPTURE_WRITE) } throws
            IllegalStateException("unauthorized")
        val file = MockMultipartFile("file", "main-000.png", "image/png", byteArrayOf(1))
        assertThrows(IllegalStateException::class.java) { controller.initUpload(null, "{}") }
        assertThrows(IllegalStateException::class.java) { controller.uploadImage(null, "capture", "image", file) }
        assertThrows(IllegalStateException::class.java) { controller.finalizeUpload(null, "capture") }
        verify(exactly = 0) { captureService.initUpload(any(), any(), any()) }
        verify(exactly = 0) { captureService.uploadImage(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { captureService.finalizeUpload(any(), any(), any()) }
    }

    @Test
    fun `upload requires the dedicated scope and only forwards the token bound account`() {
        val files = listOf(MockMultipartFile("files", "capture-00.png", "image/png", byteArrayOf(1)))
        every { tokenService.validateAuthorization("Bearer star", OpenApiPermission.STAR_CAPTURE_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { captureService.upload("u1", "acc1", "{}", files) } returns StarCaptureUploadResponse("capture", "main", 1, Instant.EPOCH)

        val response = controller.upload("Bearer star", "{}", files)

        assertEquals("capture", response.data?.captureId)
        verify { tokenService.validateAuthorization("Bearer star", OpenApiPermission.STAR_CAPTURE_WRITE) }
        verify { captureService.upload("u1", "acc1", "{}", files) }
    }
}
