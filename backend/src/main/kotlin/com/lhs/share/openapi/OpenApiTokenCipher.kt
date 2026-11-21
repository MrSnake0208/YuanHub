package com.lhs.share.openapi

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.HexFormat
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@Component
class OpenApiTokenCipher(@param:Value("\${share.openapi.storage-key:}") encodedKey: String) {
    private val key = SecretKeySpec(
        Base64.getDecoder().decode(encodedKey).also { require(it.size == 32) { "Configure a 32-byte OpenAPI storage key" } },
        "AES",
    )
    private val random = SecureRandom()

    fun encrypt(secret: String, id: String, owner: String): String {
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = cipher(Cipher.ENCRYPT_MODE, iv, id, owner)
        return Base64.getEncoder().encodeToString(iv + cipher.doFinal(secret.toByteArray()))
    }

    fun decrypt(encoded: String, id: String, owner: String): String {
        val bytes = Base64.getDecoder().decode(encoded)
        require(bytes.size >= 28) { "Incomplete encrypted connection code" }
        val cipher = cipher(Cipher.DECRYPT_MODE, bytes.copyOfRange(0, 12), id, owner)
        return cipher.doFinal(bytes, 12, bytes.size - 12).toString(Charsets.UTF_8)
    }

    private fun cipher(mode: Int, iv: ByteArray, id: String, owner: String) = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(mode, key, GCMParameterSpec(128, iv))
        updateAAD("yuanhub-openapi-v1\u0000$id\u0000$owner".toByteArray())
    }

    companion object {
        fun digest(secret: String): String =
            "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.toByteArray()))
    }
}
