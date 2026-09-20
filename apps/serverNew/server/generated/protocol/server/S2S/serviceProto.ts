import { ServiceProto } from '@arthropoda/game-engine'
import {
    ReqActivityNotifyClientTimeVer,
    ReqActivityStageTask,
    ReqActivityOpenReload,
    ReqActivityNotifyProcessTimeVer,
    ReqActivityClose,
} from '../../../../src/modules/activity/ActivityS2S'
import { ReqTimeAddChange, ReqConfigReload, ReqConfigReloadBroadcast } from '../../../../src/modules/adjust/AdjustS2S'
import {} from '../../../../src/runtime/protocol/S2S/commom'
import { ReqDefault, ResDefault } from '../../../../src/runtime/protocol/S2S/default'
import {
    ReqFriendDealApply,
    ReqFriendDealAccept,
    ReqFriendDealReject,
    ReqFriendDefriend,
} from '../../../../src/modules/friend/FriendS2S'
import { ReqRepairScript, ReqChangeServerState, ReqServerStop, ReqGmUserForbid } from '../../../../src/modules/gm/GmS2S'
import { ReqGuildResetGift } from '../../../../src/modules/guild/GuildS2S'
import { ReqOnlyJson, ResOnlyJson } from '../../../../src/runtime/protocol/S2S/http'
import {
    ReqMailSendGlobal,
    ReqMailAdd,
    ReqTracelessAward,
    ReqTracelessReduceItem,
    ReqMailLoopSendGlobal,
} from '../../../../src/modules/mail/MailS2S'
import { ReqSettingTagRefresh } from '../../../../src/runtime/protocol/S2S/settingTag'
import { ReqUserQuitGuild, ReqUserFieldValUpdate, ReqUserRename } from '../../../../src/modules/user/UserS2S'

export interface ServiceType {
    api: {
        'activity/ActivityNotifyClientTimeVer': {
            req: ReqActivityNotifyClientTimeVer
            res: ResDefault
        }
        'activity/ActivityStageTask': {
            req: ReqActivityStageTask
            res: ResDefault
        }
        'activity/ActivityOpenReload': {
            req: ReqActivityOpenReload
            res: ResDefault
        }
        'activity/ActivityNotifyProcessTimeVer': {
            req: ReqActivityNotifyProcessTimeVer
            res: ResDefault
        }
        'activity/ActivityClose': {
            req: ReqActivityClose
            res: ResDefault
        }
        'adjust/TimeAddChange': {
            req: ReqTimeAddChange
            res: ResDefault
        }
        'adjust/ConfigReload': {
            req: ReqConfigReload
            res: ResDefault
        }
        'adjust/ConfigReloadBroadcast': {
            req: ReqConfigReloadBroadcast
            res: ResDefault
        }
        'default/Default': {
            req: ReqDefault
            res: ResDefault
        }
        'friend/FriendDealApply': {
            req: ReqFriendDealApply
            res: ResDefault
        }
        'friend/FriendDealAccept': {
            req: ReqFriendDealAccept
            res: ResDefault
        }
        'friend/FriendDealReject': {
            req: ReqFriendDealReject
            res: ResDefault
        }
        'friend/FriendDefriend': {
            req: ReqFriendDefriend
            res: ResDefault
        }
        'gm/RepairScript': {
            req: ReqRepairScript
            res: ResDefault
        }
        'gm/ChangeServerState': {
            req: ReqChangeServerState
            res: ResDefault
        }
        'gm/ServerStop': {
            req: ReqServerStop
            res: ResDefault
        }
        'gm/GmUserForbid': {
            req: ReqGmUserForbid
            res: ResDefault
        }
        'guild/GuildResetGift': {
            req: ReqGuildResetGift
            res: ResDefault
        }
        'http/OnlyJson': {
            req: ReqOnlyJson
            res: ResOnlyJson
        }
        'mail/MailSendGlobal': {
            req: ReqMailSendGlobal
            res: ResDefault
        }
        'mail/MailAdd': {
            req: ReqMailAdd
            res: ResDefault
        }
        'mail/TracelessAward': {
            req: ReqTracelessAward
            res: ResDefault
        }
        'mail/TracelessReduceItem': {
            req: ReqTracelessReduceItem
            res: ResDefault
        }
        'mail/MailLoopSendGlobal': {
            req: ReqMailLoopSendGlobal
            res: ResDefault
        }
        'settingTag/SettingTagRefresh': {
            req: ReqSettingTagRefresh
            res: ResDefault
        }
        'user/UserQuitGuild': {
            req: ReqUserQuitGuild
            res: ResDefault
        }
        'user/UserFieldValUpdate': {
            req: ReqUserFieldValUpdate
            res: ResDefault
        }
        'user/UserRename': {
            req: ReqUserRename
            res: ResDefault
        }
    }
    push: {}
}
export const serviceProto: ServiceProto = {
    version: 91,
    protocols: [
        {
            name: 'activity/ActivityNotifyClientTimeVer',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityStageTask',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityOpenReload',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityNotifyProcessTimeVer',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'activity/ActivityClose',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'adjust/TimeAddChange',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'adjust/ConfigReload',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'adjust/ConfigReloadBroadcast',
            type: 'api',
            serviceType: 'Center',
        },
        {
            name: 'default/Default',
            type: 'api',
            serviceType: 'undefined',
        },
        {
            name: 'friend/FriendDealApply',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendDealAccept',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendDealReject',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'friend/FriendDefriend',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gm/RepairScript',
            type: 'api',
            serviceType: 'Gm',
        },
        {
            name: 'gm/ChangeServerState',
            type: 'api',
            serviceType: 'Gm',
        },
        {
            name: 'gm/ServerStop',
            type: 'api',
            serviceType: 'Gm',
        },
        {
            name: 'gm/GmUserForbid',
            type: 'api',
            serviceType: 'Gm',
        },
        {
            name: 'guild/GuildResetGift',
            type: 'api',
            serviceType: 'Guild',
        },
        {
            name: 'http/OnlyJson',
            type: 'api',
            serviceType: 'Http',
        },
        {
            name: 'mail/MailSendGlobal',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/MailAdd',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/TracelessAward',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/TracelessReduceItem',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'mail/MailLoopSendGlobal',
            type: 'api',
            serviceType: 'Mail',
        },
        {
            name: 'settingTag/SettingTagRefresh',
            type: 'api',
            serviceType: 'Gm',
        },
        {
            name: 'user/UserQuitGuild',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/UserFieldValUpdate',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'user/UserRename',
            type: 'api',
            serviceType: 'Base',
        },
    ],
}
