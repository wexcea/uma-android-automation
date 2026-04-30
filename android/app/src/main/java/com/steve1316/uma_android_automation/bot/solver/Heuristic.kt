package com.steve1316.uma_android_automation.bot.solver

/**
 * Beam-search heuristic. Explores the schedule space turn by turn, keeping the top [DEFAULT_BEAM_WIDTH]
 * partial schedules at each step. Each step expands every active beam into one child per legal
 * decision (locked decision, available race, Train, Rest), scores the child, and re-prunes.
 *
 * The heuristic is deterministic — same [SolverState] in, same beams out — provided the candidate
 * pool ordering is stable. We rely on `state.racesByTurn` already being deterministically sorted
 * by the race key string when constructed by the wiring layer.
 */
object Heuristic {
    const val DEFAULT_BEAM_WIDTH: Int = 32
    const val LAST_TURN: TurnNumber = 72

    /**
     * Runs the search and returns the highest-scoring schedule found.
     *
     * @param state Initial solver state. The search plans from `state.currentTurn` to [LAST_TURN].
     * @param beamWidth Maximum number of partial schedules retained per step.
     */
    fun search(state: SolverState, beamWidth: Int = DEFAULT_BEAM_WIDTH): Schedule {
        var beams: List<Beam> = listOf(initialBeam(state))
        for (turn in state.currentTurn..LAST_TURN) {
            val expanded = beams.flatMap { expand(it, turn, state) }
            beams = keepTopK(expanded, beamWidth, state)
            if (beams.isEmpty()) break
        }
        val best =
            beams.maxByOrNull { it.score }
                ?: return Schedule(emptyMap(), emptySet(), 0.0)
        return Schedule(
            decisions = best.decisions.toMap(),
            projectedEpithets = best.completedEpithets,
            totalScore = best.score,
        )
    }

    private fun initialBeam(state: SolverState): Beam =
        Beam(
            decisions = emptyList(),
            raceHistory = state.raceHistory,
            completedEpithets = state.completedEpithets,
            consecutiveRaces = countTrailingRaces(state.raceHistory, state.currentTurn - 1),
            score = 0.0,
        )

    /** Counts how many consecutive races end at [endTurn] in the existing history. */
    private fun countTrailingRaces(history: List<RaceWin>, endTurn: TurnNumber): Int {
        if (endTurn <= 0) return 0
        val turns = history.map { it.turnNumber }.toSet()
        var count = 0
        var t = endTurn
        while (t > 0 && t in turns) {
            count++
            t--
        }
        return count
    }

    /** Returns child beams for [beam] at [turn]. Honours [SolverState.lockedDecisions]. */
    private fun expand(beam: Beam, turn: TurnNumber, state: SolverState): List<Beam> {
        val lock = state.lockedDecisions[turn]
        if (lock != null) return listOf(applyDecision(beam, turn, lock, state))

        val alreadyWon = beam.raceHistory.mapTo(HashSet()) { it.raceKey }
        val racesHere =
            state.racesByTurn[turn].orEmpty()
                .filter { ScoringFunctions.isEligible(it, state) }
                .filter { it.key !in alreadyWon }

        val children = ArrayList<Beam>(racesHere.size + 2)
        for (race in racesHere) {
            children += applyDecision(beam, turn, Decision.RaceDecision(race.key), state)
        }
        children += applyDecision(beam, turn, Decision.Train, state)
        children += applyDecision(beam, turn, Decision.Rest, state)
        return children
    }

    private fun applyDecision(
        beam: Beam,
        turn: TurnNumber,
        decision: Decision,
        state: SolverState,
    ): Beam =
        when (decision) {
            is Decision.RaceDecision -> applyRace(beam, turn, decision, state)
            Decision.Train ->
                beam.copy(
                    decisions = beam.decisions + (turn to decision),
                    consecutiveRaces = 0,
                    score = beam.score + ScoringFunctions.trainValue(state.weights),
                )
            Decision.Rest ->
                beam.copy(
                    decisions = beam.decisions + (turn to decision),
                    consecutiveRaces = 0,
                    score = beam.score + ScoringFunctions.restValue(state.weights),
                )
        }

    private fun applyRace(
        beam: Beam,
        turn: TurnNumber,
        decision: Decision.RaceDecision,
        state: SolverState,
    ): Beam {
        val race =
            state.racesByTurn[turn]?.firstOrNull { it.key == decision.raceKey }
                ?: return beam.copy(decisions = beam.decisions + (turn to decision))

        val newHistory = beam.raceHistory + RaceWin(race.key, race.name, race.classYear, turn)
        val newConsec = beam.consecutiveRaces + 1

        // Re-evaluate epithet completions with the new history (already-completed epithets are
        // not re-checked since their matchers are monotonically satisfied).
        val syntheticState =
            state.copy(
                raceHistory = newHistory,
                completedEpithets = beam.completedEpithets,
            )
        val newlyCompleted =
            state.epithets.filter { epithet ->
                epithet.name !in beam.completedEpithets &&
                    epithet.name !in state.deadEpithets &&
                    EpithetTracker.isCompleted(epithet, syntheticState)
            }

        val baseScore = ScoringFunctions.raceValue(race, state.weights)
        // Mirror the reference Trackblazer solver: every epithet completion contributes its
        // reward to the objective. This is what makes G2/G3 races (which net zero on grade-
        // and-cost alone) competitive — a free epithet reward tips the balance over Train.
        // Forced epithets are still surfaced via the feasibility check in [keepTopK]; targeted
        // epithets get an additional weight boost via [Weights.epithetValue].
        val epithetGain =
            newlyCompleted.sumOf { ScoringFunctions.epithetContribution(it, state.weights) }
        val summer = ScoringFunctions.summerBlockPenalty(turn, state)
        val consec = ScoringFunctions.consecutiveRacePenalty(newConsec, turn, state.weights)

        return beam.copy(
            decisions = beam.decisions + (turn to decision),
            raceHistory = newHistory,
            completedEpithets = beam.completedEpithets + newlyCompleted.map { it.name },
            consecutiveRaces = newConsec,
            score = beam.score + baseScore + epithetGain - summer - consec,
        )
    }

    /**
     * Prunes beams that can no longer satisfy a forced epithet, then sorts by score and
     * keeps the top [k]. Stable-sorted to keep ties deterministic.
     */
    private fun keepTopK(beams: List<Beam>, k: Int, state: SolverState): List<Beam> {
        if (beams.isEmpty()) return beams
        val viable =
            beams.filter { beam ->
                state.forcedEpithets.all { name ->
                    name in beam.completedEpithets || canStillComplete(name, state)
                }
            }
        return viable.sortedWith(compareByDescending<Beam> { it.score }.thenBy { it.decisions.size })
            .take(k)
    }

    /**
     * Conservative reachability check: an epithet is considered still completable as long as
     * it is not flagged dead and there are turns remaining. The full forward feasibility
     * analysis is intentionally deferred — beams that pursue dead-ends are filtered out by
     * the score-based prune in [keepTopK] over time.
     */
    private fun canStillComplete(epithetName: String, state: SolverState): Boolean =
        epithetName !in state.deadEpithets

    /** Internal beam representation. Kept private to discourage external mutation. */
    private data class Beam(
        val decisions: List<Pair<TurnNumber, Decision>>,
        val raceHistory: List<RaceWin>,
        val completedEpithets: Set<String>,
        val consecutiveRaces: Int,
        val score: Double,
    )
}
