import { clsx, type ClassValue } from "clsx"
import * as Clipboard from "expo-clipboard"
import { ToastAndroid } from "react-native"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Shallow element-wise comparison for primitive arrays. Cheaper than the JSON.stringify diff pattern.
 * @param a First array.
 * @param b Second array.
 * @returns True when both arrays have identical lengths and equal elements at each index.
 */
export function shallowArrayEqual<T>(a: readonly T[] | undefined | null, b: readonly T[] | undefined | null): boolean {
    if (a === b) return true
    if (!a || !b) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/**
 * Copy text to the clipboard and show a brief Android toast.
 * @param text The text to copy.
 */
export async function copyToClipboard(text: string): Promise<void> {
    const displayText = text.length > 40 ? text.substring(0, 37) + "..." : text
    await Clipboard.setStringAsync(text)
    ToastAndroid.show(`Copied "${displayText}"`, ToastAndroid.SHORT)
}
