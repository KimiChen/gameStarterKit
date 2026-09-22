import { defineGameModule } from '../../startup/GameModule'

export const GuildModule = defineGameModule({
    name: 'guild',
    errorCodes: { namePrefixes: ['Guild'] },
})
