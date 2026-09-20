import { defineGameModule } from '../../startup/GameModule'

export const GongModule = defineGameModule({
    name: 'gong',
    errorCodes: { namePrefixes: ['Gong', 'Treasure'] },
})
