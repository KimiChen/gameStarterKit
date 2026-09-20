import { defineGameModule } from '../../startup/GameModule'
import { MissionConfigIndex } from './config/MissionConfigIndex'

export const MissionModule = defineGameModule({
    name: 'mission',
    configuration: {
        initializers: [{ name: 'initialize-mission-config', app: 'all', handler: initializeMissionConfig }],
    },
    errorCodes: { namePrefixes: ['Mission'] },
})

function initializeMissionConfig() {
    MissionConfigIndex.initialize()
}
