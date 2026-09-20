import { defineGameModule } from '../../startup/GameModule'
import { ErrorLogController } from './http/ErrorLogController'

export const DiagnosticsModule = defineGameModule({
    name: 'diagnostics',
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'error-log-controller',
                app: 'management',
                after: ['clientConfig'],
                controller: ErrorLogController,
            },
        ],
    },
})
