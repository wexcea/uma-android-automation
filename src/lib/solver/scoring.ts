import epithetsData from "../../data/epithets.json"
import {
    APT_ORDER,
    AptitudeMap,
    BASE_SP_BY_GRADE,
    BASE_STAT_BY_GRADE,
    COUNTRY_NAMES,
    EpithetEntry,
    EpithetWithMatchers,
    MatcherProgress,
    OP_GRADES,
    PreviewStats,
    RaceEntry,
    WeightsMap,
} from "./constants"
import { SchedulePreview } from "./preview"

/** True iff the race's name contains one of the COUNTRY_NAMES tokens (Globe-Trotter filter). */
export const nameContainsCountry = (name: string): boolean => COUNTRY_NAMES.some((c) => name.includes(c))

const isGradedRace = (grade: string): boolean => grade === "G1" || grade === "G2" || grade === "G3"
const isOpenOrAboveRace = (grade: string): boolean => isGradedRace(grade) || grade === "OP" || grade === "FINALE" || grade === "EX"

/**
 * TS mirror of `ScoringFunctions.isEligible`. A race is eligible iff its distance and surface
 * aptitudes both meet `weights.aptitudeThreshold`, and OP/Pre-OP races are only allowed when
 * `weights.includeOpAndPreOp` is true.
 *
 * @param race The race to test.
 * @param aptitudes Trainee's distance + surface aptitudes.
 * @param weights Solver weights (only `aptitudeThreshold` and `includeOpAndPreOp` are read).
 * @returns True when the race passes the eligibility filter.
 */
export const isRaceEligible = (race: RaceEntry, aptitudes: AptitudeMap, weights: Pick<WeightsMap, "aptitudeThreshold" | "includeOpAndPreOp">): boolean => {
    if (OP_GRADES.has(race.grade) && !weights.includeOpAndPreOp) return false
    const threshold = APT_ORDER[weights.aptitudeThreshold] ?? 4
    const distKey = race.distanceType === "Sprint" ? "Sprint" : race.distanceType === "Mile" ? "Mile" : race.distanceType === "Medium" ? "Medium" : race.distanceType === "Long" ? "Long" : null
    const surfKey = race.terrain === "Turf" ? "Turf" : race.terrain === "Dirt" ? "Dirt" : null
    if (!distKey || !surfKey) return false
    const distApt = APT_ORDER[(aptitudes as any)[distKey]] ?? 0
    const surfApt = APT_ORDER[(aptitudes as any)[surfKey]] ?? 0
    return distApt >= threshold && surfApt >= threshold
}

/**
 * Returns every epithet whose matcher list references the given race. Mirrors the matcher
 * branches in `Epithet.kt`: `winRace`, `winRaceTimes`, `winAnyOf`, `winAtLeast`, `winCount`.
 * `epithetAll` / `epithetAnyOf` are dependency matchers and are intentionally skipped here.
 */
export const epithetsForRace = (race: RaceEntry): EpithetEntry[] => {
    const all = epithetsData as unknown as Record<string, EpithetWithMatchers>
    const out: EpithetEntry[] = []
    const graded = isGradedRace(race.grade)
    const openOrAbove = isOpenOrAboveRace(race.grade)
    for (const ep of Object.values(all)) {
        const matchers = ep.matchers ?? []
        const matched = matchers.some((m) => {
            const type = m["type"] as string
            const name = m["name"] as string | undefined
            const names = (m["names"] as string[] | undefined) ?? []
            switch (type) {
                case "winRace":
                case "winRaceTimes":
                    return name != null && name === race.name
                case "winAnyOf":
                case "winAtLeast":
                    return names.includes(race.name)
                case "winCount": {
                    const f = (m["filter"] as Record<string, unknown> | undefined) ?? {}
                    if (f["terrain"] && f["terrain"] !== race.terrain) return false
                    if (f["grade"] && f["grade"] !== race.grade) return false
                    if (f["gradedOnly"] && !graded) return false
                    if (f["gradeAtLeastOpen"] && !openOrAbove) return false
                    const dts = f["distanceTypes"] as string[] | undefined
                    if (dts && dts.length > 0 && !dts.includes(race.distanceType)) return false
                    const tracks = f["raceTracks"] as string[] | undefined
                    if (tracks && tracks.length > 0 && !tracks.includes(race.raceTrack)) return false
                    const nameContains = f["nameContains"] as string | undefined
                    if (nameContains && !race.name.toLowerCase().includes(nameContains.toLowerCase())) return false
                    if (f["nameContainsCountry"] && !nameContainsCountry(race.name)) return false
                    return true
                }
                default:
                    return false
            }
        })
        if (matched) out.push(ep)
    }
    return out
}

/**
 * Computes how much progress a single matcher has accumulated up to and including `upToTurn`,
 * based on the preview's race decisions. Returns null when the matcher type isn't
 * progress-trackable (e.g. `epithetAll` / `epithetAnyOf`). `current` is capped at `required`.
 *
 * @param upToTurn Inclusive upper bound on which turns count toward progress.
 * @param matcher Raw matcher record from `epithets.json`.
 * @param preview Schedule preview that supplies the win history.
 * @param racesByKey Lookup table from race key → race entry.
 */
export const matcherProgress = (upToTurn: number, matcher: Record<string, unknown>, preview: SchedulePreview, racesByKey: Record<string, RaceEntry>): MatcherProgress | null => {
    const winsUpTo: Array<{ turn: number; race: RaceEntry }> = []
    for (const [turnStr, dec] of Object.entries(preview.decisions)) {
        const t = parseInt(turnStr, 10)
        if (Number.isNaN(t) || t > upToTurn) continue
        if (dec.type !== "Race") continue
        const r = dec.raceKey ? racesByKey[dec.raceKey] : undefined
        if (!r) continue
        winsUpTo.push({ turn: t, race: r })
    }

    const type = matcher["type"] as string
    switch (type) {
        case "winRace": {
            const name = matcher["name"] as string
            const hit = winsUpTo.some((w) => w.race.name === name)
            return { current: hit ? 1 : 0, required: 1 }
        }
        case "winRaceTimes": {
            const name = matcher["name"] as string
            const required = (matcher["times"] as number) ?? 1
            const current = winsUpTo.filter((w) => w.race.name === name).length
            return { current: Math.min(current, required), required }
        }
        case "winAnyOf": {
            const names = (matcher["names"] as string[]) ?? []
            const required = (matcher["count"] as number) ?? names.length
            const current = winsUpTo.filter((w) => names.includes(w.race.name)).length
            return { current: Math.min(current, required), required }
        }
        case "winAtLeast": {
            const names = (matcher["names"] as string[]) ?? []
            const required = (matcher["count"] as number) ?? names.length
            const distinct = new Set(winsUpTo.filter((w) => names.includes(w.race.name)).map((w) => w.race.name))
            return { current: Math.min(distinct.size, required), required }
        }
        case "winCount": {
            const f = (matcher["filter"] as Record<string, unknown>) ?? {}
            const required = (matcher["count"] as number) ?? 1
            let current = 0
            for (const w of winsUpTo) {
                if (f["terrain"] && f["terrain"] !== w.race.terrain) continue
                if (f["grade"] && f["grade"] !== w.race.grade) continue
                if (f["gradedOnly"] && !isGradedRace(w.race.grade)) continue
                if (f["gradeAtLeastOpen"] && !isOpenOrAboveRace(w.race.grade)) continue
                const dts = f["distanceTypes"] as string[] | undefined
                if (dts && dts.length > 0 && !dts.includes(w.race.distanceType)) continue
                const tracks = f["raceTracks"] as string[] | undefined
                if (tracks && tracks.length > 0 && !tracks.includes(w.race.raceTrack)) continue
                const nameContains = f["nameContains"] as string | undefined
                if (nameContains && !w.race.name.toLowerCase().includes(nameContains.toLowerCase())) continue
                if (f["nameContainsCountry"] && !nameContainsCountry(w.race.name)) continue
                current++
            }
            return { current: Math.min(current, required), required }
        }
        default:
            return null
    }
}

/**
 * Aggregate progress across ALL of an epithet's matchers as of `upToTurn`. Sums each matcher's
 * `(current, required)` so multi-condition epithets like Turf Tussler render as "(1/4) → (4/4)"
 * instead of "(1/1)" after just one matcher fires. Returns null when no matchers progress.
 */
export const epithetProgress = (upToTurn: number, ep: EpithetWithMatchers, preview: SchedulePreview, racesByKey: Record<string, RaceEntry>): MatcherProgress | null => {
    let totalCurrent = 0
    let totalRequired = 0
    for (const m of ep.matchers ?? []) {
        const p = matcherProgress(upToTurn, m, preview, racesByKey)
        if (!p) continue
        totalCurrent += p.current
        totalRequired += p.required
    }
    if (totalRequired === 0) return null
    return { current: totalCurrent, required: totalRequired }
}

/**
 * Aggregate stats for the reference Trackblazer-style summary panel: race count, epithet count,
 * total race stats (BASE_STAT × (1 + raceBonusPct/100)), race SP, epithet stats, and hint count.
 */
export const computePreviewStats = (preview: SchedulePreview, weights: Pick<WeightsMap, "raceBonusPct">, racesByKey: Record<string, RaceEntry>): PreviewStats => {
    const epithetsAll = epithetsData as unknown as Record<string, EpithetEntry & { reward_kind?: string; amount?: number }>
    const rb = Math.max(0, weights.raceBonusPct) / 100
    let races = 0
    let raceStats = 0
    let raceSp = 0
    for (const [, entry] of Object.entries(preview.decisions)) {
        if (entry.type !== "Race") continue
        races += 1
        const race = entry.raceKey ? racesByKey[entry.raceKey] : undefined
        const grade = (race?.grade ?? entry.grade ?? "").replace("-", "_")
        raceStats += Math.floor((BASE_STAT_BY_GRADE[grade] ?? 0) * (1 + rb))
        raceSp += Math.floor((BASE_SP_BY_GRADE[grade] ?? 0) * (1 + rb))
    }
    let epithetStats = 0
    let hints = 0
    for (const name of preview.projectedEpithets) {
        const ep = epithetsAll[name]
        if (!ep) continue
        if (ep.reward_kind === "stat") epithetStats += ep.amount ?? 0
        else if (ep.reward_kind === "hint") hints += 1
    }
    return { races, epithets: preview.projectedEpithets.length, raceStats, raceSp, epithetStats, hints }
}
