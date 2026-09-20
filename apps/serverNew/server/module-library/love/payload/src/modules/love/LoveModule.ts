import { defineGameModule } from '../../startup/GameModule'
import { LoveDefine } from './rules/LoveDefine'

export const LoveModule = defineGameModule({
    name: 'love',
    configuration: {
        initializers: [{ name: 'initialize-love-config', app: 'all', after: ['equip'], handler: initializeLoveConfig }],
    },
})

function initializeLoveConfig() {
    LoveDefine.init()
}
