@file:OptIn(ExperimentalMultiplatform::class)

package com.steve1316.uma_scoring

/**
 * Multiplatform-safe alias for `kotlin.js.JsExport`. On the JS target this resolves to the real annotation (and the declaration is exported to JS / TypeScript). On any other
 * target (JVM here) the annotation has no `actual`, and `@OptionalExpectation` makes it a no-op so the same source files compile for both targets.
 */
@Target(AnnotationTarget.CLASS, AnnotationTarget.PROPERTY, AnnotationTarget.FUNCTION, AnnotationTarget.FILE)
@OptionalExpectation
expect annotation class JsExport()
