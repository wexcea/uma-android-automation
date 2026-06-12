import { NativeModules } from "react-native"
import { storageBridge } from "../storageBridge"

jest.mock("react-native", () => ({
    NativeModules: {
        StorageBridgeModule: {
            pickFolder: jest.fn(),
            getCurrentFolder: jest.fn(),
            clearFolder: jest.fn(),
            validateAccess: jest.fn(),
            scanLegacyFiles: jest.fn(),
            migrateLegacyFiles: jest.fn(),
        },
    },
}))

describe("storageBridge", () => {
    it("forwards pickFolder to the native module", async () => {
        ;(NativeModules.StorageBridgeModule.pickFolder as jest.Mock).mockResolvedValue("content://uri")
        const result = await storageBridge.pickFolder()
        expect(result).toBe("content://uri")
    })

    it("forwards migrateLegacyFiles with the mode argument", async () => {
        ;(NativeModules.StorageBridgeModule.migrateLegacyFiles as jest.Mock).mockResolvedValue({ movedLogs: 5, movedRecordings: 2 })
        const result = await storageBridge.migrateLegacyFiles("move")
        expect(NativeModules.StorageBridgeModule.migrateLegacyFiles).toHaveBeenCalledWith("move")
        expect(result).toEqual({ movedLogs: 5, movedRecordings: 2 })
    })
})
