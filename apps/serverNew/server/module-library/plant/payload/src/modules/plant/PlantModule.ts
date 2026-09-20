import { defineGameModule } from '../../startup/GameModule'

export const PlantModule = defineGameModule({
    name: 'plant',
    errorCodes: { namePrefixes: ['Plant'] },
})
