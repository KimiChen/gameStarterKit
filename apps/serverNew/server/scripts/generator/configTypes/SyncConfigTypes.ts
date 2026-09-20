import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const projectRoot = path.resolve(__dirname, '../../..')
const rawArgs = process.argv.slice(2)
const dryRun = rawArgs[0] === '--dry-run'
const args = dryRun ? rawArgs.slice(1) : rawArgs
if (dryRun) {
    console.log(JSON.stringify(['game-sync', ...args]))
    process.exit(0)
}
fs.mkdirSync(path.join(projectRoot, 'generated/configTypes'), { recursive: true })
const result = spawnSync('pnpm', ['exec', 'game-sync', ...args], { cwd: projectRoot, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
