import { act, renderHook, waitFor } from "@testing-library/react-native"

jest.mock("../../lib/logcatBridge", () => ({
    logcatBridge: { dumpLogcat: jest.fn() },
}))

import { useLogcatDump } from "../useLogcatDump"
import { logcatBridge } from "../../lib/logcatBridge"

const mockBridge = logcatBridge as jest.Mocked<typeof logcatBridge>

describe("useLogcatDump", () => {
    beforeEach(() => {
        mockBridge.dumpLogcat.mockReset()
    })

    it("sets a success message after a dump resolves", async () => {
        mockBridge.dumpLogcat.mockResolvedValue({ filename: "adb_dump_2026-06-12_00_30_15.txt", bytes: 1234, location: "UmaAutomation" })
        const { result } = renderHook(() => useLogcatDump())
        await act(async () => {
            await result.current.dump()
        })
        expect(result.current.message).toBe("Saved adb_dump_2026-06-12_00_30_15.txt to UmaAutomation")
        expect(result.current.dumping).toBe(false)
        expect(mockBridge.dumpLogcat).toHaveBeenCalledTimes(1)
    })

    it("sets an error message when the dump rejects", async () => {
        mockBridge.dumpLogcat.mockRejectedValue(new Error("No writable storage location is available for the logcat dump."))
        const { result } = renderHook(() => useLogcatDump())
        await act(async () => {
            await result.current.dump()
        })
        expect(result.current.message).toContain("failed")
        expect(result.current.dumping).toBe(false)
    })

    it("reports dumping while a dump is in flight and clears it afterwards", async () => {
        let resolveDump: (value: { filename: string; bytes: number; location: string }) => void = () => {}
        mockBridge.dumpLogcat.mockReturnValue(new Promise((resolve) => { resolveDump = resolve }))
        const { result } = renderHook(() => useLogcatDump())
        act(() => {
            void result.current.dump()
        })
        expect(result.current.dumping).toBe(true)
        await act(async () => {
            resolveDump({ filename: "a.txt", bytes: 1, location: "X" })
        })
        expect(result.current.dumping).toBe(false)
    })

    it("clears the message when clearMessage is called", async () => {
        mockBridge.dumpLogcat.mockResolvedValue({ filename: "a.txt", bytes: 1, location: "X" })
        const { result } = renderHook(() => useLogcatDump())
        await act(async () => {
            await result.current.dump()
        })
        expect(result.current.message).not.toBeNull()
        act(() => {
            result.current.clearMessage()
        })
        expect(result.current.message).toBeNull()
    })

    it("ignores a second dump call while one is already in flight", async () => {
        let resolveDump: (value: { filename: string; bytes: number; location: string }) => void = () => {}
        mockBridge.dumpLogcat.mockReturnValue(new Promise((resolve) => { resolveDump = resolve }))
        const { result } = renderHook(() => useLogcatDump())
        act(() => {
            void result.current.dump()
        })
        act(() => {
            void result.current.dump()
        })
        await act(async () => {
            resolveDump({ filename: "a.txt", bytes: 1, location: "X" })
        })
        expect(mockBridge.dumpLogcat).toHaveBeenCalledTimes(1)
    })
})
