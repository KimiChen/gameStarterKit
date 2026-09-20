import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { RuntimeCronScheduler } from '../../src/runtime/scheduling/RuntimeCronScheduler'

describe('module cron registration', () => {
    it('registers exactly the generated tasks for each process in final order', async () => {
        const catalog = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), 'generated/modules/module-catalog.json'), 'utf8'),
        )
        for (const app of ['service', 'management'] as const) {
            const actual: string[] = []
            const entries = await RuntimeCronScheduler.registerCronTasks(app, async (entry) => {
                actual.push(`${entry.moduleName}:${entry.contribution.name}`)
            })
            const expected = catalog.systems.cron
                .filter((entry: { contribution: { app: string } }) => entry.contribution.app === app)
                .map(
                    (entry: { moduleName: string; contribution: { name: string } }) =>
                        `${entry.moduleName}:${entry.contribution.name}`,
                )
            assert.deepStrictEqual(actual, expected)
            assert.strictEqual(entries.length, expected.length)
        }
    })
})
