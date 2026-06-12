import { renderHook, waitFor } from "@testing-library/react-native"
import { storageBridge } from "../../lib/storageBridge"
import { useLegacyFileScan } from "../useLegacyFileScan"

jest.mock("../../lib/storageBridge", () => ({
    storageBridge: {
        scanLegacyFiles: jest.fn(),
    },
}))

const scan = storageBridge.scanLegacyFiles as jest.Mock

describe("useLegacyFileScan", () => {
    beforeEach(() => {
        scan.mockReset()
    })

    it("reports hasLegacyFiles when counts are non-zero", async () => {
        scan.mockResolvedValue({ logs: 5, recordings: 2 })
        const { result } = renderHook(() => useLegacyFileScan())
        await waitFor(() => expect(result.current.scanning).toBe(false))
        expect(result.current.counts).toEqual({ logs: 5, recordings: 2 })
        expect(result.current.hasLegacyFiles).toBe(true)
    })

    it("reports no legacy files when counts are zero", async () => {
        scan.mockResolvedValue({ logs: 0, recordings: 0 })
        const { result } = renderHook(() => useLegacyFileScan())
        await waitFor(() => expect(result.current.scanning).toBe(false))
        expect(result.current.hasLegacyFiles).toBe(false)
    })

    it("treats scan errors as no legacy files", async () => {
        scan.mockRejectedValue(new Error("bridge error"))
        const { result } = renderHook(() => useLegacyFileScan())
        await waitFor(() => expect(result.current.scanning).toBe(false))
        expect(result.current.counts).toBeNull()
        expect(result.current.hasLegacyFiles).toBe(false)
    })
})
