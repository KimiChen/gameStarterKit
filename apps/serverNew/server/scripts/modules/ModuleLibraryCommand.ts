import {
    add,
    addPlan,
    archive,
    archivePlan,
    audit,
    doctor,
    ensurePackageName,
    listArchived,
    readManifest,
} from './ModuleLibrary'
import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'

const [command, ...rawArgs] = process.argv.slice(2).filter((argument) => argument !== '--')
const dryRun = removeFlag(rawArgs, '--dry-run')
const json = removeFlag(rawArgs, '--json')
if (rawArgs.some((argument) => argument.startsWith('-'))) throw new Error(`unknown option: ${rawArgs.join(' ')}`)

if (command === 'list') output(listArchived())
else if (command === 'show') {
    const name = requireOne(rawArgs)
    output(readManifest(name))
} else if (command === 'add') {
    const names = requireNames(rawArgs)
    const plan = addPlan(names)
    if (!dryRun) {
        add(names)
        verifyActiveProject({ addedNames: names })
    }
    output({ dryRun, ...plan })
} else if (command === 'archive') {
    const names = requireNames(rawArgs)
    const plans = names.map(archivePlan)
    if (!dryRun) {
        for (const name of names) archive(name)
        verifyActiveProject({ archivedNames: names })
    }
    output({ dryRun, plans })
} else if (command === 'audit') {
    output(requireNames(rawArgs).map(audit))
} else if (command === 'doctor') output(doctor())
else throw new Error('usage: ModuleLibraryCommand <list|show|add|archive|audit|doctor> [modules] [--dry-run]')

function removeFlag(args: string[], flag: string) {
    const index = args.indexOf(flag)
    if (index < 0) return false
    args.splice(index, 1)
    return true
}

function requireOne(args: string[]) {
    if (args.length !== 1) throw new Error('provide exactly one module name')
    ensurePackageName(args[0]!)
    return args[0]!
}

function requireNames(args: string[]) {
    if (args.length === 0) throw new Error('provide at least one module name')
    for (const name of args) ensurePackageName(name)
    return args
}

function output(value: unknown) {
    if (json) console.log(JSON.stringify(value, null, 2))
    else console.log(JSON.stringify(value, null, 2))
}

function verifyActiveProject({
    addedNames = [],
    archivedNames = [],
}: {
    addedNames?: string[]
    archivedNames?: string[]
}) {
    runPnpm(['generate'])
    for (const name of archivedNames) removeArchivedGeneratedArtifacts(name)
    runPnpm(['check'], addedNames)
}

function runPnpm(args: string[], enabledArchiveModules: string[] = []) {
    const result = childProcess.spawnSync('pnpm', args, {
        stdio: 'inherit',
        env: { ...process.env, ALLOY_ENABLED_ARCHIVE_MODULES: enabledArchiveModules.join(',') },
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} exited with status ${result.status ?? 1}`)
}

function removeArchivedGeneratedArtifacts(name: string) {
    const generatedRoot = path.join(process.cwd(), 'generated/protocol')
    for (const file of readManifest(name).files) {
        const match = file.target.match(new RegExp(`^src/modules/${name}/bean/([^/]+)\\.ts$`))
        if (!match) continue
        const beanName = match[1]!
        fs.rmSync(path.join(generatedRoot, 'server/C2S/mod', name, `${beanName}.ts`), { force: true })
    }
}
