import React, { useContext, useEffect, useMemo, useReducer } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { TrainingContext } from "../../context/BotStateContext"
import { ALL_STAT_NAMES, calculateRawTrainingScore, scoringConstantsFromSettings, StatName } from "../../lib/training/scoring"
import { loadSandboxScenario, saveSandboxScenario } from "../../lib/asyncStorage/sandboxScenarioStorage"
import { SPACING } from "../../lib/spacing"
import { TYPE } from "../../lib/type"
import { SheetModal } from "../ui/sheet-modal"
import { Button } from "../ui/button"
import { Text } from "../ui/text"
import { initialScenario, scenarioReducer } from "./scenarioState"
import { scenarioToScoring } from "./scenarioToScoring"
import { StatTable } from "./StatTable"
import { TrainingCircleRow } from "./TrainingCircleRow"
import { EditorStrip } from "./EditorStrip"

/** Props for `TrainingScoringSandbox`. */
export interface TrainingScoringSandboxProps {
    /** Whether the sandbox modal is visible. */
    open: boolean
    /** Called when the user dismisses the modal (close X or backdrop tap). */
    onClose: () => void
}

/**
 * Sandbox modal for previewing the training scoring formula against synthetic inputs. Hosts the reducer, persists the scenario to
 * `AsyncStorage` with a 500ms debounce, and renders the stat table, globals strip, training circle row, and editor strip. The winning
 * training is computed by feeding each sandbox training through `calculateRawTrainingScore` and picking the highest score.
 *
 * @param props See `TrainingScoringSandboxProps`.
 * @returns A `SheetModal` containing the sandbox UI.
 */
export function TrainingScoringSandbox({ open, onClose }: TrainingScoringSandboxProps): React.ReactElement {
    const { colors } = useTheme()
    const { training } = useContext(TrainingContext)
    const [scenario, dispatch] = useReducer(scenarioReducer, initialScenario)

    // Hydrate from AsyncStorage once on mount.
    useEffect(() => {
        let cancelled = false
        loadSandboxScenario().then((loaded) => {
            if (!cancelled) dispatch({ type: "replace", scenario: loaded })
        })
        return () => {
            cancelled = true
        }
    }, [])

    // Debounced persistence: any change to `scenario` triggers a 500ms timer; if the scenario changes again before it fires the previous
    // timer is cleared so we only write once the user pauses.
    useEffect(() => {
        const handle = setTimeout(() => {
            saveSandboxScenario(scenario)
        }, 500)
        return () => clearTimeout(handle)
    }, [scenario])

    const constants = useMemo(() => scoringConstantsFromSettings(training as unknown as Record<string, unknown>), [training])
    const { config, trainings } = useMemo(() => scenarioToScoring(scenario, constants), [scenario, constants])

    const scoresByTraining = useMemo(() => {
        const out: Partial<Record<StatName, number>> = {}
        for (const t of trainings) out[t.name] = calculateRawTrainingScore(config, t)
        return out as Record<StatName, number>
    }, [config, trainings])

    const winnerTraining = useMemo(() => {
        let best: StatName = StatName.SPEED
        let bestScore = -Infinity
        for (const t of ALL_STAT_NAMES) {
            const s = scoresByTraining[t]
            if (s > bestScore) {
                bestScore = s
                best = t
            }
        }
        return best
    }, [scoresByTraining])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                headerRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: SPACING.sm,
                },
                title: {
                    ...TYPE.body,
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 16,
                },
                closeButton: {
                    padding: 4,
                },
                footerRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: SPACING.md,
                },
                footerHint: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    flexShrink: 1,
                    lineHeight: 18,
                    includeFontPadding: false,
                    textAlignVertical: "center",
                },
                description: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    lineHeight: 18,
                    marginBottom: SPACING.sm,
                },
                buttonLabel: {
                    color: colors.onBrand,
                    fontWeight: "600",
                },
            }),
        [colors]
    )

    const header = (
        <View style={styles.headerRow}>
            <Text style={styles.title}>Scoring Sandbox</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
        </View>
    )

    const footer = (
        <View style={styles.footerRow}>
            <Text style={styles.footerHint}>Reading current advanced settings</Text>
            <Button onPress={() => dispatch({ type: "reset" })} variant="secondary" size="sm">
                <Text style={styles.buttonLabel}>Reset</Text>
            </Button>
        </View>
    )

    return (
        <SheetModal visible={open} onRequestClose={onClose} header={header} footer={footer} maxWidth={800} heightFraction={0.55}>
            <Text style={styles.description}>
                Preview which training the scoring formula would pick against a synthetic scenario. Edit the stat gains, trainee totals, and run-wide state below; the winning training is highlighted
                in amber.
            </Text>
            <StatTable scenario={scenario} dispatch={dispatch} />
            <TrainingCircleRow scenario={scenario} scoresByTraining={scoresByTraining} winnerTraining={winnerTraining} dispatch={dispatch} />
            <EditorStrip scenario={scenario} dispatch={dispatch} />
        </SheetModal>
    )
}

export default TrainingScoringSandbox
