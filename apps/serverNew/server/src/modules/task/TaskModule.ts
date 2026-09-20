import { defineGameModule } from '../../startup/GameModule'
import { TaskTelemetryProperties } from './telemetry/TaskTelemetryProperties'

export const TaskModule = defineGameModule({
    name: 'task',
    telemetry: {
        providers: [
            {
                name: 'task-telemetry-properties',
                app: 'service',
                after: ['user'],
                provider: new TaskTelemetryProperties(),
            },
        ],
    },
    errorCodes: { namePrefixes: ['Task'] },
})
