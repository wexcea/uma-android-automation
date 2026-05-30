// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////
// Density (compile-time)
//
// Single switch controlling row padding and body font size. Production ships `"airy"`.
// Flip to `"compact"` locally to experiment with a denser layout. Not exposed as a user-facing toggle.

type Density = "airy" | "compact"

export const DENSITY: Density = "airy"

/** Row vertical padding in dp. Airy: 14, compact: 9. */
export const ROW_PADDING_Y: number = DENSITY === "airy" ? 14 : 9

/** Body font size in pt. Airy: 14, compact: 13. */
export const BODY_FONT_SIZE: number = DENSITY === "airy" ? 14 : 13
