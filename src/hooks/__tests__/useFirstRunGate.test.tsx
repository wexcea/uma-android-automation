import { act, renderHook, waitFor } from "@testing-library/react-native"
import { databaseManager } from "../../lib/database"
import { useFirstRunGate } from "../useFirstRunGate"

jest.mock("../../lib/database", () => ({
    databaseManager: {
        initialize: jest.fn(),
        loadSetting: jest.fn(),
        saveSetting: jest.fn(),
    },
}))

const initialize = databaseManager.initialize as jest.Mock
const loadSetting = databaseManager.loadSetting as jest.Mock
const saveSetting = databaseManager.saveSetting as jest.Mock

describe("useFirstRunGate", () => {
    beforeEach(() => {
        initialize.mockReset()
        initialize.mockResolvedValue(undefined)
        loadSetting.mockReset()
        saveSetting.mockReset()
    })

    it("reports first run when the flag is unset", async () => {
        loadSetting.mockResolvedValue(null)
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.isFirstRun).toBe(true)
    })

    it("reports not first run when the flag is true", async () => {
        loadSetting.mockResolvedValue(true)
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.isFirstRun).toBe(false)
    })

    it("treats the string 'true' as completed too", async () => {
        loadSetting.mockResolvedValue("true")
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.isFirstRun).toBe(false)
    })

    it("treats a load failure as first run", async () => {
        loadSetting.mockRejectedValue(new Error("db gone"))
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.isFirstRun).toBe(true)
    })

    it("writes the flag and flips isFirstRun on markComplete", async () => {
        loadSetting.mockResolvedValue(null)
        saveSetting.mockResolvedValue(undefined)
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        await act(async () => {
            await result.current.markComplete()
        })
        expect(saveSetting).toHaveBeenCalledWith("firstRun", "completed", true)
        expect(result.current.isFirstRun).toBe(false)
    })

    it("re-throws save failures and leaves isFirstRun true", async () => {
        loadSetting.mockResolvedValue(null)
        saveSetting.mockRejectedValue(new Error("disk full"))
        const { result } = renderHook(() => useFirstRunGate())
        await waitFor(() => expect(result.current.ready).toBe(true))
        await expect(result.current.markComplete()).rejects.toThrow("disk full")
        expect(result.current.isFirstRun).toBe(true)
    })
})
