import { defineGameModule } from '../../startup/GameModule'

export const PracticeModule = defineGameModule({
    name: 'practice',
    errorCodes: { namePrefixes: ['Practice'] },
})
