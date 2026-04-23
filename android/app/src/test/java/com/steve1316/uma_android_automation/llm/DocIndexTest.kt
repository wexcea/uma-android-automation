package com.steve1316.uma_android_automation.llm

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * Unit tests for [DocIndex] covering binary format round-trip, cosine search correctness, and edge cases.
 */
@DisplayName("DocIndex Tests")
class DocIndexTest {
    private fun l2Normalize(v: FloatArray): FloatArray {
        var s = 0f
        for (x in v) s += x * x
        val n = sqrt(s)
        return if (n == 0f) v else FloatArray(v.size) { v[it] / n }
    }

    private fun encodeIndex(chunks: List<Triple<Triple<String, String, String>, String, FloatArray>>, dim: Int): ByteArray {
        val out = ByteArrayOutputStream()
        val d = DataOutputStream(out)
        d.write("UMADOCIX".toByteArray(Charsets.UTF_8))
        writeU32LE(d, 1)
        writeU32LE(d, chunks.size)
        writeU32LE(d, dim)
        for ((meta, text, emb) in chunks) {
            val (id, source, heading) = meta
            val idBytes = id.toByteArray(Charsets.UTF_8)
            val sourceBytes = source.toByteArray(Charsets.UTF_8)
            val headingBytes = heading.toByteArray(Charsets.UTF_8)
            val textBytes = text.toByteArray(Charsets.UTF_8)
            writeU16LE(d, idBytes.size); d.write(idBytes)
            writeU16LE(d, sourceBytes.size); d.write(sourceBytes)
            writeU16LE(d, headingBytes.size); d.write(headingBytes)
            writeU32LE(d, textBytes.size); d.write(textBytes)
            val bb = ByteBuffer.allocate(dim * 4).order(ByteOrder.LITTLE_ENDIAN)
            for (x in emb) bb.putFloat(x)
            d.write(bb.array())
        }
        return out.toByteArray()
    }

    private fun writeU16LE(d: DataOutputStream, v: Int) {
        d.write(v and 0xFF); d.write((v ushr 8) and 0xFF)
    }

    private fun writeU32LE(d: DataOutputStream, v: Int) {
        d.write(v and 0xFF); d.write((v ushr 8) and 0xFF); d.write((v ushr 16) and 0xFF); d.write((v ushr 24) and 0xFF)
    }

    @Test
    @DisplayName("round-trips three chunks through the binary format")
    fun roundTripsBinary() {
        val dim = 4
        val a = l2Normalize(floatArrayOf(1f, 0f, 0f, 0f))
        val b = l2Normalize(floatArrayOf(0f, 1f, 0f, 0f))
        val c = l2Normalize(floatArrayOf(0.8f, 0.6f, 0f, 0f))
        val bytes = encodeIndex(
            listOf(
                Triple(Triple("id-a", "README.md", "Alpha"), "alpha chunk", a),
                Triple(Triple("id-b", "HOW_IT_WORKS.md", "Bravo"), "bravo chunk", b),
                Triple(Triple("id-c", "README.md", "Charlie"), "charlie chunk", c),
            ),
            dim,
        )
        val index = DocIndex.load(ByteArrayInputStream(bytes))
        assertEquals(3, index.chunks.size)
        assertEquals(4, index.dim)
        assertEquals("id-b", index.chunks[1].id)
        assertEquals("HOW_IT_WORKS.md", index.chunks[1].source)
        assertEquals("bravo chunk", index.chunks[1].text)
    }

    @Test
    @DisplayName("search returns exact match first")
    fun searchReturnsExactMatch() {
        val dim = 4
        val a = l2Normalize(floatArrayOf(1f, 0f, 0f, 0f))
        val b = l2Normalize(floatArrayOf(0f, 1f, 0f, 0f))
        val c = l2Normalize(floatArrayOf(0.8f, 0.6f, 0f, 0f))
        val bytes = encodeIndex(
            listOf(
                Triple(Triple("id-a", "A.md", "A"), "alpha", a),
                Triple(Triple("id-b", "B.md", "B"), "bravo", b),
                Triple(Triple("id-c", "C.md", "C"), "charlie", c),
            ),
            dim,
        )
        val index = DocIndex.load(ByteArrayInputStream(bytes))
        val results = index.search(a, k = 3)
        assertEquals("id-a", results[0].chunk.id)
        assertTrue(results[0].score > 0.99f, "exact match should score ~1.0")
        assertTrue(results[0].score > results[1].score)
    }

    @Test
    @DisplayName("search caps results at k")
    fun searchCapsAtK() {
        val dim = 2
        val bytes = encodeIndex(
            (0 until 10).map { i ->
                val v = l2Normalize(floatArrayOf(i.toFloat(), 1f))
                Triple(Triple("id-$i", "S", "H"), "t-$i", v)
            },
            dim,
        )
        val index = DocIndex.load(ByteArrayInputStream(bytes))
        assertEquals(3, index.search(floatArrayOf(1f, 0f), k = 3).size)
    }
}
