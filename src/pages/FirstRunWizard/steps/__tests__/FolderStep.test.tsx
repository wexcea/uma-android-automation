import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { storageBridge } from "../../../../lib/storageBridge"
import FolderStep from "../FolderStep"

jest.mock("../../../../lib/storageBridge", () => ({
    storageBridge: {
        getCurrentFolder: jest.fn(),
        pickFolder: jest.fn(),
    },
}))
jest.mock("../../../../context/ThemeContext", () => ({
    useTheme: () => ({ colors: { background: "#000", foreground: "#fff", primary: "#5b9dff", success: "#7bd590", muted: "#a8aebb" } }),
}))
jest.mock("../../../../components/CustomButton", () => {
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

const getCurrentFolder = storageBridge.getCurrentFolder as jest.Mock
const pickFolder = storageBridge.pickFolder as jest.Mock

describe("FolderStep", () => {
    beforeEach(() => {
        getCurrentFolder.mockReset()
        pickFolder.mockReset()
    })

    it("shows the Pick a folder CTA when nothing is picked", async () => {
        getCurrentFolder.mockResolvedValue(null)
        const { findByText, queryByText } = render(<FolderStep onPick={jest.fn()} onAdvance={jest.fn()} onCtaChange={jest.fn()} />)
        expect(await findByText("Pick a folder")).toBeTruthy()
        expect(queryByText("Change folder")).toBeNull()
    })

    it("pre-populates the Selected card when a prior pick exists", async () => {
        getCurrentFolder.mockResolvedValue({ uri: "content://t", name: "UmaAutomation" })
        const onPick = jest.fn()
        const { findByText } = render(<FolderStep onPick={onPick} onAdvance={jest.fn()} onCtaChange={jest.fn()} />)
        expect(await findByText("UmaAutomation")).toBeTruthy()
        await waitFor(() => expect(onPick).toHaveBeenCalledWith({ uri: "content://t", name: "UmaAutomation" }))
    })

    it("calls onPick on a successful pickFolder", async () => {
        getCurrentFolder.mockResolvedValue(null)
        pickFolder.mockResolvedValue("content://newone")
        const onPick = jest.fn()
        const { findByText } = render(<FolderStep onPick={onPick} onAdvance={jest.fn()} onCtaChange={jest.fn()} />)
        fireEvent.press(await findByText("Pick a folder"))
        await waitFor(() => expect(onPick).toHaveBeenCalled())
    })
})
