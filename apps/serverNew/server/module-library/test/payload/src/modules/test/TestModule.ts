import { defineGameModule } from '../../startup/GameModule'

export const TestModule = defineGameModule({
    name: 'test',
    errorCodes: { namePrefixes: ['Hero'] },
})
