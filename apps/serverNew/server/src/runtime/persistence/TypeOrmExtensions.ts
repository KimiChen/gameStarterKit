import { UtilString } from '@arthropoda/game-engine'
import { BaseEntity } from '@arthropoda/typeorm'

declare module '@arthropoda/typeorm' {
    interface BaseEntity {
        exportOfSnakeField(): Object
    }
}

declare module '@arthropoda/game-engine' {
    interface PlatformConfig {
        log_monitor: {
            scanCachePath: string
            tasks: Record<
                string,
                {
                    title: string
                    rootPath: string
                    regexp: string
                    robotUrl: string
                    errorLineRegexp: string
                    newLineRegexp: string
                    displayErrorNum: number
                    displayTraceNum: number
                }
            >
        }
    }
}

BaseEntity.prototype.exportOfSnakeField = function (): Object {
    const r: Record<string, any> = {}
    for (const [k, v] of Object.entries(this)) {
        r[UtilString.snakeCase(k)] = v
    }
    return r
}
