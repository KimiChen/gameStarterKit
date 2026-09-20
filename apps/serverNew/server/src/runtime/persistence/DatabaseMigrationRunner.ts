import { DB } from '@arthropoda/game-engine'
import { MigrationInterface } from '@arthropoda/typeorm'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'

const requireMigration = createRequire(__filename)

export async function ensureDatabaseMigrations() {
    const dataSource = DB.client.client()
    dataSource.migrations.splice(0, dataSource.migrations.length, ...loadMigrations())

    if (!(await dataSource.showMigrations())) return
    if (PLATFORM != 'bearjoy' && PLATFORM_VERSION == 'release') {
        throw new Error('数据库未同步,请先执行 migrationRun')
    }

    console.log('开始执行数据库同步')
    await dataSource.runMigrations()
}

function loadMigrations(): MigrationInterface[] {
    const migrationDirectory = path.join(ROOT_PATH, 'migration')
    const files = fs
        .readdirSync(migrationDirectory)
        .filter((file) => !file.endsWith('.d.ts') && (file.endsWith('.ts') || file.endsWith('.js')))
        .sort()
    const extension = files.some((file) => file.endsWith('.ts')) ? '.ts' : '.js'
    const migrations: MigrationInterface[] = []

    for (const file of files.filter((item) => item.endsWith(extension))) {
        const exports = requireMigration(path.join(migrationDirectory, file))
        for (const value of Object.values(exports)) {
            if (isMigrationConstructor(value)) migrations.push(new value())
        }
    }
    return migrations
}

type MigrationConstructor = new () => MigrationInterface

function isMigrationConstructor(value: unknown): value is MigrationConstructor {
    return typeof value === 'function' && typeof (value as MigrationConstructor).prototype.up === 'function'
}
