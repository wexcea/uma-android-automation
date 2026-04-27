import { Fragment, useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { useMarkdown, type MarkedStyles } from "react-native-marked"
import type { UserTheme } from "react-native-marked/dist/typescript/theme/types"
import { useTheme } from "../../context/ThemeContext"
import { flattenLists, foldHtmlTags, splitDetails } from "../../lib/chat/markdownPreprocess"

interface MarkdownTextProps {
    children: string
    theme: UserTheme
    mdStyles: MarkedStyles
}

/**
 * Render a single markdown segment via `react-native-marked` with list-flattening preprocessing applied. Used
 * inside [MarkdownView] for both the regular markdown segments and the body/summary of collapsible blocks.
 */
function MarkdownText({ children, theme, mdStyles }: MarkdownTextProps) {
    const flattened = useMemo(() => flattenLists(children), [children])
    const elements = useMarkdown(flattened, { theme, styles: mdStyles })
    return (
        <View>
            {elements.map((el, i) => (
                <Fragment key={i}>{el}</Fragment>
            ))}
        </View>
    )
}

interface CollapsibleDetailsProps {
    summary: string
    body: string
    theme: UserTheme
    mdStyles: MarkedStyles
    chevronColor: string
    borderColor: string
    headerBg: string
}

function CollapsibleDetails({ summary, body, theme, mdStyles, chevronColor, borderColor, headerBg }: CollapsibleDetailsProps) {
    const [open, setOpen] = useState(false)
    return (
        <View style={{ borderWidth: 1, borderColor, borderRadius: 4, marginVertical: 4, overflow: "hidden" }}>
            <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "flex-start", padding: 6, backgroundColor: headerBg }}>
                <Text style={{ color: chevronColor, marginRight: 6, marginTop: 2 }}>{open ? "▼" : "▶"}</Text>
                <View style={{ flex: 1 }}>
                    <MarkdownText theme={theme} mdStyles={mdStyles}>
                        {summary}
                    </MarkdownText>
                </View>
            </Pressable>
            {open && (
                <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6, borderTopWidth: 1, borderTopColor: borderColor }}>
                    <MarkdownText theme={theme} mdStyles={mdStyles}>
                        {body}
                    </MarkdownText>
                </View>
            )}
        </View>
    )
}

interface MarkdownViewProps {
    children: string
    theme: UserTheme
    mdStyles: MarkedStyles
}

/**
 * Render a chat-bot markdown payload with two preprocessing passes: GFM HTML tags (`<strong>`, `<em>`, `<br>`)
 * are folded to markdown equivalents, then `<details>`/`<summary>` blocks are pulled out and rendered as
 * tappable collapsibles. Everything else is fed through `react-native-marked` with list-flattening applied.
 */
export function MarkdownView({ children, theme, mdStyles }: MarkdownViewProps) {
    const { colors } = useTheme()
    const folded = useMemo(() => foldHtmlTags(children), [children])
    const segments = useMemo(() => splitDetails(folded), [folded])
    return (
        <View>
            {segments.map((s, i) =>
                s.kind === "md" ? (
                    <MarkdownText key={i} theme={theme} mdStyles={mdStyles}>
                        {s.text}
                    </MarkdownText>
                ) : (
                    <CollapsibleDetails
                        key={i}
                        summary={s.summary}
                        body={s.body}
                        theme={theme}
                        mdStyles={mdStyles}
                        chevronColor={colors.foreground}
                        borderColor={colors.border}
                        headerBg={colors.muted}
                    />
                )
            )}
        </View>
    )
}
