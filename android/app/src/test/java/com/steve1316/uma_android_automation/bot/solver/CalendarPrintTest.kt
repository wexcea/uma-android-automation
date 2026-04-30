package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.RaceGrade
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Diagnostic-only: load real races.json and print the schedule produced by the default
 * configuration. Disabled by default; run explicitly via `--tests CalendarPrintTest` to
 * inspect the calendar when calibrating scoring constants.
 */
class CalendarPrintTest {
    /**
     * Wide beam for diagnostic printing — gets close to the algorithmic ceiling so the printed
     * schedule reflects the best the heuristic can do. Beam plateaus around ~32 races / ~15
     * epithets for Special Week with default weights; the reference Trackblazer site (exact MILP)
     * finds 35 races / 23 epithets, so a ~3-race / ~8-epithet gap is expected here. To match
     * exactly we'd need a MILP solver in Kotlin or a post-beam local-search refinement.
     */
    private val BEAM_WIDTH: Int = 256

    private fun loadRacesJson(): String = readRepoFile("src/data/races.json")

    private fun loadEpithetsJson(): String = readRepoFile("src/data/epithets.json")

    private fun readRepoFile(relPath: String): String {
        val candidates =
            listOf(
                File("../../$relPath"),
                File(relPath),
            )
        return candidates.first { it.exists() }.readText()
    }

    private fun parseRaces(json: String): Map<TurnNumber, List<RaceCandidate>> = SmartRaceSolverIntegration.parseRacesData(json)

    private fun parseEpithetsList(json: String): List<Epithet> = SmartRaceSolverIntegration.parseEpithets(json)

    /**
     * Maps a turn number (1-72) to its in-game date. Each class year is 24 turns starting
     * Jan First Half and ending Dec Second Half. Verified against races.json (e.g. "Aichi Hai
     * (Senior Class January, First Half)" = turn 49, "Takarazuka Kinen (Senior Class June,
     * Second Half)" = turn 60).
     */
    private fun turnLabel(t: Int): String {
        val year =
            when ((t - 1) / 24) {
                0 -> "Junior"
                1 -> "Classic"
                else -> "Senior"
            }
        val into = (t - 1) % 24
        val month = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[into / 2]
        val half = if (into % 2 == 0) "Early" else "Late"
        return "$year $half $month"
    }

    @Test
    fun printDefaultCalendarAllA_thresholdC() {
        printSchedule(
            label = "all-A, threshold C, no preset, no targets",
            aptitudes = Aptitudes.DEFAULT_A,
            weights = Weights(),
        )
    }

    @Test
    fun printSpecialWeekDefault() {
        // Special Week: Sprint F, Mile C, Medium A, Long A, Turf A, Dirt G
        printSchedule(
            label = "Special Week preset, threshold C, no targets",
            aptitudes =
                Aptitudes(
                    sprint = Aptitude.F,
                    mile = Aptitude.C,
                    medium = Aptitude.A,
                    long = Aptitude.A,
                    turf = Aptitude.A,
                    dirt = Aptitude.G,
                ),
            weights = Weights(),
        )
    }

    private fun printSchedule(label: String, aptitudes: Aptitudes, weights: Weights) {
        val racesByTurn = parseRaces(loadRacesJson())
        val epithets = parseEpithetsList(loadEpithetsJson())
        val state =
            SolverState(
                currentTurn = 1,
                scenario = "Trackblazer",
                characterPreset = null,
                aptitudes = aptitudes,
                racesByTurn = racesByTurn,
                epithets = epithets,
                weights = weights,
            )
        val schedule = SmartRaceSolver.solve(state, beamWidth = BEAM_WIDTH)
        val raceCount = schedule.decisions.values.count { it is Decision.RaceDecision }
        val trainCount = schedule.decisions.values.count { it == Decision.Train }
        val restCount = schedule.decisions.values.count { it == Decision.Rest }

        // Reference-style breakdown: race stats, race SP, epithet stats, hint count.
        val rb = weights.raceBonusPct.coerceAtLeast(0.0) / 100.0
        val baseStat: (RaceGrade) -> Int = { g ->
            when (g) {
                RaceGrade.G1 -> 10
                RaceGrade.G2, RaceGrade.G3 -> 8
                RaceGrade.OP -> 5
                RaceGrade.PRE_OP -> 5
                else -> 0
            }
        }
        val baseSp: (RaceGrade) -> Int = { g ->
            when (g) {
                RaceGrade.G1 -> 35
                RaceGrade.G2, RaceGrade.G3 -> 25
                RaceGrade.OP -> 15
                RaceGrade.PRE_OP -> 10
                else -> 0
            }
        }
        var raceStats = 0
        var raceSp = 0
        for ((turn, d) in schedule.decisions) {
            if (d !is Decision.RaceDecision) continue
            val r = racesByTurn[turn]?.firstOrNull { it.key == d.raceKey } ?: continue
            raceStats += Math.floor(baseStat(r.grade) * (1.0 + rb)).toInt()
            raceSp += Math.floor(baseSp(r.grade) * (1.0 + rb)).toInt()
        }
        val byName = epithets.associateBy { it.name }
        val epithetStats = schedule.projectedEpithets.sumOf { name -> if (byName[name]?.rewardKind == "stat") byName[name]?.amount ?: 0 else 0 }
        val hints = schedule.projectedEpithets.count { name -> byName[name]?.rewardKind == "hint" }

        println("=== Schedule: $label (beam=$BEAM_WIDTH) ===")
        println("Race=$raceCount Train=$trainCount Rest=$restCount Total=${schedule.decisions.size} Score=${"%.2f".format(schedule.totalScore)}")
        println("Epithets=${schedule.projectedEpithets.size}  RaceStats=$raceStats  RaceSP=$raceSp  EpithetStats=$epithetStats  Hints=$hints")
        for (turn in 1..72) {
            val d = schedule.decisions[turn]
            val turnRaces = racesByTurn[turn].orEmpty()
            val available = turnRaces.filter { ScoringFunctions.isEligible(it, state) }
            val pickName =
                when (d) {
                    is Decision.RaceDecision -> {
                        val r = turnRaces.firstOrNull { it.key == d.raceKey }
                        "RACE: ${r?.grade?.name ?: "?"} ${r?.name ?: d.raceKey} (fans=${r?.fans})"
                    }
                    Decision.Train -> "Train"
                    Decision.Rest -> "Rest"
                    null -> "(none)"
                }
            val avail = if (available.isEmpty()) "" else "  [avail=${available.size}: ${available.take(3).joinToString { "${it.grade.name}-${it.name}" }}${if (available.size > 3) "..." else ""}]"
            println("T${turn.toString().padStart(2, '0')} ${turnLabel(turn).padEnd(15)}  $pickName$avail")
        }
        println()
    }
}
