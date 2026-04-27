const mockLoadSetting = jest.fn()
const mockSaveSetting = jest.fn()

jest.mock("../../database", () => ({
    databaseManager: {
        loadSetting: (...args: any[]) => mockLoadSetting(...args),
        saveSetting: (...args: any[]) => mockSaveSetting(...args),
    },
}))

import { CHAT_CATEGORY, DEFAULTS, SETTING_KEYS, loadChatTuning, saveTuning, trimToCap } from "../chatSettings"

describe("chatSettings", () => {
    beforeEach(() => {
        mockLoadSetting.mockReset()
        mockSaveSetting.mockReset()
        mockSaveSetting.mockResolvedValue(undefined)
    })

    describe("loadChatTuning", () => {
        it("returns DEFAULTS when nothing is stored", async () => {
            mockLoadSetting.mockResolvedValue(undefined)
            await expect(loadChatTuning()).resolves.toEqual(DEFAULTS)
        })

        it("merges stored numeric values over DEFAULTS", async () => {
            mockLoadSetting.mockImplementation((_category: string, key: string) => {
                if (key === SETTING_KEYS.maxOutputTokens) return Promise.resolve(1024)
                if (key === SETTING_KEYS.llmCitationCharCap) return Promise.resolve(3000)
                if (key === SETTING_KEYS.modelContextWindow) return Promise.resolve(8192)
                return Promise.resolve(undefined)
            })
            await expect(loadChatTuning()).resolves.toEqual({
                maxOutputTokens: 1024,
                llmCitationCharCap: 3000,
                modelContextWindow: 8192,
            })
        })

        it("falls back to DEFAULTS for non-numeric stored values", async () => {
            mockLoadSetting.mockResolvedValue("not-a-number")
            await expect(loadChatTuning()).resolves.toEqual(DEFAULTS)
        })

        it("returns DEFAULTS when the database throws", async () => {
            mockLoadSetting.mockRejectedValue(new Error("db unavailable"))
            await expect(loadChatTuning()).resolves.toEqual(DEFAULTS)
        })
    })

    describe("saveTuning", () => {
        it("forwards the typed key + value to databaseManager.saveSetting", () => {
            saveTuning("maxOutputTokens", 1234)
            expect(mockSaveSetting).toHaveBeenCalledWith(CHAT_CATEGORY, SETTING_KEYS.maxOutputTokens, 1234, true)
        })

        it("swallows save failures (fire-and-forget)", () => {
            mockSaveSetting.mockRejectedValue(new Error("write failed"))
            expect(() => saveTuning("modelContextWindow", 4096)).not.toThrow()
        })
    })

    describe("trimToCap", () => {
        it("returns the input unchanged when it fits within the cap", () => {
            expect(trimToCap("short text", 100)).toBe("short text")
        })

        it("breaks on the last word boundary and adds an ellipsis", () => {
            const text = "alpha beta gamma delta epsilon zeta"
            // Cap of 17 chars: "alpha beta gamma " — last space at index 16; truncate to 16 then add "…"
            expect(trimToCap(text, 17)).toBe("alpha beta gamma…")
        })

        it("falls back to a hard cut when there is no space inside the slice", () => {
            const text = "supercalifragilistic"
            expect(trimToCap(text, 5)).toBe("super…")
        })
    })
})
