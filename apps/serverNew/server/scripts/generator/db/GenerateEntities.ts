import { spawnSync } from 'child_process'
import fs from 'fs'
import json5 from 'json5'
import path from 'path'
import { GenerationPaths } from '../GenerationPaths'

interface PlatformConfig {
    centerMysql: {
        host: string
        port?: number
        username: string
        password: string
        database: string
    }
}

const projectRoot = path.resolve(__dirname, '../../..')
const paths = new GenerationPaths(projectRoot)
const platform = process.argv[2] ?? 'bearjoy'
const version = process.argv[3] ?? 'dev'
const platformTag = version === 'release' ? platform : platform + version
const configFile = path.join(projectRoot, 'config', 'platforms', platformTag, 'platform.json5')
const config = json5.parse(fs.readFileSync(configFile, 'utf8')) as PlatformConfig
const mysql = config.centerMysql

fs.mkdirSync(paths.persistenceRoot, { recursive: true })
run('pnpm', [
    'exec',
    'typeorm-model-generator',
    '-h',
    mysql.host,
    '-d',
    mysql.database,
    '-p',
    String(mysql.port ?? 3306),
    '-u',
    mysql.username,
    '-x',
    mysql.password,
    '-e',
    'mysql',
    '--cf',
    'pascal',
    '--ce',
    'pascal',
    '--skipTables',
    'migrations',
    '-o',
    paths.persistenceRoot,
    '-a',
    'true',
    '--strictMode',
    '!',
    '--skipSchema',
    '--noConfig',
    '--namingStrategy',
    './node_modules/@arthropoda/mysql-tool/src/NamingStrategy.js',
])
run('pnpm', ['exec', 'ts-node', './scripts/generator/db/DatabaseModelGenerator.ts'])
run('pnpm', ['exec', 'prettier', '--ignore-path', '/dev/null', '--write', paths.persistenceRoot])

function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
}
