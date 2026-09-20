import { ServiceProto } from '@arthropoda/game-engine'
import {} from '../../../../src/runtime/protocol/C2S/ModInfo'
import {} from '../../../../src/runtime/protocol/C2S/MsgError'
import {
    ReqActivityGetConf,
    ResActivityGetConf,
    ReqActivityGearAward,
    ResActivityGearAward,
    ReqActivityGetRankSettlement,
} from '../../../../src/modules/activity/ActivityC2S'
import { ReqLogin, ResLogin, PushChange } from '../../../../src/runtime/protocol/C2S/base'
import {
    ReqChatGetFirstWorld,
    ResChatGetFirstWorld,
    ReqChatGetList,
    ResChatGetList,
    ReqChatGetRecently,
    ResChatGetRecently,
    ReqChatSend,
    ResChatSend,
    PushChatForbid,
    PushChat,
    PushChatRecentlyItem,
} from '../../../../src/modules/chat/ChatC2S'
import {
    PushLedMsg,
    PushPop,
    PushTipMsg,
    PushErrorStatus,
    PushUnForbid,
} from '../../../../src/runtime/protocol/C2S/commom'
import { ReqDefault, ResDefault } from '../../../../src/runtime/protocol/C2S/default'
import {
    ReqEquipAutoDissolve,
    ResEquipAutoDissolve,
    ReqEquipDisassembly,
    ResEquipDisassembly,
    ReqEquipFashionRecover,
    ResEquipFashionRecover,
    ReqEquipFashionWear,
    ResEquipFashionWear,
    ReqEquipForgeDraw,
    ResEquipForgeDraw,
    ReqEquipGemEngrave,
    ResEquipGemEngrave,
    ReqEquipGemInlay,
    ResEquipGemInlay,
    ReqEquipGetInfo,
    ResEquipGetInfo,
    ReqEquipLock,
    ResEquipLock,
    ReqEquipWear,
    ResEquipWear,
    ReqEquipBreakAward,
    ResEquipBreakAward,
    ReqEquipRepair,
} from '../../../../src/modules/equip/EquipC2S'
import {
    ReqFriendAccept,
    ResFriendAccept,
    ReqFriendApply,
    ResFriendApply,
    ReqFriendApplyList,
    ResFriendApplyList,
    ReqFriendBatchAllow,
    ResFriendBatchAllow,
    ReqFriendBatchReject,
    ResFriendBatchReject,
    ReqFriendBlackAdd,
    ResFriendBlackAdd,
    ReqFriendBlackDel,
    ResFriendBlackDel,
    ReqFriendChatDel,
    ResFriendChatDel,
    ReqFriendDelete,
    ResFriendDelete,
    ReqFriendReject,
    ResFriendReject,
    ReqFriendSearch,
    ResFriendSearch,
    PushFriendUpdate,
} from '../../../../src/modules/friend/FriendC2S'
import { ReqGongLvUp, ResGongLvUp, ReqGongSkillUp, ResGongSkillUp } from '../../../../src/modules/gong/GongC2S'
import {
    ReqGuildApply,
    ReqGuildCreate,
    ReqGuildGetInfo,
    ResGuildGetInfo,
    ReqGuildMemberAssign,
    ReqGuildMemberAudit,
    ReqGuildMemberDissolution,
    ReqGuildMemberDonate,
    ResGuildMemberDonate,
    ReqGuildMemberDonatePill,
    ReqGuildMemberKick,
    ReqGuildMemberMagicActivate,
    ReqGuildMemberMagicUpgrade,
    ReqGuildMemberMfUp,
    ReqGuildMemberQuickJoin,
    ReqGuildMemberQuit,
    ReqGuildMemberSet,
    ReqGuildOpenRed,
    ResGuildOpenRed,
    ReqGuildNotice,
    ReqGuildInvite,
    ReqGuildMission,
    ResGuildMission,
    ReqGuildBoss,
    ResGuildBoss,
    ReqGuildBargain,
    ReqGuildCompensate,
    ResGuildCompensate,
    ReqGuildBuy,
    ResGuildBuy,
    PushInviteToGuild,
} from '../../../../src/modules/guild/GuildC2S'
import {
    ReqMailRead,
    ReqMailAward,
    ResMailAward,
    ReqMailAwardAll,
    ResMailAwardAll,
    ReqMailDelete,
} from '../../../../src/modules/mail/MailC2S'
import {} from '../../../../src/runtime/protocol/C2S/message'
import {
    ReqMissionGetList,
    ResMissionGetList,
    ReqMissionGetBossList,
    ResMissionGetBossList,
    ReqMissionSubscribe,
    ReqMissionBuyNum,
    ReqMissionAward,
    ResMissionAward,
    PushMissionUpdatePush,
} from '../../../../src/modules/mission/MissionC2S'
import { ReqPayClick, ResPayClick } from '../../../../src/modules/pay/PayC2S'
import {
    ReqPracticeEnterPractice,
    ResPracticeEnterPractice,
    ReqPracticeHangUpAward,
    ResPracticeHangUpAward,
    ReqPracticeHangUpSync,
    ReqPracticeMonsterKilled,
    ResPracticeMonsterKilled,
    ReqPracticeNpcAssist,
    ResPracticeNpcAssist,
    ReqPracticeNpcAward,
    ResPracticeNpcAward,
    ReqPracticeNpcBreakUp,
    ReqPracticeNpcDaily,
    ResPracticeNpcDaily,
    ReqPracticeNpcSkinIn,
    ResPracticeNpcSkinIn,
    ReqPracticeNpcUpLv,
    ReqPracticePickUpBox,
    ResPracticePickUpBox,
    ReqPracticeQuickAward,
    ResPracticeQuickAward,
    ReqPracticeRefreshMonster,
} from '../../../../src/modules/practice/PracticeC2S'
import { ReqPropAdd, ResPropAdd, ReqPropUse, ResPropUse } from '../../../../src/modules/props/PropsC2S'
import {
    ReqRankGetRank,
    ResRankGetRank,
    ReqRankGetSelfRank,
    ResRankGetSelfRank,
    ReqRankWorship,
    ResRankWorship,
    ReqRankGetDailyInfo,
    ResRankGetDailyInfo,
} from '../../../../src/modules/rank/RankC2S'
import { ReqRedDotRead } from '../../../../src/modules/reddot/RedDotC2S'
import {
    ReqEnter,
    ResEnter,
    ReqInitRole,
    ReqMagicWear,
    ResMagicWear,
    ReqNiubility,
    ResNiubility,
    ReqPowerOper,
    ResPowerOper,
    ReqUserAttrAdd,
    ResUserAttrAdd,
    ReqUserSync,
    ResUserSync,
    ReqGetUserInfo,
    ResGetUserInfo,
    ReqUserDetailInfo,
    ResUserDetailInfo,
    ReqCultivate,
    ResCultivate,
} from '../../../../src/modules/user/UserC2S'
import {
    ReqWeaponCleanse,
    ResWeaponCleanse,
    ReqWeaponDrop,
    ResWeaponDrop,
    ReqWeaponLvUp,
    ResWeaponLvUp,
    ReqWeaponReplace,
    ResWeaponReplace,
    ReqWeaponWear,
    ResWeaponWear,
} from '../../../../src/modules/weapon/WeaponC2S'
import {
    ReqSceneActorJoin,
    ReqSceneActorLeave,
    ReqSceneActorBack,
    ReqSceneActorRevive,
    ReqSceneActorSelect,
    ReqSceneActorSkill,
    ReqSceneActorFightSet,
    ReqSceneActorUseProp,
    ReqSceneActorDrugSet,
    ReqScenePracticeClick,
    ReqSceneInvitePageInvite,
    ReqSceneInvitePageShield,
    ReqSceneDebugInfo,
    ResSceneDebugInfo,
    ReqSceneActorGetRoomInfos,
    ResSceneActorGetRoomInfos,
    ReqSceneInvitePageGetPlayerScene,
    ResSceneInvitePageGetPlayerScene,
    ReqSceneArenaEscape,
    ReqSceneActorRankAward,
    ResSceneActorRankAward,
    ReqSceneRealmCallNpc,
    PushSceneJoinMessage,
    PushSceneResultMessage,
    PushSceneKillMessage,
    PushSceneInviteMessage,
    PushPracticeClickMessage,
} from '../../../../src/modules/scene/SceneC2S'
import {} from '../../../../src/runtime/protocol/C2S/global'
import { ReqAdsList, ResAdsList, ReqAdsWatch, ResAdsWatch } from '../../../../src/modules/ads/AdsC2S'
import {
    ReqTitleList,
    ResTitleList,
    ReqTitleActivate,
    ReqTitleDress,
    ReqTitleUnDress,
    ReqTitleRead,
} from '../../../../src/modules/title/TitleC2S'

export interface ServiceType {
    api: {
        'activity/ActivityGetConf': {
            req: ReqActivityGetConf
            res: ResActivityGetConf
        }
        'activity/ActivityGearAward': {
            req: ReqActivityGearAward
            res: ResActivityGearAward
        }
        'activity/ActivityGetRankSettlement': {
            req: ReqActivityGetRankSettlement
            res: ResDefault
        }
        'base/Login': {
            req: ReqLogin
            res: ResLogin
        }
        'chat/ChatGetFirstWorld': {
            req: ReqChatGetFirstWorld
            res: ResChatGetFirstWorld
        }
        'chat/ChatGetList': {
            req: ReqChatGetList
            res: ResChatGetList
        }
        'chat/ChatGetRecently': {
            req: ReqChatGetRecently
            res: ResChatGetRecently
        }
        'chat/ChatSend': {
            req: ReqChatSend
            res: ResChatSend
        }
        'default/Default': {
            req: ReqDefault
            res: ResDefault
        }
        'equip/EquipAutoDissolve': {
            req: ReqEquipAutoDissolve
            res: ResEquipAutoDissolve
        }
        'equip/EquipDisassembly': {
            req: ReqEquipDisassembly
            res: ResEquipDisassembly
        }
        'equip/EquipFashionRecover': {
            req: ReqEquipFashionRecover
            res: ResEquipFashionRecover
        }
        'equip/EquipFashionWear': {
            req: ReqEquipFashionWear
            res: ResEquipFashionWear
        }
        'equip/EquipForgeDraw': {
            req: ReqEquipForgeDraw
            res: ResEquipForgeDraw
        }
        'equip/EquipGemEngrave': {
            req: ReqEquipGemEngrave
            res: ResEquipGemEngrave
        }
        'equip/EquipGemInlay': {
            req: ReqEquipGemInlay
            res: ResEquipGemInlay
        }
        'equip/EquipGetInfo': {
            req: ReqEquipGetInfo
            res: ResEquipGetInfo
        }
        'equip/EquipLock': {
            req: ReqEquipLock
            res: ResEquipLock
        }
        'equip/EquipWear': {
            req: ReqEquipWear
            res: ResEquipWear
        }
        'equip/EquipBreakAward': {
            req: ReqEquipBreakAward
            res: ResEquipBreakAward
        }
        'equip/EquipRepair': {
            req: ReqEquipRepair
            res: ResDefault
        }
        'friend/FriendAccept': {
            req: ReqFriendAccept
            res: ResFriendAccept
        }
        'friend/FriendApply': {
            req: ReqFriendApply
            res: ResFriendApply
        }
        'friend/FriendApplyList': {
            req: ReqFriendApplyList
            res: ResFriendApplyList
        }
        'friend/FriendBatchAllow': {
            req: ReqFriendBatchAllow
            res: ResFriendBatchAllow
        }
        'friend/FriendBatchReject': {
            req: ReqFriendBatchReject
            res: ResFriendBatchReject
        }
        'friend/FriendBlackAdd': {
            req: ReqFriendBlackAdd
            res: ResFriendBlackAdd
        }
        'friend/FriendBlackDel': {
            req: ReqFriendBlackDel
            res: ResFriendBlackDel
        }
        'friend/FriendChatDel': {
            req: ReqFriendChatDel
            res: ResFriendChatDel
        }
        'friend/FriendDelete': {
            req: ReqFriendDelete
            res: ResFriendDelete
        }
        'friend/FriendReject': {
            req: ReqFriendReject
            res: ResFriendReject
        }
        'friend/FriendSearch': {
            req: ReqFriendSearch
            res: ResFriendSearch
        }
        'gong/GongLvUp': {
            req: ReqGongLvUp
            res: ResGongLvUp
        }
        'gong/GongSkillUp': {
            req: ReqGongSkillUp
            res: ResGongSkillUp
        }
        'guild/GuildApply': {
            req: ReqGuildApply
            res: ResDefault
        }
        'guild/GuildCreate': {
            req: ReqGuildCreate
            res: ResDefault
        }
        'guild/GuildGetInfo': {
            req: ReqGuildGetInfo
            res: ResGuildGetInfo
        }
        'guild/GuildMemberAssign': {
            req: ReqGuildMemberAssign
            res: ResDefault
        }
        'guild/GuildMemberAudit': {
            req: ReqGuildMemberAudit
            res: ResDefault
        }
        'guild/GuildMemberDissolution': {
            req: ReqGuildMemberDissolution
            res: ResDefault
        }
        'guild/GuildMemberDonate': {
            req: ReqGuildMemberDonate
            res: ResGuildMemberDonate
        }
        'guild/GuildMemberDonatePill': {
            req: ReqGuildMemberDonatePill
            res: ResDefault
        }
        'guild/GuildMemberKick': {
            req: ReqGuildMemberKick
            res: ResDefault
        }
        'guild/GuildMemberMagicActivate': {
            req: ReqGuildMemberMagicActivate
            res: ResDefault
        }
        'guild/GuildMemberMagicUpgrade': {
            req: ReqGuildMemberMagicUpgrade
            res: ResDefault
        }
        'guild/GuildMemberMfUp': {
            req: ReqGuildMemberMfUp
            res: ResDefault
        }
        'guild/GuildMemberQuickJoin': {
            req: ReqGuildMemberQuickJoin
            res: ResDefault
        }
        'guild/GuildMemberQuit': {
            req: ReqGuildMemberQuit
            res: ResDefault
        }
        'guild/GuildMemberSet': {
            req: ReqGuildMemberSet
            res: ResDefault
        }
        'guild/GuildOpenRed': {
            req: ReqGuildOpenRed
            res: ResGuildOpenRed
        }
        'guild/GuildNotice': {
            req: ReqGuildNotice
            res: ResDefault
        }
        'guild/GuildInvite': {
            req: ReqGuildInvite
            res: ResDefault
        }
        'guild/GuildMission': {
            req: ReqGuildMission
            res: ResGuildMission
        }
        'guild/GuildBoss': {
            req: ReqGuildBoss
            res: ResGuildBoss
        }
        'guild/GuildBargain': {
            req: ReqGuildBargain
            res: ResDefault
        }
        'guild/GuildCompensate': {
            req: ReqGuildCompensate
            res: ResGuildCompensate
        }
        'guild/GuildBuy': {
            req: ReqGuildBuy
            res: ResGuildBuy
        }
        'mail/MailRead': {
            req: ReqMailRead
            res: ResDefault
        }
        'mail/MailAward': {
            req: ReqMailAward
            res: ResMailAward
        }
        'mail/MailAwardAll': {
            req: ReqMailAwardAll
            res: ResMailAwardAll
        }
        'mail/MailDelete': {
            req: ReqMailDelete
            res: ResDefault
        }
        'mission/MissionGetList': {
            req: ReqMissionGetList
            res: ResMissionGetList
        }
        'mission/MissionGetBossList': {
            req: ReqMissionGetBossList
            res: ResMissionGetBossList
        }
        'mission/MissionSubscribe': {
            req: ReqMissionSubscribe
            res: ResDefault
        }
        'mission/MissionBuyNum': {
            req: ReqMissionBuyNum
            res: ResDefault
        }
        'mission/MissionAward': {
            req: ReqMissionAward
            res: ResMissionAward
        }
        'pay/PayClick': {
            req: ReqPayClick
            res: ResPayClick
        }
        'practice/PracticeEnterPractice': {
            req: ReqPracticeEnterPractice
            res: ResPracticeEnterPractice
        }
        'practice/PracticeHangUpAward': {
            req: ReqPracticeHangUpAward
            res: ResPracticeHangUpAward
        }
        'practice/PracticeHangUpSync': {
            req: ReqPracticeHangUpSync
            res: ResDefault
        }
        'practice/PracticeMonsterKilled': {
            req: ReqPracticeMonsterKilled
            res: ResPracticeMonsterKilled
        }
        'practice/PracticeNpcAssist': {
            req: ReqPracticeNpcAssist
            res: ResPracticeNpcAssist
        }
        'practice/PracticeNpcAward': {
            req: ReqPracticeNpcAward
            res: ResPracticeNpcAward
        }
        'practice/PracticeNpcBreakUp': {
            req: ReqPracticeNpcBreakUp
            res: ResDefault
        }
        'practice/PracticeNpcDaily': {
            req: ReqPracticeNpcDaily
            res: ResPracticeNpcDaily
        }
        'practice/PracticeNpcSkinIn': {
            req: ReqPracticeNpcSkinIn
            res: ResPracticeNpcSkinIn
        }
        'practice/PracticeNpcUpLv': {
            req: ReqPracticeNpcUpLv
            res: ResDefault
        }
        'practice/PracticePickUpBox': {
            req: ReqPracticePickUpBox
            res: ResPracticePickUpBox
        }
        'practice/PracticeQuickAward': {
            req: ReqPracticeQuickAward
            res: ResPracticeQuickAward
        }
        'practice/PracticeRefreshMonster': {
            req: ReqPracticeRefreshMonster
            res: ResDefault
        }
        'props/PropAdd': {
            req: ReqPropAdd
            res: ResPropAdd
        }
        'props/PropUse': {
            req: ReqPropUse
            res: ResPropUse
        }
        'rank/RankGetRank': {
            req: ReqRankGetRank
            res: ResRankGetRank
        }
        'rank/RankGetSelfRank': {
            req: ReqRankGetSelfRank
            res: ResRankGetSelfRank
        }
        'rank/RankWorship': {
            req: ReqRankWorship
            res: ResRankWorship
        }
        'rank/RankGetDailyInfo': {
            req: ReqRankGetDailyInfo
            res: ResRankGetDailyInfo
        }
        'reddot/RedDotRead': {
            req: ReqRedDotRead
            res: ResDefault
        }
        'user/Enter': {
            req: ReqEnter
            res: ResEnter
        }
        'user/InitRole': {
            req: ReqInitRole
            res: ResDefault
        }
        'user/MagicWear': {
            req: ReqMagicWear
            res: ResMagicWear
        }
        'user/Niubility': {
            req: ReqNiubility
            res: ResNiubility
        }
        'user/PowerOper': {
            req: ReqPowerOper
            res: ResPowerOper
        }
        'user/UserAttrAdd': {
            req: ReqUserAttrAdd
            res: ResUserAttrAdd
        }
        'user/UserSync': {
            req: ReqUserSync
            res: ResUserSync
        }
        'user/GetUserInfo': {
            req: ReqGetUserInfo
            res: ResGetUserInfo
        }
        'user/UserDetailInfo': {
            req: ReqUserDetailInfo
            res: ResUserDetailInfo
        }
        'user/Cultivate': {
            req: ReqCultivate
            res: ResCultivate
        }
        'weapon/WeaponCleanse': {
            req: ReqWeaponCleanse
            res: ResWeaponCleanse
        }
        'weapon/WeaponDrop': {
            req: ReqWeaponDrop
            res: ResWeaponDrop
        }
        'weapon/WeaponLvUp': {
            req: ReqWeaponLvUp
            res: ResWeaponLvUp
        }
        'weapon/WeaponReplace': {
            req: ReqWeaponReplace
            res: ResWeaponReplace
        }
        'weapon/WeaponWear': {
            req: ReqWeaponWear
            res: ResWeaponWear
        }
        'scene/SceneActorJoin': {
            req: ReqSceneActorJoin
            res: ResDefault
        }
        'scene/SceneActorLeave': {
            req: ReqSceneActorLeave
            res: ResDefault
        }
        'scene/SceneActorBack': {
            req: ReqSceneActorBack
            res: ResDefault
        }
        'scene/SceneActorRevive': {
            req: ReqSceneActorRevive
            res: ResDefault
        }
        'scene/SceneActorSelect': {
            req: ReqSceneActorSelect
            res: ResDefault
        }
        'scene/SceneActorSkill': {
            req: ReqSceneActorSkill
            res: ResDefault
        }
        'scene/SceneActorFightSet': {
            req: ReqSceneActorFightSet
            res: ResDefault
        }
        'scene/SceneActorUseProp': {
            req: ReqSceneActorUseProp
            res: ResDefault
        }
        'scene/SceneActorDrugSet': {
            req: ReqSceneActorDrugSet
            res: ResDefault
        }
        'scene/ScenePracticeClick': {
            req: ReqScenePracticeClick
            res: ResDefault
        }
        'scene/SceneInvitePageInvite': {
            req: ReqSceneInvitePageInvite
            res: ResDefault
        }
        'scene/SceneInvitePageShield': {
            req: ReqSceneInvitePageShield
            res: ResDefault
        }
        'scene/SceneDebugInfo': {
            req: ReqSceneDebugInfo
            res: ResSceneDebugInfo
        }
        'scene/SceneActorGetRoomInfos': {
            req: ReqSceneActorGetRoomInfos
            res: ResSceneActorGetRoomInfos
        }
        'scene/SceneInvitePageGetPlayerScene': {
            req: ReqSceneInvitePageGetPlayerScene
            res: ResSceneInvitePageGetPlayerScene
        }
        'scene/SceneArenaEscape': {
            req: ReqSceneArenaEscape
            res: ResDefault
        }
        'scene/SceneActorRankAward': {
            req: ReqSceneActorRankAward
            res: ResSceneActorRankAward
        }
        'scene/SceneRealmCallNpc': {
            req: ReqSceneRealmCallNpc
            res: ResDefault
        }
        'ads/AdsList': {
            req: ReqAdsList
            res: ResAdsList
        }
        'ads/AdsWatch': {
            req: ReqAdsWatch
            res: ResAdsWatch
        }
        'title/TitleList': {
            req: ReqTitleList
            res: ResTitleList
        }
        'title/TitleActivate': {
            req: ReqTitleActivate
            res: ResDefault
        }
        'title/TitleDress': {
            req: ReqTitleDress
            res: ResDefault
        }
        'title/TitleUnDress': {
            req: ReqTitleUnDress
            res: ResDefault
        }
        'title/TitleRead': {
            req: ReqTitleRead
            res: ResDefault
        }
    }
    push: {
        'base/PushChange': PushChange
        'chat/PushChatForbid': PushChatForbid
        'chat/PushChat': PushChat
        'chat/PushChatRecentlyItem': PushChatRecentlyItem
        'commom/PushLedMsg': PushLedMsg
        'commom/PushPop': PushPop
        'commom/PushTipMsg': PushTipMsg
        'commom/PushErrorStatus': PushErrorStatus
        'commom/PushUnForbid': PushUnForbid
        'friend/PushFriendUpdate': PushFriendUpdate
        'guild/PushInviteToGuild': PushInviteToGuild
        'mission/PushMissionUpdatePush': PushMissionUpdatePush
        'scene/PushSceneJoinMessage': PushSceneJoinMessage
        'scene/PushSceneResultMessage': PushSceneResultMessage
        'scene/PushSceneKillMessage': PushSceneKillMessage
        'scene/PushSceneInviteMessage': PushSceneInviteMessage
        'scene/PushPracticeClickMessage': PushPracticeClickMessage
    }
}
export const serviceProto: ServiceProto = {
    version: 844,
    protocols: [
        {
            name: 'activity/ActivityGetConf',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityGearAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityGetRankSettlement',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'base/Login',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'chat/ChatGetFirstWorld',
            type: 'api',
            serviceType: 'Chat',
        },
        {
            name: 'chat/ChatGetList',
            type: 'api',
            serviceType: 'Chat',
        },
        {
            name: 'chat/ChatGetRecently',
            type: 'api',
            serviceType: 'Chat',
        },
        {
            name: 'chat/ChatSend',
            type: 'api',
            serviceType: 'Chat',
        },
        {
            name: 'default/Default',
            type: 'api',
            serviceType: 'undefined',
        },
        {
            name: 'equip/EquipAutoDissolve',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipDisassembly',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipFashionRecover',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipFashionWear',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipForgeDraw',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipGemEngrave',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipGemInlay',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipGetInfo',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipLock',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipWear',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipBreakAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'equip/EquipRepair',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendAccept',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendApply',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendApplyList',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendBatchAllow',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendBatchReject',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendBlackAdd',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendBlackDel',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendChatDel',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendDelete',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendReject',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendSearch',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gong/GongLvUp',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gong/GongSkillUp',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'guild/GuildApply',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildCreate',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildGetInfo',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberAssign',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberAudit',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberDissolution',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberDonate',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberDonatePill',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberKick',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberMagicActivate',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberMagicUpgrade',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberMfUp',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberQuickJoin',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberQuit',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMemberSet',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildOpenRed',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildNotice',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildInvite',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildMission',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildBoss',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildBargain',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildCompensate',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'guild/GuildBuy',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'mail/MailRead',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/MailAward',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/MailAwardAll',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/MailDelete',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mission/MissionGetList',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'mission/MissionGetBossList',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'mission/MissionSubscribe',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'mission/MissionBuyNum',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'mission/MissionAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'pay/PayClick',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeEnterPractice',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeHangUpAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeHangUpSync',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeMonsterKilled',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcAssist',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcBreakUp',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcDaily',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcSkinIn',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeNpcUpLv',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticePickUpBox',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeQuickAward',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'practice/PracticeRefreshMonster',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'props/PropAdd',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'props/PropUse',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'rank/RankGetRank',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'rank/RankGetSelfRank',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'rank/RankWorship',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'rank/RankGetDailyInfo',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'reddot/RedDotRead',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/Enter',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/InitRole',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/MagicWear',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/Niubility',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/PowerOper',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/UserAttrAdd',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/UserSync',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/GetUserInfo',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/UserDetailInfo',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/Cultivate',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'weapon/WeaponCleanse',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'weapon/WeaponDrop',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'weapon/WeaponLvUp',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'weapon/WeaponReplace',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'weapon/WeaponWear',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'scene/SceneActorJoin',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorLeave',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorBack',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorRevive',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorSelect',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorSkill',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorFightSet',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorUseProp',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorDrugSet',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/ScenePracticeClick',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneInvitePageInvite',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneInvitePageShield',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneDebugInfo',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorGetRoomInfos',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneInvitePageGetPlayerScene',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneArenaEscape',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneActorRankAward',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'scene/SceneRealmCallNpc',
            type: 'api',
            serviceType: 'SceneLobby',
        },
        {
            name: 'ads/AdsList',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'ads/AdsWatch',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'title/TitleList',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'title/TitleActivate',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'title/TitleDress',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'title/TitleUnDress',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'title/TitleRead',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'base/PushChange',
            type: 'push',
        },
        {
            name: 'chat/PushChatForbid',
            type: 'push',
        },
        {
            name: 'chat/PushChat',
            type: 'push',
        },
        {
            name: 'chat/PushChatRecentlyItem',
            type: 'push',
        },
        {
            name: 'commom/PushLedMsg',
            type: 'push',
        },
        {
            name: 'commom/PushPop',
            type: 'push',
        },
        {
            name: 'commom/PushTipMsg',
            type: 'push',
        },
        {
            name: 'commom/PushErrorStatus',
            type: 'push',
        },
        {
            name: 'commom/PushUnForbid',
            type: 'push',
        },
        {
            name: 'friend/PushFriendUpdate',
            type: 'push',
        },
        {
            name: 'guild/PushInviteToGuild',
            type: 'push',
        },
        {
            name: 'mission/PushMissionUpdatePush',
            type: 'push',
        },
        {
            name: 'scene/PushSceneJoinMessage',
            type: 'push',
        },
        {
            name: 'scene/PushSceneResultMessage',
            type: 'push',
        },
        {
            name: 'scene/PushSceneKillMessage',
            type: 'push',
        },
        {
            name: 'scene/PushSceneInviteMessage',
            type: 'push',
        },
        {
            name: 'scene/PushPracticeClickMessage',
            type: 'push',
        },
    ],
}
