import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { storageBridge } from "../../../../lib/storageBridge"
import MigrationStep from "../MigrationStep"

jest.mock("../../../../lib/storageBridge", () => ({
    storageBridge: { migrateLegacyFiles: jest.fn() },
}))
jest.mock("../../../../context/ThemeContext", () => ({
    useTheme: () => ({
        colors: { background: "#000", text: "#fff", textMuted: "#a8aebb", primary: "#5b9dff", success: "#7bd590", error: "#e07b7b", surface: "#161a20", borderHair: "#232831" },
    }),
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

const migrate = storageBridge.migrateLegacyFiles as jest.Mock

describe("MigrationStep", () => {
    beforeEach(() => {
        migrate.mockReset()
    })

    it("calls migrate with 'move' when Move them is tapped", async () => {
        migrate.mockResolvedValue({ movedLogs: 5, movedRecordings: 2 })
        const onChoice = jest.fn()
        const onAdvance = jest.fn()
        const { getByText } = render(<MigrationStep legacyCounts={{ logs: 5, recordings: 2 }} onChoice={onChoice} onAdvance={onAdvance} />)
        fireEvent.press(getByText("Move them"))
        await waitFor(() => expect(migrate).toHaveBeenCalledWith("move"))
        await waitFor(() => expect(onAdvance).toHaveBeenCalled())
        expect(onChoice).toHaveBeenCalledWith("move", { movedLogs: 5, movedRecordings: 2 })
    })

    it("skips the native call for 'Leave them'", async () => {
        const onChoice = jest.fn()
        const onAdvance = jest.fn()
        const { getByText } = render(<MigrationStep legacyCounts={{ logs: 5, recordings: 2 }} onChoice={onChoice} onAdvance={onAdvance} />)
        fireEvent.press(getByText("Leave them"))
        await waitFor(() => expect(onAdvance).toHaveBeenCalled())
        expect(migrate).not.toHaveBeenCalled()
        expect(onChoice).toHaveBeenCalledWith("leave", null)
    })

    it("calls migrate with 'delete' when Delete them is tapped", async () => {
        migrate.mockResolvedValue({ movedLogs: 5, movedRecordings: 2 })
        const onChoice = jest.fn()
        const { getByText } = render(<MigrationStep legacyCounts={{ logs: 5, recordings: 2 }} onChoice={onChoice} onAdvance={jest.fn()} />)
        fireEvent.press(getByText("Delete them"))
        await waitFor(() => expect(migrate).toHaveBeenCalledWith("delete"))
    })

    it("renders an inline error when migrate returns an error", async () => {
        migrate.mockResolvedValue({ movedLogs: 2, movedRecordings: 0, error: "OUT_OF_SPACE", remaining: 5 })
        const onAdvance = jest.fn()
        const { getByText, findByText } = render(<MigrationStep legacyCounts={{ logs: 5, recordings: 2 }} onChoice={jest.fn()} onAdvance={onAdvance} />)
        fireEvent.press(getByText("Move them"))
        expect(await findByText(/Moved 2 of 7 files\. Out of space/)).toBeTruthy()
        expect(onAdvance).not.toHaveBeenCalled()
    })
})
