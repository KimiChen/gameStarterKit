import { defineGameModule } from '../../startup/GameModule'

export const TitleModule = defineGameModule({
    name: 'title',
    errorCodes: { namePrefixes: ['Title'] },
})
