import { defineGameModule } from '../../startup/GameModule'

export const ChatModule = defineGameModule({
    name: 'chat',
    errorCodes: { namePrefixes: ['Chat', 'Cross'] },
})
