import { defineGameModule } from '../../startup/GameModule'

export const SceneModule = defineGameModule({
    name: 'scene',
    errorCodes: { namePrefixes: ['Scene'] },
})
