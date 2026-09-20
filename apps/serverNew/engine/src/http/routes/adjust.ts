import express from 'express'
import { routeCallBack } from './base'
import {
    redisCommand,
    RedisCommandReq,
    RedisCommandRes,
    RedisConnectionRes,
    redisConnections,
    tipProtocol,
} from '../controllers/adjust/redis'
export const AdjustRouter = express.Router()

// redis
AdjustRouter.get('/tipProtocol', routeCallBack<any, string>(tipProtocol))
AdjustRouter.post('/redisCommand', routeCallBack<RedisCommandReq, RedisCommandRes>(redisCommand))
AdjustRouter.get('/redisConnections', routeCallBack<any, RedisConnectionRes[] | RedisCommandRes>(redisConnections))
//router.get('/:id', userLoad)
