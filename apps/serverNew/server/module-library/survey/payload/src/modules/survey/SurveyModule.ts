import { defineGameModule } from '../../startup/GameModule'
import { SurveyController } from './http/SurveyController'

export const SurveyModule = defineGameModule({
    name: 'survey',
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'survey-controller',
                app: 'management',
                after: ['pay'],
                controller: SurveyController,
            },
        ],
    },
})
