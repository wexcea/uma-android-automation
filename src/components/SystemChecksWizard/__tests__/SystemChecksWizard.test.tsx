import React from "react"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { NativeModules } from "react-native"
import SystemChecksWizard from "../index"

jest.mock("../../../context/ThemeContext", () => ({
    useTheme: () => ({
        colors: {
            text: "#e8eaed",
            textMuted: "#a8aebb",
            surface: "#161a20",
            surfaceRaised: "#1d222a",
            borderHair: "#232831",
            brand: "#5b9dff",
            primary: "#5b9dff",
            ripple: "#2a2f38",
            success: "#7bd590",
            successSubtle: "rgba(123, 213, 144, 0.15)",
            error: "#e07b7b",
            warning: "#e0a067",
            warningText: "#e0a067",
        },
    }),
}))

jest.mock("../../CustomButton", () => {
    const { Pressable, Text } = require("react-native")
    return {
        __esModule: true,
        default: ({
            onPress,
            children,
            disabled,
        }: {
            onPress?: () => void
            children: React.ReactNode
            disabled?: boolean
        }) => (
            <Pressable onPress={onPress} disabled={disabled}>
                <Text>{children}</Text>
            </Pressable>
        ),
    }
})

jest.mock("@react-native-vector-icons/ionicons", () => "Ionicons")

const setupStartModule = () => {
    NativeModules.StartModule = {
        getAccessibilityStatus: jest.fn(),
        getOverlayStatus: jest.fn(),
        getBatteryOptimizationStatus: jest.fn(),
        openAccessibilitySettings: jest.fn(),
        openOverlaySettings: jest.fn(),
        openBatteryOptimizationSettings: jest.fn(),
    }
}

describe("SystemChecksWizard", () => {
    beforeEach(() => {
        setupStartModule()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it("renders all 3 permission rows on mount", async () => {
        const pending = new Promise(() => {})
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockReturnValue(pending)
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockReturnValue(pending)
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockReturnValue(pending)

        const { findByText } = render(<SystemChecksWizard />)
        expect(await findByText("Accessibility Service")).toBeTruthy()
        expect(await findByText("Overlay Permission")).toBeTruthy()
        expect(await findByText("Battery Optimization")).toBeTruthy()
    })

    it("hides the description on a granted row even when other rows are missing", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: false })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: false })

        const { queryByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        expect(queryByText(/perform clicks and gestures/i)).toBeNull()
    })

    it("shows MISSING row with description, Refresh, and Open Settings buttons", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: false, active: false })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: true })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const { findByText, getAllByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        expect(await findByText(/perform clicks and gestures/i)).toBeTruthy()
        expect(getAllByText("Refresh").length).toBe(1)
        expect(getAllByText("Open Settings").length).toBe(1)
    })

    it("shows the Android-killed warning when accessibility is enabled but not active", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: false })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: true })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const { findByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        expect(await findByText(/Android killed it/i)).toBeTruthy()
    })

    it("fires onPermissionsChange with the aggregated grant state after statuses resolve", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: false })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const onPermissionsChange = jest.fn()
        render(<SystemChecksWizard onPermissionsChange={onPermissionsChange} />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        await waitFor(() => expect(onPermissionsChange).toHaveBeenCalled())
        const last = onPermissionsChange.mock.calls[onPermissionsChange.mock.calls.length - 1][0]
        expect(last).toEqual({ accessibility: true, overlay: false, battery: true })
    })

    it("Re-check link re-invokes all 3 status pollers when pressed", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: true })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const { findByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        const link = await findByText("Re-check")
        expect(NativeModules.StartModule.getAccessibilityStatus).toHaveBeenCalledTimes(1)
        expect(NativeModules.StartModule.getOverlayStatus).toHaveBeenCalledTimes(1)
        expect(NativeModules.StartModule.getBatteryOptimizationStatus).toHaveBeenCalledTimes(1)
        fireEvent.press(link)
        await waitFor(() => {
            jest.advanceTimersByTime(2000)
        })
        expect(NativeModules.StartModule.getAccessibilityStatus).toHaveBeenCalledTimes(2)
        expect(NativeModules.StartModule.getOverlayStatus).toHaveBeenCalledTimes(2)
        expect(NativeModules.StartModule.getBatteryOptimizationStatus).toHaveBeenCalledTimes(2)
    })

    it("expands only the topmost missing row when multiple are missing", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: false })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: false })

        const { findAllByText, queryByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        const refreshButtons = await findAllByText("Refresh")
        expect(refreshButtons.length).toBe(1)
        expect(queryByText(/render its on-screen control overlay/i)).toBeTruthy()
        expect(queryByText(/killing the bot during long-running/i)).toBeNull()
    })

    it("shows the All system checks passed banner only when every permission is granted", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: true })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const { findByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        expect(await findByText("All system checks passed")).toBeTruthy()
    })

    it("hides the All system checks passed banner when any permission is missing", async () => {
        ;(NativeModules.StartModule.getAccessibilityStatus as jest.Mock).mockResolvedValue({ enabled: true, active: true })
        ;(NativeModules.StartModule.getOverlayStatus as jest.Mock).mockResolvedValue({ enabled: false })
        ;(NativeModules.StartModule.getBatteryOptimizationStatus as jest.Mock).mockResolvedValue({ enabled: true })

        const { queryByText } = render(<SystemChecksWizard />)
        await waitFor(() => {
            jest.advanceTimersByTime(300)
        })
        expect(queryByText("All system checks passed")).toBeNull()
    })
})
