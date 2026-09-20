import { defineGameModule } from '../../startup/GameModule'

export const LikeModule = defineGameModule({
    name: 'like',
    errorCodes: { namePrefixes: ['Like'] },
})
