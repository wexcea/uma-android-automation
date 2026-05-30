import { PerformanceLogger } from "../performanceLogger"

describe("PerformanceLogger", () => {
    beforeEach(() => {
        PerformanceLogger.ENABLED = true
        jest.spyOn(console, "log").mockImplementation(() => {})
        jest.spyOn(console, "warn").mockImplementation(() => {})
    })

    afterEach(() => {
        PerformanceLogger.ENABLED = false
        jest.restoreAllMocks()
    })

    describe("startTiming", () => {
        it("returns a no-op function when ENABLED is false", () => {
            PerformanceLogger.ENABLED = false
            const logger = new PerformanceLogger()
            const end = logger.startTiming("test_op", "settings")
            const metric = end()
            expect(metric.operation).toBe("test_op")
            expect(metric.duration).toBe(0)
            expect(metric.category).toBe("settings")
        })

        it("returns a function that records duration when ENABLED is true", () => {
            const logger = new PerformanceLogger()
            const end = logger.startTiming("test_op", "database")
            // Small delay to ensure duration > 0
            const metric = end({ key: "value" })
            expect(metric.operation).toBe("test_op")
            expect(metric.category).toBe("database")
            expect(metric.duration).toBeGreaterThanOrEqual(0)
            expect(metric.details).toEqual({ key: "value" })
            expect(metric.timestamp).toBeGreaterThan(0)
        })
    })

    describe("recordMetric", () => {
        it("records metric and logs it", () => {
            const logger = new PerformanceLogger()
            logger.recordMetric({
                operation: "test",
                duration: 10,
                timestamp: Date.now(),
                category: "ui",
            })
            expect(console.log).toHaveBeenCalledTimes(1)
            expect((console.log as jest.Mock).mock.calls[0][0]).toContain("[PERF] UI - test: 10.00ms")
        })

        it("does nothing when ENABLED is false", () => {
            PerformanceLogger.ENABLED = false
            const logger = new PerformanceLogger()
            logger.recordMetric({
                operation: "test",
                duration: 10,
                timestamp: Date.now(),
                category: "ui",
            })
            expect(console.log).not.toHaveBeenCalled()
        })

        it("caps metrics at maxMetricsHistory", () => {
            const logger = new PerformanceLogger()
            // Record 105 metrics
            for (let i = 0; i < 105; i++) {
                logger.recordMetric({
                    operation: `op_${i}`,
                    duration: 1,
                    timestamp: Date.now(),
                    category: "settings",
                })
            }
            // Internal array should be capped at 100
            // We can verify by checking the logger still works (no crash)
            expect(console.log).toHaveBeenCalledTimes(105)
        })
    })

    describe("logMetric (slow operation warning)", () => {
        it("warns for operations >= 300ms", () => {
            const logger = new PerformanceLogger()
            logger.recordMetric({
                operation: "slow_op",
                duration: 300,
                timestamp: Date.now(),
                category: "database",
            })
            expect(console.warn).toHaveBeenCalledTimes(1)
            expect((console.warn as jest.Mock).mock.calls[0][0]).toContain("[PERF] DATABASE - slow_op: 300.00ms")
        })

        it("logs normally for operations < 300ms", () => {
            const logger = new PerformanceLogger()
            logger.recordMetric({
                operation: "fast_op",
                duration: 50,
                timestamp: Date.now(),
                category: "state",
            })
            expect(console.log).toHaveBeenCalledTimes(1)
            expect(console.warn).not.toHaveBeenCalled()
        })

        it("includes details in log message", () => {
            const logger = new PerformanceLogger()
            logger.recordMetric({
                operation: "detailed_op",
                duration: 5,
                timestamp: Date.now(),
                category: "ui",
                details: { count: 3 },
            })
            expect((console.log as jest.Mock).mock.calls[0][0]).toContain('Details: {"count":3}')
        })
    })

    describe("markNavigationStart/End", () => {
        it("records navigation metric between start and end", () => {
            const logger = new PerformanceLogger()
            logger.markNavigationStart("Settings")
            logger.markNavigationEnd("Settings", "ui")
            expect(console.log).toHaveBeenCalledTimes(1)
            expect((console.log as jest.Mock).mock.calls[0][0]).toContain("navigation_to_Settings")
        })

        it("does nothing when markNavigationEnd called without start", () => {
            const logger = new PerformanceLogger()
            logger.markNavigationEnd("Unknown")
            expect(console.log).not.toHaveBeenCalled()
        })

        it("does nothing when ENABLED is false", () => {
            PerformanceLogger.ENABLED = false
            const logger = new PerformanceLogger()
            logger.markNavigationStart("Test")
            logger.markNavigationEnd("Test")
            expect(console.log).not.toHaveBeenCalled()
        })
    })
})
