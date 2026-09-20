import { CronService } from '@arthropoda/game-engine'
import type { CronTaskContribution, GameModuleApp, RegisteredContribution } from '../../startup/GameModule'
import { GameModuleCatalog } from '../../startup/GameModuleCatalog'

export class RuntimeCronScheduler {
    static entries(app: Exclude<GameModuleApp, 'all'>) {
        return GameModuleCatalog.systems.cron.entries.filter((entry) => entry.contribution.app === app)
    }

    static async initCronTasks(
        app: Exclude<GameModuleApp, 'all'>,
        register: (entry: RegisteredContribution<CronTaskContribution>) => Promise<void> = this.register,
    ) {
        const entries = await this.registerCronTasks(app, register)
        await CronService.runNextCronTask()
        return entries
    }

    static async registerCronTasks(
        app: Exclude<GameModuleApp, 'all'>,
        register: (entry: RegisteredContribution<CronTaskContribution>) => Promise<void>,
    ) {
        const entries = this.entries(app)
        for (const entry of entries) await register(entry)
        return entries
    }

    private static async register(entry: RegisteredContribution<CronTaskContribution>) {
        const task = entry.contribution
        await CronService.initTask(task.name, task.schedule, task.handler)
    }
}
