/**
 * Defines icon components.
 *
 * These are images which are typically not clickable, however they DO have click functionality; it just isn't their primary purpose. This is why we classify them as Icons instead of Buttons.
 */

package com.steve1316.uma_android_automation.components

object IconMoodGreat : ComponentInterface {
    override val template = Template("components/icon/mood_great", region = Region.topHalf)
}

object IconMoodGood : ComponentInterface {
    override val template = Template("components/icon/mood_good", region = Region.topHalf)
}

object IconMoodNormal : ComponentInterface {
    override val template = Template("components/icon/mood_normal", region = Region.topHalf)
}

object IconMoodBad : ComponentInterface {
    override val template = Template("components/icon/mood_bad", region = Region.topHalf)
}

object IconMoodAwful : ComponentInterface {
    override val template = Template("components/icon/mood_awful", region = Region.topHalf)
}

object IconTrainingHeaderSpeed : ComponentInterface {
    override val template = Template("components/icon/training_header_speed", region = Region.topHalf)
}

object IconTrainingHeaderStamina : ComponentInterface {
    override val template = Template("components/icon/training_header_stamina", region = Region.topHalf)
}

object IconTrainingHeaderPower : ComponentInterface {
    override val template = Template("components/icon/training_header_power", region = Region.topHalf)
}

object IconTrainingHeaderGuts : ComponentInterface {
    override val template = Template("components/icon/training_header_guts", region = Region.topHalf)
}

object IconTrainingHeaderWit : ComponentInterface {
    override val template = Template("components/icon/training_header_wit", region = Region.topHalf)
}

object IconHorseshoe : ComponentInterface {
    override val template = Template("components/icon/horseshoe")
}

object IconDoubleCircle : ComponentInterface {
    override val template = Template("components/icon/double_circle")
}

object IconUnityCupRaceEndLogo : ComponentInterface {
    override val template = Template("components/icon/unity_cup_race_end_logo", region = Region.topHalf)
}

object IconTazuna : ComponentInterface {
    override val template = Template("components/icon/tazuna", region = Region.topHalf)
}

object IconRaceDayRibbon : ComponentInterface {
    override val template = Template("components/icon/race_day_ribbon", region = Region.bottomHalf)
}

object IconRaceHistory1st : ComponentInterface {
    override val template = Template("components/icon/race_history_1st")
}

object IconGoalRibbon : ComponentInterface {
    override val template = Template("components/icon/goal_ribbon", region = Region.leftHalf)
}

object IconRaceListPredictionDoubleStar : ComponentInterface {
    override val template = Template("components/icon/race_list_prediction_double_star", region = Region.rightHalf)
}

object IconRaceListSelectionBracketBottomRight : ComponentInterface {
    override val template = Template("components/icon/race_list_selection_bracket_bottom_right", region = Region.rightHalf)
}

object IconRaceListMaidenPill : ComponentInterface {
    override val template = Template("components/icon/race_list_maiden_pill", region = Region.bottomHalf)
}

object IconScrollListTopLeft : ComponentInterface {
    override val template = Template("components/icon/scroll_list_top_left", region = Region.leftHalf)
}

object IconScrollListBottomRight : ComponentInterface {
    override val template = Template("components/icon/scroll_list_bottom_right", region = Region.rightHalf)
}

object IconObtainedPill : ComponentInterface {
    override val template = Template("components/icon/obtained_pill", region = Region.rightHalf)
}

object IconSkillTitleDoubleCircle : ComponentInterface {
    override val template = Template("components/icon/skill_title_double_circle")
}

object IconSkillTitleCircle : ComponentInterface {
    override val template = Template("components/icon/skill_title_circle")
}

object IconSkillTitleX : ComponentInterface {
    override val template = Template("components/icon/skill_title_x")
}

object IconRaceListTopLeft : ComponentInterface {
    override val template = Template("components/icon/race_list_top_left", region = Region.leftHalf)
}

object IconRaceListBottomRight : ComponentInterface {
    override val template = Template("components/icon/race_list_bottom_right", region = Region.rightHalf)
}

object IconOneFreePerDayTooltip : ComponentInterface {
    override val template = Template("components/icon/one_free_per_day_tooltip", region = Region.middle)
}

object IconEnergyBarLeftPart : ComponentInterface {
    override val template = Template("components/icon/energy_bar_left_part", region = Region.topHalf)
}

object IconEnergyBarRightPart0 : ComponentInterface {
    override val template = Template("components/icon/energy_bar_right_part_0", region = Region.topHalf)
}

object IconEnergyBarRightPart1 : ComponentInterface {
    override val template = Template("components/icon/energy_bar_right_part_1", region = Region.topHalf)
}

object IconRaceNotEnoughFans : ComponentInterface {
    override val template = Template("components/icon/race_not_enough_fans", region = Region.middle)
}

object IconStatBlockSpeed : ComponentInterface {
    override val template = Template("components/icon/stat_block_speed")
}

object IconStatBlockStamina : ComponentInterface {
    override val template = Template("components/icon/stat_block_stamina")
}

object IconStatBlockPower : ComponentInterface {
    override val template = Template("components/icon/stat_block_power")
}

object IconStatBlockGuts : ComponentInterface {
    override val template = Template("components/icon/stat_block_guts")
}

object IconStatBlockWit : ComponentInterface {
    override val template = Template("components/icon/stat_block_wit")
}

object IconStatBlockTrainer : ComponentInterface {
    override val template = Template("components/icon/stat_block_trainer")
}

object IconStatBlockGroup : ComponentInterface {
    override val template = Template("components/icon/stat_block_group")
}

object IconStatSupportEtsukoOtonashi : ComponentInterface {
    override val template = Template("components/icon/stat_support_etsuko_otonashi")
}

object IconStatSupportRikoKashimoto : ComponentInterface {
    override val template = Template("components/icon/stat_support_riko_kashimoto")
}

object IconStatSupportYayoiAkikawa : ComponentInterface {
    override val template = Template("components/icon/stat_support_yayoi_akikawa")
}

object IconStatSkillHint : ComponentInterface {
    override val template = Template("components/icon/stat_skill_hint", confidence = 0.9)
}

object IconRecreationDate : ComponentInterface {
    override val template = Template("components/icon/recreation_date", region = Region.bottomHalf)
}

object IconRecreationDateOpen : ComponentInterface {
    override val template = Template("components/icon/recreation_date_open", region = Region.middle)
}

object IconTrainingEventHorseshoe : ComponentInterface {
    override val template = Template("components/icon/training_event_horseshoe", region = Region.leftHalf)
}

object IconEventTitleSpacer : ComponentInterface {
    override val template = Template("components/icon/event_title_spacer")
}

object IconUnityCupSpiritExplosion : ComponentInterface {
    override val template = Template("components/icon/unitycup_spirit_explosion", region = Region.topRightThird)
}

object IconUnityCupSpiritTraining : ComponentInterface {
    override val template = Template("components/icon/unitycup_spirit_training", region = Region.topRightThird)
}

object IconUnityCupTutorialHeader : ComponentInterface {
    override val template = Template("components/icon/unitycup_tutorial_header", region = Region.topHalf)
}

object IconInfirmaryEventHeader : ComponentInterface {
    override val template = Template("components/icon/infirmary_event_header", region = Region.topHalf)
}

object IconRaceAgendaEmpty : ComponentInterface {
    override val template = Template("components/icon/race_agenda_empty", region = Region.topHalf)
}

object IconDialogScrollListTopLeft : ComponentInterface {
    override val template = Template("components/icon/dialog_scroll_list_top_left", region = Region.leftHalf)
}

object IconDialogScrollListBottomRight : ComponentInterface {
    override val template = Template("components/icon/dialog_scroll_list_bottom_right", region = Region.rightHalf)
}
