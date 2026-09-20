import childProcess from 'child_process'

const moduleName = process.argv.slice(2).find((argument) => argument !== '--')

if (!moduleName || !/^[A-Za-z][A-Za-z0-9]*$/.test(moduleName)) {
    throw new Error('usage: pnpm verify:module -- <module>')
}

run(['gen:modules:check'])
run(['test:module', '--', moduleName])

function run(args: string[]) {
    const result = childProcess.spawnSync('pnpm', args, { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} exited with status ${result.status ?? 1}`)
}
