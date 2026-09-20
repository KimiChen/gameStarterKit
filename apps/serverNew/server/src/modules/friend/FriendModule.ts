import { defineGameModule } from '../../startup/GameModule'

export const FriendModule = defineGameModule({
    name: 'friend',
    errorCodes: { namePrefixes: ['Friend'] },
})
