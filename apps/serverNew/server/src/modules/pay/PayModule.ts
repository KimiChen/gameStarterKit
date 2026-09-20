import { defineGameModule } from '../../startup/GameModule'
import { PayController } from './http/callback/PayController'
import { OrderController } from './http/order/OrderController'

export const PayModule = defineGameModule({
    name: 'pay',
    managementHttp: {
        controllers: [
            {
                kind: 'controller',
                name: 'order-controller',
                app: 'management',
                after: ['gm'],
                controller: OrderController,
            },
            {
                kind: 'controller',
                name: 'pay-controller',
                app: 'management',
                after: ['order-controller'],
                controller: PayController,
            },
        ],
    },
    errorCodes: { namePrefixes: ['Pay', 'Gift'] },
})
