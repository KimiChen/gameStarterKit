import { ActionActivityStageTask } from '../../../../src/modules/activity/action/ActionActivityStageTask'
import { ActionActivityOpenReload } from '../../../../src/modules/activity/action/ActionActivityOpenReload'
import { ActionActivityNotifyProcessTimeVer } from '../../../../src/modules/activity/action/ActionActivityNotifyProcessTimeVer'
import { ActionActivityClose } from '../../../../src/modules/activity/action/ActionActivityClose'
import { ActionTimeAddChange } from '../../../../src/modules/adjust/action/ActionTimeAddChange'
import { ActionConfigReload } from '../../../../src/modules/adjust/action/ActionConfigReload'
import { ActionConfigReloadBroadcast } from '../../../../src/modules/adjust/action/ActionConfigReloadBroadcast'
import { ActionDefault } from '../../../../src/runtime/action/S2S/default/ActionDefault'
import { ActionRepairScript } from '../../../../src/modules/gm/action/ActionRepairScript'
import { ActionChangeServerState } from '../../../../src/modules/gm/action/ActionChangeServerState'
import { ActionServerStop } from '../../../../src/modules/gm/action/ActionServerStop'
import { ActionGmUserForbid } from '../../../../src/modules/gm/action/ActionGmUserForbid'
import { ActionGuildResetGift } from '../../../../src/modules/guild/action/ActionGuildResetGift'
import { ActionOnlyJson } from '../../../../src/runtime/action/S2S/http/ActionOnlyJson'
import { ActionMailSendGlobal } from '../../../../src/modules/mail/action/ActionMailSendGlobal'
import { ActionMailAdd } from '../../../../src/modules/mail/action/ActionMailAdd'
import { ActionTracelessAward } from '../../../../src/modules/mail/action/ActionTracelessAward'
import { ActionTracelessReduceItem } from '../../../../src/modules/mail/action/ActionTracelessReduceItem'
import { ActionMailLoopSendGlobal } from '../../../../src/modules/mail/action/ActionMailLoopSendGlobal'
import { ActionSettingTagRefresh } from '../../../../src/runtime/action/S2S/settingTag/ActionSettingTagRefresh'
import { ActionUserQuitGuild } from '../../../../src/modules/user/action/ActionUserQuitGuild'
import { ActionUserFieldValUpdate } from '../../../../src/modules/user/action/ActionUserFieldValUpdate'
import { ActionUserRename } from '../../../../src/modules/user/action/ActionUserRename'

export const Actions = {
    'activity/ActivityStageTask': ActionActivityStageTask,
    'activity/ActivityOpenReload': ActionActivityOpenReload,
    'activity/ActivityNotifyProcessTimeVer': ActionActivityNotifyProcessTimeVer,
    'activity/ActivityClose': ActionActivityClose,
    'adjust/TimeAddChange': ActionTimeAddChange,
    'adjust/ConfigReload': ActionConfigReload,
    'adjust/ConfigReloadBroadcast': ActionConfigReloadBroadcast,
    'default/Default': ActionDefault,
    'gm/RepairScript': ActionRepairScript,
    'gm/ChangeServerState': ActionChangeServerState,
    'gm/ServerStop': ActionServerStop,
    'gm/GmUserForbid': ActionGmUserForbid,
    'guild/GuildResetGift': ActionGuildResetGift,
    'http/OnlyJson': ActionOnlyJson,
    'mail/MailSendGlobal': ActionMailSendGlobal,
    'mail/MailAdd': ActionMailAdd,
    'mail/TracelessAward': ActionTracelessAward,
    'mail/TracelessReduceItem': ActionTracelessReduceItem,
    'mail/MailLoopSendGlobal': ActionMailLoopSendGlobal,
    'settingTag/SettingTagRefresh': ActionSettingTagRefresh,
    'user/UserQuitGuild': ActionUserQuitGuild,
    'user/UserFieldValUpdate': ActionUserFieldValUpdate,
    'user/UserRename': ActionUserRename,
}
