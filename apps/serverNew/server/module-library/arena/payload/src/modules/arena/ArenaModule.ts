import { defineGameModule } from '../../startup/GameModule'

export const ArenaModule = defineGameModule({
    name: 'arena',
    errorCodes: { namePrefixes: ['Arena'] },
})
