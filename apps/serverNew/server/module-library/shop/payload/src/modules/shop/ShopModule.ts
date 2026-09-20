import { defineGameModule } from '../../startup/GameModule'

export const ShopModule = defineGameModule({
    name: 'shop',
    errorCodes: { namePrefixes: ['Shop'] },
})
