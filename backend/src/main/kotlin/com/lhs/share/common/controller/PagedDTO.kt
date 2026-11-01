package com.lhs.share.common.controller

/**
 * 通用分页返回结构
 *
 * @param hasNext 是否还有下一页
 * @param page    当前页码(从 1 开始)
 * @param total   总记录数
 * @param data    当前页数据
 */
data class PagedDTO<T>(
    val hasNext: Boolean,
    val page: Int,
    val total: Long,
    val data: List<T>,
)
