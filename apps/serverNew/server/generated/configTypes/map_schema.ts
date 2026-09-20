import { configSchemas } from '@arthropoda/game-engine'

export const configSchemaVersion = 1
configSchemas.achievement = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAchievement>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfAchievementMore>(),
        },
    ],
}

configSchemas.achievement_award = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAchievement_award>(),
    map_schemas: [],
}

configSchemas.achievement_label = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAchievement_label>(),
    map_schemas: [],
}

configSchemas.achievement_label_open = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAchievement_label_open>(),
    map_schemas: [],
}

configSchemas.achievement_medal = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAchievement_medal>(),
    map_schemas: [],
}

configSchemas.activity_cross_mission = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfActivity_cross_mission>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'rank',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_cross_missionRank>(),
        },
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_cross_missionGifts>(),
        },
        {
            depth: [],
            field_name: 'crossRank',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_cross_missionCrossRank>(),
        },
    ],
}

configSchemas.activity_gift = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfActivity_gift>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_giftGifts>(),
        },
    ],
}

configSchemas.activity_rank = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfActivity_rank>(),
    map_schemas: [
        {
            depth: [{ field_name: 'task', field_type: 'object' }],
            field_name: 'taskDesc',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_rankTaskDesc>(),
        },
        {
            depth: [],
            field_name: 'task',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_rankTask>(),
        },
        {
            depth: [],
            field_name: 'rank',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_rankRank>(),
        },
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfActivity_rankGifts>(),
        },
    ],
}

configSchemas.ads_awards = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAds_awards>(),
    map_schemas: [],
}

configSchemas.arena_prestige = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfArena_prestige>(),
    map_schemas: [],
}

configSchemas.arena_rank_daily = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfArena_rank_daily>(),
    map_schemas: [],
}

configSchemas.arena_rank_season = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfArena_rank_season>(),
    map_schemas: [],
}

configSchemas.arena_ratio = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfArena_ratio>(),
    map_schemas: [],
}

configSchemas.attr = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfAttr>(),
    map_schemas: [],
}

configSchemas.audio = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfAudio>(),
    map_schemas: [],
}

configSchemas.audio_skill = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfAudio_skill>(),
    map_schemas: [],
}

configSchemas.congratulation = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfCongratulation>(),
    map_schemas: [],
}

configSchemas.cross_kui_cow = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfCross_kui_cow>(),
    map_schemas: [],
}

configSchemas.cross_mission = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfCross_mission>(),
    map_schemas: [
        {
            depth: [{ field_name: 'more', field_type: 'object' }],
            field_name: 'talk',
            id_type: 'int',
            createFn: () => new Map<int, IConfCross_missionTalk>(),
        },
        {
            depth: [{ field_name: 'task', field_type: 'object' }],
            field_name: 'taskAward',
            id_type: 'int',
            createFn: () => new Map<int, IConfCross_missionTaskAward>(),
        },
        {
            depth: [{ field_name: 'task', field_type: 'object' }],
            field_name: 'taskDesc',
            id_type: 'int',
            createFn: () => new Map<int, IConfCross_missionTaskDesc>(),
        },
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfCross_missionMore>(),
        },
        {
            depth: [],
            field_name: 'task',
            id_type: 'int',
            createFn: () => new Map<int, IConfCross_missionTask>(),
        },
    ],
}

configSchemas.day_gift = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfDay_gift>(),
    map_schemas: [
        {
            depth: [{ field_name: 'content', field_type: 'object' }],
            field_name: 'awards2',
            id_type: 'int',
            createFn: () => new Map<int, IConfDay_giftAwards2>(),
        },
        {
            depth: [{ field_name: 'content', field_type: 'object' }],
            field_name: 'choose',
            id_type: 'int',
            createFn: () => new Map<int, IConfDay_giftChoose>(),
        },
        {
            depth: [],
            field_name: 'content',
            id_type: 'int',
            createFn: () => new Map<int, IConfDay_giftContent>(),
        },
    ],
}

configSchemas.desc_tips = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfDesc_tips>(),
    map_schemas: [],
}

configSchemas.drug = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfDrug>(),
    map_schemas: [],
}

configSchemas.emoji_pack = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEmoji_pack>(),
    map_schemas: [],
}

configSchemas.equip = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip>(),
    map_schemas: [],
}

configSchemas.equip_attr_rank = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_attr_rank>(),
    map_schemas: [],
}

configSchemas.equip_award = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_award>(),
    map_schemas: [],
}

configSchemas.equip_draw = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_draw>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'specialCost',
            id_type: 'int',
            createFn: () => new Map<int, IConfEquip_drawSpecialCost>(),
        },
        {
            depth: [],
            field_name: 'lvRange',
            id_type: 'int',
            createFn: () => new Map<int, IConfEquip_drawLvRange>(),
        },
    ],
}

configSchemas.equip_effect = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_effect>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfEquip_effectMore>(),
        },
    ],
}

configSchemas.equip_effect_call = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_effect_call>(),
    map_schemas: [],
}

configSchemas.equip_effect_rank = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_effect_rank>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'rank',
            id_type: 'int',
            createFn: () => new Map<int, IConfEquip_effect_rankRank>(),
        },
    ],
}

configSchemas.equip_entry = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_entry>(),
    map_schemas: [],
}

configSchemas.equip_entry_call = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_entry_call>(),
    map_schemas: [],
}

configSchemas.equip_fashion = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_fashion>(),
    map_schemas: [],
}

configSchemas.equip_gem = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_gem>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfEquip_gemMore>(),
        },
    ],
}

configSchemas.equip_suit = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEquip_suit>(),
    map_schemas: [],
}

configSchemas.event_tracking = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEvent_tracking>(),
    map_schemas: [],
}

configSchemas.evil = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfEvil>(),
    map_schemas: [],
}

configSchemas.fast_practice = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfFast_practice>(),
    map_schemas: [],
}

configSchemas.festival_activity = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfFestival_activity>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfFestival_activityGifts>(),
        },
    ],
}

configSchemas.festival_draw = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfFestival_draw>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'times',
            id_type: 'int',
            createFn: () => new Map<int, IConfFestival_drawTimes>(),
        },
        {
            depth: [],
            field_name: 'detail',
            id_type: 'int',
            createFn: () => new Map<int, IConfFestival_drawDetail>(),
        },
        {
            depth: [],
            field_name: 'show',
            id_type: 'int',
            createFn: () => new Map<int, IConfFestival_drawShow>(),
        },
    ],
}

configSchemas.first_recharge = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfFirst_recharge>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'list',
            id_type: 'int',
            createFn: () => new Map<int, IConfFirst_rechargeList>(),
        },
    ],
}

configSchemas.first_recharge_gift = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfFirst_recharge_gift>(),
    map_schemas: [],
}

configSchemas.force_target = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfForce_target>(),
    map_schemas: [],
}

configSchemas.fund = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfFund>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfFundMore>(),
        },
    ],
}

configSchemas.getway = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGetway>(),
    map_schemas: [],
}

configSchemas.ghost_city = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGhost_city>(),
    map_schemas: [],
}

configSchemas.gift = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGift>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'content',
            id_type: 'int',
            createFn: () => new Map<int, IConfGiftContent>(),
        },
    ],
}

configSchemas.gong = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong>(),
    map_schemas: [],
}

configSchemas.gong_award = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong_award>(),
    map_schemas: [],
}

configSchemas.gong_booty = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong_booty>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'lv',
            id_type: 'int',
            createFn: () => new Map<int, IConfGong_bootyLv>(),
        },
    ],
}

configSchemas.gong_booty_combination = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong_booty_combination>(),
    map_schemas: [],
}

configSchemas.gong_magical = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong_magical>(),
    map_schemas: [],
}

configSchemas.gong_sorcery = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGong_sorcery>(),
    map_schemas: [],
}

configSchemas.goto = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGoto>(),
    map_schemas: [],
}

configSchemas.guide = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuide>(),
    map_schemas: [],
}

configSchemas.guild = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild>(),
    map_schemas: [],
}

configSchemas.guild_apply = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_apply>(),
    map_schemas: [],
}

configSchemas.guild_boss = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_boss>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'person',
            id_type: 'int',
            createFn: () => new Map<int, IConfGuild_bossPerson>(),
        },
        {
            depth: [],
            field_name: 'guild',
            id_type: 'int',
            createFn: () => new Map<int, IConfGuild_bossGuild>(),
        },
    ],
}

configSchemas.guild_build = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_build>(),
    map_schemas: [],
}

configSchemas.guild_flag = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_flag>(),
    map_schemas: [],
}

configSchemas.guild_gift = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfGuild_gift>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfGuild_giftGifts>(),
        },
    ],
}

configSchemas.guild_magic = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_magic>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'lv',
            id_type: 'int',
            createFn: () => new Map<int, IConfGuild_magicLv>(),
        },
    ],
}

configSchemas.guild_mf = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_mf>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'lv',
            id_type: 'int',
            createFn: () => new Map<int, IConfGuild_mfLv>(),
        },
    ],
}

configSchemas.guild_mission = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_mission>(),
    map_schemas: [],
}

configSchemas.guild_red_envelope = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfGuild_red_envelope>(),
    map_schemas: [],
}

configSchemas.heart_demon = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfHeart_demon>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfHeart_demonMore>(),
        },
    ],
}

configSchemas.help = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfHelp>(),
    map_schemas: [],
}

configSchemas.hero = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfHero>(),
    map_schemas: [],
}

configSchemas.hero_lv = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfHero_lv>(),
    map_schemas: [],
}

configSchemas.home_talk = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfHome_talk>(),
    map_schemas: [],
}

configSchemas.item = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfItem>(),
    map_schemas: [],
}

configSchemas.item_box = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfItem_box>(),
    map_schemas: [],
}

configSchemas.item_call = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfItem_call>(),
    map_schemas: [
        {
            depth: [{ field_name: 'mores', field_type: 'object' }],
            field_name: 'gem',
            id_type: 'int',
            createFn: () => new Map<int, IConfItem_callGem>(),
        },
        {
            depth: [],
            field_name: 'mores',
            id_type: 'int',
            createFn: () => new Map<int, IConfItem_callMore>(),
        },
    ],
}

configSchemas.item_draw = {
    id_type: 'int',
    value_type: 'array',
    createFn: () => new Map<int, IConfItem_draw[]>(),
    map_schemas: [
        {
            depth: [{ field_name: 'more', field_type: 'array' }],
            field_name: 'gem',
            id_type: 'int',
            createFn: () => new Map<int, IConfItem_drawGem>(),
        },
    ],
}

configSchemas.item_optional_box = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfItem_optional_box>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'detail',
            id_type: 'int',
            createFn: () => new Map<int, IConfItem_optional_boxDetail>(),
        },
    ],
}

configSchemas.kui_cow = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfKui_cow>(),
    map_schemas: [],
}

configSchemas.kui_cow_open = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfKui_cow_open>(),
    map_schemas: [],
}

configSchemas.level = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfLevel>(),
    map_schemas: [],
}

configSchemas.list = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfList>(),
    map_schemas: [],
}

configSchemas.lode = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfLode>(),
    map_schemas: [],
}

configSchemas.love = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfLove>(),
    map_schemas: [],
}

configSchemas.mail = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMail>(),
    map_schemas: [],
}

configSchemas.main_task = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMain_task>(),
    map_schemas: [],
}

configSchemas.map_buff = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMap_buff>(),
    map_schemas: [],
}

configSchemas.mission = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMission>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfMissionMore>(),
        },
    ],
}

configSchemas.mission_buy = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMission_buy>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfMission_buyMore>(),
        },
    ],
}

configSchemas.monster = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfMonster>(),
    map_schemas: [],
}

configSchemas.name = {
    id_type: 'number',
    value_type: 'object',
    createFn: () => new Map<number, IConfName>(),
    map_schemas: [],
}

configSchemas.npc = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfNpc>(),
    map_schemas: [],
}

configSchemas.param = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfParam>(),
    map_schemas: [],
}

configSchemas.peach_orchard = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPeach_orchard>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'detail',
            id_type: 'int',
            createFn: () => new Map<int, IConfPeach_orchardDetail>(),
        },
    ],
}

configSchemas.peach_orchard_audio = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPeach_orchard_audio>(),
    map_schemas: [],
}

configSchemas.phy_buy = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPhy_buy>(),
    map_schemas: [],
}

configSchemas.plot = {
    id_type: 'int',
    value_type: 'array',
    createFn: () => new Map<int, IConfPlot[]>(),
    map_schemas: [],
}

configSchemas.practice = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPractice>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfPracticeMore>(),
        },
    ],
}

configSchemas.practice_multi = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPractice_multi>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfPractice_multiMore>(),
        },
    ],
}

configSchemas.preload_prefab = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfPreload_prefab>(),
    map_schemas: [],
}

configSchemas.privilege_card = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfPrivilege_card>(),
    map_schemas: [],
}

configSchemas.product_id = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfProduct_id>(),
    map_schemas: [],
}

configSchemas.question_condition = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfQuestion_condition>(),
    map_schemas: [],
}

configSchemas.race = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfRace>(),
    map_schemas: [],
}

configSchemas.rank = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfRank>(),
    map_schemas: [],
}

configSchemas.rank_awards = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfRank_awards>(),
    map_schemas: [],
}

configSchemas.rank_boss = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfRank_boss>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'rank1',
            id_type: 'int',
            createFn: () => new Map<int, IConfRank_bossRank1>(),
        },
        {
            depth: [],
            field_name: 'rank2',
            id_type: 'int',
            createFn: () => new Map<int, IConfRank_bossRank2>(),
        },
        {
            depth: [],
            field_name: 'rank3',
            id_type: 'int',
            createFn: () => new Map<int, IConfRank_bossRank3>(),
        },
    ],
}

configSchemas.realm = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfRealm>(),
    map_schemas: [],
}

configSchemas.recharge = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfRecharge>(),
    map_schemas: [],
}

configSchemas.server_error_code = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfServer_error_code>(),
    map_schemas: [],
}

configSchemas.seven_day_sign = {
    id_type: 'number',
    value_type: 'object',
    createFn: () => new Map<number, IConfSeven_day_sign>(),
    map_schemas: [],
}

configSchemas.shop = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfShop>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'content',
            id_type: 'int',
            createFn: () => new Map<int, IConfShopContent>(),
        },
    ],
}

configSchemas.skill = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSkill>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'lv',
            id_type: 'int',
            createFn: () => new Map<int, IConfSkillLv>(),
        },
    ],
}

configSchemas.skill_buff = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSkill_buff>(),
    map_schemas: [],
}

configSchemas.skill_buff_decs = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfSkill_buff_decs>(),
    map_schemas: [],
}

configSchemas.skill_effect = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSkill_effect>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'targetBuff',
            id_type: 'int',
            createFn: () => new Map<int, IConfSkill_effectTargetBuff>(),
        },
        {
            depth: [],
            field_name: 'ownBuff',
            id_type: 'int',
            createFn: () => new Map<int, IConfSkill_effectOwnBuff>(),
        },
    ],
}

configSchemas.skill_fx_delay = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfSkill_fx_delay>(),
    map_schemas: [],
}

configSchemas.sterious_man = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSterious_man>(),
    map_schemas: [],
}

configSchemas.sterious_man_skin = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSterious_man_skin>(),
    map_schemas: [],
}

configSchemas.sterious_man_through = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSterious_man_through>(),
    map_schemas: [],
}

configSchemas.system_id = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSystem_id>(),
    map_schemas: [],
}

configSchemas.system_info = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSystem_info>(),
    map_schemas: [],
}

configSchemas.system_preference_id = {
    id_type: 'number',
    value_type: 'object',
    createFn: () => new Map<number, IConfSystem_preference_id>(),
    map_schemas: [],
}

configSchemas.system_preview = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfSystem_preview>(),
    map_schemas: [],
}

configSchemas.system_rank = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfSystem_rank>(),
    map_schemas: [
        {
            depth: [{ field_name: 'task', field_type: 'object' }],
            field_name: 'taskDesc',
            id_type: 'int',
            createFn: () => new Map<int, IConfSystem_rankTaskDesc>(),
        },
        {
            depth: [],
            field_name: 'task',
            id_type: 'int',
            createFn: () => new Map<int, IConfSystem_rankTask>(),
        },
        {
            depth: [],
            field_name: 'rank',
            id_type: 'int',
            createFn: () => new Map<int, IConfSystem_rankRank>(),
        },
        {
            depth: [],
            field_name: 'gifts',
            id_type: 'int',
            createFn: () => new Map<int, IConfSystem_rankGifts>(),
        },
    ],
}

configSchemas.task_daily = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTask_daily>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfTask_dailyMore>(),
        },
        {
            depth: [],
            field_name: 'box',
            id_type: 'int',
            createFn: () => new Map<int, IConfTask_dailyBox>(),
        },
    ],
}

configSchemas.task_type = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTask_type>(),
    map_schemas: [],
}

configSchemas.title = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTitle>(),
    map_schemas: [],
}

configSchemas.tow_box = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTow_box>(),
    map_schemas: [],
}

configSchemas.tow_box_robot = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTow_box_robot>(),
    map_schemas: [],
}

configSchemas.tow_box_worker = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTow_box_worker>(),
    map_schemas: [],
}

configSchemas.tower = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTower>(),
    map_schemas: [],
}

configSchemas.tower_personal = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTower_personal>(),
    map_schemas: [],
}

configSchemas.tower_server = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTower_server>(),
    map_schemas: [],
}

configSchemas.trigger_gift = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfTrigger_gift>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfTrigger_giftMore>(),
        },
    ],
}

configSchemas.version = {
    id_type: 'string',
    value_type: 'object',
    createFn: () => new Map<string, IConfVersion>(),
    map_schemas: [],
}

configSchemas.weapon = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon>(),
    map_schemas: [
        {
            depth: [],
            field_name: 'more',
            id_type: 'int',
            createFn: () => new Map<int, IConfWeaponMore>(),
        },
    ],
}

configSchemas.weapon_award = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_award>(),
    map_schemas: [],
}

configSchemas.weapon_soul_add = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_soul_add>(),
    map_schemas: [],
}

configSchemas.weapon_soul_attribute = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_soul_attribute>(),
    map_schemas: [],
}

configSchemas.weapon_soul_extract = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_soul_extract>(),
    map_schemas: [],
}

configSchemas.weapon_soul_open = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_soul_open>(),
    map_schemas: [],
}

configSchemas.weapon_valuable = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWeapon_valuable>(),
    map_schemas: [],
}

configSchemas.wechat_template = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWechat_template>(),
    map_schemas: [],
}

configSchemas.world_level = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWorld_level>(),
    map_schemas: [],
}

configSchemas.world_level_add = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWorld_level_add>(),
    map_schemas: [],
}

configSchemas.worship_god = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWorship_god>(),
    map_schemas: [],
}

configSchemas.worship_skill = {
    id_type: 'int',
    value_type: 'object',
    createFn: () => new Map<int, IConfWorship_skill>(),
    map_schemas: [],
}
