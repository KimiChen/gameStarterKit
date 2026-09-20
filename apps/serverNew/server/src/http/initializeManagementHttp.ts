import { RuntimeCronScheduler } from '../runtime/scheduling/RuntimeCronScheduler'
import { GameModuleLifecycle } from '../startup/GameModuleLifecycle'
import { ensureDatabaseMigrations } from '../runtime/persistence/DatabaseMigrationRunner'

export async function initializeManagementHttp() {
    // 检测数据库迁移文件是否执行
    await ensureDatabaseMigrations()

    await GameModuleLifecycle.run('management', 'persistence-ready')
    await RuntimeCronScheduler.initCronTasks('management')
    await GameModuleLifecycle.run('management', 'runtime-ready')
}
