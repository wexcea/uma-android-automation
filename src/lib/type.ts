import type { TextStyle } from "react-native"

// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////
// Type scale
//
// Geist Sans for prose, Geist Mono for numerics and uppercase micro-labels. Tokens are partial `TextStyle`s so consumers can spread them into `StyleSheet.create` blocks without re-typing the font family.

export const TYPE = {
    /** Page titles, hero stat values. */
    display: { fontFamily: "Geist_600SemiBold", fontSize: 22, lineHeight: 28, letterSpacing: -0.4 } as TextStyle,
    /** Primary page header text. */
    h1: { fontFamily: "Geist_600SemiBold", fontSize: 18, lineHeight: 24, letterSpacing: -0.2 } as TextStyle,
    /** Group titles inside a page (used by SectionLabel when prose-cased rather than uppercase). */
    h2: { fontFamily: "Geist_600SemiBold", fontSize: 15, lineHeight: 20 } as TextStyle,
    /** Default body and Row titles. */
    body: { fontFamily: "Geist_500Medium", fontSize: 14, lineHeight: 20 } as TextStyle,
    /** Row descriptions, helper text. */
    caption: { fontFamily: "Geist_400Regular", fontSize: 12, lineHeight: 16 } as TextStyle,
    /** Numeric values: counts, percentages, K-formatted numbers, timestamps. */
    monoValue: { fontFamily: "GeistMono_500Medium", fontSize: 13, lineHeight: 18 } as TextStyle,
    /** Uppercase section labels and stat captions. */
    monoLabel: { fontFamily: "GeistMono_600SemiBold", fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" } as TextStyle,
} as const

export type TypeKey = keyof typeof TYPE
