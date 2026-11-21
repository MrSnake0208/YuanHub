package com.lhs.share.service.jwt

import com.lhs.share.repository.UserRepository
import com.mongodb.client.model.Filters.and
import com.mongodb.client.model.Filters.eq
import com.mongodb.client.model.IndexOptions
import com.mongodb.client.model.Indexes
import com.mongodb.client.model.UpdateOptions
import com.mongodb.client.model.Updates.combine
import com.mongodb.client.model.Updates.max
import com.mongodb.client.model.Updates.set
import com.mongodb.client.model.Updates.setOnInsert
import io.github.oshai.kotlinlogging.KotlinLogging
import org.bson.Document
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.Date
import java.util.UUID
import java.util.concurrent.TimeUnit

@Service
class LoginSessions(
    @param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate,
    private val users: UserRepository,
    private val jwt: JwtService,
) {
    private val log = KotlinLogging.logger { }
    private val sessions by lazy {
        mongo.getCollection("login_session").also {
            it.createIndex(Indexes.ascending("expires"), IndexOptions().expireAfter(0L, TimeUnit.SECONDS))
        }
    }

    fun start(userId: String, startedAt: Instant): JwtRefreshToken {
        val token = jwt.issueRefreshToken(userId, UUID.randomUUID().toString())
        sessions.insertOne(
            Document("_id", token.jwtId).append("user", userId).append("start", startedAt.toEpochMilli())
                .append("current", token.issuedAt.toEpochMilli()).append("expires", Date.from(token.expiresAt)),
        )
        return token
    }

    private fun sessionId(token: JwtRefreshToken) = token.jwtId ?: "legacy-refresh:${token.subject}:${token.issuedAt.toEpochMilli()}"

    fun refresh(old: JwtRefreshToken, passwordChangedAt: Instant, at: Instant = Instant.now()): JwtRefreshToken {
        val id = sessionId(old)
        val issued = old.issuedAt.toEpochMilli()
        val now = at.toEpochMilli()
        val next = jwt.issueRefreshToken(old.subject, id, Instant.ofEpochMilli(now))
        val owner = and(eq("_id", id), eq("user", old.subject))
        if (old.jwtId == null) {
            // Concurrent retries of the same pre-upgrade token must adopt the same session.
            sessions.updateOne(
                eq("_id", id),
                combine(
                    setOnInsert("user", old.subject),
                    setOnInsert("start", issued),
                    setOnInsert("previous", issued),
                    setOnInsert("current", now),
                    setOnInsert("expires", Date.from(next.expiresAt)),
                ),
                UpdateOptions().upsert(true),
            )
        } else if (now - issued >= RETRY_WINDOW_MS) {
            sessions.updateOne(
                and(owner, eq("current", issued), eq("revoked", null)),
                combine(
                    set("previous", issued),
                    set("current", now),
                    set("acknowledged", false),
                    set("expires", Date.from(next.expiresAt)),
                ),
            )
        }
        if (old.jwtId != null && now - issued < RETRY_WINDOW_MS) {
            sessions.updateOne(and(owner, eq("current", issued)), set("acknowledged", true))
        }
        val session = sessions.find(owner).first() ?: throw JwtInvalidException()
        if (session.getBoolean("revoked", false) || Instant.ofEpochMilli(session.getLong("start")).isBefore(passwordChangedAt)) {
            throw JwtInvalidException()
        }
        val current = session.getLong("current")
        // A lost rotation response can be retried until the successor is used or the signed old token expires.
        val retired = session.getBoolean("acknowledged", false) && now - current >= RETRY_WINDOW_MS
        if (issued != current && (session["previous"] != issued || retired)) {
            log.warn { "Rejected stale refresh token" }
            throw JwtInvalidException()
        }
        return jwt.issueRefreshToken(old.subject, id, Instant.ofEpochMilli(current))
    }

    fun requireAccess(token: JwtAuthToken) {
        val user = users.findByUserId(token.subject) ?: throw JwtInvalidException()
        val id = token.jwtId
        val start = if (id == null) {
            if (sessions.find(eq("_id", legacyAccessId(token))).first() != null) throw JwtInvalidException()
            token.issuedAt
        } else {
            val session = sessions.find(and(eq("_id", id), eq("user", token.subject), eq("revoked", null))).first()
                ?: throw JwtInvalidException()
            val current = session.getLong("current")
            if (session["previous"] != null && !session.getBoolean("acknowledged", false) && token.refreshIssuedAt == current) {
                sessions.updateOne(and(eq("_id", id), eq("current", current)), set("acknowledged", true))
            }
            Instant.ofEpochMilli(session.getLong("start"))
        }
        if (user.status <= 0 || start.isBefore(user.pwdUpdateTime)) throw JwtInvalidException()
    }

    fun logout(refresh: JwtRefreshToken, access: JwtAuthToken?) {
        // Keep a tombstone until the legacy credential expires so lazy adoption cannot resurrect it.
        sessions.updateOne(
            eq("_id", sessionId(refresh)),
            combine(set("revoked", true), setOnInsert("user", refresh.subject), max("expires", Date.from(refresh.expiresAt))),
            UpdateOptions().upsert(true),
        )
        if (access != null && access.jwtId == null && access.subject == refresh.subject) {
            sessions.updateOne(eq("_id", legacyAccessId(access)), set("expires", Date.from(access.expiresAt)), UpdateOptions().upsert(true))
        }
    }

    private fun legacyAccessId(token: JwtAuthToken) = "legacy-access:${token.subject}:${token.issuedAt.toEpochMilli()}"

    private companion object {
        const val RETRY_WINDOW_MS = 300_000L
    }
}
