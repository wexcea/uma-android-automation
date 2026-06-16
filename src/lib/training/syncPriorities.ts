import { shallowArrayEqual } from "../utils"

/** Result of computing a priority sync from the main list onto the two dependent lists. */
export interface PrioritySyncResult {
    /** True if at least one target list would change. False when both targets already match the source. */
    changed: boolean
    /** New Event Choice prioritization list - a fresh copy of the source order. */
    eventChoice: string[]
    /** New Summer Training prioritization list - a fresh copy of the source order. */
    summer: string[]
}

/**
 * Compute the result of syncing the main stat prioritization order onto the Event Choice and Summer Training lists.
 * Returns fresh copies of the source for both targets so callers never share array references with the source.
 * @param source The main `statPrioritization` order to copy from.
 * @param eventChoice The current Event Choice prioritization list.
 * @param summer The current Summer Training prioritization list.
 * @returns A `PrioritySyncResult` with `changed` plus the new target arrays.
 */
export function computePrioritySync(source: string[], eventChoice: string[], summer: string[]): PrioritySyncResult {
    const changed = !shallowArrayEqual(source, eventChoice) || !shallowArrayEqual(source, summer)
    return { changed, eventChoice: [...source], summer: [...source] }
}
