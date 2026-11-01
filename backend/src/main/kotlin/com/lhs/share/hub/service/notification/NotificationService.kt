package com.lhs.share.hub.service.notification

import com.lhs.share.hub.controller.notification.response.NotificationListResponse
import com.lhs.share.hub.controller.notification.response.NotificationResponse
import com.lhs.share.hub.repository.NotificationRepository
import com.lhs.share.hub.repository.entity.Notification
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.security.SecureRandom
import java.time.Instant

/**
 * 通知服务
 *
 * 提供通知的创建、查询、标记已读等功能。
 * 反馈消息、管理员回复或状态更新后，由反馈服务调用 [create] 生成通知。
 */
@Service
@Transactional(transactionManager = "hubTransactionManager")
class NotificationService(
    private val notificationRepository: NotificationRepository,
    private val notificationEvents: NotificationEventService,
) {
    private val random = SecureRandom()

    /**
     * 生成 ntf_ 前缀的安全随机 ID
     */
    private fun generateId(): String {
        val bytes = ByteArray(12)
        random.nextBytes(bytes)
        return "ntf_" + bytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * 创建通知
     */
    fun create(
        userId: String,
        kind: String,
        title: String,
        body: String,
        refType: String,
        refId: String,
        messageIndex: Int? = null,
    ): Notification {
        val notification = Notification(
            id = generateId(),
            userId = userId,
            kind = kind,
            title = title,
            body = body,
            refType = refType,
            refId = refId,
            messageIndex = messageIndex,
        )
        val saved = notificationRepository.save(notification)
        notificationEvents.publishCreated(userId, checkNotNull(saved.id))
        return saved
    }

    fun clearFeedbackReminders(ticketId: String, throughIndex: Int) {
        val reminders = notificationRepository.findByRefTypeAndRefIdAndReadAtIsNull("FEEDBACK", ticketId)
            .filter { it.messageIndex != null && it.messageIndex <= throughIndex }
        if (reminders.isNotEmpty()) notificationRepository.saveAll(reminders.map { it.copy(readAt = Instant.now()) })
    }

    fun clearFeedbackTasks(ticketId: String) {
        val reminders = notificationRepository.findByRefTypeAndRefIdAndReadAtIsNull("FEEDBACK", ticketId)
            .filter { it.kind != "FEEDBACK_REPLY" && it.kind != "FEEDBACK_STATUS_UPDATED" }
        if (reminders.isNotEmpty()) notificationRepository.saveAll(reminders.map { it.copy(readAt = Instant.now()) })
    }

    fun clearFeedbackKinds(ticketId: String, kinds: Set<String>) {
        val reminders = notificationRepository.findByRefTypeAndRefIdAndReadAtIsNull("FEEDBACK", ticketId)
            .filter { it.kind in kinds }
        if (reminders.isNotEmpty()) notificationRepository.saveAll(reminders.map { it.copy(readAt = Instant.now()) })
    }

    /**
     * 查询通知列表
     *
     * @param userId 当前用户 id
     * @param page 页码，从 1 开始
     * @param pageSize 每页大小
     * @param unreadOnly 是否仅查未读
     */
    fun list(userId: String, page: Int = 1, pageSize: Int = 20, unreadOnly: Boolean = false): NotificationListResponse {
        val pageable = PageRequest.of(
            (page - 1).coerceAtLeast(0),
            pageSize.coerceIn(1, 100),
            Sort.by(Sort.Direction.DESC, "createdAt"),
        )

        val notificationPage = if (unreadOnly) {
            notificationRepository.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId, pageable)
        } else {
            notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
        }

        val unreadCount = notificationRepository.countByUserIdAndReadAtIsNull(userId)

        val notifications = notificationPage.content.map { it.toResponse() }

        return NotificationListResponse(
            notifications = notifications,
            total = notificationPage.totalElements,
            unreadCount = unreadCount,
        )
    }

    /**
     * 获取未读通知数
     */
    fun getUnreadCount(userId: String): Long {
        return notificationRepository.countByUserIdAndReadAtIsNull(userId)
    }

    /**
     * 标记单条通知为已读
     *
     * @param userId 当前用户 id（用于校验归属）
     * @param notificationId 通知 id
     * @return 更新后的通知
     */
    fun markRead(userId: String, notificationId: String): Notification {
        val notification = notificationRepository.findById(notificationId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "通知不存在") }

        if (notification.userId != userId) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "无权操作他人的通知")
        }

        if (notification.readAt != null) {
            return notification // 已读则直接返回
        }

        val updated = notification.copy(readAt = Instant.now())
        return notificationRepository.save(updated)
    }

    /**
     * 标记全部通知为已读
     *
     * @param userId 当前用户 id
     * @return 更新的通知数
     */
    fun markAllRead(userId: String): Int {
        val unreadNotifications = notificationRepository.findByUserIdAndReadAtIsNull(userId)
        if (unreadNotifications.isEmpty()) return 0

        val now = Instant.now()
        val updated = unreadNotifications.map { it.copy(readAt = now) }
        notificationRepository.saveAll(updated)
        return updated.size
    }

    /**
     * 将实体转换为响应 DTO
     */
    private fun Notification.toResponse(): NotificationResponse = NotificationResponse(
        id = checkNotNull(id),
        kind = kind,
        title = title,
        body = body,
        refType = refType,
        refId = refId,
        readAt = readAt,
        createdAt = createdAt,
    )
}
