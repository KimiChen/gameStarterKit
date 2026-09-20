import { defineGameModule } from '../../startup/GameModule'
import { EquipDefine } from './rules/EquipDefine'

export const EquipModule = defineGameModule({
    name: 'equip',
    configuration: {
        initializers: [
            { name: 'initialize-equip-config', app: 'all', after: ['user'], handler: initializeEquipConfig },
        ],
    },
    errorCodes: { namePrefixes: ['Equip', 'Fashion'] },
})

function initializeEquipConfig() {
    EquipDefine.init()
}
