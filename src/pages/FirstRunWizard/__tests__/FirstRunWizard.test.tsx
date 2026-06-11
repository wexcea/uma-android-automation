import React from "react"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import FirstRunWizard from "../index"
import { storageBridge } from "../../../lib/storageBridge"

jest.mock("../../../lib/storageBridge", () => ({
    storageBridge: {
        scanLegacyFiles: jest.fn(),
        getCurrentFolder: jest.fn(),
        pickFolder: jest.fn(),
        migrateLegacyFiles: jest.fn(),
        validateAccess: jest.fn().mockResolvedValue(true),
    },
}))
jest.mock("../../../context/ThemeContext", () => ({
    useTheme: () => ({ colors: { background: "#000", text: "#fff", textMuted: "#a8aebb", primary: "#5b9dff", success: "#7bd590", error: "#e07b7b", warning: "#e0a067", surface: "#161a20", borderHair: "#232831" } }),
}))
jest.mock("../../../components/CustomButton", () => {
    const { Pressable, Text } = require("react-native")
    return {
        __esModule: true,
        default: ({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) => (
            <Pressable onPress={onPress}>
                <Text>{children}</Text>
            </Pressable>
        ),
    }
})
jest.mock("../../../components/SystemChecksWizard", () => {
    const { Pressable, Text } = require("react-native")
    return {
        __esModule: true,
        default: ({
            onPermissionsChange,
        }: {
            onPermissionsChange?: (r: { accessibility: boolean; overlay: boolean; battery: boolean }) => void
        }) => (
            <Pressable
                onPress={() => {
                    onPermissionsChange?.({ accessibility: true, overlay: true, battery: true })
                }}
            >
                <Text>FAKE_VISIT_ALL</Text>
            </Pressable>
        ),
    }
})

const scan = storageBridge.scanLegacyFiles as jest.Mock
const getCurrent = storageBridge.getCurrentFolder as jest.Mock

describe("FirstRunWizard", () => {
    beforeEach(() => {
        scan.mockReset()
        getCurrent.mockReset()
    })

    it("uses 2 steps when no legacy files", async () => {
        scan.mockResolvedValue({ logs: 0, recordings: 0 })
        getCurrent.mockResolvedValue(null)
        const { findByText } = render(<FirstRunWizard onComplete={jest.fn()} />)
        expect(await findByText("STEP 1 OF 2")).toBeTruthy()
    })

    it("uses 3 steps when legacy files are present", async () => {
        scan.mockResolvedValue({ logs: 5, recordings: 1 })
        getCurrent.mockResolvedValue(null)
        const { findByText } = render(<FirstRunWizard onComplete={jest.fn()} />)
        expect(await findByText("STEP 1 OF 3")).toBeTruthy()
    })

    it("fires onComplete exactly once when Finish is tapped on the system checks step", async () => {
        scan.mockResolvedValue({ logs: 0, recordings: 0 })
        getCurrent.mockResolvedValue({ uri: "content://t", name: "UmaAutomation" })
        const onComplete = jest.fn().mockResolvedValue(undefined)
        const { findByText } = render(<FirstRunWizard onComplete={onComplete} />)
        fireEvent.press(await findByText("Next"))                 // folder -> systemChecks
        fireEvent.press(await findByText("FAKE_VISIT_ALL"))       // systemChecks visited -> Finish CTA appears
        fireEvent.press(await findByText("Finish"))               // markComplete
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    })
})
