package com.lhs.share.hub.service.operator

object OperatorGrowthRules {
    const val MAX_LEVEL = 100
    const val MAX_ELITE = 17

    // 修为 1 为初始阶段；后续修为在对应等级节点解锁。
    private val eliteUnlockLevels = intArrayOf(
        1,
        10,
        15,
        30,
        40,
        45,
        50,
        55,
        60,
        65,
        70,
        75,
        80,
        85,
        90,
        95,
        100,
    )

    fun maxEliteForLevel(level: Int): Int {
        val normalizedLevel = level.coerceIn(0, MAX_LEVEL)
        return eliteUnlockLevels.count { normalizedLevel >= it }.coerceAtMost(MAX_ELITE)
    }
}
