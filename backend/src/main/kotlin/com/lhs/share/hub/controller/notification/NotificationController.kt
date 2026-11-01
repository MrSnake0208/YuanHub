package com.lhs.share.hub.controller.notification

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.notification.response.NotificationListResponse
import com.lhs.share.hub.controller.notification.response.NotificationResponse
import com.lhs.share.hub.service.notification.NotificationEventService
import com.lhs.share.hub.service.notification.NotificationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * 站内通知控制器
 */
@RestController
@RequestMapping("/v1/notifications", produces = [MediaType.APPLICATION_JSON_VALUE])
@Tag(name = "通知", description = "站内通知：回复/状态更新通知、标记已读")
class NotificationController(
    private val notificationService: NotificationService,
    private val helper: AuthenticationHelper,
    private val notificationEvents: NotificationEventService,
) {

    @Operation(summary = "私人通知事件", description = "通过 Authorization 请求头鉴权；仅推送当前用户的通知 ID，断线后通过通知列表补偿")
    @RequireJwt
    @GetMapping("/events", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun events(): ResponseEntity<SseEmitter> = ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .header("X-Accel-Buffering", "no")
        .body(notificationEvents.subscribe(helper.requireUserId()))

    @Operation(summary = "通知列表", description = "分页返回当前用户的通知列表，可筛选仅未读")
    @RequireJwt
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "20") pageSize: Int,
        @RequestParam(defaultValue = "false") unreadOnly: Boolean,
    ): ApiResult<NotificationListResponse> {
        val userId = helper.requireUserId()
        return success(notificationService.list(userId, page, pageSize, unreadOnly))
    }

    @Operation(summary = "未读通知数", description = "返回当前用户的未读通知数量")
    @RequireJwt
    @GetMapping("/unread-count")
    fun unreadCount(): ApiResult<UnreadCountResponse> {
        val userId = helper.requireUserId()
        val count = notificationService.getUnreadCount(userId)
        return success(UnreadCountResponse(count))
    }

    @Operation(summary = "标记通知已读", description = "标记单条通知为已读")
    @RequireJwt
    @PatchMapping("/{id}/read")
    fun markRead(@PathVariable id: String): ApiResult<NotificationResponse> {
        val userId = helper.requireUserId()
        val notification = notificationService.markRead(userId, id)
        return success(
            NotificationResponse(
                id = checkNotNull(notification.id),
                kind = notification.kind,
                title = notification.title,
                body = notification.body,
                refType = notification.refType,
                refId = notification.refId,
                readAt = notification.readAt,
                createdAt = notification.createdAt,
            ),
        )
    }

    @Operation(summary = "全部标记已读", description = "标记当前用户所有未读通知为已读")
    @RequireJwt
    @PatchMapping("/read-all")
    fun markAllRead(): ApiResult<MarkAllReadResponse> {
        val userId = helper.requireUserId()
        val updated = notificationService.markAllRead(userId)
        return success(MarkAllReadResponse(updated))
    }
}

/**
 * 未读计数响应
 */
data class UnreadCountResponse(
    val count: Long,
)

/**
 * 全部已读响应
 */
data class MarkAllReadResponse(
    val updated: Int,
)
