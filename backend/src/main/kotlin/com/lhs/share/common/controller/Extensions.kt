package com.lhs.share.common.controller

import org.springframework.data.domain.Page

/**
 * Spring Data [Page] 转 [PagedDTO]
 */
fun <T> Page<T>.toDto() = PagedDTO(hasNext(), pageable.pageNumber + 1, totalElements, content)
