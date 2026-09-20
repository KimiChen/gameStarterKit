import { ActionTitle } from './ActionTitle'

/**
 * 卸下当前佩戴的称号。没有请求参数与响应字段，因此不需要 doAction 入参。
 */
export class ActionTitleUnDress extends ActionTitle {
    async doAction(): Promise<void> {
        ActionTitle.unload(this.user)
    }
}
