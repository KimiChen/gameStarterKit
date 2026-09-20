import { defineGameModule } from '../../startup/GameModule'
import { MailAttachTask } from './action/MailAttachTask'
import { GlobalMailDispatcher } from './delivery/GlobalMailDispatcher'
import { cleanupExpiredMail, handleGmMailTiming, handleGmMailType } from './scheduling/MailCronTasks'
import { MailNativeLobbyRoutes } from './lobby/MailNativeLobbyRoutes'
import { MailNativeLobbyStore } from './lobby/MailNativeLobbyStore'

export const MailModule = defineGameModule({
    name: 'mail',
    actions: {
        attachTasks: [{ name: 'mail-attach-task', app: 'service', task: MailAttachTask }],
    },
    cron: [
        {
            name: 'gmCronGmEmailHandleTiming',
            app: 'management',
            schedule: '*/10 * * * * *',
            handler: handleGmMailTiming,
        },
        {
            name: 'gmCronEmailHandleEmailType',
            app: 'management',
            schedule: '*/10 * * * * *',
            handler: handleGmMailType,
        },
        {
            name: 'gmCronDeleteExpiredMail',
            app: 'management',
            schedule: '0 * 5 * * *',
            handler: cleanupExpiredMail,
        },
    ],
    startup: [
        {
            name: 'initialize-global-mail-dispatcher',
            app: 'service',
            phase: 'runtime-ready',
            scope: 'server',
            run: () => GlobalMailDispatcher.init(),
        },
    ],
    nativeLobby: {
        routes: [
            {
                name: 'mail-native-lobby-routes',
                app: 'service',
                register: (registry, services) =>
                    new MailNativeLobbyRoutes(
                        services.identities,
                        new MailNativeLobbyStore(services.pushToUser),
                    ).register(registry),
            },
        ],
    },
    errorCodes: { namePrefixes: ['Mail'] },
})
