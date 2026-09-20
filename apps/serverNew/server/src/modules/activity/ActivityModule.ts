import { defineGameModule } from '../../startup/GameModule'
import { reloadActivityAtStartup } from './lifecycle/reloadActivityAtStartup'

export const ActivityModule = defineGameModule({
    name: 'activity',
    startup: [
        {
            name: 'reload-activity-on-service-start',
            app: 'service',
            phase: 'runtime-ready',
            scope: 'process',
            run: reloadActivityAtStartup,
        },
    ],
    errorCodes: { namePrefixes: ['Activity'] },
})
