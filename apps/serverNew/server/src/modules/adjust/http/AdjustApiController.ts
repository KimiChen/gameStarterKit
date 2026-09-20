import { Body, JsonController, Post, UseBefore } from 'routing-controllers'
import { Service } from 'typedi'
import { AdjustActionDispatcher } from './AdjustActionDispatcher'
import { AdjustApiChangeBody } from './NewUserQuery'
import { User } from '../../user/bean/User'
import { ResError } from '../../../http/constants/httpError'
import { AdjustAccessMiddleware } from './AdjustAccessMiddleware'
import { OpenAPI } from 'routing-controllers-openapi'

@JsonController('/adjust')
@UseBefore(AdjustAccessMiddleware)
@Service()
export class AdjustApiController {
    constructor(private readonly actionDispatcher: AdjustActionDispatcher) {}

    @OpenAPI({ summary: '修改服务器时间' })
    @Post('/api/change')
    async adjustApiChange(@Body({ validate: true }) data: AdjustApiChangeBody) {
        const uId = Number(data.uId)
        try {
            await User.load(uId)
        } catch (e) {
            throw new ResError('该uId查询不到用户信息')
        }

        if (data.do == 'changeServerTime') {
            return this.actionDispatcher.changeServerTime(uId, data.timeFormat ?? '')
        }
    }
}
