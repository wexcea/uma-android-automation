package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.bot.solver.TestFixtures.race
import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MandatoryRacesTest {
    private val sampleJson =
        """
        {
          "Taiki Shuttle": {
            "name": "Taiki Shuttle",
            "mandatoryRaces": [
              { "turn": 25, "isChoice": false, "options": [
                { "raceName": "Shinzan Kinen", "grade": "G3", "surface": "Turf", "distanceType": "Mile", "fans": 3800 }
              ] },
              { "turn": 34, "isChoice": true, "options": [
                { "raceName": "Japanese Oaks", "grade": "G1", "surface": "Turf", "distanceType": "Medium", "fans": 20000 },
                { "raceName": "Tokyo Yushun", "grade": "G1", "surface": "Dirt", "distanceType": "Medium", "fans": 20000 }
              ] }
            ]
          }
        }
        """.trimIndent()

    @Test
    fun parsesObjectivesByCharacter() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val taiki = parsed["Taiki Shuttle"]
        assertNotNull(taiki)
        assertEquals(2, taiki!!.size)
        assertEquals(25, taiki[0].turn)
        assertEquals(RaceGrade.G3, taiki[0].options[0].grade)
        assertEquals(TrackSurface.TURF, taiki[0].options[0].surface)
        assertEquals(TrackDistance.MILE, taiki[0].options[0].distanceType)
        assertEquals(3800, taiki[0].options[0].fans)
        assertTrue(taiki[1].isChoice)
    }

    @Test
    fun selectsBestAptitudeOption() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val choice = parsed["Taiki Shuttle"]!![1]
        // Turf A vs Dirt G -> the Turf option (Japanese Oaks) wins.
        val apt = Aptitudes(Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.G)
        assertEquals("Japanese Oaks", MandatoryRaces.selectBestOption(choice.options, apt).raceName)
    }

    @Test
    fun trackblazerScenarioAppliesNothing() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val races = mapOf(25 to listOf(race("Shinzan Kinen", 25)))
        val result = MandatoryRaces.apply("Trackblazer", "Taiki Shuttle", Aptitudes.DEFAULT_A, races, emptyMap(), parsed)
        assertTrue(result.lockedDecisions.isEmpty())
    }

    @Test
    fun nullPresetAppliesNothing() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val result = MandatoryRaces.apply("URA Finale", null, Aptitudes.DEFAULT_A, emptyMap(), emptyMap(), parsed)
        assertTrue(result.lockedDecisions.isEmpty())
    }

    @Test
    fun unknownPresetAppliesNothing() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val races = mapOf(25 to listOf(race("Shinzan Kinen", 25)))
        val result = MandatoryRaces.apply("URA Finale", "Nonexistent Character", Aptitudes.DEFAULT_A, races, emptyMap(), parsed)
        assertTrue(result.lockedDecisions.isEmpty())
        assertEquals(races, result.racesByTurn)
    }

    @Test
    fun locksExistingRaceAndFlagsItMandatory() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val existing = race("Shinzan Kinen", 25)
        val races = mapOf(25 to listOf(existing))
        val result = MandatoryRaces.apply("URA Finale", "Taiki Shuttle", Aptitudes.DEFAULT_A, races, emptyMap(), parsed)
        val locked = result.lockedDecisions[25]
        assertTrue(locked is Decision.RaceDecision)
        val key = (locked as Decision.RaceDecision).raceKey
        val candidate = result.racesByTurn[25]!!.first { it.key == key }
        assertTrue(candidate.isMandatory)
        assertEquals("Shinzan Kinen", candidate.name)
    }

    @Test
    fun injectsSyntheticCandidateWhenRaceMissing() {
        val parsed = MandatoryRaces.parse(sampleJson)
        // Turn 25 has no candidate in the pool -> a synthetic one is injected and locked.
        val result = MandatoryRaces.apply("URA Finale", "Taiki Shuttle", Aptitudes.DEFAULT_A, emptyMap(), emptyMap(), parsed)
        val locked = result.lockedDecisions[25] as Decision.RaceDecision
        val candidate = result.racesByTurn[25]!!.first { it.key == locked.raceKey }
        assertTrue(candidate.isMandatory)
        assertEquals(RaceGrade.G3, candidate.grade)
        assertEquals(25, candidate.turnNumber)
    }

    @Test
    fun mandatoryOverridesManualLock() {
        val parsed = MandatoryRaces.parse(sampleJson)
        val existing = race("Shinzan Kinen", 25)
        val races = mapOf(25 to listOf(existing))
        val manual = mapOf(25 to Decision.Train as Decision)
        val result = MandatoryRaces.apply("URA Finale", "Taiki Shuttle", Aptitudes.DEFAULT_A, races, manual, parsed)
        assertTrue(result.lockedDecisions[25] is Decision.RaceDecision)
    }
}
