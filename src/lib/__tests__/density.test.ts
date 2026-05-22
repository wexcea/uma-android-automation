import { DENSITY, ROW_PADDING_Y, BODY_FONT_SIZE } from "../density"

describe("density tokens", () => {
    it("ships airy as the production default", () => {
        expect(DENSITY).toBe("airy")
    })

    it("airy mode derives the airy row padding", () => {
        expect(ROW_PADDING_Y).toBe(14)
    })

    it("airy mode derives the airy body font size", () => {
        expect(BODY_FONT_SIZE).toBe(14)
    })
})
