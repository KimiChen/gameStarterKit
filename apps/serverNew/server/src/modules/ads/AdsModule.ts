import { defineGameModule } from '../../startup/GameModule'

export const AdsModule = defineGameModule({
    name: 'ads',
    errorCodes: { namePrefixes: ['Ads'] },
})
