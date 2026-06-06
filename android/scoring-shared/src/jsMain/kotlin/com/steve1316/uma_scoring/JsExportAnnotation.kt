@file:OptIn(ExperimentalJsExport::class)

package com.steve1316.uma_scoring

/**
 * On the JS target, the multiplatform `JsExport` alias resolves to the real `kotlin.js.JsExport`. Both annotations are zero-arg, so call sites in commonMain (`@JsExport`) round
 * trip cleanly via the typealias.
 */
actual typealias JsExport = kotlin.js.JsExport
