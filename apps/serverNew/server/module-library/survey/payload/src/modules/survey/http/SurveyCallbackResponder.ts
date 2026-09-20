import { Request } from 'express'
import { Service } from 'typedi'
import { ChannelSurveyCallback } from '../../channel/contracts/ChannelSurveyCallback'
import { SurveyCallbackParams } from '../callbackContract/SurveyCallbackParams'

@Service()
export class SurveyCallbackResponder {
    jsonResponse(req: Request, code: int, msg: string) {
        const data = {
            code: code == 0 ? '00000' : code,
            tips: msg,
            description: msg,
            data: {},
        }
        if (code === 0) {
            Log.pay.info('surveyCallBack response:', [req.get('sdk'), data, req.query])
        } else {
            Log.pay.error('surveyCallBack error:', [req.get('sdk'), data, req.query])
        }
        return data
    }

    channelCallback(
        req: Request,
        channelObj: ChannelSurveyCallback,
        code: int,
        msg: string,
        backData?: SurveyCallbackParams,
    ) {
        const data = channelObj.surveyCallbackResponse(code, msg, backData)
        if (code === 0) {
            Log.pay.info('surveyCallBack response:', [req.get('sdk'), data, req.query])
        } else {
            Log.pay.error('surveyCallBack error:', [req.get('sdk'), data, req.query])
        }
        return data
    }
}
