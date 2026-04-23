package com.steve1316.uma_android_automation.llm

/**
 * Lightweight post-generation hallucination guard.
 *
 * Tokenizes the model's answer into content-word unigrams and checks what fraction of them appear verbatim in any
 * of the retrieved source chunks the prompt was grounded on. Below the threshold, the orchestrator discards the
 * generated answer and falls back to showing the top retrieved chunk verbatim — the well-studied failure mode for
 * sub-3B instruct models is confident confabulation, and n-gram overlap catches a meaningful fraction of it at
 * negligible cost.
 *
 * Not a replacement for stronger verification (NLI, citation-quote matching); intended as the cheap first layer.
 */
object GroundingVerifier {
    /** Default unigram-overlap threshold — hand-picked to allow natural paraphrase while rejecting invention. */
    const val DEFAULT_THRESHOLD = 0.4f

    /** English stopwords stripped before overlap computation so common function words don't carry the ratio. */
    private val STOPWORDS = setOf(
        "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "and", "or", "but", "if", "then",
        "to", "of", "in", "on", "for", "with", "by", "at", "as", "from", "into", "about", "it", "its", "this",
        "that", "these", "those", "you", "your", "yours", "we", "our", "ours", "they", "them", "their", "theirs",
        "he", "she", "him", "her", "his", "hers", "i", "me", "my", "mine", "not", "no", "yes", "do", "does",
        "did", "doing", "done", "have", "has", "had", "having", "will", "would", "should", "could", "can", "may",
        "might", "must", "shall", "so", "than", "too", "very", "just", "also", "such", "only", "some", "any",
    )

    /**
     * Check whether [answer] is sufficiently supported by the provided [context] chunks.
     *
     * @param answer Generated text from the LLM.
     * @param context Source chunks the prompt grounded the LLM on.
     * @param threshold Minimum fraction of answer content-unigrams that must be present in at least one context chunk.
     * @return true if overlap ≥ [threshold]; false otherwise.
     */
    fun isGrounded(answer: String, context: List<String>, threshold: Float = DEFAULT_THRESHOLD): Boolean {
        return overlap(answer, context) >= threshold
    }

    /**
     * Compute the unigram overlap ratio without applying the threshold. Useful for logging / tuning.
     *
     * @param answer Generated text from the LLM.
     * @param context Source chunks.
     * @return Ratio in [0.0, 1.0]. Returns 1.0 for an empty answer since "nothing" trivially matches.
     */
    fun overlap(answer: String, context: List<String>): Float {
        val answerTokens = contentTokens(answer)
        if (answerTokens.isEmpty()) return 1f
        val contextTokens = HashSet<String>()
        for (c in context) contextTokens.addAll(contentTokens(c))
        var matched = 0
        for (t in answerTokens) if (contextTokens.contains(t)) matched += 1
        return matched.toFloat() / answerTokens.size
    }

    private fun contentTokens(text: String): Set<String> {
        val out = HashSet<String>()
        val lower = text.lowercase()
        val sb = StringBuilder()
        for (ch in lower) {
            if (ch.isLetterOrDigit()) {
                sb.append(ch)
            } else {
                if (sb.isNotEmpty()) {
                    val token = sb.toString()
                    if (token.length > 1 && token !in STOPWORDS) out.add(token)
                    sb.clear()
                }
            }
        }
        if (sb.isNotEmpty()) {
            val token = sb.toString()
            if (token.length > 1 && token !in STOPWORDS) out.add(token)
        }
        return out
    }
}
