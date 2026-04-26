/**
 * TypeScript port of GroundingVerifier.kt.
 *
 * Lightweight post-generation hallucination guard: tokenizes the model's answer into content-word unigrams and
 * checks what fraction of them appear verbatim in any of the retrieved source chunks. Below the threshold, the
 * orchestrator discards the generated answer and falls back to showing the top retrieved chunk verbatim.
 *
 * Identical algorithm to the Kotlin original so behavior matches the existing 5 JUnit cases.
 */

/** Default unigram-overlap threshold — hand-picked to allow natural paraphrase while rejecting invention. */
export const DEFAULT_THRESHOLD = 0.4

/** Lower threshold the orchestrator actually uses, since summary-style answers paraphrase and reduce overlap. */
export const SUMMARY_THRESHOLD = 0.3

/** English stopwords stripped before overlap computation so common function words don't carry the ratio. */
const STOPWORDS = new Set<string>([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "and", "or", "but", "if", "then",
    "to", "of", "in", "on", "for", "with", "by", "at", "as", "from", "into", "about", "it", "its", "this",
    "that", "these", "those", "you", "your", "yours", "we", "our", "ours", "they", "them", "their", "theirs",
    "he", "she", "him", "her", "his", "hers", "i", "me", "my", "mine", "not", "no", "yes", "do", "does",
    "did", "doing", "done", "have", "has", "had", "having", "will", "would", "should", "could", "can", "may",
    "might", "must", "shall", "so", "than", "too", "very", "just", "also", "such", "only", "some", "any",
])

/**
 * Compute the unigram overlap ratio between [answer] and the union of [context] chunks. Returns 1.0 for an empty
 * answer (nothing trivially matches) and a value in [0, 1] otherwise.
 */
export function overlap(answer: string, context: string[]): number {
    const answerTokens = contentTokens(answer)
    if (answerTokens.size === 0) return 1
    const contextTokens = new Set<string>()
    for (const c of context) for (const t of contentTokens(c)) contextTokens.add(t)
    let matched = 0
    for (const t of answerTokens) if (contextTokens.has(t)) matched += 1
    return matched / answerTokens.size
}

/** True when [overlap] meets or exceeds [threshold]. */
export function isGrounded(answer: string, context: string[], threshold: number = DEFAULT_THRESHOLD): boolean {
    return overlap(answer, context) >= threshold
}

function contentTokens(text: string): Set<string> {
    const out = new Set<string>()
    const lower = text.toLowerCase()
    let buf = ""
    for (const ch of lower) {
        if (isLetterOrDigit(ch)) {
            buf += ch
        } else {
            if (buf.length > 0) {
                if (buf.length > 1 && !STOPWORDS.has(buf)) out.add(buf)
                buf = ""
            }
        }
    }
    if (buf.length > 1 && !STOPWORDS.has(buf)) out.add(buf)
    return out
}

function isLetterOrDigit(ch: string): boolean {
    return /[\p{L}\p{N}]/u.test(ch)
}
