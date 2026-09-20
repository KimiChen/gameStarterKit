import { defineGameModule } from '../../startup/GameModule'

export const PropsModule = defineGameModule({
    name: 'props',
    errorCodes: { namePrefixes: ['Props', 'Prop', 'General'] },
})
