import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const coreRoot = path.resolve(serverRoot, '..', '..', 'alloy-core')
const mode = process.argv[2] ?? 'development'
const outdir =
    mode === 'production'
        ? path.join(serverRoot, 'dist', 'app', 'runtime')
        : path.join(serverRoot, 'build', 'alloy-core')

const result = spawnSync(
    process.execPath,
    [path.join(coreRoot, 'tools', 'build-runtime-bundle.mjs'), '--outdir', outdir],
    { cwd: coreRoot, stdio: 'inherit' },
)
if (result.status !== 0) process.exit(result.status ?? 1)
