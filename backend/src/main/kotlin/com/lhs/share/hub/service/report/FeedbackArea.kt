package com.lhs.share.hub.service.report

/**
 * 反馈归属板块。新接口使用 category，area 仅作为旧数据兼容字段。
 */
object FeedbackArea {
    const val INVENTORY = "INVENTORY"
    const val OPERATOR = "OPERATOR"
    const val LEDGER = "LEDGER"
    const val PLAZA = "PLAZA"
    const val CALENDAR = "CALENDAR"
    const val ACCOUNT = "ACCOUNT"
    const val UI = "UI"
    const val STAR = "STAR"
    const val MAAYUAN = "MAAYUAN"
    const val OTHER = "OTHER"

    val all = linkedSetOf(INVENTORY, OPERATOR, LEDGER, PLAZA, CALENDAR, ACCOUNT, UI, STAR, MAAYUAN, OTHER)

    val labels = linkedMapOf(
        INVENTORY to "库存管理",
        OPERATOR to "密探养成",
        LEDGER to "广陵账房",
        PLAZA to "作业广场",
        CALENDAR to "活动日历",
        ACCOUNT to "账号与连接",
        UI to "界面与交互",
        STAR to "星石",
        MAAYUAN to "麻圆",
        OTHER to "其他模块",
    )

    fun requireValid(area: String): String {
        val normalized = area.trim().uppercase()
        if (normalized !in all) {
            throw IllegalArgumentException("无效的反馈模块: $area, 可选: $all")
        }
        return normalized
    }
}
