import { ServiceProto } from '@arthropoda/game-engine'
import {
    ReqActivityStageTask,
    ReqActivityOpenReload,
    ReqActivityNotifyProcessTimeVer,
    ReqActivityClose,
} from '../../../../src/modules/activity/ActivityS2S'
import { ReqTimeAddChange, ReqConfigReload, ReqConfigReloadBroadcast } from '../../../../src/modules/adjust/AdjustS2S'
import {} from '../../../../src/runtime/protocol/S2S/commom'
import { ReqDefault, ResDefault } from '../../../../src/runtime/protocol/S2S/default'
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
import {
    ReqGameDemoMailDeliver,
    ReqGameDemoSeasonScore,
    ReqGameDemoSeasonTick,
    ReqGameDemoBossTick,
} from '../../../../src/modules/gameDemo/GameDemoS2S'

export interface ServiceType {
    api: {
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
        'gameDemo/GameDemoMailDeliver': {
            req: ReqGameDemoMailDeliver
            res: ResDefault
        }
        'gameDemo/GameDemoSeasonScore': {
            req: ReqGameDemoSeasonScore
            res: ResDefault
        }
        'gameDemo/GameDemoSeasonTick': {
            req: ReqGameDemoSeasonTick
            res: ResDefault
        }
        'gameDemo/GameDemoBossTick': {
            req: ReqGameDemoBossTick
            res: ResDefault
        }
    }
    push: {}
}
export const serviceProto: ServiceProto = {
    version: 95,
    protocols: [
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
        {
            name: 'gameDemo/GameDemoMailDeliver',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gameDemo/GameDemoSeasonScore',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gameDemo/GameDemoSeasonTick',
            type: 'api',
            serviceType: 'Base',
        },
        {
            name: 'gameDemo/GameDemoBossTick',
            type: 'api',
            serviceType: 'Base',
        },
    ],
}
