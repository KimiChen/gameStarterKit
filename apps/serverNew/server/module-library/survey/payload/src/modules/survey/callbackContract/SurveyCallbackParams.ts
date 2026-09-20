export class SurveyCallbackParams {
    isOk: boolean = false

    errorMsg: Array<string> = []

    /**
     * 问卷id
     */
    surveyId: int = 0

    /**
     * 角色id
     */
    roleId: int = 0

    /**
     * 区服id
     */
    serverId: int = 0

    /**
     * 原始参数
     */
    originParams: { [key: string]: any } = {}
}
