/** This file contains various custom data types used throughout the app.
 *
 * This just allows us to keep these custom types in a central location.
 * Of course, if a custom type is only used in a single class then keep it in a
 * companion object in that class. Anything else that could be used elsewhere
 * should go in here.
 *
 * If a custom type gets too complex (such as [GameDate]) then it should be moved
 * to its own file.
 */

package com.steve1316.uma_android_automation.types

/** These are the different tiers defined in game and awarded based on fan count. */
enum class FanCountClass {
    DEBUT,
    MAIDEN,
    BEGINNER,
    BRONZE,
    SILVER,
    GOLD,
    PLATINUM,
    STAR,
    TOP_STAR,
    LEGEND,
    ;

    companion object {
        /** Mapping of fan count class names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        fun fromName(value: String): FanCountClass? = nameMap[value.uppercase()]
    }
}

// `StatName` is now defined in the shared scoring module so the same enum is consumed by both the Android bot (this file's old location) and the React Native sandbox. The
// typealias preserves the original import path `com.steve1316.uma_android_automation.types.StatName` so every existing call site keeps working unchanged.
typealias StatName = com.steve1316.uma_scoring.StatName

enum class Aptitude {
    G,
    F,
    E,
    D,
    C,
    B,
    A,
    S,
    ;

    companion object {
        /** Mapping of aptitude names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        fun fromName(value: String): Aptitude? = nameMap[value.uppercase()]
    }
}

enum class RunningStyle(val shortName: String) {
    FRONT_RUNNER("FRONT"),
    PACE_CHASER("PACE"),
    LATE_SURGER("LATE"),
    END_CLOSER("END"),
    ;

    companion object {
        /** Mapping of running style names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding running style enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): RunningStyle? = nameMap[value.uppercase()]

        fun fromOrdinal(ordinal: Int): RunningStyle? = ordinalMap[ordinal]

        fun fromShortName(value: String): RunningStyle? = entries.find { value.uppercase() == it.shortName }
    }
}

enum class TrackSurface {
    TURF,
    DIRT,
    ;

    companion object {
        /** Mapping of track surface names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding track surface enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): TrackSurface? = nameMap[value.uppercase()]

        fun fromOrdinal(ordinal: Int): TrackSurface? = ordinalMap[ordinal]
    }
}

enum class TrackDistance {
    SPRINT,
    MILE,
    MEDIUM,
    LONG,
    ;

    companion object {
        /** Mapping of track distance names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding track distance enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): TrackDistance? = nameMap[value.uppercase()]

        fun fromOrdinal(ordinal: Int): TrackDistance? = ordinalMap[ordinal]
    }
}

enum class Mood {
    AWFUL,
    BAD,
    NORMAL,
    GOOD,
    GREAT,
    ;

    /** Increments the mood level by one, capping at [GREAT].
     *
     * @return The new mood level.
     */
    fun increment(): Mood {
        return entries.getOrElse(ordinal + 1) { GREAT }
    }

    /** Decrements the mood level by one, capping at [AWFUL].
     *
     * @return The new mood level.
     */
    fun decrement(): Mood {
        return entries.getOrElse(ordinal - 1) { AWFUL }
    }

    companion object {
        /** Mapping of mood names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        fun fromName(value: String): Mood? = nameMap[value.uppercase()]
    }
}

enum class RaceGrade {
    DEBUT,
    MAIDEN,
    PRE_OP,
    OP,
    G3,
    G2,
    G1,
    FINALE,
    EX,
    ;

    companion object {
        /** Mapping of race grade names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        fun fromName(value: String): RaceGrade? = nameMap[value.uppercase()]
    }
}

enum class DatePhase {
    EARLY,
    LATE,
    ;

    companion object {
        /** Mapping of date phase names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding date phase enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): DatePhase? = nameMap[value.uppercase()]

        fun fromOrdinal(ordinal: Int): DatePhase? = ordinalMap[ordinal]
    }
}

enum class DateMonth(val shortName: String) {
    JANUARY("JAN"),
    FEBRUARY("FEB"),
    MARCH("MAR"),
    APRIL("APR"),
    MAY("MAY"),
    JUNE("JUN"),
    JULY("JUL"),
    AUGUST("AUG"),
    SEPTEMBER("SEP"),
    OCTOBER("OCT"),
    NOVEMBER("NOV"),
    DECEMBER("DEC"),
    ;

    companion object {
        /** Mapping of month names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding month enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): DateMonth? = nameMap[value.uppercase()]

        fun fromOrdinal(ordinal: Int): DateMonth? = ordinalMap[ordinal]

        fun fromShortName(value: String): DateMonth? = entries.find { value.uppercase() == it.shortName }
    }
}

// `DateYear` is now defined in the shared scoring module so both the Android bot and the React Native sandbox import the same enum. The typealias preserves the original
// import path `com.steve1316.uma_android_automation.types.DateYear` so every existing call site keeps working unchanged.
typealias DateYear = com.steve1316.uma_scoring.DateYear

/** Defines the positive status effects that a trainee can have. */
enum class PositiveStatus(val statusName: String) {
    CHARMING("Charming"),
    FAST_LEARNER("Fast Learner"),
    PRACTICE_PERFECT("Practice Perfect"),
    HOT_TOPIC("Hot Topic"),
    ;

    companion object {
        /** List of all positive status names. */
        val names: List<String> = entries.map { it.statusName }

        /** Returns the [PositiveStatus] for the given name, or null if not found. */
        fun fromName(name: String): PositiveStatus? = entries.find { it.statusName == name }
    }
}

/** Defines the negative status effects that a trainee can have. */
enum class NegativeStatus(val statusName: String) {
    PRACTICE_POOR("Practice Poor"),
    MIGRAINE("Migraine"),
    NIGHT_OWL("Night Owl"),
    SLOW_METABOLISM("Slow Metabolism"),
    SLACKER("Slacker"),
    SKIN_OUTBREAK("Skin Outbreak"),
    ;

    companion object {
        /** List of all negative status names. */
        val names: List<String> = entries.map { it.statusName }

        /** Returns the [NegativeStatus] for the given name, or null if not found. */
        fun fromName(name: String): NegativeStatus? = entries.find { it.statusName == name }
    }
}

// DATA CLASSES

/** A simple class used to define a bounding box on the screen.
 *
 * @param x The bounding region's bottom left corner's X-coordinate.
 * @param y The bounding region's bottom left corner's Y-coordinate.
 * @param w The bounding region's width.
 * @param h The bounding region's height.
 */
data class BoundingBox(val x: Int, val y: Int, val w: Int, val h: Int) {
    /** The bounding region's center X-coordinate. */
    val cx: Int
        get() = (x + (w / 2))

    /** The bounding region's center Y-coordinate. */
    val cy: Int
        get() = (y + (h / 2))

    /** A pair containing the bounding region's center coordinates. */
    val center: Pair<Int, Int>
        get() = Pair(cx, cy)

    override fun toString(): String {
        return "x=$x, y=$y, w=$w, h=$h"
    }

    /** Converts the parameters to an integer array.
     *
     * Mostly used for backward compatibility.
     * Does not include any of the center coordinates.
     *
     * @return An array containing x, y, w, h values.
     */
    fun toIntArray(): IntArray {
        return intArrayOf(x, y, w, h)
    }
}

enum class SkillType {
    GREEN,
    BLUE,
    YELLOW,
    RED,
    ;

    companion object {
        /** Mapping of skill type names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        fun fromName(value: String): SkillType? = nameMap[value.uppercase()]

        fun fromIconId(iconId: Int): SkillType? {
            val digits: String = iconId.toString()
            return when {
                digits.take(1) == "1" -> GREEN

                // BLUE and YELLOW types both start with "20" so we filter
                // out the BLUE types first since there are way fewer of them.
                digits.take(4) == "2002" -> BLUE

                digits.take(4) == "2003" -> BLUE

                digits.take(4) == "2011" -> BLUE

                // The rest of the skills starting with "2" are yellow
                digits.take(1) == "2" -> YELLOW

                digits.take(1) == "3" -> RED

                // At the moment the Runaway skill starts with "40". Unsure why
                // since it is a green skill.
                iconId == 40012 -> GREEN

                else -> null
            }
        }
    }
}

enum class SkillCommunityTier {
    SS,
    S,
    A,
    B,
    ;

    companion object {
        /** Mapping of community tier names to their corresponding enum entries. */
        private val nameMap = entries.associateBy { it.name }

        /** Mapping of ordinals to their corresponding community tier enum entries. */
        private val ordinalMap = entries.associateBy { it.ordinal }

        fun fromName(value: String): SkillCommunityTier? = nameMap[value]

        fun fromOrdinal(ordinal: Int): SkillCommunityTier? = ordinalMap[ordinal]
    }
}

/** Defines the metadata and properties of a skill in the game. */
data class SkillData(
    val id: Int,
    val geneId: Int,
    val name: String,
    val description: String,
    val iconId: Int,
    val cost: Int,
    val evalPt: Int,
    val ptRatio: Double,
    val rarity: Int,
    val condition: String,
    val precondition: String,
    val bIsInheritedUnique: Boolean,
    val communityTier: Int?,
    val versions: List<Int>,
    val upgrade: Int?,
    val downgrade: Int?,
) {
    /** Whether this skill is an upgraded version of another skill.
     *
     * This is calculated using the Icon ID. If the last digit is a 2, then it is gold.
     */
    val bIsGold: Boolean = iconId % 10 == 2

    /** Whether this skill is considered a unique skill.
     *
     * This is calculated using the Icon ID. If the last digit is a 3, then it is unique.
     */
    val bIsUnique: Boolean = bIsInheritedUnique || iconId % 10 == 3

    /** Whether this skill is considered a negative skill.
     *
     * This is calculated using the Icon ID. If the last digit is a 4, then it is negative.
     */
    val bIsNegative: Boolean = iconId % 10 == 4

    /** The type of this skill (i.e. Green, Blue, Red, Yellow). */
    val type: SkillType = SkillType.fromIconId(iconId)!!

    /** Whether this skill chain has an in-place upgrade system.
     *
     * Only certain types of skills can have in-place upgrades:
     * - Negative Skills (purple)
     * - Green Skills
     * - Distance-based Skills (i.e. [Distance/Style] Straightaway/Corners)
     */
    val bIsInPlace: Boolean =
        type == SkillType.GREEN ||
            bIsNegative ||
            name.dropLast(2).endsWith("straightaways", ignoreCase = true) ||
            name.dropLast(2).endsWith("corners", ignoreCase = true)

    /** Mapping of community tier identifiers to their corresponding names. */
    private val communityTierNameMap: Map<Int, String> =
        mapOf(
            0 to "SS",
            1 to "S",
            2 to "A",
            3 to "B",
        )

    /** The name of the community tier for this skill (SS, S, A, or B). */
    val communityTierName: String? = communityTierNameMap[communityTier]

    /** The activation conditions for this skill.
     *
     * &=AND, @=OR. Split groupings of AND conditions into separate strings.
     * Then each one of those is converted to a mapping of the condition to the effect string.
     */
    val conditions: Conditions =
        Conditions.fromString(
            listOf(condition, precondition)
                .filter { it.isNotEmpty() }
                .joinToString("@"),
        )

    /** The Running Style required to activate this skill. Can be null.
     *
     * Some skills are for specific running styles or track distances/surfaces.
     * We want to extract this from the scraped data.
     */
    val runningStyle: RunningStyle? = conditions.runningStyle

    /** The Track Distance required to activate this skill. Can be null. */
    val trackDistance: TrackDistance? = conditions.trackDistance

    /** The Track Surface required to activate this skill. Can be null. */
    val trackSurface: TrackSurface? = conditions.trackSurface

    /** The list of Running Styles that best suit this skill. Can be empty.
     *
     * These running styles are calculated based on a skill's activation conditions.
     * However since these might not actually be specific to a running style,
     * the skill will not give any rank bonus based on aptitudes.
     */
    val inferredRunningStyles: List<RunningStyle> = calculateInferredRunningStyles()

    constructor(
        id: Int,
        geneId: Int,
        name: String,
        description: String,
        iconId: Int,
        cost: Int,
        evalPt: Int,
        ptRatio: Double,
        rarity: Int,
        condition: String,
        precondition: String,
        bIsInheritedUnique: Boolean,
        communityTier: Int?,
        versions: String,
        upgrade: Int?,
        downgrade: Int?,
    ) : this(
        id,
        geneId,
        name,
        description,
        iconId,
        cost,
        evalPt,
        ptRatio,
        rarity,
        condition,
        precondition,
        bIsInheritedUnique,
        communityTier,
        versions
            .replace("[", "")
            .replace("]", "")
            .split(",")
            .filter { it.isNotEmpty() }.map { it.trim().toInt() },
        upgrade,
        downgrade,
    )

    enum class Operator(val opString: String) {
        EQ("=="),
        NE("!="),
        GT(">"),
        GE(">="),
        LT("<"),
        LE("<="),
        ;

        companion object {
            /** Mapping of operator names to their corresponding enum entries. */
            private val nameMap = entries.associateBy { it.name }

            fun fromName(value: String): Operator? = nameMap[value]

            fun fromString(value: String): Operator? = entries.find { value == it.opString }
        }
    }

    /** A single condition for skill activation.
     *
     * See: https://gametora.com/umamusume/skill-condition-viewer
     *
     * @param name The condition name.
     * @param op The operator for the condition.
     * @param value The condition's value.
     */
    data class Condition(val name: String, val op: Operator, val value: Int) {
        companion object {
            /** Parses a single condition string and splits it into its three parts.
             *
             * For example, the string "order==1" will be split into "order", "==", and 1.
             *
             * @param input The condition string.
             *
             * @return A Condition instance generated using the split condition.
             */
            fun fromString(input: String): Condition? {
                // Regex explanation:
                // (\\s*\\S+?): Captures the left operand (non-whitespace characters, non-greedy, with optional surrounding whitespace).
                // (==|!=|>=|<=|>|<): Captures the operator from a set of possible conditional operators.
                // (\\s*\\S+): Captures the right operand (non-whitespace characters, with optional surrounding whitespace).
                val pattern = "(\\s*\\S+?) *(==|!=|>=|<=|>|<) *(\\S+)\\s*".toRegex()
                val matchResult = pattern.find(input.trim())
                if (matchResult != null && matchResult.groupValues.size == 4) {
                    // groupValues[0] is the whole match.
                    val name: String = matchResult.groupValues[1].trim()
                    val op: Operator = Operator.fromString(matchResult.groupValues[2].trim()) ?: return null
                    val value: Int = matchResult.groupValues[3].trim().toIntOrNull() ?: return null
                    return Condition(name, op, value)
                } else {
                    return null
                }
            }
        }

        /** Checks whether this condition matches the passed conditions.
         *
         * @param name The condition name.
         * If not specified, then only the [op] and [value] are checked against.
         * @param op The operator for the condition.
         * @param value The condition value.
         *
         * @return Whether this condition matches the passed parameters.
         */
        fun check(name: String? = null, op: Operator, value: Int): Boolean {
            return if (name != null) {
                this.name == name && this.op == op && this.value == value
            } else {
                this.op == op && this.value == value
            }
        }

        override fun toString(): String {
            return "$name $op $value"
        }
    }

    /** Represents a group of [Condition] objects joined together with "&" symbols.
     *
     * [Condition] group conditions are evaluated using AND logic.
     * These entries are separated by an "&" in the condition string.
     *
     * @param conditions The list of [Condition] objects in the group.
     */
    class ConditionGroup(val conditions: List<Condition>) {
        /** Whether this group indicates a leading position (e.g., 1st place). */
        val bIsLeading: Boolean = isLeading()

        /** Whether this group indicates a well-positioned runner near the front. */
        val bIsWellPositioned: Boolean = isWellPositioned()

        /** Whether this group indicates a runner off the pace. */
        val bIsOffThePace: Boolean = isOffThePace()

        /** Whether this group indicates a mid-pack position. */
        val bIsMidPack: Boolean = isMidPack()

        /** Whether this group indicates a position toward the back of the field. */
        val bIsTowardTheBack: Boolean = isTowardTheBack()

        /** Whether this group indicates a position toward the front of the field. */
        val bIsTowardTheFront: Boolean = isTowardTheFront()

        companion object {
            fun fromString(input: String): ConditionGroup {
                return ConditionGroup(input.split("&").mapNotNull { Condition.fromString(it) })
            }
        }

        /** Checks whether this group indicates a leading position (e.g., 1st place).
         *
         * @return True if leading.
         */
        private fun isLeading(): Boolean {
            return check(Condition("order", Operator.EQ, 1))
        }

        /** Checks whether this group indicates a well-positioned runner near the front.
         *
         * @return True if well-positioned.
         */
        private fun isWellPositioned(): Boolean {
            return (
                checkInRange("order", 2, 5) ||
                    checkInRange("order_rate", 20, 60)
            )
        }

        /** Checks whether this group indicates a runner off the pace.
         *
         * @return True if off the pace.
         */
        private fun isOffThePace(): Boolean {
            return (
                check(Condition("order", Operator.GE, 3)) &&
                    checkInRange("order_rate", 0, 50)
            )
        }

        /** Checks whether this group indicates a mid-pack position.
         *
         * @return True if in the mid-pack.
         */
        private fun isMidPack(): Boolean {
            return (
                (check(Condition("order", Operator.GE, 3)) && checkInRange("order_rate", 30, 80)) ||
                    checkInRange("order_rate", 30, 80)
            )
        }

        /** Checks whether this group indicates a position toward the back of the field.
         *
         * @return True if toward the back.
         */
        private fun isTowardTheBack(): Boolean {
            return (
                checkInRange("order", 5, 50) ||
                    checkInRange("order_rate", 50, 100) ||
                    check(Condition("order_rate_out50_continue", Operator.EQ, 1)) ||
                    check(Condition("order_rate_out70_continue", Operator.EQ, 1))
            )
        }

        /** Checks whether this group indicates a position toward the front of the field.
         *
         * @return True if toward the front.
         */
        private fun isTowardTheFront(): Boolean {
            return (
                checkInRange("order", 0, 5) ||
                    checkInRange("order_rate", 0, 50) ||
                    check(Condition("order_rate_in20_continue", Operator.EQ, 1)) ||
                    check(Condition("order_rate_in40_continue", Operator.EQ, 1)) ||
                    check(Condition("order_rate_in50_continue", Operator.EQ, 1))
            )
        }

        /** Checks whether the group contains the specified [Condition] object.
         *
         * @param condition The [Condition] object to check.
         * @return True if the [Condition] object is present.
         */
        fun check(condition: Condition): Boolean {
            return conditions.any {
                it.name == condition.name &&
                    it.op == condition.op &&
                    it.value == condition.value
            }
        }

        /** Checks whether the group contains all the specified [Condition] objects.
         *
         * @param conditions The list of [Condition] objects to check.
         * @return True if all [Condition] objects are present.
         */
        fun check(conditions: List<Condition>): Boolean {
            return conditions.all { check(it) }
        }

        /** Checks whether any condition with the specified [name] has a value within the range.
         *
         * @param name The condition name to check.
         * @param minVal The minimum value (inclusive).
         * @param maxVal The maximum value (inclusive).
         * @return True if any matching condition is in range.
         */
        fun checkInRange(name: String, minVal: Int, maxVal: Int): Boolean {
            return conditions.any { it.name == name && it.value in minVal..maxVal }
        }

        /** Retrieves the [RunningStyle] specified in this group's conditions.
         *
         * @return The running style, or null if not found.
         */
        fun getRunningStyle(): RunningStyle? {
            for (condition in conditions) {
                if (condition.name == "running_style") {
                    return RunningStyle.fromOrdinal(condition.value - 1)
                }
            }
            return null
        }

        /** Retrieves the [TrackDistance] specified in this group's conditions.
         *
         * @return The track distance, or null if not found.
         */
        fun getTrackDistance(): TrackDistance? {
            for (condition in conditions) {
                if (condition.name == "distance_type") {
                    return TrackDistance.fromOrdinal(condition.value - 1)
                }
            }
            return null
        }

        /** Retrieves the [TrackSurface] specified in this group's conditions.
         *
         * @return The track surface, or null if not found.
         */
        fun getTrackSurface(): TrackSurface? {
            for (condition in conditions) {
                if (condition.name == "ground_type") {
                    return TrackSurface.fromOrdinal(condition.value - 1)
                }
            }
            return null
        }

        override fun toString(): String {
            return conditions.joinToString()
        }
    }

    /** Parses the activation conditions string scraped from skill data.
     *
     * @param groups The list of [ConditionGroup] objects in the conditions.
     */
    class Conditions(val groups: List<ConditionGroup>) {
        /** True if any condition group indicates a leading position. */
        val bIsLeading: Boolean = groups.any { it.bIsLeading }

        /** True if any condition group indicates a well-positioned placement. */
        val bIsWellPositioned: Boolean = groups.any { it.bIsWellPositioned }

        /** True if any condition group indicates being off the pace. */
        val bIsOffThePace: Boolean = groups.any { it.bIsOffThePace }

        /** True if any condition group indicates a mid-pack placement. */
        val bIsMidPack: Boolean = groups.any { it.bIsMidPack }

        /** True if any condition group indicates being toward the back. */
        val bIsTowardTheBack: Boolean = groups.any { it.bIsTowardTheBack }

        /** True if any condition group indicates being toward the front. */
        val bIsTowardTheFront: Boolean = groups.any { it.bIsTowardTheFront }

        /** The [RunningStyle] required to activate these conditions. Can be null. */
        val runningStyle: RunningStyle? = calculateRunningStyle()

        /** The [TrackDistance] required to activate these conditions. Can be null. */
        val trackDistance: TrackDistance? = calculateTrackDistance()

        /** The [TrackSurface] required to activate these conditions. Can be null. */
        val trackSurface: TrackSurface? = calculateTrackSurface()

        companion object {
            fun fromString(input: String): Conditions {
                return Conditions(input.split("@").map { ConditionGroup.fromString(it) })
            }
        }

        /** Calculates the [RunningStyle] required to activate these conditions.
         *
         * @return The [RunningStyle] or null if no style was found.
         */
        private fun calculateRunningStyle(): RunningStyle? {
            for (group in groups) {
                val result: RunningStyle? = group.getRunningStyle()
                if (result != null) {
                    return result
                }
            }
            return null
        }

        /** Calculates the [TrackDistance] required to activate these conditions.
         *
         * @return The [TrackDistance] or null if no distance was found.
         */
        private fun calculateTrackDistance(): TrackDistance? {
            for (group in groups) {
                val result: TrackDistance? = group.getTrackDistance()
                if (result != null) {
                    return result
                }
            }
            return null
        }

        /** Calculates the [TrackSurface] required to activate these conditions.
         *
         * @return The [TrackSurface] or null if no surface was found.
         */
        private fun calculateTrackSurface(): TrackSurface? {
            for (group in groups) {
                val result: TrackSurface? = group.getTrackSurface()
                if (result != null) {
                    return result
                }
            }
            return null
        }

        /** Infers a distinct list of [RunningStyle] entries based on positional conditions.
         *
         * NOTE: This is currently unreliable due to potential inaccuracies in GameTora's data.
         * Overlapping conditions can lead to nonsensical results (e.g., "toward the back"
         * being defined as 5th place regardless of field size).
         *
         * @return A list of inferred [RunningStyle] entries.
         */
        @Deprecated("Not currently working due to GameTora's seemingly inaccurate conditions.")
        private fun calculateInferredRunningStyles(): List<RunningStyle> {
            val result: MutableList<RunningStyle> = mutableListOf()
            if (bIsLeading) {
                result.add(RunningStyle.FRONT_RUNNER)
            }

            if (bIsTowardTheFront) {
                result.add(RunningStyle.FRONT_RUNNER)
                result.add(RunningStyle.PACE_CHASER)
            }

            if (bIsWellPositioned) {
                result.add(RunningStyle.PACE_CHASER)
            }

            if (bIsMidPack) {
                result.add(RunningStyle.PACE_CHASER)
                result.add(RunningStyle.LATE_SURGER)
            }

            if (bIsOffThePace) {
                result.add(RunningStyle.PACE_CHASER)
                result.add(RunningStyle.LATE_SURGER)
            }

            if (bIsTowardTheBack) {
                result.add(RunningStyle.LATE_SURGER)
                result.add(RunningStyle.END_CLOSER)
            }

            return result.distinct()
        }

        override fun toString(): String {
            return groups.joinToString()
        }
    }

    /** Checks whether this skill prefers a specific RunningStyle to activate.
     *
     * @param runningStyle The RunningStyle to check against.
     *
     * @return Whether this skill prefers the [runningStyle] to activate.
     */
    fun checkInferredRunningStyleAptitude(runningStyle: RunningStyle): Boolean {
        return runningStyle in inferredRunningStyles
    }

    /** Checks whether this skill requires a specific RunningStyle to activate.
     *
     * @param runningStyle The RunningStyle to check against.
     *
     * @return Whether this skill requires the [runningStyle] to activate.
     */
    fun checkRunningStyleAptitude(runningStyle: RunningStyle): Boolean {
        return this.runningStyle == runningStyle
    }

    /** Checks whether this skill requires a specific TrackDistance to activate.
     *
     * @param trackDistance The TrackDistance to check against.
     *
     * @return Whether this skill requires the [trackDistance] to activate.
     */
    fun checkTrackDistanceAptitude(trackDistance: TrackDistance): Boolean {
        return this.trackDistance == trackDistance
    }

    /** Checks whether this skill requires a specific TrackSurface to activate.
     *
     * @param trackSurface The TrackSurface to check against.
     *
     * @return Whether this skill requires the [trackSurface] to activate.
     */
    fun checkTrackSurfaceAptitude(trackSurface: TrackSurface): Boolean {
        return this.trackSurface == trackSurface
    }

    /** Calculates a list of inferred running styles for this skill.
     *
     * @return A list of inferred running styles.
     */
    fun calculateInferredRunningStyles(): List<RunningStyle> {
        // If a running style is specified, then we do not want to infer any other styles since they won't apply.
        if (runningStyle != null) {
            return emptyList()
        }

        val result: MutableList<RunningStyle> = mutableListOf()

        if ("order==1" in condition) {
            result.add(RunningStyle.FRONT_RUNNER)
        }

        if ("well-positioned" in description) {
            result.add(RunningStyle.PACE_CHASER)
            result.add(RunningStyle.LATE_SURGER)
        }

        if ("toward the front" in description) {
            result.add(RunningStyle.FRONT_RUNNER)
            result.add(RunningStyle.PACE_CHASER)
        }

        if ("midpack" in description) {
            result.add(RunningStyle.PACE_CHASER)
            result.add(RunningStyle.LATE_SURGER)
        }

        if ("off the pace" in description) {
            result.add(RunningStyle.PACE_CHASER)
            result.add(RunningStyle.LATE_SURGER)
        }

        if ("toward the back" in description) {
            result.add(RunningStyle.LATE_SURGER)
            result.add(RunningStyle.END_CLOSER)
        }

        return result.distinct().toList()
    }
}
