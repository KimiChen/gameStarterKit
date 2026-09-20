import { ActionActivityGetConf } from '../../../../src/modules/activity/action/ActionActivityGetConf'
import { ActionActivityGearAward } from '../../../../src/modules/activity/action/ActionActivityGearAward'
import { ActionActivityGetRankSettlement } from '../../../../src/modules/activity/action/ActionActivityGetRankSettlement'
import { ActionLogin } from '../../../../src/runtime/action/C2S/base/ActionLogin'
import { ActionChatGetFirstWorld } from '../../../../src/modules/chat/action/ActionChatGetFirstWorld'
import { ActionChatGetList } from '../../../../src/modules/chat/action/ActionChatGetList'
import { ActionChatGetRecently } from '../../../../src/modules/chat/action/ActionChatGetRecently'
import { ActionChatSend } from '../../../../src/modules/chat/action/ActionChatSend'
import { ActionDefault } from '../../../../src/runtime/action/C2S/default/ActionDefault'
import { ActionEquipAutoDissolve } from '../../../../src/modules/equip/action/ActionEquipAutoDissolve'
import { ActionEquipDisassembly } from '../../../../src/modules/equip/action/ActionEquipDisassembly'
import { ActionEquipFashionRecover } from '../../../../src/modules/equip/action/ActionEquipFashionRecover'
import { ActionEquipFashionWear } from '../../../../src/modules/equip/action/ActionEquipFashionWear'
import { ActionEquipForgeDraw } from '../../../../src/modules/equip/action/ActionEquipForgeDraw'
import { ActionEquipGemEngrave } from '../../../../src/modules/equip/action/ActionEquipGemEngrave'
import { ActionEquipGemInlay } from '../../../../src/modules/equip/action/ActionEquipGemInlay'
import { ActionEquipGetInfo } from '../../../../src/modules/equip/action/ActionEquipGetInfo'
import { ActionEquipLock } from '../../../../src/modules/equip/action/ActionEquipLock'
import { ActionEquipWear } from '../../../../src/modules/equip/action/ActionEquipWear'
import { ActionEquipBreakAward } from '../../../../src/modules/equip/action/ActionEquipBreakAward'
import { ActionEquipRepair } from '../../../../src/modules/equip/action/ActionEquipRepair'
import { ActionFriendAccept } from '../../../../src/modules/friend/action/ActionFriendAccept'
import { ActionFriendApply } from '../../../../src/modules/friend/action/ActionFriendApply'
import { ActionFriendApplyList } from '../../../../src/modules/friend/action/ActionFriendApplyList'
import { ActionFriendBatchAllow } from '../../../../src/modules/friend/action/ActionFriendBatchAllow'
import { ActionFriendBatchReject } from '../../../../src/modules/friend/action/ActionFriendBatchReject'
import { ActionFriendBlackAdd } from '../../../../src/modules/friend/action/ActionFriendBlackAdd'
import { ActionFriendBlackDel } from '../../../../src/modules/friend/action/ActionFriendBlackDel'
import { ActionFriendChatDel } from '../../../../src/modules/friend/action/ActionFriendChatDel'
import { ActionFriendDelete } from '../../../../src/modules/friend/action/ActionFriendDelete'
import { ActionFriendReject } from '../../../../src/modules/friend/action/ActionFriendReject'
import { ActionFriendSearch } from '../../../../src/modules/friend/action/ActionFriendSearch'
import { ActionGongLvUp } from '../../../../src/modules/gong/action/ActionGongLvUp'
import { ActionGongSkillUp } from '../../../../src/modules/gong/action/ActionGongSkillUp'
import { ActionGuildApply } from '../../../../src/modules/guild/action/ActionGuildApply'
import { ActionGuildCreate } from '../../../../src/modules/guild/action/ActionGuildCreate'
import { ActionGuildGetInfo } from '../../../../src/modules/guild/action/ActionGuildGetInfo'
import { ActionGuildMemberAssign } from '../../../../src/modules/guild/action/ActionGuildMemberAssign'
import { ActionGuildMemberAudit } from '../../../../src/modules/guild/action/ActionGuildMemberAudit'
import { ActionGuildMemberDissolution } from '../../../../src/modules/guild/action/ActionGuildMemberDissolution'
import { ActionGuildMemberDonate } from '../../../../src/modules/guild/action/ActionGuildMemberDonate'
import { ActionGuildMemberDonatePill } from '../../../../src/modules/guild/action/ActionGuildMemberDonatePill'
import { ActionGuildMemberKick } from '../../../../src/modules/guild/action/ActionGuildMemberKick'
import { ActionGuildMemberMagicActivate } from '../../../../src/modules/guild/action/ActionGuildMemberMagicActivate'
import { ActionGuildMemberMagicUpgrade } from '../../../../src/modules/guild/action/ActionGuildMemberMagicUpgrade'
import { ActionGuildMemberMfUp } from '../../../../src/modules/guild/action/ActionGuildMemberMfUp'
import { ActionGuildMemberQuickJoin } from '../../../../src/modules/guild/action/ActionGuildMemberQuickJoin'
import { ActionGuildMemberQuit } from '../../../../src/modules/guild/action/ActionGuildMemberQuit'
import { ActionGuildMemberSet } from '../../../../src/modules/guild/action/ActionGuildMemberSet'
import { ActionGuildOpenRed } from '../../../../src/modules/guild/action/ActionGuildOpenRed'
import { ActionGuildNotice } from '../../../../src/modules/guild/action/ActionGuildNotice'
import { ActionGuildInvite } from '../../../../src/modules/guild/action/ActionGuildInvite'
import { ActionGuildMission } from '../../../../src/modules/guild/action/ActionGuildMission'
import { ActionGuildBoss } from '../../../../src/modules/guild/action/ActionGuildBoss'
import { ActionGuildBargain } from '../../../../src/modules/guild/action/ActionGuildBargain'
import { ActionGuildCompensate } from '../../../../src/modules/guild/action/ActionGuildCompensate'
import { ActionGuildBuy } from '../../../../src/modules/guild/action/ActionGuildBuy'
import { ActionMailRead } from '../../../../src/modules/mail/action/ActionMailRead'
import { ActionMailAward } from '../../../../src/modules/mail/action/ActionMailAward'
import { ActionMailAwardAll } from '../../../../src/modules/mail/action/ActionMailAwardAll'
import { ActionMailDelete } from '../../../../src/modules/mail/action/ActionMailDelete'
import { ActionMissionGetList } from '../../../../src/modules/mission/action/ActionMissionGetList'
import { ActionMissionGetBossList } from '../../../../src/modules/mission/action/ActionMissionGetBossList'
import { ActionMissionSubscribe } from '../../../../src/modules/mission/action/ActionMissionSubscribe'
import { ActionMissionBuyNum } from '../../../../src/modules/mission/action/ActionMissionBuyNum'
import { ActionMissionAward } from '../../../../src/modules/mission/action/ActionMissionAward'
import { ActionPayClick } from '../../../../src/modules/pay/action/ActionPayClick'
import { ActionPracticeEnterPractice } from '../../../../src/modules/practice/action/ActionPracticeEnterPractice'
import { ActionPracticeHangUpAward } from '../../../../src/modules/practice/action/ActionPracticeHangUpAward'
import { ActionPracticeHangUpSync } from '../../../../src/modules/practice/action/ActionPracticeHangUpSync'
import { ActionPracticeMonsterKilled } from '../../../../src/modules/practice/action/ActionPracticeMonsterKilled'
import { ActionPracticeNpcAssist } from '../../../../src/modules/practice/action/ActionPracticeNpcAssist'
import { ActionPracticeNpcAward } from '../../../../src/modules/practice/action/ActionPracticeNpcAward'
import { ActionPracticeNpcBreakUp } from '../../../../src/modules/practice/action/ActionPracticeNpcBreakUp'
import { ActionPracticeNpcDaily } from '../../../../src/modules/practice/action/ActionPracticeNpcDaily'
import { ActionPracticeNpcSkinIn } from '../../../../src/modules/practice/action/ActionPracticeNpcSkinIn'
import { ActionPracticeNpcUpLv } from '../../../../src/modules/practice/action/ActionPracticeNpcUpLv'
import { ActionPracticePickUpBox } from '../../../../src/modules/practice/action/ActionPracticePickUpBox'
import { ActionPracticeQuickAward } from '../../../../src/modules/practice/action/ActionPracticeQuickAward'
import { ActionPracticeRefreshMonster } from '../../../../src/modules/practice/action/ActionPracticeRefreshMonster'
import { ActionPropAdd } from '../../../../src/modules/props/action/ActionPropAdd'
import { ActionPropUse } from '../../../../src/modules/props/action/ActionPropUse'
import { ActionRankGetRank } from '../../../../src/modules/rank/action/ActionRankGetRank'
import { ActionRankGetSelfRank } from '../../../../src/modules/rank/action/ActionRankGetSelfRank'
import { ActionRankWorship } from '../../../../src/modules/rank/action/ActionRankWorship'
import { ActionRankGetDailyInfo } from '../../../../src/modules/rank/action/ActionRankGetDailyInfo'
import { ActionRedDotRead } from '../../../../src/modules/reddot/action/ActionRedDotRead'
import { ActionEnter } from '../../../../src/modules/user/action/ActionEnter'
import { ActionInitRole } from '../../../../src/modules/user/action/ActionInitRole'
import { ActionMagicWear } from '../../../../src/modules/user/action/ActionMagicWear'
import { ActionNiubility } from '../../../../src/modules/user/action/ActionNiubility'
import { ActionPowerOper } from '../../../../src/modules/user/action/ActionPowerOper'
import { ActionUserAttrAdd } from '../../../../src/modules/user/action/ActionUserAttrAdd'
import { ActionUserSync } from '../../../../src/modules/user/action/ActionUserSync'
import { ActionGetUserInfo } from '../../../../src/modules/user/action/ActionGetUserInfo'
import { ActionUserDetailInfo } from '../../../../src/modules/user/action/ActionUserDetailInfo'
import { ActionCultivate } from '../../../../src/modules/user/action/ActionCultivate'
import { ActionWeaponCleanse } from '../../../../src/modules/weapon/action/ActionWeaponCleanse'
import { ActionWeaponDrop } from '../../../../src/modules/weapon/action/ActionWeaponDrop'
import { ActionWeaponLvUp } from '../../../../src/modules/weapon/action/ActionWeaponLvUp'
import { ActionWeaponReplace } from '../../../../src/modules/weapon/action/ActionWeaponReplace'
import { ActionWeaponWear } from '../../../../src/modules/weapon/action/ActionWeaponWear'
import { ActionSceneActorJoin } from '../../../../src/modules/scene/action/ActionSceneActorJoin'
import { ActionSceneActorLeave } from '../../../../src/modules/scene/action/ActionSceneActorLeave'
import { ActionSceneActorBack } from '../../../../src/modules/scene/action/ActionSceneActorBack'
import { ActionSceneActorRevive } from '../../../../src/modules/scene/action/ActionSceneActorRevive'
import { ActionSceneActorSelect } from '../../../../src/modules/scene/action/ActionSceneActorSelect'
import { ActionSceneActorSkill } from '../../../../src/modules/scene/action/ActionSceneActorSkill'
import { ActionSceneActorFightSet } from '../../../../src/modules/scene/action/ActionSceneActorFightSet'
import { ActionSceneActorUseProp } from '../../../../src/modules/scene/action/ActionSceneActorUseProp'
import { ActionSceneActorDrugSet } from '../../../../src/modules/scene/action/ActionSceneActorDrugSet'
import { ActionScenePracticeClick } from '../../../../src/modules/scene/action/ActionScenePracticeClick'
import { ActionSceneInvitePageInvite } from '../../../../src/modules/scene/action/ActionSceneInvitePageInvite'
import { ActionSceneInvitePageShield } from '../../../../src/modules/scene/action/ActionSceneInvitePageShield'
import { ActionSceneDebugInfo } from '../../../../src/modules/scene/action/ActionSceneDebugInfo'
import { ActionSceneActorGetRoomInfos } from '../../../../src/modules/scene/action/ActionSceneActorGetRoomInfos'
import { ActionSceneInvitePageGetPlayerScene } from '../../../../src/modules/scene/action/ActionSceneInvitePageGetPlayerScene'
import { ActionSceneArenaEscape } from '../../../../src/modules/scene/action/ActionSceneArenaEscape'
import { ActionSceneActorRankAward } from '../../../../src/modules/scene/action/ActionSceneActorRankAward'
import { ActionSceneRealmCallNpc } from '../../../../src/modules/scene/action/ActionSceneRealmCallNpc'
import { ActionAdsList } from '../../../../src/modules/ads/action/ActionAdsList'
import { ActionAdsWatch } from '../../../../src/modules/ads/action/ActionAdsWatch'
import { ActionTitleList } from '../../../../src/modules/title/action/ActionTitleList'
import { ActionTitleActivate } from '../../../../src/modules/title/action/ActionTitleActivate'
import { ActionTitleDress } from '../../../../src/modules/title/action/ActionTitleDress'
import { ActionTitleUnDress } from '../../../../src/modules/title/action/ActionTitleUnDress'
import { ActionTitleRead } from '../../../../src/modules/title/action/ActionTitleRead'

export const Actions = {
    'activity/ActivityGetConf': ActionActivityGetConf,
    'activity/ActivityGearAward': ActionActivityGearAward,
    'activity/ActivityGetRankSettlement': ActionActivityGetRankSettlement,
    'base/Login': ActionLogin,
    'chat/ChatGetFirstWorld': ActionChatGetFirstWorld,
    'chat/ChatGetList': ActionChatGetList,
    'chat/ChatGetRecently': ActionChatGetRecently,
    'chat/ChatSend': ActionChatSend,
    'default/Default': ActionDefault,
    'equip/EquipAutoDissolve': ActionEquipAutoDissolve,
    'equip/EquipDisassembly': ActionEquipDisassembly,
    'equip/EquipFashionRecover': ActionEquipFashionRecover,
    'equip/EquipFashionWear': ActionEquipFashionWear,
    'equip/EquipForgeDraw': ActionEquipForgeDraw,
    'equip/EquipGemEngrave': ActionEquipGemEngrave,
    'equip/EquipGemInlay': ActionEquipGemInlay,
    'equip/EquipGetInfo': ActionEquipGetInfo,
    'equip/EquipLock': ActionEquipLock,
    'equip/EquipWear': ActionEquipWear,
    'equip/EquipBreakAward': ActionEquipBreakAward,
    'equip/EquipRepair': ActionEquipRepair,
    'friend/FriendAccept': ActionFriendAccept,
    'friend/FriendApply': ActionFriendApply,
    'friend/FriendApplyList': ActionFriendApplyList,
    'friend/FriendBatchAllow': ActionFriendBatchAllow,
    'friend/FriendBatchReject': ActionFriendBatchReject,
    'friend/FriendBlackAdd': ActionFriendBlackAdd,
    'friend/FriendBlackDel': ActionFriendBlackDel,
    'friend/FriendChatDel': ActionFriendChatDel,
    'friend/FriendDelete': ActionFriendDelete,
    'friend/FriendReject': ActionFriendReject,
    'friend/FriendSearch': ActionFriendSearch,
    'gong/GongLvUp': ActionGongLvUp,
    'gong/GongSkillUp': ActionGongSkillUp,
    'guild/GuildApply': ActionGuildApply,
    'guild/GuildCreate': ActionGuildCreate,
    'guild/GuildGetInfo': ActionGuildGetInfo,
    'guild/GuildMemberAssign': ActionGuildMemberAssign,
    'guild/GuildMemberAudit': ActionGuildMemberAudit,
    'guild/GuildMemberDissolution': ActionGuildMemberDissolution,
    'guild/GuildMemberDonate': ActionGuildMemberDonate,
    'guild/GuildMemberDonatePill': ActionGuildMemberDonatePill,
    'guild/GuildMemberKick': ActionGuildMemberKick,
    'guild/GuildMemberMagicActivate': ActionGuildMemberMagicActivate,
    'guild/GuildMemberMagicUpgrade': ActionGuildMemberMagicUpgrade,
    'guild/GuildMemberMfUp': ActionGuildMemberMfUp,
    'guild/GuildMemberQuickJoin': ActionGuildMemberQuickJoin,
    'guild/GuildMemberQuit': ActionGuildMemberQuit,
    'guild/GuildMemberSet': ActionGuildMemberSet,
    'guild/GuildOpenRed': ActionGuildOpenRed,
    'guild/GuildNotice': ActionGuildNotice,
    'guild/GuildInvite': ActionGuildInvite,
    'guild/GuildMission': ActionGuildMission,
    'guild/GuildBoss': ActionGuildBoss,
    'guild/GuildBargain': ActionGuildBargain,
    'guild/GuildCompensate': ActionGuildCompensate,
    'guild/GuildBuy': ActionGuildBuy,
    'mail/MailRead': ActionMailRead,
    'mail/MailAward': ActionMailAward,
    'mail/MailAwardAll': ActionMailAwardAll,
    'mail/MailDelete': ActionMailDelete,
    'mission/MissionGetList': ActionMissionGetList,
    'mission/MissionGetBossList': ActionMissionGetBossList,
    'mission/MissionSubscribe': ActionMissionSubscribe,
    'mission/MissionBuyNum': ActionMissionBuyNum,
    'mission/MissionAward': ActionMissionAward,
    'pay/PayClick': ActionPayClick,
    'practice/PracticeEnterPractice': ActionPracticeEnterPractice,
    'practice/PracticeHangUpAward': ActionPracticeHangUpAward,
    'practice/PracticeHangUpSync': ActionPracticeHangUpSync,
    'practice/PracticeMonsterKilled': ActionPracticeMonsterKilled,
    'practice/PracticeNpcAssist': ActionPracticeNpcAssist,
    'practice/PracticeNpcAward': ActionPracticeNpcAward,
    'practice/PracticeNpcBreakUp': ActionPracticeNpcBreakUp,
    'practice/PracticeNpcDaily': ActionPracticeNpcDaily,
    'practice/PracticeNpcSkinIn': ActionPracticeNpcSkinIn,
    'practice/PracticeNpcUpLv': ActionPracticeNpcUpLv,
    'practice/PracticePickUpBox': ActionPracticePickUpBox,
    'practice/PracticeQuickAward': ActionPracticeQuickAward,
    'practice/PracticeRefreshMonster': ActionPracticeRefreshMonster,
    'props/PropAdd': ActionPropAdd,
    'props/PropUse': ActionPropUse,
    'rank/RankGetRank': ActionRankGetRank,
    'rank/RankGetSelfRank': ActionRankGetSelfRank,
    'rank/RankWorship': ActionRankWorship,
    'rank/RankGetDailyInfo': ActionRankGetDailyInfo,
    'reddot/RedDotRead': ActionRedDotRead,
    'user/Enter': ActionEnter,
    'user/InitRole': ActionInitRole,
    'user/MagicWear': ActionMagicWear,
    'user/Niubility': ActionNiubility,
    'user/PowerOper': ActionPowerOper,
    'user/UserAttrAdd': ActionUserAttrAdd,
    'user/UserSync': ActionUserSync,
    'user/GetUserInfo': ActionGetUserInfo,
    'user/UserDetailInfo': ActionUserDetailInfo,
    'user/Cultivate': ActionCultivate,
    'weapon/WeaponCleanse': ActionWeaponCleanse,
    'weapon/WeaponDrop': ActionWeaponDrop,
    'weapon/WeaponLvUp': ActionWeaponLvUp,
    'weapon/WeaponReplace': ActionWeaponReplace,
    'weapon/WeaponWear': ActionWeaponWear,
    'scene/SceneActorJoin': ActionSceneActorJoin,
    'scene/SceneActorLeave': ActionSceneActorLeave,
    'scene/SceneActorBack': ActionSceneActorBack,
    'scene/SceneActorRevive': ActionSceneActorRevive,
    'scene/SceneActorSelect': ActionSceneActorSelect,
    'scene/SceneActorSkill': ActionSceneActorSkill,
    'scene/SceneActorFightSet': ActionSceneActorFightSet,
    'scene/SceneActorUseProp': ActionSceneActorUseProp,
    'scene/SceneActorDrugSet': ActionSceneActorDrugSet,
    'scene/ScenePracticeClick': ActionScenePracticeClick,
    'scene/SceneInvitePageInvite': ActionSceneInvitePageInvite,
    'scene/SceneInvitePageShield': ActionSceneInvitePageShield,
    'scene/SceneDebugInfo': ActionSceneDebugInfo,
    'scene/SceneActorGetRoomInfos': ActionSceneActorGetRoomInfos,
    'scene/SceneInvitePageGetPlayerScene': ActionSceneInvitePageGetPlayerScene,
    'scene/SceneArenaEscape': ActionSceneArenaEscape,
    'scene/SceneActorRankAward': ActionSceneActorRankAward,
    'scene/SceneRealmCallNpc': ActionSceneRealmCallNpc,
    'ads/AdsList': ActionAdsList,
    'ads/AdsWatch': ActionAdsWatch,
    'title/TitleList': ActionTitleList,
    'title/TitleActivate': ActionTitleActivate,
    'title/TitleDress': ActionTitleDress,
    'title/TitleUnDress': ActionTitleUnDress,
    'title/TitleRead': ActionTitleRead,
}
