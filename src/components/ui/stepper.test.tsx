import { render, fireEvent, screen } from "@testing-library/react-native"
import React from "react"
import { Stepper } from "./stepper"

describe("Stepper", () => {
    test("renders current value", () => {
        render(<Stepper value={42} onChange={() => {}} />)
        expect(screen.getByText("42")).toBeTruthy()
    })

    test("plus button calls onChange with value + step", () => {
        const handle = jest.fn()
        render(<Stepper value={5} onChange={handle} step={2} />)
        fireEvent.press(screen.getByLabelText("Increase"))
        expect(handle).toHaveBeenCalledWith(7)
    })

    test("minus button calls onChange with value - step", () => {
        const handle = jest.fn()
        render(<Stepper value={5} onChange={handle} step={2} />)
        fireEvent.press(screen.getByLabelText("Decrease"))
        expect(handle).toHaveBeenCalledWith(3)
    })

    test("minus disabled at min", () => {
        const handle = jest.fn()
        render(<Stepper value={0} onChange={handle} min={0} />)
        fireEvent.press(screen.getByLabelText("Decrease"))
        expect(handle).not.toHaveBeenCalled()
    })

    test("plus disabled at max", () => {
        const handle = jest.fn()
        render(<Stepper value={10} onChange={handle} max={10} />)
        fireEvent.press(screen.getByLabelText("Increase"))
        expect(handle).not.toHaveBeenCalled()
    })
})
