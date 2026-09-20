import { GmAction } from '../../../gm/http/GmAction'

export class ActionPropsListConfig extends GmAction {
    private static readonly actionMap = {
        system: '系统操作',
    }

    public doAction(params: any) {
        return ActionPropsListConfig.actionMap
    }
}
