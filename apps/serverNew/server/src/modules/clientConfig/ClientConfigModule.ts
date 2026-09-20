import { defineGameModule } from '../../startup/GameModule'
import { ClientConfigController } from './http/ClientConfigController'
import { ClientController } from './http/ClientController'

export const ClientConfigModule = defineGameModule({
    name: 'clientConfig',
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'client-controller',
                app: 'management',
                after: ['user'],
                controller: ClientController,
            },
            {
                kind: 'controller',
                name: 'client-config-controller',
                app: 'management',
                after: ['client-controller'],
                controller: ClientConfigController,
            },
        ],
    },
})
