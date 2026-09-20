import { defineGameModule } from '../../startup/GameModule'
import { GmConfigCatalog } from './config/GmConfig'
import { GmController } from './http/GmController'

export const GmModule = defineGameModule({
    name: 'gm',
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'gm-controller',
                app: 'management',
                after: ['diagnostics'],
                controller: GmController,
            },
        ],
    },
    startup: [
        {
            name: 'load-gm-config',
            app: 'management',
            phase: 'persistence-ready',
            scope: 'process',
            run: () => GmConfigCatalog.loadAllConfig(),
        },
    ],
    errorCodes: { namePrefixes: ['Cdkey'] },
})
