/**
 * Defines button components.
 *
 * Buttons are any element on screen that can be clicked to perform an action.
 *
 * Do not add checkboxes or radio buttons to this file. Those have their own files.
 *
 * Some buttons may have multiple different states. These should use the MultiStateButtonInterface interface instead of ButtonInterface.
 */

package com.steve1316.uma_android_automation.components

object ButtonAgenda : ButtonInterface {
    override val template = Template("components/button/agenda", region = Region.bottomHalf)
}

object ButtonAutoSelect : ButtonInterface {
    override val template = Template("components/button/auto_select")
}

object ButtonBack : ButtonInterface {
    override val template = Template("components/button/back", region = Region.bottomHalf)
}

object ButtonBackGreen : ButtonInterface {
    override val template = Template("components/button/back_green", region = Region.bottomHalf)
}

object ButtonBeginShowdown : ButtonInterface {
    override val template = Template("components/button/begin_showdown")
}

object ButtonBorrowSupportCard : ButtonInterface {
    override val template = Template("components/button/borrow_support_card")
}

object ButtonBurger : ButtonInterface {
    override val template = Template("components/button/burger", region = Region.bottomHalf)
}

object ButtonCancel : ButtonInterface {
    override val template = Template("components/button/cancel", region = Region.bottomHalf)
}

object ButtonCareer : ButtonInterface {
    override val template = Template("components/button/career")
}

object ButtonChangeRunningStyle : ButtonInterface {
    override val template = Template("components/button/change")
}

object ButtonClose : ButtonInterface {
    override val template = Template("components/button/close", region = Region.bottomHalf)
}

object ButtonCollectAll : ButtonInterface {
    override val template = Template("components/button/collect_all", region = Region.bottomHalf)
}

object ButtonConfirm : ButtonInterface {
    override val template = Template("components/button/confirm", region = Region.bottomHalf)
}

object ButtonConfirmExclamation : ButtonInterface {
    override val template = Template("components/button/confirm_exclamation", region = Region.bottomHalf)
}

object ButtonDailyRaces : ButtonInterface {
    override val template = Template("components/button/daily_races")
}

object ButtonDailyRacesDisabled : ButtonInterface {
    override val template = Template("components/button/daily_races_disabled")
}

object ButtonDailyRacesJupiterCup : ButtonInterface {
    override val template = Template("components/button/daily_races_jupiter_cup_logo")
}

object ButtonDailyRacesMoonlightSho : ButtonInterface {
    override val template = Template("components/button/daily_races_moonlight_sho_logo")
}

object ButtonEditTeam : ButtonInterface {
    override val template = Template("components/button/edit_team")
}

object ButtonFollow : ButtonInterface {
    override val template = Template("components/button/follow")
}

object ButtonFinish : ButtonInterface {
    override val template = Template("components/button/finish")
}

object ButtonGiveUp : ButtonInterface {
    override val template = Template("components/button/give_up")
}

object ButtonToHome : ButtonInterface {
    override val template = Template("components/button/to_home")
}

object ButtonHomeSpecialMissions : ButtonInterface {
    override val template = Template("components/button/home_special_missions")
}

object ButtonHomePresents : ButtonInterface {
    override val template = Template("components/button/home_presents")
}

object ButtonSpecialMissionsTabDaily : ButtonInterface {
    override val template = Template("components/button/special_missions_tab_daily")
}

object ButtonSpecialMissionsTabMain : ButtonInterface {
    override val template = Template("components/button/special_missions_tab_main")
}

object ButtonSpecialMissionsTabTitles : ButtonInterface {
    override val template = Template("components/button/special_missions_tab_titles")
}

object ButtonSpecialMissionsTabSpecial : ButtonInterface {
    override val template = Template("components/button/special_missions_tab_special")
}

object ButtonLater : ButtonInterface {
    override val template = Template("components/button/later")
}

object ButtonLegendRace : ButtonInterface {
    override val template = Template("components/button/legend_race")
}

object ButtonLegendRaceDisabled : ButtonInterface {
    override val template = Template("components/button/legend_race_disabled")
}

object ButtonRaceHardInactive : ButtonInterface {
    override val template = Template("components/button/race_hard_inactive")
}

object ButtonRaceHardActive : ButtonInterface {
    override val template = Template("components/button/race_hard_active")
}

object ButtonLegendRaceHomeSpecialMissions : ButtonInterface {
    override val template = Template("components/button/legend_race_special_missions")
}

object ButtonLog : ButtonInterface {
    override val template = Template("components/button/log", region = Region.bottomHalf)
}

object ButtonNext : ButtonInterface {
    override val template = Template("components/button/next", region = Region.bottomHalf)
}

object ButtonNextWithImage : ButtonInterface {
    override val template = Template("components/button/next_with_image", region = Region.bottomHalf)
}

object ButtonNextRaceEnd : ButtonInterface {
    override val template = Template("components/button/next_race_end", region = Region.bottomHalf)
}

object ButtonNo : ButtonInterface {
    override val template = Template("components/button/no", region = Region.bottomHalf)
}

object ButtonOk : ButtonInterface {
    override val template = Template("components/button/ok", region = Region.bottomHalf)
}

object ButtonOptions : ButtonInterface {
    override val template = Template("components/button/options", region = Region.bottomHalf)
}

object ButtonLearn : ButtonInterface {
    override val template = Template("components/button/learn")
}

object ButtonReset : ButtonInterface {
    override val template = Template("components/button/reset", region = Region.bottomHalf)
}

object ButtonRace : ButtonInterface {
    override val template = Template("components/button/race", region = Region.bottomHalf)
}

object ButtonRaceDayRace : ButtonInterface {
    override val template = Template("components/button/race_day_race", region = Region.bottomHalf)
}

object ButtonRaceAgain : ButtonInterface {
    override val template = Template("components/button/race_again", region = Region.bottomHalf)
}

object ButtonRaceDetails : ButtonInterface {
    override val template = Template("components/button/race_details", region = Region.bottomHalf)
}

object ButtonRaceEvents : ButtonInterface {
    override val template = Template("components/button/race_events")
}

object ButtonRaceExclamation : ButtonInterface {
    override val template = Template("components/button/race_exclamation", region = Region.bottomHalf)
}

object ButtonRaceExclamationShiftedUp : ButtonInterface {
    override val template = Template("components/button/race_exclamation_shifted_up", region = Region.middle)
}

object ButtonRaceManual : ButtonInterface {
    override val template = Template("components/button/race_manual", region = Region.bottomHalf)
}

object ButtonRaceRecommendationsCenterStage : ButtonInterface {
    override val template = Template("components/button/race_recommendations_center_stage")
}

object ButtonRaceRecommendationsPathToFame : ButtonInterface {
    override val template = Template("components/button/race_recommendations_path_to_fame")
}

object ButtonRaceRecommendationsForgeYourOwnPath : ButtonInterface {
    override val template = Template("components/button/race_recommendations_forge_your_own_path")
}

object ButtonRaceResults : ButtonInterface {
    override val template = Template("components/button/race_results")
}

object ButtonRestore : ButtonInterface {
    override val template = Template("components/button/restore")
}

object ButtonRetry : ButtonInterface {
    override val template = Template("components/button/retry")
}

object ButtonResume : ButtonInterface {
    override val template = Template("components/button/resume")
}

object ButtonSave : ButtonInterface {
    override val template = Template("components/button/save", region = Region.bottomHalf)
}

object ButtonSaveSchedule : ButtonInterface {
    override val template = Template("components/button/save_schedule", region = Region.bottomHalf)
}

object ButtonSaveAndExit : ButtonInterface {
    override val template = Template("components/button/save_and_exit", region = Region.bottomHalf)
}

object ButtonSeeResults : ButtonInterface {
    override val template = Template("components/button/see_results", region = Region.bottomHalf)
}

object ButtonSelectOpponent : ButtonInterface {
    override val template = Template("components/button/select_opponent", region = Region.bottomHalf)
}

object ButtonSelectLegacy : ButtonInterface {
    override val template = Template("components/button/select_legacy")
}

object ButtonShop : ButtonInterface {
    override val template = Template("components/button/shop")
}

object ButtonSkip : ButtonInterface {
    override val template = Template("components/button/skip", region = Region.bottomHalf)
}

object ButtonSkills : ButtonInterface {
    override val template = Template("components/button/skills", region = Region.bottomHalf)
}

object ButtonStartCareer : ButtonInterface {
    override val template = Template("components/button/start_career", region = Region.bottomHalf)
}

object ButtonStartCareerOffset : ButtonInterface {
    override val template = Template("components/button/start_career_offset", region = Region.bottomHalf)
}

object ButtonTeamRace : ButtonInterface {
    override val template = Template("components/button/team_race")
}

object ButtonTeamTrials : ButtonInterface {
    override val template = Template("components/button/team_trials")
}

object ButtonTitleScreen : ButtonInterface {
    override val template = Template("components/button/title_screen")
}

object ButtonTryAgain : ButtonInterface {
    override val template = Template("components/button/try_again", region = Region.bottomHalf)
}

object ButtonTryAgainAlt : ButtonInterface {
    override val template = Template("components/button/try_again_alt", region = Region.bottomHalf)
}

object ButtonViewResults : ButtonInterface {
    override val template = Template("components/button/view_results", region = Region.bottomHalf)
}

object ButtonWatchConcert : ButtonInterface {
    override val template = Template("components/button/watch_concert", region = Region.bottomHalf)
}

object ButtonRaceStrategyFront : ButtonInterface {
    override val template = Template("components/button/strategy_front_select", region = Region.middle)
}

object ButtonRaceStrategyPace : ButtonInterface {
    override val template = Template("components/button/strategy_pace_select", region = Region.middle)
}

object ButtonRaceStrategyLate : ButtonInterface {
    override val template = Template("components/button/strategy_late_select", region = Region.middle)
}

object ButtonRaceStrategyEnd : ButtonInterface {
    override val template = Template("components/button/strategy_end_select", region = Region.middle)
}

// More complex buttons

object ButtonMenuBarHomeSelected : ButtonInterface {
    override val template = Template("components/button/menu_bar_home_selected")
}

object ButtonMenuBarHomeUnselected : ButtonInterface {
    override val template = Template("components/button/menu_bar_home_unselected")
}

object ButtonMenuBarHome : MultiStateButtonInterface {
    override val templates: List<Template> =
        listOf(
            Template("components/button/menu_bar_home_unselected"),
            Template("components/button/menu_bar_home_selected"),
        )
}

object ButtonMenuBarRaceSelected : ButtonInterface {
    override val template = Template("components/button/menu_bar_race_selected")
}

object ButtonMenuBarRaceUnselected : ButtonInterface {
    override val template = Template("components/button/menu_bar_race_unselected")
}

object ButtonMenuBarRace : MultiStateButtonInterface {
    override val templates: List<Template> =
        listOf(
            Template("components/button/menu_bar_race_unselected"),
            Template("components/button/menu_bar_race_selected"),
        )
}

object ButtonCompleteCareer : ButtonInterface {
    override val template = Template("components/button/complete_career", region = Region.bottomHalf)
}

object ButtonCareerEndSkills : ButtonInterface {
    override val template = Template("components/button/career_end_skills")
}

object ButtonCraneGame : ButtonInterface {
    override val template = Template("components/button/crane_game", region = Region.bottomHalf)
}

object ButtonCraneGameOk : ButtonInterface {
    override val template = Template("components/button/crane_game_ok", region = Region.bottomHalf)
}

object ButtonInheritance : ButtonInterface {
    override val template = Template("components/button/inheritance", region = Region.bottomHalf)
}

object ButtonPredictions : ButtonInterface {
    override val template = Template("components/button/predictions", region = Region.bottomHalf)
}

object ButtonRunners : ButtonInterface {
    override val template = Template("components/button/runners", region = Region.middle)
}

object ButtonUnityCupRace : ButtonInterface {
    override val template = Template("components/button/unitycup_race", region = Region.bottomHalf)
}

object ButtonUnityCupRaceFinal : ButtonInterface {
    override val template = Template("components/button/unitycup_race_final", region = Region.bottomHalf)
}

object ButtonUnityCupSeeAllRaceResults : ButtonInterface {
    override val template = Template("components/button/unitycup_see_all_race_results", region = Region.bottomHalf)
}

object ButtonUnityCupTeam : ButtonInterface {
    override val template = Template("components/button/unitycup_team", region = Region.bottomHalf)
}

object ButtonUnityCupWatchMainRace : ButtonInterface {
    override val template = Template("components/button/unitycup_watch_main_race", region = Region.bottomHalf)
}

object ButtonRest : ButtonInterface {
    override val template = Template("components/button/rest", region = Region.bottomHalf)
}

object ButtonRestAndRecreation : ButtonInterface {
    override val template = Template("components/button/rest_and_recreation", region = Region.bottomHalf)
}

object ButtonInfirmary : ButtonInterface {
    override val template = Template("components/button/infirmary", region = Region.bottomHalf)
}

object ButtonRecreation : ButtonInterface {
    override val template = Template("components/button/recreation", region = Region.bottomHalf)
}

object ButtonEndCareer : ButtonInterface {
    override val template = Template("components/button/end_career", region = Region.bottomHalf)
}

object ButtonRaceListFullStats : ButtonInterface {
    override val template = Template("components/button/race_list_full_stats", region = Region.middle)
}

object ButtonSkillListFullStats : ButtonInterface {
    override val template = Template("components/button/skill_list_full_stats", region = Region.topHalf)
}

object ButtonHomeFullStats : ButtonInterface {
    override val template = Template("components/button/home_full_stats", region = Region.middle)
}

object ButtonTrainingSpeed : ButtonInterface {
    override val template = Template("components/button/training_speed", region = Region.bottomHalf)
}

object ButtonTrainingStamina : ButtonInterface {
    override val template = Template("components/button/training_stamina", region = Region.bottomHalf)
}

object ButtonTrainingPower : ButtonInterface {
    override val template = Template("components/button/training_power", region = Region.bottomHalf)
}

object ButtonTrainingGuts : ButtonInterface {
    override val template = Template("components/button/training_guts", region = Region.bottomHalf)
}

object ButtonTrainingWit : ButtonInterface {
    override val template = Template("components/button/training_wit", region = Region.bottomHalf)
}

object ButtonTraining : ButtonInterface {
    override val template = Template("components/button/training", region = Region.bottomHalf)
}

object ButtonRaces : ButtonInterface {
    override val template = Template("components/button/races", region = Region.bottomHalf)
}

object ButtonHomeFansInfo : ButtonInterface {
    override val template = Template("components/button/home_fans_info", region = Region.leftHalf)
}

object ButtonSkillUp : ButtonInterface {
    override val template = Template("components/button/skill_up", region = Region.rightHalf)
}

object ButtonSkillDown : ButtonInterface {
    override val template = Template("components/button/skill_down", region = Region.rightHalf)
}

object ButtonOverwrite : ButtonInterface {
    override val template = Template("components/button/overwrite", region = Region.bottomHalf)
}

object ButtonMyAgendas : ButtonInterface {
    override val template = Template("components/button/my_agendas", region = Region.bottomHalf)
}

object ButtonRaceAgendaLoadList : ButtonInterface {
    override val template = Template("components/button/race_agenda_load_list", region = Region.rightHalf)
}

object ButtonDetails : ButtonInterface {
    override val template = Template("components/button/details", region = Region.middle)
}

object ButtonShopTrackblazer : ButtonInterface {
    override val template = Template("components/button/shop_trackblazer", region = Region.bottomHalf)
}

object ButtonTrainingItems : ButtonInterface {
    override val template = Template("components/button/training_items")
}

object ButtonExchange : ButtonInterface {
    override val template = Template("components/button/exchange", region = Region.bottomHalf)
}

object ButtonConfirmUse : ButtonInterface {
    override val template = Template("components/button/confirm_use", region = Region.bottomHalf)
}

object ButtonUseTrainingItems : ButtonInterface {
    override val template = Template("components/button/use_training_items", region = Region.bottomHalf)
}

object ButtonConditions : ButtonInterface {
    override val template = Template("components/button/conditions", region = Region.middle)
}

object ButtonEventProgressChevron : ButtonInterface {
    override val template = Template("components/button/event_progress_chevron")
}
