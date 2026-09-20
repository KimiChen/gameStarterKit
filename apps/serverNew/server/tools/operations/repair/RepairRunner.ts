import { QueuedLocalAction } from '../../../src/runtime/action/QueuedLocalAction'
import { ActionRepairScript } from '../../../src/modules/gm/action/ActionRepairScript'

export class RepairRunner {
    static async doRepair(scriptName: string, sIdsParam: string, argsParam: string) {
        let sIds: number[] = []
        if (sIdsParam) {
            sIds = sIdsParam.split(',').map((el: string) => Number(el))
        }
        let args: string[] = []
        if (argsParam) {
            args = argsParam.split(',')
        }
        await QueuedLocalAction.rpc(
            ActionRepairScript,
            {
                scriptName: scriptName,
                serverIds: sIds,
                args: args,
            },
            0,
            0,
        )
    }
}
