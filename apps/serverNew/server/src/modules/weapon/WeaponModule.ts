import { defineGameModule } from '../../startup/GameModule'

export const WeaponModule = defineGameModule({
    name: 'weapon',
    errorCodes: { namePrefixes: ['Weapon'] },
})
