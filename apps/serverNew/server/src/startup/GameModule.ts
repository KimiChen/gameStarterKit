import type { ActionEventHandlerBase, IActionAttachTask, ProtocolConfig } from '@arthropoda/game-engine'
import type { ExpressMiddlewareInterface } from 'routing-controllers'
import type { RoutingControllersOptions } from 'routing-controllers'
import type { InternalJsonActionHandler } from '../runtime/action/S2S/http/InternalJsonActionRegistry'
import type { TelemetryPropertiesProvider } from '../telemetry/TelemetryPropertiesRegistry'
import type { NativeLobbyRouteRegistry, NativeLobbyRouteServices } from '../runtime/lobby/NativeLobbyRouteRegistry'

export const gameModuleSystems = [
    'configuration',
    'protocol',
    'actions',
    'events',
    'telemetry',
    'managementHttp',
    'cron',
    'startup',
    'errorCodes',
    'nativeLobby',
] as const

export const gameModuleApps = ['service', 'management', 'all'] as const
export const gameModuleStartupPhases = [
    'configuration-loaded',
    'persistence-ready',
    'runtime-ready',
    'server-started',
] as const

export type GameModuleSystem = (typeof gameModuleSystems)[number]
export type GameModuleApp = (typeof gameModuleApps)[number]
export type GameModuleStartupPhase = (typeof gameModuleStartupPhases)[number]

export interface OrderedContribution {
    readonly name: string
    readonly app: GameModuleApp
    readonly before?: readonly string[]
    readonly after?: readonly string[]
}

export interface RegisteredContribution<T> {
    readonly moduleName: string
    readonly source: string
    readonly contribution: T
}

export interface ConfigurationInitializerContribution extends OrderedContribution {
    readonly handler: () => void
}

export interface ConfigurationContribution {
    readonly initializers: readonly ConfigurationInitializerContribution[]
}

export interface ProtocolActionExecutorContribution extends OrderedContribution {
    readonly kind: 'actionExecutor'
    readonly executor: ProtocolConfig['execAction']
}

export interface InternalJsonActionContribution extends OrderedContribution {
    readonly kind: 'internalJsonAction'
    readonly key: string
    readonly handler: InternalJsonActionHandler
}

export interface ProtocolContribution {
    readonly actionExecutors?: readonly ProtocolActionExecutorContribution[]
    readonly internalJsonActions?: readonly InternalJsonActionContribution[]
}

export type ActionAttachTaskConstructor = new () => IActionAttachTask

export interface ActionAttachTaskContribution extends OrderedContribution {
    readonly task: ActionAttachTaskConstructor
}

export interface ActionContribution {
    readonly attachTasks: readonly ActionAttachTaskContribution[]
}

export interface ActionEventContribution extends OrderedContribution {
    readonly route: string
    readonly handlers: readonly (typeof ActionEventHandlerBase)[]
}

export interface EventContribution {
    readonly actionHandlers: readonly ActionEventContribution[]
}

export interface TelemetryProviderContribution extends OrderedContribution {
    readonly provider: TelemetryPropertiesProvider
}

export interface TelemetryContribution {
    readonly providers: readonly TelemetryProviderContribution[]
}

export type ManagementHttpController = Exclude<NonNullable<RoutingControllersOptions['controllers']>[number], string>
export type ManagementHttpMiddleware = Exclude<NonNullable<RoutingControllersOptions['middlewares']>[number], string>

export interface ManagementHttpControllerContribution extends OrderedContribution {
    readonly kind: 'controller'
    readonly controller: ManagementHttpController
}

export interface ManagementHttpMiddlewareContribution extends OrderedContribution {
    readonly kind: 'middleware'
    readonly middleware: ManagementHttpMiddleware | (new () => ExpressMiddlewareInterface)
}

export interface ManagementHttpContribution {
    readonly controllers?: readonly ManagementHttpControllerContribution[]
    readonly middlewares?: readonly ManagementHttpMiddlewareContribution[]
}

export interface CronTaskContribution extends OrderedContribution {
    readonly app: 'service' | 'management'
    readonly schedule: string
    readonly handler: () => void | Promise<void>
}

export const gameModuleStartupScopes = ['process', 'server'] as const
export type GameModuleStartupScope = (typeof gameModuleStartupScopes)[number]

export interface StartupContribution extends OrderedContribution {
    readonly phase: GameModuleStartupPhase
    /**
     * 多进程下 service 初始化在每个 worker 各执行一遍，必填以强制显式选择：
     * - process: 每个业务进程各跑一次（进程内缓存、本地状态必须选它）
     * - server: 整个区服只跑一次（全局副作用，如调度全局任务），仅启动落点进程执行；
     *           落点进程重启会重跑，handler 必须幂等
     */
    readonly scope: GameModuleStartupScope
    readonly run: () => void | Promise<void>
}

export interface ErrorCodeContribution {
    readonly namePrefixes: readonly string[]
}

/** 原生 Lobby 路由只由业务模块登记，运行时不维护第二份领域清单。 */
export interface NativeLobbyRouteContribution extends OrderedContribution {
    readonly register: (registry: NativeLobbyRouteRegistry, services: NativeLobbyRouteServices) => void
}

export interface GameModule {
    readonly name: string
    readonly configuration?: ConfigurationContribution
    readonly protocol?: ProtocolContribution
    readonly actions?: ActionContribution
    readonly events?: EventContribution
    readonly telemetry?: TelemetryContribution
    readonly managementHttp?: ManagementHttpContribution
    readonly cron?: readonly CronTaskContribution[]
    readonly startup?: readonly StartupContribution[]
    readonly errorCodes?: ErrorCodeContribution
    readonly nativeLobby?: { readonly routes: readonly NativeLobbyRouteContribution[] }
}

export interface GameModuleRegistryEntry {
    readonly moduleName: string
    readonly source: string
    readonly module: GameModule
}

export function defineGameModule<const T extends GameModule>(module: T): Readonly<T> {
    return freezeDescriptor(module)
}

function freezeDescriptor<T>(value: T): T {
    if (Array.isArray(value)) {
        for (const item of value) freezeDescriptor(item)
        return Object.freeze(value) as T
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        for (const item of Object.values(value)) freezeDescriptor(item)
        return Object.freeze(value)
    }
    return value
}
