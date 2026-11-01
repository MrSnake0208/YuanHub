package com.lhs.share.config.agent

import org.springframework.data.redis.serializer.RedisSerializer

/** Used only by opt-in synthetic environments; values and hash fields remain unchanged. */
class NamespacedRedisKeys(private val prefix: String) : RedisSerializer<String> {
    init {
        require(Regex("yuanhub_(test|agent):[a-f0-9-]+:").matches(prefix))
    }

    override fun serialize(value: String?): ByteArray? = value?.let { (prefix + it).toByteArray(Charsets.UTF_8) }

    override fun deserialize(bytes: ByteArray?): String? = bytes?.toString(Charsets.UTF_8)?.let {
        require(it.startsWith(prefix)) { "Refusing a Redis key outside this namespace" }
        it.removePrefix(prefix)
    }
}
