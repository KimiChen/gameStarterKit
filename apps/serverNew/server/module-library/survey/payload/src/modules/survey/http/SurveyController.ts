import { Get, JsonController, Post, QueryParam, Req } from 'routing-controllers'
import { Service } from 'typedi'
import { SurveyCallbackResponder } from './SurveyCallbackResponder'
import { ChannelRegistry } from '../../channel/ChannelRegistry'
import { ChannelSurveyCallback } from '../../channel/contracts/ChannelSurveyCallback'
import { QueuedLocalAction } from '../../../runtime/action/QueuedLocalAction'
import { ActionSurveyBack } from '../action/ActionSurveyBack'
import { Request } from 'express'
import { OpenAPI } from 'routing-controllers-openapi'

/**
 * 问卷回调
 */
@JsonController('/survey')
@Service()
export class SurveyController {
    constructor(private readonly responder: SurveyCallbackResponder) {}

    @OpenAPI({ summary: '问卷回调' })
    @Get('/:sdk')
    @Post('/:sdk')
    async surveyCallback(@QueryParam('sdk') sdk: string, @Req() req: Request) {
        Log.info('surveyCallBack request', [sdk, req.query])
        if (!req.query || !sdk) {
            return this.responder.jsonResponse(req, 1, 'param error')
        }

        // WhiteIPService.checkWhiteIPList(request, PlatformConfig.getPayCallbackWhiteIPList())

        const channelObj = ChannelRegistry.getObj(sdk)
        if (!(channelObj instanceof ChannelSurveyCallback)) {
            return this.responder.jsonResponse(req, 1, 'channelObj invalid')
        }

        const backData = await channelObj.surveyCallbackParse(req.query, req.headers)
        if (backData === false) {
            return this.responder.channelCallback(req, channelObj, 2, 'signature error')
        }
        if (backData.roleId <= 0 || backData.serverId <= 0 || backData.surveyId <= 0) {
            return this.responder.channelCallback(req, channelObj, 3, 'param error', backData)
        }

        await QueuedLocalAction.rpc(
            ActionSurveyBack,
            { uId: backData.roleId, qaCode: backData.surveyId.toString() },
            backData.roleId,
            backData.serverId,
        )

        return this.responder.channelCallback(req, channelObj, 0, 'success', backData)
    }
}
