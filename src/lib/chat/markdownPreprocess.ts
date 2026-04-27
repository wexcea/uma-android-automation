/**
 * Markdown preprocessors for the on-device docs chatbot.
 *
 * The model output is fed to `react-native-marked`, which:
 *  - cannot render `<details>`/`<summary>` interactively,
 *  - has flex-marker layout bugs on bullet lists in RN, and
 *  - silently drops a few inline GFM HTML tags.
 *
 * These helpers transform the raw markdown into a marked-friendly form before rendering.
 */

/**
 * Fold inline GitHub-flavored HTML tags into markdown equivalents the marked tokenizer can style.
 * `<details>`/`<summary>` are NOT folded here — they're handled separately by [splitDetails] so we can render
 * them as collapsible sections instead of static text.
 */
export function foldHtmlTags(md: string): string {
    return md
        .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
        .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
        .replace(/<br\s*\/?>/gi, "  \n")
}

const DETAILS_RE = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi

export type MdSegment = { kind: "md"; text: string } | { kind: "details"; summary: string; body: string }

/**
 * Split markdown into a stream of plain-markdown and details-block segments. Each details segment is
 * rendered as a Pressable collapsible by `MarkdownView`; everything else falls through to the marked
 * pipeline. Stray `<details>`/`</details>`/`<summary>` tags that don't form a complete block are left
 * as-is and stripped by the marked html-token renderer downstream.
 */
export function splitDetails(md: string): MdSegment[] {
    const segments: MdSegment[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    DETAILS_RE.lastIndex = 0
    while ((m = DETAILS_RE.exec(md)) !== null) {
        if (m.index > lastIndex) segments.push({ kind: "md", text: md.slice(lastIndex, m.index) })
        segments.push({ kind: "details", summary: m[1].trim(), body: m[2].trim() })
        lastIndex = m.index + m[0].length
    }
    if (lastIndex < md.length) segments.push({ kind: "md", text: md.slice(lastIndex) })
    return segments
}

/**
 * Replace markdown list lines with plain prose lines using a unicode bullet ("• ") for unordered items and an
 * escaped digit ("1\. ") for ordered ones, so marked won't reparse them as lists. Each line gets a trailing
 * hard-break (two spaces) so consecutive items become separate visual lines inside one paragraph instead of
 * being collapsed by markdown's whitespace folding. Avoids the entire RN flex-marker layout class of bugs at
 * the cost of nested-block-content inside list items, which the chatbot rarely produces. Calls [foldHtmlTags]
 * first so any inline `<strong>`/`<em>` markers inside list items get the same treatment.
 */
export function flattenLists(md: string): string {
    return foldHtmlTags(md)
        .split("\n")
        .map((line) => {
            const u = line.match(/^(\s*)[-*+]\s+(.*)$/)
            if (u) return `${u[1]}• ${u[2]}  `
            const o = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
            if (o) return `${o[1]}${o[2]}\\. ${o[3]}  `
            return line
        })
        .join("\n")
}
