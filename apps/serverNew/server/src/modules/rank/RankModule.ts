import { defineGameModule } from '../../startup/GameModule'
import { RankUserEnterHandler } from './event/RankUserEnterHandler'

export const RankModule = defineGameModule({
    name: 'rank',
    events: {
        actionHandlers: [
            { name: 'rank-user-enter', app: 'service', route: 'user/Enter', handlers: [RankUserEnterHandler] },
        ],
    },
    errorCodes: { namePrefixes: ['Rank'] },
})
