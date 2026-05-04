import epithetsData from "../../data/epithets.json"
import {
    APT_ORDER,
    AptitudeMap,
    BASE_SP_BY_GRADE,
    BASE_STAT_BY_GRADE,
    COUNTRY_NAMES,
    EpithetEntry,
    MatcherProgress,
    OP_GRADES,
    PreviewStats,
    RaceEntry,
    WeightsMap,
} from "./constants"
import { SchedulePreview } from "./preview"

/** Matches gametora's "<X> scenario only" bullet. Group 1 captures the scenario name. */
const SCENARIO_RESTRICTION_REGEX = /([A-Za-z][A-Za-z0-9 \-]*?) scenario only/i

/** Matches gametora's character-restriction bullet, e.g. "Yaeno Muteki only". */
const CHARACTER_RESTRICTION_REGEX = /^(.+?)\s+only$/

/** Matches gametora's stat-reward bullet. Group 1+2 = current "<count> random stats +<perStat>"; group 3+4 = legacy "+<perStat> to <count> random stats". */
const STAT_REWARD_REGEX = /(?:(\d+)\s+random\s+stats?\s*\+(\d+))|(?:\+(\d+)\s+to\s+(\d+)\s+random\s+stats?)/i

/** Matches gametora's hint-reward bullet, e.g. "Reward: Top Pick hint +1". Group 1 = level. */
const HINT_REWARD_REGEX = /hint\s*\+(\d+)/i

/** True iff the race's name contains one of the COUNTRY_NAMES tokens (Globe-Trotter filter). */
export const nameContainsCountry = (name: string): boolean => COUNTRY_NAMES.some((c) => name.includes(c))

/**
 * Scenario gate for an epithet. Prefers the structured `scenarios` field, falling back to scanning `bullet_points` for "<X> scenario only".
 *
 * @param e Epithet entry to inspect.
 * @returns Scenario names referenced by any "<X> scenario only" bullet.
 */
export const scenariosForEpithet = (e: EpithetEntry): string[] => {
    if (e.scenarios && e.scenarios.length > 0) return e.scenarios
    const bullets = e.bullet_points ?? []
    const out: string[] = []
    for (const b of bullets) {
        const m = SCENARIO_RESTRICTION_REGEX.exec(b)
        if (m) out.push(m[1].trim())
    }
    return out
}

/**
 * Character gate for an epithet. Prefers the structured `characters` field, falling back to scanning `bullet_points` for standalone "<name> only".
 *
 * @param e Epithet entry to inspect.
 * @returns Character names referenced by any standalone "<name> only" bullet.
 */
export const charactersForEpithet = (e: EpithetEntry): string[] => {
    if (e.characters && e.characters.length > 0) return e.characters
    const bullets = e.bullet_points ?? []
    const out: string[] = []
    for (const b of bullets) {
        const trimmed = b.trim().replace(/\.$/, "")
        if (/scenario only/i.test(trimmed)) continue
        const m = CHARACTER_RESTRICTION_REGEX.exec(trimmed)
        if (m) out.push(m[1].trim())
    }
    return out
}

/**
 * Parses an epithet's reward bullet into kind + total magnitude.
 * The reward bullet is the last bullet by convention; this scans every bullet so a row whose reward isn't last still works.
 *
 * @param e Epithet entry to inspect.
 * @returns `{ kind, amount }` where `amount` is `per_stat * stat_count` for stat rewards, the level for hint rewards, and 0 otherwise.
 */
export const epithetReward = (e: EpithetEntry): { kind: "stat" | "hint" | "unknown"; amount: number } => {
    const bullets = e.bullet_points ?? []
    if (bullets.length === 0) return { kind: "unknown", amount: 0 }
    const ordered = [bullets[bullets.length - 1], ...bullets.slice(0, -1)]
    for (const b of ordered) {
        const stat = STAT_REWARD_REGEX.exec(b)
        if (stat) {
            const count = parseInt(stat[1] ?? stat[4] ?? "0", 10)
            const perStat = parseInt(stat[2] ?? stat[3] ?? "0", 10)
            return { kind: "stat", amount: count * perStat }
        }
        const hint = HINT_REWARD_REGEX.exec(b)
        if (hint) return { kind: "hint", amount: parseInt(hint[1], 10) }
    }
    return { kind: "unknown", amount: 0 }
}

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
    const all = epithetsData as unknown as Record<string, EpithetEntry>
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
export const epithetProgress = (upToTurn: number, ep: EpithetEntry, preview: SchedulePreview, racesByKey: Record<string, RaceEntry>): MatcherProgress | null => {
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
 * Set of turn numbers whose race actually counts toward completing `ep`, walked chronologically and capped at each matcher's required count.
 * Used by the calendar-cell highlight: a race that *could* satisfy a matcher's filter but exceeds the required count is NOT in the set.
 *
 * @param ep Epithet entry to evaluate.
 * @param preview Schedule preview that supplies the win history.
 * @param racesByKey Lookup table from race key to race entry.
 * @returns Turns whose scheduled race contributes to completing the epithet.
 */
export const turnsContributingToEpithet = (ep: EpithetEntry, preview: SchedulePreview, racesByKey: Record<string, RaceEntry>): Set<number> => {
    const contributing = new Set<number>()
    const winsOrdered: Array<{ turn: number; race: RaceEntry }> = []
    for (const [turnStr, dec] of Object.entries(preview.decisions)) {
        const t = parseInt(turnStr, 10)
        if (Number.isNaN(t)) continue
        if (dec.type !== "Race") continue
        const r = dec.raceKey ? racesByKey[dec.raceKey] : undefined
        if (!r) continue
        winsOrdered.push({ turn: t, race: r })
    }
    winsOrdered.sort((a, b) => a.turn - b.turn)

    for (const matcher of ep.matchers ?? []) {
        const type = matcher["type"] as string
        switch (type) {
            case "winRace": {
                const name = matcher["name"] as string
                for (const w of winsOrdered) {
                    if (w.race.name === name) {
                        contributing.add(w.turn)
                        break
                    }
                }
                break
            }
            case "winRaceTimes": {
                const name = matcher["name"] as string
                const required = (matcher["times"] as number) ?? 1
                let counted = 0
                for (const w of winsOrdered) {
                    if (counted >= required) break
                    if (w.race.name === name) {
                        contributing.add(w.turn)
                        counted++
                    }
                }
                break
            }
            case "winAnyOf": {
                const names = (matcher["names"] as string[]) ?? []
                const required = (matcher["count"] as number) ?? names.length
                let counted = 0
                for (const w of winsOrdered) {
                    if (counted >= required) break
                    if (names.includes(w.race.name)) {
                        contributing.add(w.turn)
                        counted++
                    }
                }
                break
            }
            case "winAtLeast": {
                const names = (matcher["names"] as string[]) ?? []
                const required = (matcher["count"] as number) ?? names.length
                const distinctSeen = new Set<string>()
                for (const w of winsOrdered) {
                    if (distinctSeen.size >= required) break
                    if (names.includes(w.race.name) && !distinctSeen.has(w.race.name)) {
                        contributing.add(w.turn)
                        distinctSeen.add(w.race.name)
                    }
                }
                break
            }
            case "winCount": {
                const f = (matcher["filter"] as Record<string, unknown>) ?? {}
                const required = (matcher["count"] as number) ?? 1
                let counted = 0
                for (const w of winsOrdered) {
                    if (counted >= required) break
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
                    contributing.add(w.turn)
                    counted++
                }
                break
            }
        }
    }

    return contributing
}

/**
 * Aggregate stats for the reference Trackblazer-style summary panel: race count, epithet count,
 * total race stats (BASE_STAT × (1 + raceBonusPct/100)), race SP, epithet stats, and hint count.
 */
export const computePreviewStats = (preview: SchedulePreview, weights: Pick<WeightsMap, "raceBonusPct">, racesByKey: Record<string, RaceEntry>): PreviewStats => {
    const epithetsAll = epithetsData as unknown as Record<string, EpithetEntry>
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
        const { kind, amount } = epithetReward(ep)
        if (kind === "stat") epithetStats += amount
        else if (kind === "hint") hints += 1
    }
    return { races, epithets: preview.projectedEpithets.length, raceStats, raceSp, epithetStats, hints }
}
