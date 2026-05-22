import { TYPE } from "../type"

describe("type tokens", () => {
    it("exposes the full type scale", () => {
        expect(Object.keys(TYPE).sort()).toEqual(["body", "caption", "display", "h1", "h2", "monoLabel", "monoValue"])
    })

    it("uses Geist Sans for prose tokens", () => {
        expect(TYPE.display.fontFamily).toMatch(/^Geist_/)
        expect(TYPE.h1.fontFamily).toMatch(/^Geist_/)
        expect(TYPE.body.fontFamily).toMatch(/^Geist_/)
        expect(TYPE.caption.fontFamily).toMatch(/^Geist_/)
    })

    it("uses Geist Mono for numeric and label tokens", () => {
        expect(TYPE.monoValue.fontFamily).toMatch(/^GeistMono_/)
        expect(TYPE.monoLabel.fontFamily).toMatch(/^GeistMono_/)
    })

    it("upper-cases monoLabel for uppercase micro-labels", () => {
        expect(TYPE.monoLabel.textTransform).toBe("uppercase")
        expect(TYPE.monoLabel.letterSpacing).toBeGreaterThan(0)
    })
})
