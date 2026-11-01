package com.lhs.share.hub.service.star

/** Completed breakthroughs, independent of the calculator's private row numbering. */
object StarBreakthroughRules {
    fun maximumLevel(quality: String): Int = when (quality) {
        "white" -> 30
        "green" -> 40
        "blue" -> 50
        "purple", "orange" -> 60
        else -> throw IllegalArgumentException("Unknown star quality")
    }

    fun allowed(level: Int, quality: String): IntRange {
        val maximum = maximumLevel(quality)
        require(level in 1..maximum) { "Star level exceeds its quality limit" }
        return (level - 1) / 10..minOf(level / 10, maximum / 10 - 1)
    }

    fun inferred(level: Int, quality: String): Int? = allowed(level, quality).let {
        it.first.takeIf { _ -> it.first == it.last }
    }

    fun completed(level: Int, quality: String, alreadyBroken: Boolean): Int = allowed(level, quality).let {
        require(!alreadyBroken || it.first != it.last) { "Star cannot break through at this level" }
        if (alreadyBroken) it.last else it.first
    }
}
