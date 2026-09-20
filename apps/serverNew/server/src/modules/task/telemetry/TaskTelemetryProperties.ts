import type { TelemetryPropertiesProvider } from '../../../telemetry/TelemetryPropertiesRegistry'
import { TaskDefine } from '../rules/TaskDefine'

interface TaskTelemetrySource {
    mainTaskId: int
    mainTaskProgress: int
}

export class TaskTelemetryProperties implements TelemetryPropertiesProvider {
    readonly name = 'task'

    provide(source: unknown) {
        const task = source as TaskTelemetrySource
        return {
            maintask_id: task.mainTaskId,
            maintask_status: TaskDefine.checkMainTaskProgress(task.mainTaskId, task.mainTaskProgress)
                ? '完成'
                : '未完成',
        }
    }
}
