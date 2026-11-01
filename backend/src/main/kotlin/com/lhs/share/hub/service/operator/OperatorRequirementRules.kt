package com.lhs.share.hub.service.operator

import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import kotlin.math.ceil
import kotlin.math.min

/** Server copy of YuanHub operatorRequirements.js, source revision 93628. */
object OperatorRequirementRules {
    data class Cost(val items: Map<String, Long>, val heart: Long = 0, val experience: Long = 0, val money: Long = 0)
    data class BookChoice(val items: Map<String, Long>, val suppliedExperience: Long)

    private val levelExp = longArrayOf(
        0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100,
        100, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300,
        1200, 1200, 1200, 1200, 1200, 1600, 2000, 2400, 2800, 3200,
        3500, 3800, 4100, 4400, 4700, 5100, 5500, 6000, 6500, 7000,
        7500, 8000, 8500, 9000, 9500, 10100, 10700, 11400, 12100, 12800,
        13500, 14200, 14900, 15600, 16300, 17100, 17900, 18800, 19700, 20600,
        21500, 22400, 23300, 24200, 25100, 26100, 27100, 28300, 29500, 30700,
        31900, 33100, 34300, 35500, 36700, 38700, 40700, 42700, 44700, 46700,
        48700, 50700, 52700, 54700, 56700, 60200, 63700, 67200, 70700, 74200,
        77200, 80200, 83200, 86200, 89200, 92200, 95200, 98200, 101200,
    )
    private data class Breakthrough(val level: Int, val items: Map<String, Long>, val money: Long)
    private val breakthroughs = listOf(
        Breakthrough(10, mapOf("jianjia" to 4), 20_000),
        Breakthrough(20, mapOf("jianjia" to 8), 50_000),
        Breakthrough(30, mapOf("jianjia" to 12, "yuanyu" to 10), 80_000),
        Breakthrough(40, mapOf("jianjia" to 40, "yuanyu" to 30), 100_000),
        Breakthrough(50, mapOf("jianjia" to 60, "diguanghe" to 40, "zuigucao" to 30), 200_000),
        Breakthrough(60, mapOf("jianjia" to 90, "diguanghe" to 60), 200_000),
        Breakthrough(70, mapOf("jianjia" to 120, "jincuodao" to 80), 300_000),
        Breakthrough(80, mapOf("jianjia" to 160, "yingqiongyao" to 105), 300_000),
        Breakthrough(90, mapOf("ziyunying" to 160, "qingtingyan" to 120), 400_000),
    )
    private val profession70 = mapOf(
        "pojun" to "tietaigong",
        "longdun" to "caiwendun",
        "qihuang" to "qingtongdao",
        "shenji" to "zhentiangu",
        "guidao" to "menghunlan",
    )
    private val profession80 = mapOf(
        "pojun" to "xijiaogong",
        "longdun" to "yuguidun",
        "qihuang" to "yinwendao",
        "shenji" to "panlonggu",
        "guidao" to "fujunhaitang",
    )
    private data class StarCost(val heart: Long, val money: Long, val items: Map<String, Long> = emptyMap())
    private val stars = listOf<StarCost?>(
        null,
        StarCost(2, 4_000), StarCost(3, 6_000), StarCost(5, 10_000),
        StarCost(5, 10_000), StarCost(5, 10_000), StarCost(5, 10_000),
        StarCost(15, 30_000), StarCost(15, 30_000), StarCost(15, 30_000),
        StarCost(15, 30_000), StarCost(15, 30_000), StarCost(30, 60_000),
        StarCost(20, 40_000), StarCost(20, 40_000), StarCost(20, 40_000),
        StarCost(25, 50_000), StarCost(25, 50_000), StarCost(40, 80_000),
        StarCost(40, 80_000), StarCost(40, 80_000), StarCost(40, 80_000),
        StarCost(40, 80_000), StarCost(40, 80_000), StarCost(80, 160_000),
        StarCost(100, 300_000, mapOf("zhuangjinboli" to 1)),
    )
    private val eliteCosts = mapOf(
        2 to listOf(20, 0, 0, 0, 0, 0), 3 to listOf(40, 0, 0, 0, 0, 0),
        4 to listOf(60, 50, 0, 0, 0, 0), 5 to listOf(60, 80, 0, 0, 0, 0),
        6 to listOf(0, 80, 120, 0, 0, 0), 7 to listOf(0, 100, 150, 0, 0, 0),
        8 to listOf(0, 120, 180, 0, 0, 0), 9 to listOf(0, 140, 210, 0, 0, 0),
        10 to listOf(0, 0, 240, 360, 0, 0), 11 to listOf(0, 0, 260, 390, 0, 0),
        12 to listOf(0, 0, 280, 420, 0, 0), 13 to listOf(0, 0, 0, 440, 660, 0),
        14 to listOf(0, 0, 0, 460, 690, 0), 15 to listOf(0, 0, 0, 480, 720, 0),
        16 to listOf(0, 0, 0, 0, 600, 900), 17 to listOf(0, 0, 0, 0, 750, 1200),
    )
    private val eliteMoney = mapOf(
        2 to 30_000, 3 to 50_000, 4 to 80_000, 5 to 80_000, 6 to 80_000, 7 to 100_000,
        8 to 100_000, 9 to 100_000, 10 to 150_000, 11 to 150_000, 12 to 150_000,
        13 to 200_000, 14 to 300_000, 15 to 300_000, 16 to 300_000, 17 to 350_000,
    )
    private val eliteItems = listOf(
        listOf("juanshan", "cuishan", "jinsishan", "yushan", "xianmenshan", "beihuifengshan"),
        listOf("zhuojiu", "qingjiu", "baimozhijiu", "lingshanquan", "bawanglei", "mulanzhuilu"),
        listOf("tongjing", "liubojing", "liujinjing", "baoshijing", "shuijing", "xinghanjing"),
    )
    val bookValues = linkedMapOf("liutaobingshu" to 10_000L, "bingshuquanjuan" to 1_000L, "bingshucanjuan" to 100L)

    fun level(
        from: Int,
        to: Int,
        catalog: OperatorCatalogEntity,
        skipBreakthroughMaterials: Boolean = false,
        levelBreakthroughStage: Int? = null,
    ): Cost {
        var experience = 0L
        for (level in from + 1..to) experience += levelExp[level]
        val stage = OperatorLevelBreakthroughRules.read(from, levelBreakthroughStage)
        val skipStarting = from in 10..90 && from % 10 == 0 &&
            (stage == from / 10 || (stage == null && skipBreakthroughMaterials))
        val items = linkedMapOf<String, Long>()
        var money = 0L
        breakthroughs.filter { from <= it.level && to > it.level && !(skipStarting && it.level == from) }.forEach { row ->
            row.items.forEach { (id, count) -> items.add(id, count) }
            money += row.money
            val sub = catalog.subProf.firstOrNull()
            if (row.level == 70) profession70[sub]?.let { items.add(it, 30) }
            if (row.level == 80) profession80[sub]?.let { items.add(it, 30) }
        }
        return Cost(items, experience = experience, money = money)
    }

    fun elite(from: Int, to: Int, catalog: OperatorCatalogEntity): Cost {
        val group = when (catalog.prof.firstOrNull()) {
            "风", "火" -> 0
            "水", "地" -> 1
            else -> 2
        }
        val items = linkedMapOf<String, Long>()
        var money = 0L
        for (level in maxOf(2, from + 1)..to) {
            eliteCosts[level].orEmpty().forEachIndexed { index, count ->
                if (count >
                    0
                ) {
                    items.add(eliteItems[group][index], count.toLong())
                }
            }
            money += eliteMoney[level] ?: 0
        }
        return Cost(items, money = money)
    }

    fun huaji(fromLevel: Int, toLevel: Int): Cost {
        require(fromLevel != 31 && toLevel != 31) { "Awakening is not a huaji stage" }
        val from = starStage(fromLevel)
        val to = starStage(toLevel)
        val items = linkedMapOf<String, Long>()
        var heart = 0L
        var money = 0L
        for (stage in from + 1..to) {
            val row = stars.getOrNull(stage) ?: continue
            heart += row.heart
            money += row.money
            row.items.forEach { (id, count) -> items.add(id, count) }
        }
        return Cost(items, heart = heart, money = money)
    }

    fun awakening(): Cost {
        val row = checkNotNull(stars.last())
        return Cost(row.items, heart = row.heart, money = row.money)
    }

    fun chooseBooks(requiredExperience: Long, stock: Map<String, Long>): BookChoice? {
        if (requiredExperience <= 0) return BookChoice(emptyMap(), 0)
        val requiredUnits = ceil(requiredExperience / 100.0).toLong()
        val sixAvailable = stock["liutaobingshu"].orZero()
        val fullAvailable = stock["bingshuquanjuan"].orZero()
        val fragmentAvailable = stock["bingshucanjuan"].orZero()
        if (sixAvailable * 100 + fullAvailable * 10 + fragmentAvailable < requiredUnits) return null
        var best: Triple<Long, Long, Long>? = null
        val maxSix = min(sixAvailable, (requiredUnits + 99) / 100)
        for (six in 0..maxSix) {
            val remainingAfterSix = maxOf(0, requiredUnits - six * 100)
            val floorFull = min(fullAvailable, remainingAfterSix / 10)
            val candidates = setOf(floorFull, min(fullAvailable, floorFull + 1), 0L, fullAvailable)
            candidates.forEach { full ->
                val remaining = maxOf(0, requiredUnits - six * 100 - full * 10)
                val fragments = min(fragmentAvailable, remaining)
                var candidate = Triple(six, full, fragments)
                var supplied = suppliedUnits(candidate)
                if (supplied < requiredUnits) {
                    val missing = requiredUnits - supplied
                    val extraFragments = min(fragmentAvailable - fragments, missing)
                    candidate = Triple(six, full, fragments + extraFragments)
                    supplied = suppliedUnits(candidate)
                }
                if (supplied >= requiredUnits && better(candidate, best, requiredUnits)) best = candidate
            }
        }
        val result = best ?: return null
        return BookChoice(
            linkedMapOf(
                "liutaobingshu" to result.first,
                "bingshuquanjuan" to result.second,
                "bingshucanjuan" to result.third,
            ).filterValues { it > 0 },
            suppliedUnits(result) * 100,
        )
    }

    private fun better(candidate: Triple<Long, Long, Long>, best: Triple<Long, Long, Long>?, required: Long): Boolean {
        if (best == null) return true
        val overflow = suppliedUnits(candidate) - required
        val bestOverflow = suppliedUnits(best) - required
        return overflow < bestOverflow ||
            (overflow == bestOverflow && candidate.first > best.first) ||
            (overflow == bestOverflow && candidate.first == best.first && candidate.second > best.second)
    }

    private fun suppliedUnits(value: Triple<Long, Long, Long>) = value.first * 100 + value.second * 10 + value.third
    private fun MutableMap<String, Long>.add(id: String, count: Long) {
        this[id] = (this[id] ?: 0) + count
    }
    private fun Long?.orZero() = this ?: 0
    private fun starStage(level: Int) = when {
        level >= 31 -> 25
        level >= 25 -> 24
        else -> (level - 1).coerceIn(0, 23)
    }
}
