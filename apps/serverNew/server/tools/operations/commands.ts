import { ensureDatabaseMigrations } from '../../src/runtime/persistence/DatabaseMigrationRunner'
import { ErrorLogMonitor } from './error-log/ErrorLogMonitor'
import { RepairRunner } from './repair/RepairRunner'

// 执行数据库迁移命令
export async function migrationRun() {
    await ensureDatabaseMigrations()
}

export function errorLogPush() {
    ErrorLogMonitor.run().catch((err) => console.error(err))
}

export function repair() {
    RepairRunner.doRepair('debug', '1,2,3', '').catch((err) => console.error(err))
}
