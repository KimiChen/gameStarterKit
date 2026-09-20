import { defineGameModule } from '../../startup/GameModule'
import { AttrDefine } from './rules/AttrDefine'
import { AttrModDefine } from './rules/AttrModDefine'

export const AttrModule = defineGameModule({
    name: 'attr',
    configuration: {
        initializers: [{ name: 'initialize-attr-config', app: 'all', handler: initializeAttrConfig }],
    },
    errorCodes: { namePrefixes: ['Attr'] },
})

function initializeAttrConfig() {
    AttrDefine.init()
    AttrModDefine.init()
}
