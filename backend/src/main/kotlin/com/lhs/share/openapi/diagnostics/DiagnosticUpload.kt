package com.lhs.share.openapi.diagnostics

import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream

internal class DiagnosticUpload(private val filename: String, private val mime: String, private val content: ByteArray) : MultipartFile {
    override fun getName(): String = "files"

    override fun getOriginalFilename(): String = filename

    override fun getContentType(): String = mime

    override fun isEmpty(): Boolean = content.isEmpty()

    override fun getSize(): Long = content.size.toLong()

    override fun getBytes(): ByteArray = content

    override fun getInputStream(): InputStream = ByteArrayInputStream(content)

    override fun transferTo(dest: File) = dest.writeBytes(content)
}
