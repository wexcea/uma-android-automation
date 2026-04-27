import { flattenLists, foldHtmlTags, splitDetails } from "../markdownPreprocess"

describe("markdownPreprocess", () => {
    describe("foldHtmlTags", () => {
        it("folds <strong> and <b> into bold markdown", () => {
            expect(foldHtmlTags("hello <strong>bold</strong> world")).toBe("hello **bold** world")
            expect(foldHtmlTags("hello <b>bold</b> world")).toBe("hello **bold** world")
        })

        it("folds <em> and <i> into italic markdown", () => {
            expect(foldHtmlTags("hello <em>em</em> <i>i</i>")).toBe("hello *em* *i*")
        })

        it("folds <br> into a hard line break", () => {
            expect(foldHtmlTags("line one<br>line two")).toBe("line one  \nline two")
            expect(foldHtmlTags("line one<br />line two")).toBe("line one  \nline two")
        })

        it("does not touch <details>/<summary>", () => {
            const input = "<details><summary>title</summary>body</details>"
            expect(foldHtmlTags(input)).toBe(input)
        })
    })

    describe("splitDetails", () => {
        it("returns one md segment when there is no details block", () => {
            const result = splitDetails("just plain markdown text")
            expect(result).toEqual([{ kind: "md", text: "just plain markdown text" }])
        })

        it("extracts a single details block in the middle of text", () => {
            const md = "before\n<details><summary>summary</summary>body</details>\nafter"
            const result = splitDetails(md)
            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({ kind: "md", text: "before\n" })
            expect(result[1]).toEqual({ kind: "details", summary: "summary", body: "body" })
            expect(result[2]).toEqual({ kind: "md", text: "\nafter" })
        })

        it("extracts multiple details blocks in order", () => {
            const md = "<details><summary>a</summary>1</details><details><summary>b</summary>2</details>"
            const result = splitDetails(md)
            expect(result).toHaveLength(2)
            expect(result.map((s) => (s.kind === "details" ? s.summary : s.text))).toEqual(["a", "b"])
        })

        it("trims whitespace inside summary and body", () => {
            const md = "<details><summary>  spaced  </summary>\n\nbody\n\n</details>"
            const result = splitDetails(md)
            expect(result[0]).toEqual({ kind: "details", summary: "spaced", body: "body" })
        })
    })

    describe("flattenLists", () => {
        it("rewrites unordered list items as bullet prose with hard breaks", () => {
            const md = "- one\n- two\n- three"
            expect(flattenLists(md)).toBe("• one  \n• two  \n• three  ")
        })

        it("rewrites ordered list items with escaped digits", () => {
            const md = "1. first\n2. second"
            expect(flattenLists(md)).toBe("1\\. first  \n2\\. second  ")
        })

        it("preserves indentation on nested items", () => {
            const md = "- top\n  - nested"
            expect(flattenLists(md)).toBe("• top  \n  • nested  ")
        })

        it("leaves non-list lines untouched", () => {
            const md = "intro\n- bullet\noutro"
            expect(flattenLists(md)).toBe("intro\n• bullet  \noutro")
        })

        it("applies foldHtmlTags first so list items can contain inline HTML", () => {
            const md = "- <strong>bold</strong> item"
            expect(flattenLists(md)).toBe("• **bold** item  ")
        })
    })
})
