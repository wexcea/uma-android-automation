package com.steve1316.uma_android_automation.llm

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

/** Unit tests for the [GroundingVerifier] hallucination guard. */
@DisplayName("GroundingVerifier Tests")
class GroundingVerifierTest {
    @Test
    @DisplayName("exact-match answer is grounded")
    fun exactMatchGrounded() {
        val answer = "The bot uses YOLOv8 for detection."
        val context = listOf("The bot uses YOLOv8 for detection and OCR.")
        assertTrue(GroundingVerifier.isGrounded(answer, context))
    }

    @Test
    @DisplayName("answer with invented terms is rejected")
    fun inventedTermsRejected() {
        val answer = "The bot uses Kubernetes clusters and Docker Swarm orchestration for training."
        val context = listOf("The bot uses YOLOv8 for detection.")
        assertFalse(GroundingVerifier.isGrounded(answer, context))
    }

    @Test
    @DisplayName("empty answer is treated as trivially grounded")
    fun emptyAnswerGrounded() {
        assertTrue(GroundingVerifier.isGrounded("", listOf("anything")))
    }

    @Test
    @DisplayName("stopword-only overlap fails")
    fun stopwordOnlyOverlapFails() {
        // Answer content words don't appear in context — only stopwords do.
        val answer = "The bot uses reinforcement learning algorithms."
        val context = listOf("The app is a tool for the user.")
        assertFalse(GroundingVerifier.isGrounded(answer, context))
    }

    @Test
    @DisplayName("overlap ratio is bounded in [0, 1]")
    fun overlapRatioBounded() {
        val r = GroundingVerifier.overlap("hello world foo bar", listOf("hello world baz"))
        assertTrue(r in 0f..1f)
        assertEquals(0.5f, r, 0.01f)
    }
}
