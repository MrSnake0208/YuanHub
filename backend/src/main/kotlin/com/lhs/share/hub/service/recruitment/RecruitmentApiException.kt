package com.lhs.share.hub.service.recruitment

import org.springframework.http.HttpStatus

class RecruitmentApiException(val status: HttpStatus, val code: String, override val message: String) : RuntimeException(message)

internal fun recruitmentInvalid(message: String) =
    RecruitmentApiException(HttpStatus.UNPROCESSABLE_ENTITY, "recruitment_validation_failed", message)
internal fun recruitmentConflict(message: String = "档案已变化，请刷新后重新确认保存") =
    RecruitmentApiException(HttpStatus.CONFLICT, "recruitment_revision_conflict", message)
internal fun recruitmentNotFound(kind: String) =
    RecruitmentApiException(HttpStatus.NOT_FOUND, "recruitment_${kind}_not_found", "未找到对应记录（$kind）")

internal const val MAX_RECRUITMENT_COUNT = 1_000_000_000L
internal fun recruitmentCount(value: Long, field: String, positive: Boolean = false): Long =
    value.takeIf { it in (if (positive) 1L else 0L)..MAX_RECRUITMENT_COUNT }
        ?: throw recruitmentInvalid("$field 抽数超出允许范围")
