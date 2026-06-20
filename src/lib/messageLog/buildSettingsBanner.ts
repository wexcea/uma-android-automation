import { Settings } from "../../context/BotStateContext"
import { SCORING_CONSTANTS_CATALOG } from "../training/scoringConstantsCatalog"

/**
 * Length of `json` parsed as either a JSON array or object. Returns 0 on parse failure or empty input.
 *
 * @param json Raw JSON string from a Smart Race Solver settings field.
 * @returns Number of array entries or object keys, or 0 if `json` is empty or malformed.
 */
const safeJsonLength = (json: string): number => {
    try {
        const parsed = JSON.parse(json || "[]")
        return Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length
    } catch {
        return 0
    }
}

const csvCount = (csv: string): number => (csv ? csv.split(",").filter((s) => s.trim() !== "").length : 0)

/**
 * Build the optional Advanced Training Scoring section. Lists only catalog entries whose current value differs from the
 * cataloged default. Returns an empty string when every entry is at its default so the banner stays uncluttered.
 *
 * @param training The `settings.training` slice that holds the dynamic scoring keys.
 * @returns A leading-newline-prefixed section string, or "" when there are no overrides.
 */
const formatAdvancedScoringSection = (training: Settings["training"]): string => {
    const record = training as unknown as Record<string, unknown>
    const overrides: string[] = []
    for (const entry of SCORING_CONSTANTS_CATALOG) {
        const v = record[entry.key]
        if (typeof v === "number" && Number.isFinite(v) && v !== entry.defaultValue) {
            overrides.push(`  - ${entry.label}: ${v} (default ${entry.defaultValue})`)
        }
    }
    if (overrides.length === 0) return ""
    return `\n\n---------- Advanced Training Scoring ----------\n${overrides.join("\n")}`
}

const formatExcludedCategories = (plan: { excludeGreenSkills: boolean; excludeRedSkills: boolean; excludeUniqueSkills: boolean; excludeDoubleCircleSkills: boolean }): string => {
    const parts: string[] = []
    if (plan.excludeGreenSkills) parts.push("Green")
    if (plan.excludeRedSkills) parts.push("Red")
    if (plan.excludeUniqueSkills) parts.push("Unique")
    if (plan.excludeDoubleCircleSkills) parts.push("Double-O")
    return parts.length === 0 ? "None" : parts.join(", ")
}

/**
 * Build the welcome / startup banner that summarizes the current bot configuration. Pure function of the
 * settings snapshot. The output is rendered at the top of the in-app message log and persisted to SQLite
 * so the Kotlin runtime (`SettingsHelper.getStringSetting`) can read the same string the user sees.
 *
 * @param settings Snapshot of all bot settings to summarize.
 * @returns Multi-line banner string with one line per logged setting.
 */
export function buildSettingsBanner(settings: Settings): string {
    // Training stat targets by distance.
    const sprintTargetsString = `Sprint: \n\t\tSpeed: ${settings.trainingStatTarget.trainingSprintStatTarget_speedStatTarget}\t\tStamina: ${settings.trainingStatTarget.trainingSprintStatTarget_staminaStatTarget}\t\tPower: ${settings.trainingStatTarget.trainingSprintStatTarget_powerStatTarget}\n\t\tGuts: ${settings.trainingStatTarget.trainingSprintStatTarget_gutsStatTarget}\t\t\tWit: ${settings.trainingStatTarget.trainingSprintStatTarget_witStatTarget}`
    const mileTargetsString = `Mile: \n\t\tSpeed: ${settings.trainingStatTarget.trainingMileStatTarget_speedStatTarget}\t\tStamina: ${settings.trainingStatTarget.trainingMileStatTarget_staminaStatTarget}\t\tPower: ${settings.trainingStatTarget.trainingMileStatTarget_powerStatTarget}\n\t\tGuts: ${settings.trainingStatTarget.trainingMileStatTarget_gutsStatTarget}\t\t\tWit: ${settings.trainingStatTarget.trainingMileStatTarget_witStatTarget}`
    const mediumTargetsString = `Medium: \n\t\tSpeed: ${settings.trainingStatTarget.trainingMediumStatTarget_speedStatTarget}\t\tStamina: ${settings.trainingStatTarget.trainingMediumStatTarget_staminaStatTarget}\t\tPower: ${settings.trainingStatTarget.trainingMediumStatTarget_powerStatTarget}\n\t\tGuts: ${settings.trainingStatTarget.trainingMediumStatTarget_gutsStatTarget}\t\t\tWit: ${settings.trainingStatTarget.trainingMediumStatTarget_witStatTarget}`
    const longTargetsString = `Long: \n\t\tSpeed: ${settings.trainingStatTarget.trainingLongStatTarget_speedStatTarget}\t\tStamina: ${settings.trainingStatTarget.trainingLongStatTarget_staminaStatTarget}\t\tPower: ${settings.trainingStatTarget.trainingLongStatTarget_powerStatTarget}\n\t\tGuts: ${settings.trainingStatTarget.trainingLongStatTarget_gutsStatTarget}\t\t\tWit: ${settings.trainingStatTarget.trainingLongStatTarget_witStatTarget}`

    // Smart Race Solver settings - counts derived from JSON-string fields.
    const smartRaceSolverTargetCount = safeJsonLength(settings.racing.smartRaceSolverTargetEpithets)
    const smartRaceSolverForcedCount = safeJsonLength(settings.racing.smartRaceSolverForcedEpithets)
    const smartRaceSolverLockCount = safeJsonLength(settings.racing.smartRaceSolverManualLocks)
    const smartRaceSolverWeightsObj = (() => {
        try {
            return JSON.parse(settings.racing.smartRaceSolverWeights || "{}") as Record<string, number | string | boolean>
        } catch {
            return {} as Record<string, number | string | boolean>
        }
    })()
    const smartRaceSolverFanWeight = typeof smartRaceSolverWeightsObj.fanWeight === "number" ? smartRaceSolverWeightsObj.fanWeight : 0
    const smartRaceSolverOptimizeMode = smartRaceSolverFanWeight > 0 ? "Fans + Epitaphs" : "Stat Epitaphs"
    const smartRaceSolverAptitudesObj = (() => {
        try {
            return JSON.parse(settings.racing.smartRaceSolverAptitudes || "{}") as Record<string, string>
        } catch {
            return {} as Record<string, string>
        }
    })()

    return `🏁 Campaign Selected: ${settings.general.scenario !== "" ? `${settings.general.scenario}` : "Please select one in the Select Campaign option"}
👤 Profile Selected: ${settings.misc.currentProfileName ? `${settings.misc.currentProfileName}` : "Default Profile"}

---------- Training Event Options ----------
🎭 Special Event Overrides: ${
        Object.keys(settings.trainingEvent.specialEventOverrides).length === 0
            ? "No Special Event Overrides"
            : `${Object.keys(settings.trainingEvent.specialEventOverrides).length} Special Event Overrides applied`
    }
👤 Character Event Overrides: ${
        Object.keys(settings.trainingEvent.characterEventOverrides).length === 0
            ? "No Character Event Overrides"
            : `${Object.keys(settings.trainingEvent.characterEventOverrides).length} Character Event Override(s) applied`
    }
💪 Support Event Overrides: ${
        Object.keys(settings.trainingEvent.supportEventOverrides).length === 0
            ? "No Support Event Overrides"
            : `${Object.keys(settings.trainingEvent.supportEventOverrides).length} Support Event Override(s) applied`
    }
🎭 Scenario Event Overrides: ${
        Object.keys(settings.trainingEvent.scenarioEventOverrides).length === 0
            ? "No Scenario Event Overrides"
            : `${Object.keys(settings.trainingEvent.scenarioEventOverrides).length} Scenario Event Override(s) applied`
    }
🔋 Prioritize Energy Options: ${settings.trainingEvent.enablePrioritizeEnergyOptions ? "✅" : "❌"}
🔍 Enable Automatic OCR retry: ${settings.trainingEvent.enableAutomaticOCRRetry ? "✅" : "❌"}
🔍 Minimum OCR Confidence: ${settings.trainingEvent.ocrConfidence}
🔍 Hide OCR String Comparison Results: ${settings.trainingEvent.enableHideOCRComparisonResults ? "✅" : "❌"}

---------- Training Options ----------
🚫 Training Blacklist: ${settings.training.trainingBlacklist.length === 0 ? "No Trainings blacklisted" : `${settings.training.trainingBlacklist.join(", ")}`}
📊 Stat Prioritization: ${
        settings.training.statPrioritization.length === 0 ? "Using Default Stat Prioritization: Speed, Stamina, Power, Wit, Guts" : `${settings.training.statPrioritization.join(", ")}`
    }
🎴 Event Choice Stat Priority: ${
        settings.training.eventChoiceStatPriority.length === 0
            ? "Using Default Event Choice Stat Priority: Speed, Stamina, Power, Wit, Guts"
            : `${settings.training.eventChoiceStatPriority.join(", ")}`
    }
☀️ Summer Training Stat Priority: ${
        settings.training.summerTrainingStatPriority.length === 0
            ? "Using Default Summer Training Stat Priority: Speed, Stamina, Power, Wit, Guts"
            : `${settings.training.summerTrainingStatPriority.join(", ")}`
    }
🔍 Maximum Failure Chance Allowed: ${settings.training.maximumFailureChance}%
⚠️ Enable Riskier Training: ${settings.training.enableRiskyTraining ? "✅" : "❌"}${
        settings.training.enableRiskyTraining
            ? `\n   📊 Minimum Main Stat Gain Threshold: ${settings.training.riskyTrainingMinStatGain}\n   🎯 Risky Training Maximum Failure Chance: ${settings.training.riskyTrainingMaxFailureChance}%`
            : ""
    }
🔄 Disable Training on Maxed Stat: ${settings.training.disableTrainingOnMaxedStat ? "✅" : "❌"}
📏 Preferred Distance Override: ${settings.training.preferredDistanceOverride === "Default" ? "Default" : settings.training.preferredDistanceOverride}
🌈 Enable Rainbow Training Bonus: ${settings.training.enableRainbowTrainingBonus ? "✅" : "❌"}
💞 Prioritize Near-Max Friendship: ${settings.training.enablePrioritizeNearMaxFriendship ? "✅" : "❌"}
💡 Prioritize Skill Hints: ${settings.training.enablePrioritizeSkillHints ? "✅" : "❌"}
📈 Weight Score by Training Level: ${settings.training.enableTrainingLevelWeighting ? "✅" : "❌"}
☀️ Must Rest Before Summer: ${settings.training.mustRestBeforeSummer ? "✅" : "❌"}
🎯 Train Wit During Finale: ${settings.training.trainWitDuringFinale ? "✅" : "❌"}
🔍 Training Analysis Validation: ${settings.training.enableTrainingAnalysisValidation ? "✅" : "❌"}
🤖 Enable YOLO Stat Detection: ${settings.training.enableYoloStatDetection ? "✅" : "❌"}

---------- Training Stat Targets by Distance ----------
🛑 Disable Stat Targets: ${settings.training.disableStatTargets ? "✅ (all stats treated as cap=1200)" : "❌"}
🎯 Classic Year Milestone: ${settings.training.classicMilestonePercent}%
🎯 Senior Year Milestone: ${settings.training.seniorMilestonePercent}%
${sprintTargetsString}
${mileTargetsString}
${mediumTargetsString}
${longTargetsString}${formatAdvancedScoringSection(settings.training)}

---------- Racing Options ----------
👥 Prioritize Farming Fans: ${settings.racing.enableFarmingFans ? "✅" : "❌"}
⏰ Modulo Days to Farm Fans: ${settings.racing.enableFarmingFans ? `${settings.racing.daysToRunExtraRaces} days` : "❌"}
🚫 Ignore Consecutive Race Warning: ${settings.racing.ignoreConsecutiveRaceWarning ? "✅" : "❌"}
⚡ Ignore Low Energy Racing Block: ${settings.racing.ignoreLowEnergyRacingBlock ? "✅" : "❌"}
🔄 Disable Race Retries: ${settings.racing.disableRaceRetries ? "✅" : "❌"}
\t🔄 Allow Daily Free Race Retry: ${settings.racing.enableFreeRaceRetry ? "✅" : "❌"}
🏳️ Complete Career on Failure: ${settings.racing.enableCompleteCareerOnFailure ? "✅" : "❌"}
🏁 Stop on Mandatory Race: ${settings.racing.enableStopOnMandatoryRaces ? "✅" : "❌"}
🏃 Force Racing Every Day: ${settings.racing.enableForceRacing ? "✅" : "❌"}
🏁 Enable User In-Game Race Agenda: ${settings.racing.enableUserInGameRaceAgenda ? "✅" : "❌"}
🏁 Limit Extra Races to Agenda: ${settings.racing.limitRacesToInGameAgenda ? "✅" : "❌"}
🏁 Skip Summer Training for Agenda: ${settings.racing.skipSummerTrainingForAgenda ? "✅" : "❌"}
🏁 Selected User In-Game Race Agenda: ${settings.racing.selectedUserAgenda}
🏁 Custom Agenda Title: ${settings.racing.customAgendaTitle || "(none)"}
🎯 Per-Distance Strategy: ${settings.racing.enablePerDistanceStrategy ? "Enabled" : "Disabled"}
🎯 Junior Year Race Strategy: ${settings.racing.enablePerDistanceStrategy ? `[Short: ${settings.racing.juniorYearPerDistanceStrategies?.Short ?? "Default"}, Mile: ${settings.racing.juniorYearPerDistanceStrategies?.Mile ?? "Default"}, Medium: ${settings.racing.juniorYearPerDistanceStrategies?.Medium ?? "Default"}, Long: ${settings.racing.juniorYearPerDistanceStrategies?.Long ?? "Default"}]` : settings.racing.juniorYearRaceStrategy}
🎯 Classic/Senior Year Race Strategy: ${settings.racing.enablePerDistanceStrategy ? `[Short: ${settings.racing.originalPerDistanceStrategies?.Short ?? "Default"}, Mile: ${settings.racing.originalPerDistanceStrategies?.Mile ?? "Default"}, Medium: ${settings.racing.originalPerDistanceStrategies?.Medium ?? "Default"}, Long: ${settings.racing.originalPerDistanceStrategies?.Long ?? "Default"}]` : settings.racing.originalRaceStrategy}

---------- Smart Race Solver Options ----------
🤖 Enable Smart Race Solver: ${settings.racing.enableSmartRaceSolver ? "✅" : "❌"}
🚫 Disable Schedule Re-Plan Upon Race Loss: ${settings.racing.disableScheduleReplanOnRaceLoss ? "✅" : "❌"}
🎭 Solver Character Preset: ${settings.racing.smartRaceSolverCharacterPreset || "(none)"}
🐎 Solver Aptitudes: Spr ${smartRaceSolverAptitudesObj.Sprint ?? "?"}, Mile ${smartRaceSolverAptitudesObj.Mile ?? "?"}, Med ${smartRaceSolverAptitudesObj.Medium ?? "?"}, Lng ${smartRaceSolverAptitudesObj.Long ?? "?"}, Trf ${smartRaceSolverAptitudesObj.Turf ?? "?"}, Drt ${smartRaceSolverAptitudesObj.Dirt ?? "?"}
🎯 Solver Optimize Mode: ${smartRaceSolverOptimizeMode}
⚖️ Solver Weights: race ${smartRaceSolverWeightsObj.raceValue ?? "?"}, epithet ${smartRaceSolverWeightsObj.epithetValue ?? "?"}, fans ${smartRaceSolverWeightsObj.fanWeight ?? 0}, hint ${smartRaceSolverWeightsObj.hintWeight ?? "?"}, consec −${smartRaceSolverWeightsObj.consecutiveRacePenalty ?? "?"}, summer −${smartRaceSolverWeightsObj.summerPenalty ?? "?"}, raceBonus ${smartRaceSolverWeightsObj.raceBonusPct ?? "?"}%, raceCost ${smartRaceSolverWeightsObj.raceCostPct ?? "?"}%, threshold ${smartRaceSolverWeightsObj.aptitudeThreshold ?? "?"}, includeOP ${smartRaceSolverWeightsObj.includeOpAndPreOp ? "✅" : "❌"}, summerRacing ${smartRaceSolverWeightsObj.allowSummerRacing ? "✅" : "❌"}
🎯 Solver Target Epithets: ${smartRaceSolverTargetCount} selected
🚨 Solver Forced Epithets: ${smartRaceSolverForcedCount} selected
🔒 Solver Manual Turn Locks: ${smartRaceSolverLockCount} locked turn(s)

---------- Skill Options ----------
🔍 Skill Point Check: ${settings.skills.enableSkillPointCheck ? `Stop on ${settings.skills.skillPointCheck} Skill Points or more` : "❌"}
🏃 Running Style Override: ${settings.skills.preferredRunningStyle}
🛣️ Track Distance Override: ${settings.skills.preferredTrackDistance}
🛣️ Track Surface Override: ${settings.skills.preferredTrackSurface}
📅 Pre-Finals Skill Plan: ${settings.skills.plans.preFinals.enabled ? "✅" : "❌"}${
        settings.skills.plans.preFinals.enabled
            ? `\n\t💲 Buy All Negative Skills: ${
                  settings.skills.plans.preFinals.enableBuyNegativeSkills ? "✅" : "❌"
              }\n\t💸 Spending Strategy: ${settings.skills.plans.preFinals.strategy ? "✅" : "❌"}\n\t🚫 Blacklisted Skills: ${csvCount(
                  settings.skills.plans.preFinals.blacklist
              )}\n\t🎨 Excluded Categories: ${formatExcludedCategories(settings.skills.plans.preFinals)}`
            : ""
    }
📅 CareerComplete Skill Plan: ${settings.skills.plans.careerComplete.enabled ? "✅" : "❌"}${
        settings.skills.plans.careerComplete.enabled
            ? `\n\t💲 Buy All Negative Skills: ${
                  settings.skills.plans.careerComplete.enableBuyNegativeSkills ? "✅" : "❌"
              }\n\t💸 Spending Strategy: ${settings.skills.plans.careerComplete.strategy ? "✅" : "❌"}\n\t🚫 Blacklisted Skills: ${csvCount(
                  settings.skills.plans.careerComplete.blacklist
              )}\n\t🎨 Excluded Categories: ${formatExcludedCategories(settings.skills.plans.careerComplete)}`
            : ""
    }

---------- Scenario Overrides ----------
🏁 Trackblazer Consecutive Races Limit: ${settings.scenarioOverrides?.trackblazerConsecutiveRacesLimit}
🔋 Trackblazer Energy Threshold: ${settings.scenarioOverrides?.trackblazerEnergyThreshold}
🔋 Trackblazer Force-Train Energy Floor: ${settings.scenarioOverrides?.trackblazerForceTrainEnergyFloor}
🛍️ Trackblazer Shop Check Grades: ${settings.scenarioOverrides?.trackblazerShopCheckGrades?.join(", ")}
🛍️ Trackblazer Shop Check Frequency: ${settings.scenarioOverrides?.trackblazerShopCheckFrequency}
🛍️ Trackblazer Excluded Items: ${settings.scenarioOverrides?.trackblazerExcludedItems?.length === 0 ? "None" : settings.scenarioOverrides?.trackblazerExcludedItems?.join(", ")}
✨ Trackblazer Skip Risky Charm Training Below Main Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipRiskyCharmTrainingBelowGain}
✨ Trackblazer Skip Items During Bad Mood Below Main Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipBadMoodItemsBelowGain}
✨ Trackblazer Skip Empowering Megaphone Below Main Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipEmpoweringMegaphoneBelowGain}
✨ Trackblazer Skip Motivating Megaphone Below Main Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipMotivatingMegaphoneBelowGain}
✨ Trackblazer Skip Coaching Megaphone Below Main Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipCoachingMegaphoneBelowGain}
🔄 Trackblazer Max Retries per Race: ${settings.scenarioOverrides?.trackblazerMaxRetriesPerRace}
🔄 Trackblazer Whistle Forces Training: ${settings.scenarioOverrides?.trackblazerWhistleForcesTraining ? "✅" : "❌"}
🔄 Trackblazer Retry Grades: ${settings.scenarioOverrides?.trackblazerRetryRacesBeforeFinalGrades?.join(", ")}
✨ Trackblazer Enable Irregular Training: ${settings.scenarioOverrides?.trackblazerEnableIrregularTraining ? "✅" : "❌"}
✨ Trackblazer Irregular Training Min Gain: ${settings.scenarioOverrides?.trackblazerIrregularTrainingMinStatGain}
🏇 Trackblazer Preferred Distances: ${settings.scenarioOverrides?.trackblazerPreferredDistances?.length === 0 ? "None" : settings.scenarioOverrides?.trackblazerPreferredDistances?.join(", ")}
🏇 Trackblazer Preferred Surfaces: ${settings.scenarioOverrides?.trackblazerPreferredSurfaces?.length === 0 ? "None" : settings.scenarioOverrides?.trackblazerPreferredSurfaces?.join(", ")}
🔋 Trackblazer Energy Item Reserve: ${settings.scenarioOverrides?.trackblazerEnergyItemReserve}
🧁 Trackblazer Cupcake Reserve: ${settings.scenarioOverrides?.trackblazerCupcakeReserve}
🔨 Trackblazer Master Hammer Finale Reserve: ${settings.scenarioOverrides?.trackblazerMasterHammerFinaleReserve}
🔨 Trackblazer Artisan Hammer Min Stock G3: ${settings.scenarioOverrides?.trackblazerArtisanHammerMinStockForG3}
🔨 Trackblazer Artisan Hammer Min Stock G2: ${settings.scenarioOverrides?.trackblazerArtisanHammerMinStockForG2}
✨ Trackblazer Glow Stick Final-Day Reserve: ${settings.scenarioOverrides?.trackblazerGlowStickFinalReserve}
✨ Trackblazer Glow Stick Min Fans: ${settings.scenarioOverrides?.trackblazerGlowStickMinFans}

---------- Misc Options ----------
🔍 Enable Claw Machine Attempt: ${settings.general.enableClawMachineAttempt ? "✅" : "❌"}
🌀 Enable Swipe-Based Scrolling: ${settings.general.enableSwipeBasedScrolling ? "✅" : "❌"}
🛑 Stop Before Finals: ${settings.general.enableStopBeforeFinals ? "✅" : "❌"}
🛑 Stop At Date: ${settings.general.enableStopAtDate ? `✅ (${settings.general.stopAtDates.join(", ")})` : "❌"}
⏰ Wait Delay: ${settings.general.waitDelay}s
⏰ Dialog Wait Delay: ${settings.general.dialogWaitDelay}s

---------- Debug Options ----------
🐛 Debug Mode: ${settings.debug.enableDebugMode ? "✅" : "❌"}
🔍 OCR Threshold: ${settings.debug.ocrThreshold}
🔍 Minimum Template Match Confidence: ${settings.debug.templateMatchConfidence}
🔍 Custom Scale: ${settings.debug.templateMatchCustomScale}
💻 Remote Log Viewer: ${settings.debug.enableRemoteLogViewer ? "✅" : "❌"}
📹 Enable Screen Recording: ${
        settings.debug.enableScreenRecording ? `✅ (${settings.debug.recordingBitRate} Mbps, ${settings.debug.recordingFrameRate} FPS, ${settings.debug.recordingResolutionScale}x scale)` : "❌"
    }
🔍 Start Template Matching Test: ${settings.debug.debugMode_startTemplateMatchingTest ? "✅" : "❌"}
🔍 Start Single Training OCR Test: ${settings.debug.debugMode_startSingleTrainingOCRTest ? "✅" : "❌"}
🔍 Start Comprehensive Training OCR Test: ${settings.debug.debugMode_startComprehensiveTrainingOCRTest ? "✅" : "❌"}
🔍 Start Race List Detection Test: ${settings.debug.debugMode_startRaceListDetectionTest ? "✅" : "❌"}
🔍 Start Main Screen Update Test: ${settings.debug.debugMode_startMainScreenUpdateTest ? "✅" : "❌"}
🔍 Start Skill List Buy Test: ${settings.debug.debugMode_startSkillListBuyTest ? "✅" : "❌"}
🔍 Start Scrollbar Detection Test: ${settings.debug.debugMode_startScrollBarDetectionTest ? "✅" : "❌"}
🔍 Start Trackblazer Race Selection Test: ${settings.debug.debugMode_startTrackblazerRaceSelectionTest ? "✅" : "❌"}
🔍 Start Trackblazer Inventory Sync Test: ${settings.debug.debugMode_startTrackblazerInventorySyncTest ? "✅" : "❌"}
🔍 Start Trackblazer Buy Items Test: ${settings.debug.debugMode_startTrackblazerBuyItemsTest ? "✅" : "❌"}

---------- Discord Options ----------
🔔 Discord Notifications: ${settings.discord?.enableDiscordNotifications ? "✅" : "❌"}
👤 Discord User ID: ${settings.discord?.discordUserID ? "Configured" : "Not Set"}
🔑 Discord Bot Token: ${settings.discord?.discordToken ? "Configured" : "Not Set"}`
}
