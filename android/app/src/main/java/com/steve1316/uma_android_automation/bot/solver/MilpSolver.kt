package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.RaceGrade
import org.ojalgo.optimisation.ExpressionsBasedModel
import org.ojalgo.optimisation.Variable

/**
 * Exact Mixed-Integer Linear Programming backend for the Smart Race Solver, mirroring the
 * reference Trackblazer site's `solver-browser.js` GLPK formulation.
 *
 * Decision variables (all binary):
 *  - `x[turn]` — race vs train at each turn from `currentTurn` to LAST_TURN.
 *  - `r[turn][raceKey]` — which specific race is picked. Σ r[turn][*] = x[turn].
 *  - `y[epithet]` — whether the epithet is completed by the end of the schedule.
 *  - `z[turn]` — third-or-later consecutive race indicator (turns currentTurn+2..LAST_TURN).
 *
 * Objective (maximize):
 *   Σ r[turn][race] · raceValue(race)
 *   + Σ y[epithet] · epithetContribution(epithet)
 *   − Σ z[turn] · consecutiveRacePenalty   (zero on Late-Dec turns 23, 47, 71)
 *   − Σ x[summer turn] · summerPenalty
 *
 * Each [EpithetMatcher] becomes one or two linear inequalities tying y[e] to the relevant
 * sum of r-variables and a history-derived constant.
 */
object MilpSolver {
    private val LATE_DEC_FREE_TURNS: Set<TurnNumber> = setOf(23, 47, 71)

    /** Classic + Senior summer race-blocked turns (Early Jul → Late Aug). */
    private val CLASSIC_SENIOR_SUMMER_TURNS: Set<TurnNumber> = setOf(37, 38, 39, 40, 61, 62, 63, 64)
    private val GRADED: Set<RaceGrade> = setOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3)
    private val GRADED_OR_OPEN: Set<RaceGrade> =
        setOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3, RaceGrade.OP, RaceGrade.PRE_OP)

    /** ojAlgo variable names accept only `[A-Za-z0-9_]`; replace anything else with `_`. */
    private fun sanitize(s: String): String = s.replace(Regex("[^A-Za-z0-9_]"), "_")

    /** Solve [state] via exact MILP. Returns a [Schedule] equivalent to [Heuristic]'s contract. */
    fun solve(state: SolverState): Schedule {
        if (state.currentTurn > Heuristic.LAST_TURN) return Schedule(emptyMap(), emptySet(), 0.0)
        return ModelBuilder(state).build()
    }

    /** One-shot model construction. State is local to a single solve. */
    private class ModelBuilder(private val state: SolverState) {
        private val model = ExpressionsBasedModel()
        private val turns: IntRange = state.currentTurn..Heuristic.LAST_TURN

        // Eligible races per turn (after aptitude filter and removing already-won races).
        private val eligibleByTurn: Map<TurnNumber, List<RaceCandidate>> =
            run {
                val won = state.raceHistory.mapTo(HashSet()) { it.raceKey }
                turns.associateWith { t ->
                    state.racesByTurn[t].orEmpty()
                        .filter { ScoringFunctions.isEligible(it, state) }
                        .filter { it.key !in won }
                }
            }

        // x[turn] — 1 if any race is picked.
        private val xVars: Map<TurnNumber, Variable> =
            turns.associateWith { t ->
                model.newVariable("x_$t").binary()
            }

        // r[turn][raceKey] — picks the specific race.
        private val raceVars: Map<TurnNumber, Map<String, Variable>> =
            turns.associateWith { t ->
                eligibleByTurn[t].orEmpty().associate { race ->
                    race.key to model.newVariable("r_${t}_${sanitize(race.key)}").binary()
                }
            }

        // y[epithetName] — projected to complete. Dead epithets get no variable (forced to 0).
        private val epithetVars: Map<String, Variable> =
            state.epithets
                .filter { it.name !in state.deadEpithets }
                .associate { e -> e.name to model.newVariable("y_${sanitize(e.name)}").binary() }

        // z[turn] — third-or-later consecutive race indicator.
        private val zVars: Map<TurnNumber, Variable> =
            turns
                .filter { t -> (t - 2) in turns }
                .associateWith { t -> model.newVariable("z_$t").binary() }

        fun build(): Schedule {
            wireXrConsistency()
            wireSummerHardBlock()
            wireManualLocks()
            wireConsecutiveRaceIndicators()
            wireEpithetMatchers()
            wireDependsOn()
            wireForcedEpithets()
            wireObjective()

            val result = model.maximise()
            if (!result.state.isFeasible) {
                return Schedule(emptyMap(), emptySet(), 0.0)
            }
            return extractSchedule(result.value)
        }

        /** Σ r[t][*] − x[t] = 0. With no eligible races, force x[t] = 0. */
        private fun wireXrConsistency() {
            for (t in turns) {
                val races = raceVars[t].orEmpty()
                if (races.isEmpty()) {
                    xVars[t]!!.upper(0.0)
                    continue
                }
                val expr = model.newExpression("xr_$t").lower(0.0).upper(0.0)
                expr.set(xVars[t]!!, -1.0)
                for ((_, v) in races) expr.set(v, 1.0)
            }
        }

        /** When [Weights.allowSummerRacing] is false, force x[t]=0 on Classic/Senior summer turns. */
        private fun wireSummerHardBlock() {
            if (state.weights.allowSummerRacing) return
            for (t in CLASSIC_SENIOR_SUMMER_TURNS) {
                if (t in turns) xVars[t]!!.upper(0.0)
            }
        }

        /** Manual locks: a Race lock forces r[t][key]=1; Train/Rest forces x[t]=0. */
        private fun wireManualLocks() {
            for ((turn, decision) in state.lockedDecisions) {
                if (turn !in turns) continue
                when (decision) {
                    is Decision.RaceDecision -> {
                        val v = raceVars[turn]?.get(decision.raceKey)
                        if (v != null) v.lower(1.0) else xVars[turn]!!.upper(0.0)
                    }
                    Decision.Train, Decision.Rest -> xVars[turn]!!.upper(0.0)
                }
            }
        }

        /**
         * z[t] ≥ x[t] + x[t-1] + x[t-2] − 2 — pushed to 1 only when all three are 1, since the
         * objective prefers z=0 (negative weight).
         */
        private fun wireConsecutiveRaceIndicators() {
            for ((t, z) in zVars) {
                val expr = model.newExpression("consec_$t")
                expr.set(z, 1.0)
                expr.set(xVars[t]!!, -1.0)
                expr.set(xVars[t - 1]!!, -1.0)
                expr.set(xVars[t - 2]!!, -1.0)
                // expr = z − x − x − x ≥ −2
                expr.lower(-2.0)
            }
        }

        /** Each matcher becomes a linear inequality `required · y ≤ progress + history_constant`. */
        private fun wireEpithetMatchers() {
            for (epithet in state.epithets) {
                val y = epithetVars[epithet.name] ?: continue
                for ((idx, matcher) in epithet.matchers.withIndex()) {
                    val (required, terms, constant) = linearise(matcher) ?: continue
                    val expr = model.newExpression("ep_${sanitize(epithet.name)}_$idx")
                    // required · y − Σ terms ≤ constant
                    expr.set(y, required.toDouble())
                    for ((variable, coeff) in terms) expr.set(variable, expr.get(variable).toDouble() - coeff)
                    expr.upper(constant)
                }
            }
        }

        /** y[child] ≤ y[prereq] for each `dependsOn` edge. */
        private fun wireDependsOn() {
            for (epithet in state.epithets) {
                val y = epithetVars[epithet.name] ?: continue
                for (prereq in epithet.dependsOn) {
                    val parent = epithetVars[prereq] ?: continue
                    val expr = model.newExpression("dep_${sanitize(epithet.name)}_${sanitize(prereq)}")
                    expr.set(y, 1.0).set(parent, -1.0).upper(0.0)
                }
            }
        }

        /** y[name] = 1 for forced epithets that aren't dead. */
        private fun wireForcedEpithets() {
            for (name in state.forcedEpithets) epithetVars[name]?.lower(1.0)
        }

        /** Sum race rewards, epithet rewards, and subtract penalties via variable weights. */
        private fun wireObjective() {
            for ((t, races) in raceVars) {
                val byKey = state.racesByTurn[t]?.associateBy { it.key } ?: continue
                for ((key, v) in races) {
                    val race = byKey[key] ?: continue
                    var w = ScoringFunctions.raceValue(race, state.weights)
                    if (t in state.summerBlockTurns) w -= state.weights.summerPenalty
                    v.weight(w)
                }
            }
            for ((name, v) in epithetVars) {
                val epithet = state.epithetsByName[name] ?: continue
                v.weight(ScoringFunctions.epithetContribution(epithet, state.weights))
            }
            for ((t, v) in zVars) {
                if (t in LATE_DEC_FREE_TURNS) continue
                v.weight(-state.weights.consecutiveRacePenalty)
            }
        }

        private fun extractSchedule(objectiveValue: Double): Schedule {
            val decisions = HashMap<TurnNumber, Decision>(turns.last - turns.first + 1)
            for (t in turns) {
                val raceOn = (xVars[t]?.value?.toDouble() ?: 0.0) > 0.5
                if (raceOn) {
                    val pickedKey =
                        raceVars[t].orEmpty().entries
                            .firstOrNull { (_, v) -> (v.value?.toDouble() ?: 0.0) > 0.5 }
                            ?.key
                    decisions[t] = if (pickedKey != null) Decision.RaceDecision(pickedKey) else Decision.Train
                } else {
                    decisions[t] = Decision.Train
                }
            }
            val projected =
                epithetVars
                    .filter { (_, v) -> (v.value?.toDouble() ?: 0.0) > 0.5 }
                    .keys
                    .toSet() + state.completedEpithets
            return Schedule(decisions, projected, objectiveValue)
        }

        // ---------------- Linearisation helpers ----------------

        /**
         * Returns `(required, terms, constantBound)` such that the matcher is satisfied iff
         * `required · y ≤ Σ coeff·var + constantBound`. Returns null when the matcher can't be
         * linearised (e.g., reference to an epithet not in [epithetVars]).
         */
        private fun linearise(matcher: EpithetMatcher): Triple<Int, Map<Variable, Double>, Double>? {
            return when (matcher) {
                is EpithetMatcher.WinRace -> {
                    // Need 1 win of `name` (optionally at class).
                    val terms = sumRaceVars(matcher.name, matcher.atClass)
                    val historyHits =
                        state.raceHistory.count {
                            it.name == matcher.name && (matcher.atClass == null || it.classYear.equals(matcher.atClass, ignoreCase = true))
                        }
                    Triple(1, terms, historyHits.toDouble())
                }
                is EpithetMatcher.WinRaceTimes -> {
                    val terms = sumRaceVars(matcher.name)
                    val historyHits = state.raceHistory.count { it.name == matcher.name }
                    Triple(matcher.times, terms, historyHits.toDouble())
                }
                is EpithetMatcher.WinAnyOf -> {
                    val terms = HashMap<Variable, Double>()
                    var historyHits = 0
                    for (name in matcher.names) {
                        for ((v, c) in sumRaceVars(name, matcher.atClass)) {
                            terms[v] = (terms[v] ?: 0.0) + c
                        }
                        historyHits +=
                            state.raceHistory.count {
                                it.name == name && (matcher.atClass == null || it.classYear.equals(matcher.atClass, ignoreCase = true))
                            }
                    }
                    Triple(matcher.count, terms, historyHits.toDouble())
                }
                is EpithetMatcher.WinAtLeast -> {
                    val terms = HashMap<Variable, Double>()
                    var historyHits = 0
                    for (name in matcher.names) {
                        for ((v, c) in sumRaceVars(name)) terms[v] = (terms[v] ?: 0.0) + c
                        historyHits += state.raceHistory.count { it.name == name }
                    }
                    Triple(matcher.count, terms, historyHits.toDouble())
                }
                is EpithetMatcher.WinCount -> {
                    val terms = sumRaceVarsByFilter(matcher.filter)
                    val historyHits = state.raceHistory.count { historyMatchesFilter(it, matcher.filter) }
                    Triple(matcher.count, terms, historyHits.toDouble())
                }
                is EpithetMatcher.EpithetAnyOf -> {
                    // 1·y[e] ≤ Σ y[name] — at least one of the named epithets must be completed.
                    val others = matcher.names.mapNotNull { epithetVars[it] }
                    if (others.isEmpty()) return Triple(1, emptyMap(), -1.0) // unreachable
                    val terms = others.associateWith { 1.0 }
                    Triple(1, terms, 0.0)
                }
                is EpithetMatcher.EpithetAll -> {
                    // N·y[e] ≤ Σ y[name] — every prereq must be completed. Any dead prereq
                    // makes the AND unsatisfiable, so emit an unreachable bound.
                    val others = matcher.names.mapNotNull { epithetVars[it] }
                    if (others.size != matcher.names.size) return Triple(1, emptyMap(), -1.0)
                    val terms = others.associateWith { 1.0 }
                    Triple(matcher.names.size, terms, 0.0)
                }
            }
        }

        /** All r-vars whose race name (and optional class) match. */
        private fun sumRaceVars(raceName: String, atClass: String? = null): Map<Variable, Double> {
            val out = HashMap<Variable, Double>()
            for (t in turns) {
                val byKey = raceVars[t] ?: continue
                val candidates = state.racesByTurn[t] ?: continue
                for (race in candidates) {
                    if (race.name != raceName) continue
                    if (atClass != null && !race.classYear.equals(atClass, ignoreCase = true)) continue
                    val v = byKey[race.key] ?: continue
                    out[v] = (out[v] ?: 0.0) + 1.0
                }
            }
            return out
        }

        /** All r-vars whose race matches the filter predicate. */
        private fun sumRaceVarsByFilter(filter: EpithetFilter): Map<Variable, Double> {
            val out = HashMap<Variable, Double>()
            for (t in turns) {
                val byKey = raceVars[t] ?: continue
                val candidates = state.racesByTurn[t] ?: continue
                for (race in candidates) {
                    if (!matchesFilter(race, filter)) continue
                    val v = byKey[race.key] ?: continue
                    out[v] = (out[v] ?: 0.0) + 1.0
                }
            }
            return out
        }

        private fun historyMatchesFilter(win: RaceWin, filter: EpithetFilter): Boolean {
            val race = state.racesByTurn[win.turnNumber]?.firstOrNull { it.key == win.raceKey } ?: return false
            return matchesFilter(race, filter)
        }

        private fun matchesFilter(c: RaceCandidate, f: EpithetFilter): Boolean {
            if (f.terrain != null && c.terrain != f.terrain) return false
            if (f.grade != null && c.grade != f.grade) return false
            if (f.gradeAtLeastOpen && c.grade !in GRADED_OR_OPEN) return false
            if (f.gradedOnly && c.grade !in GRADED) return false
            if (f.distanceTypes.isNotEmpty() && c.distanceType !in f.distanceTypes) return false
            if (f.raceTracks.isNotEmpty() && c.raceTrack !in f.raceTracks) return false
            if (f.nameContains != null && !c.name.contains(f.nameContains, ignoreCase = true)) return false
            if (f.nameContainsCountry && !EpithetFilters.nameContainsCountry(c.name)) return false
            return true
        }
    }
}
