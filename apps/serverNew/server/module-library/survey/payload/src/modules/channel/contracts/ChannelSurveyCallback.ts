import { IncomingHttpHeaders } from 'http'
import { SurveyCallbackParams } from '../../survey/callbackContract/SurveyCallbackParams'

/**
 * 问卷 sdk 接口
 */
export abstract class ChannelSurveyCallback {
    /**
     * 解析问卷回调内容
     * @param params
     * @param header
     */
    abstract surveyCallbackParse(
        params: { [k: string]: any },
        header?: IncomingHttpHeaders,
    ): Promise<SurveyCallbackParams | false>

    /**
     * 组装返回给发行的问卷回调信息
     * @param code
     * @param msg
     * @param params
     */
    abstract surveyCallbackResponse(code: int, msg: string, params?: SurveyCallbackParams): void
}
