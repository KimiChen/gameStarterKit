import { gameModuleRegistry } from '../../generated/modules/GameModuleRegistry'
import type {
    ActionAttachTaskContribution,
    ActionEventContribution,
    ConfigurationInitializerContribution,
    CronTaskContribution,
    GameModule,
    GameModuleApp,
    GameModuleRegistryEntry,
    GameModuleSystem,
    InternalJsonActionContribution,
    ManagementHttpControllerContribution,
    ManagementHttpMiddlewareContribution,
    OrderedContribution,
    ProtocolActionExecutorContribution,
    RegisteredContribution,
    StartupContribution,
    TelemetryProviderContribution,
    NativeLobbyRouteContribution,
    NativeLobbyAuthContribution,
} from './GameModule'

type SystemContributionMap = {
    configuration: ConfigurationInitializerContribution
    protocol: ProtocolActionExecutorContribution | InternalJsonActionContribution
    actions: ActionAttachTaskContribution
    events: ActionEventContribution
    telemetry: TelemetryProviderContribution
    managementHttp: ManagementHttpControllerContribution | ManagementHttpMiddlewareContribution
    cron: CronTaskContribution
    startup: StartupContribution
    errorCodes: OrderedContribution & { readonly namePrefixes: readonly string[] }
    nativeLobby: NativeLobbyRouteContribution
    nativeLobbyAuth: NativeLobbyAuthContribution
}

type AnyContribution = SystemContributionMap[GameModuleSystem]

export interface GameModuleSystemCatalog<K extends GameModuleSystem> {
    readonly entries: readonly RegisteredContribution<SystemContributionMap[K]>[]
}

export class GameModuleCatalog {
    static readonly registry = gameModuleRegistry
    static readonly modules = freeze(this.registry.map((entry) => entry.module))
    static readonly systems = buildSystems(this.registry)

    static getSystemModules<K extends GameModuleSystem>(system: K) {
        const entries = this.systems[system].entries
        return freeze([...new Set(entries.map((entry) => entry.moduleName))])
    }

    static getModuleContributions(moduleName: string) {
        if (!this.registry.some((entry) => entry.moduleName === moduleName)) {
            throw new Error(`unknown game module: ${moduleName}`)
        }
        return Object.freeze(
            Object.fromEntries(
                Object.entries(this.systems)
                    .map(([system, catalog]) => [
                        system,
                        catalog.entries.filter((entry) => entry.moduleName === moduleName),
                    ])
                    .filter(([, entries]) => (entries as readonly unknown[]).length > 0),
            ),
        ) as Partial<{ [K in GameModuleSystem]: readonly RegisteredContribution<SystemContributionMap[K]>[] }>
    }
}

export function validateGameModules(registry: readonly GameModuleRegistryEntry[]) {
    assertUnique(registry, 'module name', (entry) => entry.moduleName)
    for (const entry of registry) {
        if (entry.module.name !== entry.moduleName) {
            throw new Error(`game module name mismatch: ${entry.moduleName}, descriptor=${entry.module.name}`)
        }
        if (collectModuleEntries(entry).length === 0 && entry.module.schemaOnly !== true) {
            throw new Error(`game module has no contributions: ${entry.moduleName}`)
        }
    }
    buildSystems(registry)
}

validateGameModules(GameModuleCatalog.registry)

function buildSystems(registry: readonly GameModuleRegistryEntry[]) {
    const entries = registry.flatMap(collectModuleEntries)
    return Object.freeze({
        configuration: systemCatalog(entries, 'configuration'),
        protocol: systemCatalog(entries, 'protocol'),
        actions: systemCatalog(entries, 'actions'),
        events: systemCatalog(entries, 'events'),
        telemetry: systemCatalog(entries, 'telemetry'),
        managementHttp: systemCatalog(entries, 'managementHttp'),
        cron: systemCatalog(entries, 'cron'),
        startup: systemCatalog(entries, 'startup'),
        errorCodes: systemCatalog(entries, 'errorCodes'),
        nativeLobby: systemCatalog(entries, 'nativeLobby'),
        nativeLobbyAuth: systemCatalog(entries, 'nativeLobbyAuth'),
    })
}

function systemCatalog<K extends GameModuleSystem>(entries: AnyRegistered[], system: K): GameModuleSystemCatalog<K> {
    const systemEntries = entries.filter((entry) => entry.system === system)
    return Object.freeze({
        entries: freeze(sortContributions(system, systemEntries)),
    }) as unknown as GameModuleSystemCatalog<K>
}

type AnyRegistered = RegisteredContribution<AnyContribution> & { readonly system: GameModuleSystem }

function collectModuleEntries(entry: GameModuleRegistryEntry): AnyRegistered[] {
    const module = entry.module
    const result: AnyRegistered[] = []
    const add = (system: GameModuleSystem, contributions: readonly AnyContribution[] | undefined) => {
        for (const contribution of contributions ?? []) {
            result.push({ moduleName: entry.moduleName, source: entry.source, contribution, system })
        }
    }
    add('configuration', module.configuration?.initializers)
    add('protocol', [...(module.protocol?.actionExecutors ?? []), ...(module.protocol?.internalJsonActions ?? [])])
    add('actions', module.actions?.attachTasks)
    add('events', module.events?.actionHandlers)
    add('telemetry', module.telemetry?.providers)
    add('managementHttp', [
        ...(module.managementHttp?.controllers ?? []),
        ...(module.managementHttp?.middlewares ?? []),
    ])
    add('cron', module.cron)
    add('startup', module.startup)
    add('nativeLobby', module.nativeLobby?.routes)
    if (module.errorCodes) {
        add('errorCodes', [
            {
                name: `${module.name}-error-codes`,
                app: 'all',
                namePrefixes: module.errorCodes.namePrefixes,
            },
        ])
    }
    add('nativeLobbyAuth', module.nativeLobbyAuth?.handlers)
    return result
}

function sortContributions(system: GameModuleSystem, entries: readonly AnyRegistered[]) {
    const grouped = new Map<string, AnyRegistered[]>()
    for (const entry of entries) {
        const scope = contributionScope(system, entry.contribution)
        const group = grouped.get(scope) ?? []
        group.push(entry)
        grouped.set(scope, group)
    }
    return [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, group]) => topologicalSort(system, group))
}

function contributionScope(system: GameModuleSystem, contribution: OrderedContribution) {
    if (system === 'startup') return `${contribution.app}:${(contribution as StartupContribution).phase}`
    return contribution.app
}

function topologicalSort(system: GameModuleSystem, entries: readonly AnyRegistered[]) {
    const byName = new Map<string, AnyRegistered>()
    const byModule = new Map<string, AnyRegistered[]>()
    for (const entry of entries) {
        const name = entry.contribution.name
        const duplicate = byName.get(name)
        if (duplicate) {
            throw new Error(
                `duplicate ${system} contribution '${name}' in modules ${duplicate.moduleName} and ${entry.moduleName}`,
            )
        }
        byName.set(name, entry)
        byModule.set(entry.moduleName, [...(byModule.get(entry.moduleName) ?? []), entry])
    }

    const edges = new Map(entries.map((entry) => [entry, new Set<AnyRegistered>()]))
    const indegree = new Map(entries.map((entry) => [entry, 0]))
    const resolve = (owner: AnyRegistered, reference: string) => {
        const target = byName.get(reference)
        const moduleTargets = byModule.get(reference)
        if (!target && !moduleTargets) {
            throw new Error(
                `unknown ${system} order dependency '${reference}' from module ${owner.moduleName} contribution ${owner.contribution.name}`,
            )
        }
        return target ? [target] : moduleTargets!
    }
    const connect = (from: AnyRegistered, to: AnyRegistered) => {
        if (from === to || edges.get(from)!.has(to)) return
        edges.get(from)!.add(to)
        indegree.set(to, indegree.get(to)! + 1)
    }
    for (const entry of entries) {
        for (const reference of entry.contribution.before ?? []) {
            for (const target of resolve(entry, reference)) connect(entry, target)
        }
        for (const reference of entry.contribution.after ?? []) {
            for (const target of resolve(entry, reference)) connect(target, entry)
        }
    }

    const compare = (left: AnyRegistered, right: AnyRegistered) =>
        left.moduleName.localeCompare(right.moduleName) || left.contribution.name.localeCompare(right.contribution.name)
    const ready = entries.filter((entry) => indegree.get(entry) === 0).sort(compare)
    const sorted: AnyRegistered[] = []
    while (ready.length > 0) {
        const current = ready.shift()!
        sorted.push(current)
        for (const next of [...edges.get(current)!].sort(compare)) {
            indegree.set(next, indegree.get(next)! - 1)
            if (indegree.get(next) === 0) {
                ready.push(next)
                ready.sort(compare)
            }
        }
    }
    if (sorted.length !== entries.length) {
        const cycle = entries
            .filter((entry) => indegree.get(entry)! > 0)
            .map((entry) => `${entry.moduleName}:${entry.contribution.name}`)
            .sort()
        throw new Error(`cyclic ${system} contribution order: ${cycle.join(' -> ')}`)
    }
    return sorted
}

function freeze<T>(items: T[]): readonly T[] {
    return Object.freeze(items)
}

function assertUnique<T>(items: readonly T[], label: string, keyOf: (item: T) => string) {
    const seen = new Set<string>()
    for (const item of items) {
        const key = keyOf(item)
        if (!key) throw new Error(`${label} must not be empty`)
        if (seen.has(key)) throw new Error(`duplicate ${label}: ${key}`)
        seen.add(key)
    }
}
