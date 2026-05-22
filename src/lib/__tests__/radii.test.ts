import { RADII } from "../radii"

describe("radii tokens", () => {
    it("exposes the Linear-balanced scale", () => {
        expect(RADII).toEqual({ xs: 4, sm: 6, md: 8, lg: 10, xl: 14, pill: 999 })
    })
})
