import { defineGameModule } from '../../startup/GameModule'

export const AchieveModule = defineGameModule({
    name: 'achieve',
    errorCodes: { namePrefixes: ['Achieve'] },
})
