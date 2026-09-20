import { GmAction } from '../../../gm/http/GmAction'

export class ActionPropsListGame extends GmAction {
    public async doAction(params: any) {
        const name = params.name ?? null

        if (name == 'task_type') {
            const list = []
            for (const [, conf] of C.task_type()) {
                // if (TaskDefine::needParam($conf->id)) {
                //     continue;
                // }
                list.push({
                    backType: conf.id,
                    backKey: conf.name,
                })
            }
            return { config: list }
        } else if (name == 'activity_list') {
            const list: Record<string, string> = {}
            for (const [, map] of C.list()) {
                if (map.openBy == 'set' || map.fromDB) {
                    list[map.name] = map.activityName
                }
            }
            return { config: list }
        }
        return { config: {} }
    }
}
