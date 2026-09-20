import { defineGameModule } from '../../startup/GameModule'
import { ServerSettingRefresh } from './runtime/ServerSettingRefresh'

export const ServerSettingsModule = defineGameModule({
    name: 'serverSettings',
    cron: [
        {
            name: 'reloadSettingVal',
            app: 'service',
            schedule: '*/30 * * * * *',
            handler: () => ServerSettingRefresh.refreshAllServerCache([SERVER_ID]),
        },
    ],
})
